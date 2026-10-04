// 综合风险评估引擎
// 原则：风险判断不停留在单次黄疸值，同时纳入出生小时龄、体重变化、喂养频次、
// 大便颜色（灰白便红旗征）、产妇恢复（伤口/乳房/情绪 EPDS）与家庭照护能力。
import type {
  ActionType,
  FamilyArchive,
  OverallRisk,
  RiskAssessment,
  RiskFactor,
  StoolColor,
  Visit,
} from '@/types';

/** Bhutani 小时龄胆红素百分位列线（mg/dL）锚点：[小时, P25, P50, P75, P95] */
const BHUTANI_ANCHORS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [12, 4.0, 5.0, 6.5, 8.0],
  [24, 5.0, 6.5, 8.0, 10.0],
  [36, 6.5, 8.5, 10.5, 12.3],
  [48, 8.0, 10.0, 12.0, 14.5],
  [60, 9.0, 11.5, 13.5, 15.5],
  [72, 10.0, 12.5, 14.5, 16.5],
  [84, 10.5, 13.0, 15.0, 17.0],
  [96, 11.0, 13.5, 15.5, 17.5],
  [108, 11.2, 13.8, 15.8, 17.8],
  [120, 11.5, 14.0, 16.0, 18.0],
  [144, 12.0, 14.5, 16.5, 18.5],
];

export type BilirubinZone = 'low' | 'low_intermediate' | 'high_intermediate' | 'high';

export function ageHours(birthDate: string, at: string): number {
  return Math.max(0, (new Date(at).getTime() - new Date(birthDate).getTime()) / 3_600_000);
}

function interpolate(hours: number, col: 1 | 2 | 3 | 4): number {
  const h = Math.min(144, Math.max(12, hours));
  for (let i = 0; i < BHUTANI_ANCHORS.length - 1; i++) {
    const [h0, ...v0] = BHUTANI_ANCHORS[i];
    const [h1, ...v1] = BHUTANI_ANCHORS[i + 1];
    if (h >= h0 && h <= h1) {
      const t = (h - h0) / (h1 - h0);
      return v0[col - 1] + (v1[col - 1] - v0[col - 1]) * t;
    }
  }
  return BHUTANI_ANCHORS[BHUTANI_ANCHORS.length - 1][col];
}

export const bhutani = {
  p25: (h: number) => interpolate(h, 1),
  p50: (h: number) => interpolate(h, 2),
  p75: (h: number) => interpolate(h, 3),
  p95: (h: number) => interpolate(h, 4),
};

// P40 无公开锚点，以 P25/P50 近似作为低危/低中危区的分界
const p40Approx = (h: number) => (bhutani.p25(h) + bhutani.p50(h)) / 2 + 0.5;

export function bilirubinZone(value: number, hours: number): BilirubinZone {
  if (value >= bhutani.p95(hours)) return 'high';
  if (value >= bhutani.p75(hours)) return 'high_intermediate';
  if (value >= p40Approx(hours)) return 'low_intermediate';
  return 'low';
}

/** 取本次有效胆红素值：TSB 优先于经皮额/胸（取较高者，保守） */
export function effectiveBilirubin(v: Visit['jaundice']): number | undefined {
  if (!v || v.deviceFault) return undefined;
  const tc = [v.forehead, v.chest].filter((x): x is number => typeof x === 'number');
  const tcMax = tc.length ? Math.max(...tc) : undefined;
  if (typeof v.tsb === 'number') return tcMax === undefined ? v.tsb : Math.max(v.tsb, tcMax);
  return tcMax;
}

export function computeWeightLossPct(birthWeightG: number, currentG?: number): number | undefined {
  if (!currentG || currentG <= 0) return undefined;
  return ((birthWeightG - currentG) / birthWeightG) * 100;
}

export interface AssessInput {
  archive: FamilyArchive;
  visit: Visit;
  /** 上一次访视体重，用于判断体重是否持续下降（未回升） */
  previousWeightG?: number;
  previousBilirubin?: { value: number; at: string };
}

const addHours = (iso: string, h: number) => new Date(new Date(iso).getTime() + h * 3_600_000).toISOString();

const STOOL_DANGER: Record<StoolColor, string> = {
  yellow: '黄色便（正常）',
  yellow_green: '黄绿色便',
  green: '绿色便（观察）',
  light: '浅色便（需关注）',
  gray_white: '灰白陶土便（胆道闭锁红旗征）',
};

export function assess(input: AssessInput): RiskAssessment {
  const { archive, visit } = input;
  const factors: RiskFactor[] = [];
  const actions = new Set<ActionType>();
  const advice: string[] = [];
  const at = visit.performedAt;
  const hours = ageHours(archive.birthDate, at);
  const ageDays = Math.floor(hours / 24);

  const push = (f: RiskFactor) => factors.push(f);
  let recheckAt: string | undefined;
  let bilirubinNear = false;
  let zone: RiskAssessment['bilirubinZone'] = undefined as unknown as RiskAssessment['bilirubinZone'];

  const premature = archive.gestationalWeeks < 38;

  // —— 1. 胆红素：小时龄分区，而非单次数值 ——
  const bili = effectiveBilirubin(visit.jaundice);
  if (bili === undefined) {
    zone = 'unmeasured';
    if (visit.jaundice?.deviceFault) {
      push({
        level: hours < 96 || archive.jaundiceRiskAtBirth !== 'low' ? 'warning' : 'watch',
        code: 'device_fault',
        text: '经皮胆红素仪故障未测得数值，不能凭目测排除高胆红素血症',
      });
      actions.add('recheck');
      recheckAt = addHours(at, hours < 72 ? 12 : 24);
      advice.push('请尽快到社区卫生服务中心复测黄疸，仪器恢复前不要以"看着不黄"判断。');
    }
  } else {
    const z = bilirubinZone(bili, hours);
    zone = z;
    const p95 = bhutani.p95(hours);
    const p75 = bhutani.p75(hours);
    bilirubinNear = bili >= p95 - 1 && bili < p95;
    push({ level: 'info', code: 'bili_context', text: `出生 ${hours.toFixed(0)} 小时（第 ${ageDays + 1} 天），TcB/TSB ${bili.toFixed(1)} mg/dL，处于小时龄百分位${zoneLabel(z)}` });

    if (input.previousBilirubin) {
      const gapH = Math.max(1, (new Date(at).getTime() - new Date(input.previousBilirubin.at).getTime()) / 3_600_000);
      const rise = (bili - input.previousBilirubin.value) / gapH;
      if (rise > 0.2) {
        push({ level: 'warning', code: 'rapid_rise', text: `胆红素上升速度 ${rise.toFixed(2)} mg/dL/小时，超过 0.2，进展迅速` });
        actions.add('pediatric_referral');
      }
    }

    if (bili >= 20 || (z === 'high' && hours < 48)) {
      push({ level: 'critical', code: 'bili_emergency', text: bili >= 20 ? '胆红素 ≥20 mg/dL，存在核黄疸风险' : '出生 48 小时内超过 P95，进展高危' });
      actions.add('emergency');
      advice.push('请立即带宝宝去新生儿急诊，需查血清胆红素并评估光疗，途中可少量多次喂奶。');
    } else if (z === 'high') {
      push({ level: 'warning', code: 'bili_high', text: `胆红素 ${bili.toFixed(1)} ≥ 同小时龄 P95（${p95.toFixed(1)}），需血清学确认/光疗评估` });
      actions.add('pediatric_referral');
      advice.push('今日内转上级医院儿科，检测血清总胆红素，按医嘱决定是否光疗。');
    } else if (bilirubinNear || (z === 'high_intermediate' && (premature || archive.jaundiceRiskAtBirth === 'high' || archive.riskFactorsAtBirth.length > 0))) {
      push({
        level: bilirubinNear ? 'warning' : 'watch',
        code: 'bili_near',
        text: bilirubinNear
          ? `胆红素 ${bili.toFixed(1)} 距 P95 阈值（${p95.toFixed(1)}）不足 1 mg/dL，属临界`
          : `胆红素位于中高危区（P75 ${p75.toFixed(1)} 以上），合并早产/高危因素`,
      });
      actions.add('recheck');
      recheckAt = addHours(at, hours < 72 ? 12 : 24);
      advice.push(hours < 72 ? '12 小时内复测胆红素，这两天数值可能继续上升。' : '24 小时内复测胆红素，出现黄染加重随时就诊。');
    } else if (z === 'high_intermediate') {
      push({ level: 'watch', code: 'bili_mid', text: `胆红素位于中高危区间（P75 ${p75.toFixed(1)}），暂无高危因素叠加` });
      actions.add('recheck');
      recheckAt = addHours(at, 24);
      advice.push('明天复测一次黄疸；多喂奶、多排便是帮助退黄的主要办法。');
    }
  }

  // —— 2. 体重变化（相对出生体重 + 较上次是否回升） ——
  const loss = computeWeightLossPct(archive.birthWeightG, visit.weightG);
  if (loss !== undefined) {
    if (loss < 0) {
      push({ level: 'info', code: 'weight_recovered', text: `体重已较出生体重增长 ${Math.abs(loss).toFixed(1)}%` });
    } else if (loss > 12) {
      push({ level: 'critical', code: 'weight_loss_severe', text: `体重较出生下降 ${loss.toFixed(1)}%，超过 12%，存在脱水/喂养不足` });
      actions.add('pediatric_referral');
      advice.push('体重下降过多，今日到儿科评估脱水与喂养，必要时补充喂养。');
    } else if (loss > 10) {
      push({ level: 'warning', code: 'weight_loss', text: `体重较出生下降 ${loss.toFixed(1)}%，超过生理性下降 10% 上限` });
      actions.add('recheck');
      actions.add('lactation');
      recheckAt = recheckAt ?? addHours(at, 24);
      advice.push('24 小时后复测体重；母乳不足时先纠正含接、增加哺乳频次，遵医嘱可短期补授。');
    } else if (loss > 7) {
      push({ level: 'watch', code: 'weight_loss_mild', text: `体重较出生下降 ${loss.toFixed(1)}%，需关注摄入` });
      if (archive.feedingMode !== 'formula') actions.add('lactation');
      if (!recheckAt) {
        actions.add('recheck');
        recheckAt = addHours(at, 48);
      }
    }
    if (input.previousWeightG && visit.weightG && visit.weightG < input.previousWeightG && loss !== undefined && loss >= 0) {
      push({ level: 'warning', code: 'weight_not_rebound', text: '距上次访视体重仍在下降，生后应在第 5 天前后止跌回升' });
      actions.add('recheck');
      actions.add('lactation');
      recheckAt = recheckAt ?? addHours(at, 24);
    }
  }

  // —— 3. 喂养频次与含接 ——
  const f = visit.feeding;
  if (f) {
    if (f.mode === 'breast' && f.frequency24h < 8) {
      push({ level: 'watch', code: 'feed_low_freq', text: `24 小时哺乳 ${f.frequency24h} 次，少于 8 次，摄入不足会加重黄疸` });
      actions.add('lactation');
      advice.push('白天 2-3 小时喂一次、夜间不超过 4 小时，每天 8-12 次；含住大部分乳晕。');
    }
    if (!f.effectiveLatch && f.mode !== 'formula') {
      push({ level: 'watch', code: 'latch_poor', text: '含接姿势无效，母亲疼痛、婴儿摄入差' });
      actions.add('lactation');
    }
  }

  // —— 4. 大小便：胎便转黄与灰白便 ——
  const s = visit.stool;
  if (s) {
    if (s.color === 'gray_white') {
      push({ level: 'critical', code: 'acholic_stool', text: STOOL_DANGER.gray_white });
      actions.add('emergency');
      advice.push('陶土色/灰白色大便是紧急信号，请立即就医排查胆道闭锁，不要等待黄疸复查。');
    } else if (s.color === 'light') {
      push({ level: 'warning', code: 'pale_stool', text: '大便颜色偏浅，需照片复核并排查胆道问题' });
      actions.add('pediatric_referral');
    }
    if (!s.meconiumCleared && hours >= 72) {
      push({ level: 'warning', code: 'meconium_delay', text: '出生超过 72 小时胎便尚未转黄，提示喂养不足或排出延迟' });
      actions.add('lactation');
      actions.add('recheck');
      recheckAt = recheckAt ?? addHours(at, 24);
    }
    if (s.count24h + (visit.urineCount24h ?? 0) < 4 && hours > 48) {
      push({ level: 'watch', code: 'low_output', text: `24 小时大便 ${s.count24h} 次、小便 ${visit.urineCount24h ?? '?'} 次，排泄偏少` });
    }
  }
  if (typeof visit.urineCount24h === 'number' && hours >= 96 && visit.urineCount24h < 6) {
    push({ level: hours >= 96 && visit.urineCount24h < 4 ? 'warning' : 'watch', code: 'low_urine', text: `出生 4 天后 24 小时小便 ${visit.urineCount24h} 次，少于 6 次，提示奶量不足` });
    if (archive.feedingMode !== 'formula') actions.add('lactation');
  }

  // —— 5. 脐带、吐奶、睡眠 ——
  if (visit.cord?.includes('odor') || visit.cord?.includes('redness')) {
    push({ level: 'warning', code: 'cord_infection', text: '脐轮红肿或有脓性臭味分泌物，警惕脐炎' });
    actions.add('pediatric_referral');
    advice.push('保持脐部干燥，今日就医评估是否需要抗感染治疗。');
  } else if (visit.cord?.includes('bleeding')) {
    push({ level: 'watch', code: 'cord_bleeding', text: '脐部有渗血，需观察并保持干燥' });
  }
  if (visit.spitUp === 'projectile') {
    push({ level: 'warning', code: 'projectile_vomit', text: '喷射性呕吐，需排除幽门肥厚性狭窄等外科情况' });
    actions.add('pediatric_referral');
  } else if (visit.spitUp === 'frequent') {
    push({ level: 'watch', code: 'spitup', text: '频繁吐奶，注意拍嗝与喂奶量' });
  }

  // —— 6. 产妇：乳房、伤口、情绪 ——
  const m = visit.mother;
  if (m) {
    if (m.selfHarmThought) {
      push({ level: 'critical', code: 'epds_selfharm', text: 'EPDS 第 10 题阳性（有自伤念头），须立即心理危机干预' });
      actions.add('psych_referral');
      advice.push('请立即联系社区医生/心理援助热线，不要让产妇与婴儿独处。');
    } else if (typeof m.epdsScore === 'number') {
      if (m.epdsScore >= 13) {
        push({ level: 'warning', code: 'epds_high', text: `EPDS ${m.epdsScore} 分（≥13），产后抑郁高风险` });
        actions.add('psych_referral');
      } else if (m.epdsScore >= 9) {
        push({ level: 'watch', code: 'epds_watch', text: `EPDS ${m.epdsScore} 分，情绪需关注` });
        actions.add('phone_followup');
      }
    }
    if (m.breast === 'mastitis') {
      push({ level: 'warning', code: 'mastitis', text: '乳房红肿热痛/发热，乳腺炎可能' });
      actions.add('lactation');
      advice.push('继续排空乳房、热敷后哺乳，发热或加重要及时就医。');
    } else if (m.breast === 'cracked' || m.breast === 'inverted' || m.breast === 'engorged') {
      push({ level: 'watch', code: `breast_${m.breast}`, text: m.breast === 'cracked' ? '乳头皲裂' : m.breast === 'inverted' ? '乳头内陷、含接困难' : '乳房胀痛/淤积' });
      actions.add('lactation');
    }
    if (m.wound === 'secretion' || m.wound === 'dehiscence') {
      push({ level: 'warning', code: 'maternal_wound', text: m.wound === 'dehiscence' ? '伤口裂开' : '伤口有异常渗液，感染/愈合不良可能' });
      actions.add('phone_followup');
      advice.push('保持伤口清洁干燥，尽快到分娩医院/产科门诊处理。');
    } else if (m.wound === 'redness' || m.wound === 'pain') {
      push({ level: 'watch', code: 'wound_watch', text: m.wound === 'redness' ? '伤口红肿' : '伤口疼痛明显' });
    }
  }

  // —— 7. 家庭照护能力 ——
  const c = visit.careAbility;
  if (c?.confidence === 'low') {
    push({ level: 'watch', code: 'care_low', text: `主要照护者（${c.primaryCaregiver || '家属'}）照护信心不足：${c.concerns || '需加强指导'}` });
    actions.add('phone_followup');
    advice.push('社区将在 2 天内安排电话回访，手把手指导喂养与脐部护理。');
  }

  // —— 8. 上门异常情形 ——
  if (visit.familyNotHome || visit.refusedEntry) {
    push({ level: watchIfScheduled(archive), code: visit.refusedEntry ? 'refused_entry' : 'not_home', text: visit.refusedEntry ? '家属不愿开门，未能完成访视' : '上门无人在家' });
    actions.add('phone_followup');
  }
  if (visit.onlineConsultRequested) {
    actions.add('phone_followup');
    push({ level: 'info', code: 'online_consult', text: '家长要求线上咨询，需在 24 小时内回复' });
  }

  // —— 9. 出生高危因素（作为加权背景） ——
  if (archive.riskFactorsAtBirth.length) {
    push({ level: 'info', code: 'birth_risk_factors', text: `出生高危因素：${archive.riskFactorsAtBirth.join('、')}` });
  }

  // —— 汇总分级与默认动作 ——
  const overall: OverallRisk = factors.some((x) => x.level === 'critical')
    ? 'red'
    : factors.some((x) => x.level === 'warning')
      ? 'orange'
      : factors.some((x) => x.level === 'watch')
        ? 'yellow'
        : 'green';

  if (actions.size === 0 || (actions.size === 1 && actions.has('phone_followup'))) {
    if (![...actions].includes('routine')) actions.add('routine');
    advice.unshift('继续按需喂养、观察黄疸范围与精神反应，按社区计划接受第 2 次新生儿访视。');
  }

  const familyExplanation = buildFamilyExplanation({
    overall,
    hours,
    bili,
    zone,
    loss,
    feedingFreq: f?.frequency24h,
    stoolColor: s?.color,
    epds: m?.epdsScore,
    recheckAt,
    actions: [...actions],
  });

  return {
    ageHours: Math.round(hours * 10) / 10,
    weightLossPct: loss === undefined ? undefined : Math.round(loss * 10) / 10,
    bilirubinZone: zone,
    bilirubinNearThreshold: bilirubinNear,
    factors,
    overall,
    actions: [...actions],
    recheckAt,
    advice: dedup(advice),
    familyExplanation,
    assessedAt: new Date(at).toISOString(),
  };
}

function watchIfScheduled(archive: FamilyArchive): RiskFactor['level'] {
  // 早产/高胆红素风险家庭改约更需追访
  return archive.gestationalWeeks < 38 || archive.jaundiceRiskAtBirth === 'high' ? 'warning' : 'watch';
}

function zoneLabel(z: BilirubinZone | 'unmeasured'): string {
  return { low: '低危区', low_intermediate: '低中危区', high_intermediate: '中高危区', high: '高危区（≥P95）', unmeasured: '未测' }[z];
}

function dedup(list: string[]): string[] {
  return [...new Set(list)];
}

function buildFamilyExplanation(p: {
  overall: OverallRisk;
  hours: number;
  bili?: number;
  zone?: RiskAssessment['bilirubinZone'];
  loss?: number;
  feedingFreq?: number;
  stoolColor?: StoolColor;
  epds?: number;
  recheckAt?: string;
  actions: ActionType[];
}): string {
  const parts: string[] = [];
  const day = Math.floor(p.hours / 24) + 1;
  parts.push(`宝宝今天出生约 ${p.hours.toFixed(0)} 小时（第 ${day} 天）。`);
  if (p.bili !== undefined) {
    const zText = p.zone ? zoneLabel(p.zone) : '';
    parts.push(`本次黄疸值 ${p.bili.toFixed(1)} mg/dL，结合出生天数判断处于${zText}——我们不是只看一个数字，而是和出生时间一起判断。`);
  }
  if (p.loss !== undefined) {
    parts.push(p.loss > 0 ? `体重比出生时下降 ${p.loss.toFixed(1)}%。` : '体重已超过出生体重，恢复良好。');
  }
  if (p.feedingFreq !== undefined) parts.push(`24 小时喂奶 ${p.feedingFreq} 次。`);
  if (p.stoolColor === 'gray_white' || p.stoolColor === 'light') parts.push('大便颜色异常，是本次最需要优先处理的问题。');
  if (typeof p.epds === 'number' && p.epds >= 9) parts.push('妈妈情绪评估提示需要家人多分担并由社区跟进。');

  const tail: Record<OverallRisk, string> = {
    green: '目前各项指标平稳，请按预约时间接受下次访视。',
    yellow: '有几项需要密切观察的情况，请按护理建议照护并按时复测。',
    orange: '存在需要尽快处理的风险，已为您安排复查/转诊，请不要拖延。',
    red: '存在需要立即就医的危险信号，请马上按指引前往医院。',
  };
  parts.push(tail[p.overall]);
  return parts.join('');
}
