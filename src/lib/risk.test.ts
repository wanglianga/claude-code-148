import { describe, it, expect } from 'vitest';
import { assess, bhutani, bilirubinZone, computeWeightLossPct, effectiveBilirubin, ageHours } from './risk';
import type { FamilyArchive, Visit } from '@/types';

const HOUR = 3_600_000;

function archiveAt(overrides: Partial<FamilyArchive> = {}): FamilyArchive {
  const birth = new Date(Date.now() - 72 * HOUR).toISOString();
  return {
    id: 'a1',
    babyName: '测试宝宝',
    gender: 'female',
    birthDate: birth,
    gestationalWeeks: 39,
    birthWeightG: 3300,
    delivery: 'vaginal',
    feedingMode: 'breast',
    jaundiceRiskAtBirth: 'low',
    riskFactorsAtBirth: [],
    motherName: '母亲',
    motherWound: 'good',
    address: '测试地址',
    contactName: '父亲',
    contactPhone: '13900000000',
    accessCode: 'T1',
    scheduledAt: new Date().toISOString(),
    status: 'scheduled',
    nurseId: 'n1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncStatus: 'synced',
    ...overrides,
  };
}

function visitAt(overrides: Partial<Visit> = {}, performedAt = new Date().toISOString()): Visit {
  return {
    id: 'v1',
    clientId: 'c1',
    archiveId: 'a1',
    visitNumber: 1,
    performedAt,
    photos: [],
    syncStatus: 'local_draft',
    createdAt: performedAt,
    updatedAt: performedAt,
    ...overrides,
  };
}

describe('Bhutani 小时龄分区', () => {
  it('P95 随小时龄上升（同一数值在不同天数风险不同）', () => {
    expect(bhutani.p95(24)).toBeLessThan(bhutani.p95(72));
    expect(bhutani.p95(24)).toBeCloseTo(10.0, 1);
    expect(bhutani.p95(72)).toBeCloseTo(16.5, 1);
  });

  it('16 mg/dL 在 48 小时是高危区，在 96 小时只是中高危区', () => {
    expect(bilirubinZone(16, 48)).toBe('high');
    expect(bilirubinZone(16, 96)).toBe('high_intermediate');
  });
});

describe('effectiveBilirubin', () => {
  it('TSB 与经皮并存时取较高值（保守原则）', () => {
    expect(effectiveBilirubin({ forehead: 12, chest: 13, tsb: 14.2 })).toBe(14.2);
    expect(effectiveBilirubin({ forehead: 14.8, chest: 15.1, tsb: 13 })).toBe(15.1);
  });
  it('设备故障时视为未测', () => {
    expect(effectiveBilirubin({ forehead: 12, deviceFault: true })).toBeUndefined();
  });
});

describe('体重下降', () => {
  it('计算下降百分比', () => {
    expect(computeWeightLossPct(3300, 2900)).toBeCloseTo(12.12, 1);
    expect(computeWeightLossPct(3300, 3400)).toBeCloseTo(-3.03, 1);
  });
});

describe('综合评估 assess', () => {
  it('足月健康、指标平稳 → green + 常规随访', () => {
    const a = archiveAt();
    const v = visitAt({
      weightG: 3200, // 下降 3%
      jaundice: { forehead: 9, chest: 9.5 },
      cord: ['dry'],
      urineCount24h: 7,
      stool: { count24h: 4, color: 'yellow', meconiumCleared: true },
      feeding: { mode: 'breast', frequency24h: 10, effectiveLatch: true },
      spitUp: 'small',
      sleepQuality: 'good',
      mother: { breast: 'good', emotion: 'good', wound: 'good' },
      careAbility: { primaryCaregiver: '父母', confidence: 'high' },
    });
    const r = assess({ archive: a, visit: v });
    expect(r.overall).toBe('green');
    expect(r.actions).toContain('routine');
    expect(r.actions).not.toContain('pediatric_referral');
  });

  it('胆红素 ≥20 → red + 立即急诊', () => {
    const a = archiveAt();
    const v = visitAt({ weightG: 3200, jaundice: { forehead: 20.4, chest: 20.9 }, stool: { count24h: 3, color: 'yellow', meconiumCleared: true }, feeding: { mode: 'breast', frequency24h: 9, effectiveLatch: true } });
    const r = assess({ archive: a, visit: v });
    expect(r.overall).toBe('red');
    expect(r.actions).toContain('emergency');
  });

  it('48 小时内超 P95 → red 急诊（生后 48h P95≈14.5）', () => {
    const birth = new Date(Date.now() - 47 * HOUR).toISOString();
    const a = archiveAt({ birthDate: birth });
    const v = visitAt({ weightG: 3100, jaundice: { forehead: 15 }, stool: { count24h: 2, color: 'yellow_green', meconiumCleared: true }, feeding: { mode: 'mixed', frequency24h: 9, effectiveLatch: true } });
    const r = assess({ archive: a, visit: v });
    expect(r.overall).toBe('red');
    expect(r.actions).toContain('emergency');
  });

  it('胆红素接近 P95 阈值（<1 mg/dL）→ 12-24h 复查，而非仅看绝对值', () => {
    const birth = new Date(Date.now() - 96 * HOUR).toISOString();
    const a = archiveAt({ birthDate: birth });
    // 96h P95 ≈ 17.5，取 16.9
    const v = visitAt({ weightG: 3300, jaundice: { chest: 16.9 }, stool: { count24h: 4, color: 'yellow', meconiumCleared: true }, feeding: { mode: 'breast', frequency24h: 10, effectiveLatch: true }, mother: { breast: 'good', emotion: 'good', wound: 'good' } });
    const r = assess({ archive: a, visit: v });
    expect(r.bilirubinNearThreshold).toBe(true);
    expect(r.actions).toContain('recheck');
    expect(r.recheckAt).toBeDefined();
    // 96h > 72h → 24 小时内复查
    expect(new Date(r.recheckAt!).getTime() - new Date(v.performedAt).getTime()).toBeGreaterThan(23 * HOUR);
  });

  it('体重下降 >10% + 哺乳 <8 次 → 复查 + 母乳指导', () => {
    const a = archiveAt();
    const v = visitAt({
      weightG: 2950, // -10.6%
      jaundice: { forehead: 10 },
      stool: { count24h: 2, color: 'green', meconiumCleared: false },
      feeding: { mode: 'breast', frequency24h: 6, effectiveLatch: false },
      urineCount24h: 4,
      mother: { breast: 'cracked', emotion: 'anxious', wound: 'good' },
    });
    const r = assess({ archive: a, visit: v });
    expect(r.weightLossPct).toBeGreaterThan(10);
    expect(r.actions).toContain('lactation');
    expect(r.actions).toContain('recheck');
    expect(['orange', 'yellow']).toContain(r.overall);
  });

  it('体重下降 >12% → 转儿科', () => {
    const a = archiveAt();
    const v = visitAt({ weightG: 2850, jaundice: { forehead: 9 }, feeding: { mode: 'breast', frequency24h: 7, effectiveLatch: false }, stool: { count24h: 2, color: 'green', meconiumCleared: false } });
    const r = assess({ archive: a, visit: v });
    expect(r.overall).toBe('red');
    expect(r.actions).toContain('pediatric_referral');
  });

  it('灰白陶土便 → red 急诊（独立于黄疸值）', () => {
    const a = archiveAt();
    const v = visitAt({
      weightG: 3200, jaundice: { forehead: 8 },
      stool: { count24h: 2, color: 'gray_white', meconiumCleared: true },
      feeding: { mode: 'mixed', frequency24h: 9, effectiveLatch: true },
      mother: { breast: 'good', emotion: 'good', wound: 'good' },
    });
    const r = assess({ archive: a, visit: v });
    expect(r.overall).toBe('red');
    expect(r.actions).toContain('emergency');
    expect(r.factors.some((f) => f.code === 'acholic_stool')).toBe(true);
  });

  it('胎便 72 小时未转黄 + 喂养不足 → 母乳指导与复查', () => {
    const a = archiveAt();
    const v = visitAt({
      weightG: 3100, jaundice: { forehead: 11 },
      stool: { count24h: 1, color: 'green', meconiumCleared: false },
      feeding: { mode: 'breast', frequency24h: 7, effectiveLatch: false },
    });
    const r = assess({ archive: a, visit: v });
    expect(r.factors.some((f) => f.code === 'meconium_delay')).toBe(true);
    expect(r.actions).toContain('lactation');
  });

  it('EPDS 自伤念头阳性 → red + 心理转介（即使生理指标正常）', () => {
    const a = archiveAt();
    const v = visitAt({
      weightG: 3250, jaundice: { forehead: 8 },
      stool: { count24h: 4, color: 'yellow', meconiumCleared: true },
      feeding: { mode: 'breast', frequency24h: 10, effectiveLatch: true },
      mother: { breast: 'good', emotion: 'epds_risk', epdsScore: 14, selfHarmThought: true, wound: 'good' },
    });
    const r = assess({ archive: a, visit: v });
    expect(r.overall).toBe('red');
    expect(r.actions).toContain('psych_referral');
  });

  it('EPDS 9-12 分 → 关注 + 电话随访', () => {
    const a = archiveAt();
    const v = visitAt({
      weightG: 3200, jaundice: { forehead: 9 },
      stool: { count24h: 4, color: 'yellow', meconiumCleared: true },
      feeding: { mode: 'breast', frequency24h: 10, effectiveLatch: true },
      mother: { breast: 'good', emotion: 'low', epdsScore: 10, wound: 'good' },
      careAbility: { primaryCaregiver: '母亲', confidence: 'medium' },
    });
    const r = assess({ archive: a, visit: v });
    expect(r.actions).toContain('phone_followup');
  });

  it('设备故障未测得 + 出生 96 小时内 → 必须安排复测，不能漏判', () => {
    const birth = new Date(Date.now() - 50 * HOUR).toISOString();
    const a = archiveAt({ birthDate: birth });
    const v = visitAt({ weightG: 3200, jaundice: { deviceFault: true, deviceName: 'JM-105' }, feeding: { mode: 'breast', frequency24h: 9, effectiveLatch: true }, stool: { count24h: 3, color: 'yellow', meconiumCleared: true } });
    const r = assess({ archive: a, visit: v });
    expect(r.bilirubinZone).toBe('unmeasured');
    expect(r.actions).toContain('recheck');
    expect(r.factors.some((f) => f.code === 'device_fault')).toBe(true);
  });

  it('家属拒绝开门 + 高危家庭 → 升级为 warning 并安排电话随访', () => {
    const a = archiveAt({ gestationalWeeks: 36, jaundiceRiskAtBirth: 'high' });
    const v = visitAt({ refusedEntry: true, outcomeNote: '老人拒绝' });
    const r = assess({ archive: a, visit: v });
    expect(r.actions).toContain('phone_followup');
    expect(r.factors.find((f) => f.code === 'refused_entry')?.level).toBe('warning');
  });

  it('喷射性呕吐 → 转儿科', () => {
    const a = archiveAt();
    const v = visitAt({ weightG: 3200, jaundice: { forehead: 9 }, spitUp: 'projectile', feeding: { mode: 'formula', frequency24h: 8, effectiveLatch: true }, stool: { count24h: 3, color: 'yellow', meconiumCleared: true }, mother: { breast: 'good', emotion: 'good', wound: 'good' } });
    const r = assess({ archive: a, visit: v });
    expect(r.actions).toContain('pediatric_referral');
  });

  it('照护信心不足 → 增加电话随访', () => {
    const a = archiveAt();
    const v = visitAt({
      weightG: 3200, jaundice: { forehead: 9 },
      stool: { count24h: 4, color: 'yellow', meconiumCleared: true },
      feeding: { mode: 'breast', frequency24h: 10, effectiveLatch: true },
      mother: { breast: 'good', emotion: 'good', wound: 'good' },
      careAbility: { primaryCaregiver: '奶奶', confidence: 'low', concerns: '不会喂养' },
    });
    const r = assess({ archive: a, visit: v });
    expect(r.actions).toContain('phone_followup');
  });

  it('家属端说明文本包含出生天数与综合解释', () => {
    const a = archiveAt();
    const v = visitAt({
      weightG: 3000, jaundice: { forehead: 13 },
      stool: { count24h: 3, color: 'yellow_green', meconiumCleared: true },
      feeding: { mode: 'breast', frequency24h: 8, effectiveLatch: true },
    });
    const r = assess({ archive: a, visit: v });
    expect(r.familyExplanation).toContain('小时');
    expect(r.familyExplanation).toContain('黄疸值');
    expect(ageHours(a.birthDate, v.performedAt)).toBeGreaterThan(71);
  });
});
