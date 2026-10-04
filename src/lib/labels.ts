// 领域常量与中文标签
import type {
  BreastStatus,
  CordStatus,
  DeliveryType,
  DocumentType,
  EmotionStatus,
  FeedingMode,
  FollowUpKind,
  JaundiceRiskAtBirth,
  SpitUpLevel,
  StoolColor,
  WoundStatus,
} from '@/types';

export const DELIVERY_LABEL: Record<DeliveryType, string> = {
  vaginal: '顺产',
  assisted: '产钳/胎吸助产',
  cesarean: '剖宫产',
};

export const FEEDING_LABEL: Record<FeedingMode, string> = {
  breast: '纯母乳',
  formula: '配方奶',
  mixed: '混合喂养',
};

export const JAUNDICE_RISK_LABEL: Record<JaundiceRiskAtBirth, string> = {
  low: '低危',
  medium: '中危',
  high: '高危',
};

export const CORD_LABEL: Record<CordStatus, string> = {
  dry: '干燥脱落中',
  moist: '残端湿润',
  bleeding: '渗血',
  odor: '脓性臭味',
  redness: '脐轮红肿',
};

export const STOOL_COLOR_LABEL: Record<StoolColor, string> = {
  yellow: '黄色',
  yellow_green: '黄绿色',
  green: '绿色',
  light: '浅色/淡黄',
  gray_white: '灰白陶土色',
};

export const SPITUP_LABEL: Record<SpitUpLevel, string> = {
  none: '无',
  small: '少量溢奶',
  frequent: '频繁吐奶',
  projectile: '喷射性呕吐',
};

export const BREAST_LABEL: Record<BreastStatus, string> = {
  good: '无异常',
  engorged: '胀痛淤积',
  cracked: '乳头皲裂',
  inverted: '乳头内陷',
  mastitis: '乳腺炎征象',
};

export const EMOTION_LABEL: Record<EmotionStatus, string> = {
  good: '情绪平稳',
  anxious: '焦虑担心',
  low: '情绪低落',
  epds_risk: 'EPDS 阳性',
};

export const WOUND_LABEL: Record<WoundStatus, string> = {
  good: '愈合良好',
  pain: '疼痛明显',
  redness: '红肿',
  secretion: '异常渗液',
  dehiscence: '伤口裂开',
};

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  birth_cert: '出生证明',
  discharge_summary: '出院小结',
  feeding_log: '喂养记录',
  jaundice_report: '黄疸检测报告',
  other: '其他资料',
};

export const FOLLOWUP_KIND_LABEL: Record<FollowUpKind, string> = {
  recheck: '黄疸/体重复查',
  referral: '儿科转诊',
  lactation: '母乳指导',
  phone: '电话随访',
  rescheduled_visit: '改约上门',
  online_consult: '线上咨询',
  psych_referral: '心理转介',
};

export const OVERALL_LABEL = {
  green: '平稳',
  yellow: '关注',
  orange: '高危',
  red: '紧急',
} as const;

export const ACTION_LABEL: Record<string, string> = {
  none: '无需处理',
  routine: '常规随访',
  recheck: '安排复查',
  lactation: '母乳指导',
  pediatric_referral: '转儿科',
  emergency: '立即急诊',
  psych_referral: '心理转介',
  phone_followup: '电话随访',
};

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(v: string): string {
  return new Date(v).toISOString();
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ageText(birthDate: string, at: string = new Date().toISOString()): string {
  const h = (new Date(at).getTime() - new Date(birthDate).getTime()) / 3_600_000;
  if (h < 0) return '未出生';
  const days = Math.floor(h / 24);
  const rest = Math.round(h - days * 24);
  return days === 0 ? `${rest} 小时` : `${days} 天 ${rest} 小时`;
}
