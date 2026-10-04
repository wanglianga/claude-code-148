// 领域类型定义：母婴档案、上门访视、风险评估、随访闭环、离线同步

export type Role = 'nurse' | 'family';

/** 分娩方式 */
export type DeliveryType = 'vaginal' | 'assisted' | 'cesarean';
/** 喂养方式 */
export type FeedingMode = 'breast' | 'formula' | 'mixed';
/** 出院时黄疸高危因素分层 */
export type JaundiceRiskAtBirth = 'low' | 'medium' | 'high';
/** 访视单状态 */
export type VisitStatus =
  | 'scheduled' // 已预约（未访视）
  | 'completed' // 已完成
  | 'rescheduled' // 家庭改约
  | 'no_entry'; // 上门但家属不愿开门 / 无人在家

/** 脐带情况 */
export type CordStatus = 'dry' | 'moist' | 'bleeding' | 'odor' | 'redness';
/** 大便颜色（灰白便为胆道闭锁红旗征） */
export type StoolColor = 'yellow' | 'yellow_green' | 'green' | 'light' | 'gray_white';
/** 吐奶 */
export type SpitUpLevel = 'none' | 'small' | 'frequent' | 'projectile';
/** 产妇乳房 */
export type BreastStatus = 'good' | 'engorged' | 'cracked' | 'inverted' | 'mastitis';
/** 产妇情绪 */
export type EmotionStatus = 'good' | 'anxious' | 'low' | 'epds_risk';
/** 伤口 */
export type WoundStatus = 'good' | 'pain' | 'redness' | 'secretion' | 'dehiscence';

export type SyncStatus = 'local_draft' | 'queued' | 'syncing' | 'synced' | 'failed';

/** 胆红素测量 */
export interface JaundiceMeasure {
  /** 经皮胆红素 TcB（mg/dL），额部 */
  forehead?: number;
  /** 经皮胆红素 TcB（mg/dL），胸部 */
  chest?: number;
  /** 血清胆红素 TSB（mg/dL），上级医院回报 */
  tsb?: number;
  /** 设备故障，未能测量 */
  deviceFault?: boolean;
  deviceName?: string;
}

export interface StoolRecord {
  count24h: number;
  color: StoolColor;
  /** 胎便是否已转黄 */
  meconiumCleared: boolean;
}

export interface FeedingRecord {
  mode: FeedingMode;
  /** 24 小时喂养次数 */
  frequency24h: number;
  /** 含接是否有效 */
  effectiveLatch: boolean;
  /** 配方奶/补授量说明 */
  supplement?: string;
}

export interface MotherRecord {
  breast: BreastStatus;
  emotion: EmotionStatus;
  /** EPDS 爱丁堡产后抑郁量表 0-30 */
  epdsScore?: number;
  /** 是否有自伤念头（EPDS 第10题阳性） */
  selfHarmThought?: boolean;
  wound: WoundStatus;
  woundNote?: string;
}

export interface CareAbility {
  primaryCaregiver: string;
  confidence: 'high' | 'medium' | 'low';
  concerns?: string;
}

export type DocumentType = 'birth_cert' | 'discharge_summary' | 'feeding_log' | 'jaundice_report' | 'other';

export interface FamilyDocument {
  id: string;
  archiveId: string;
  type: DocumentType;
  name: string;
  /** 照片在 IndexedDB 中的 key */
  photoId: string;
  uploadedBy: Role;
  createdAt: string;
  syncStatus: SyncStatus;
}

export interface PhotoRef {
  id: string;
  name: string;
  createdAt: string;
}

/** 上门访视记录 */
export interface Visit {
  id: string;
  /** 客户端生成的幂等 ID，用于离线队列去重 */
  clientId: string;
  archiveId: string;
  /** 第几次访视 */
  visitNumber: number;
  performedAt: string;
  /** 上门结果异常情形 */
  familyNotHome?: boolean;
  refusedEntry?: boolean;
  rescheduledTo?: string;
  outcomeNote?: string;
  /** 家长要求线上咨询 */
  onlineConsultRequested?: boolean;

  // —— 婴儿测量与观察 ——
  weightG?: number;
  jaundice?: JaundiceMeasure;
  cord?: CordStatus[];
  urineCount24h?: number;
  stool?: StoolRecord;
  feeding?: FeedingRecord;
  spitUp?: SpitUpLevel;
  sleepQuality?: 'good' | 'restless';
  photos: PhotoRef[];

  // —— 产妇与家庭 ——
  mother?: MotherRecord;
  careAbility?: CareAbility;
  nurseNote?: string;

  assessment?: RiskAssessment;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RiskFactor {
  level: 'info' | 'watch' | 'warning' | 'critical';
  code: string;
  text: string;
}

export type OverallRisk = 'green' | 'yellow' | 'orange' | 'red';
export type ActionType =
  | 'none'
  | 'routine' // 常规随访
  | 'recheck' // 安排复查
  | 'lactation' // 母乳指导
  | 'pediatric_referral' // 转儿科
  | 'emergency' // 立即急诊
  | 'psych_referral' // 心理/精神科转介
  | 'phone_followup'; // 增加电话随访

export interface RiskAssessment {
  /** 评估时出生小时数 */
  ageHours: number;
  /** 较出生体重下降百分比（正数表示下降） */
  weightLossPct?: number;
  /** 胆红素所处 Bhutani 小时龄分区 */
  bilirubinZone?: 'low' | 'low_intermediate' | 'high_intermediate' | 'high' | 'unmeasured';
  /** 胆红素接近阈值（距 95 百分位 ≤1 mg/dL） */
  bilirubinNearThreshold?: boolean;
  factors: RiskFactor[];
  overall: OverallRisk;
  actions: ActionType[];
  /** 建议复查时间（ISO），由规则引擎给出 */
  recheckAt?: string;
  /** 护士可在此基础上修改的护理建议 */
  advice: string[];
  /** 家属端可见的通俗风险说明 */
  familyExplanation: string;
  assessedAt: string;
}

export type FollowUpKind =
  | 'recheck'
  | 'referral'
  | 'lactation'
  | 'phone'
  | 'rescheduled_visit'
  | 'online_consult'
  | 'psych_referral';

export type FollowUpStatus = 'pending' | 'done' | 'overdue';

export interface FollowUpTask {
  id: string;
  archiveId: string;
  visitId?: string;
  kind: FollowUpKind;
  title: string;
  dueAt: string;
  status: FollowUpStatus;
  note?: string;
  /** 闭环记录（电话随访结果 / 复查值 / 转诊反馈） */
  closureNote?: string;
  closedAt?: string;
  createdAt: string;
  syncStatus: SyncStatus;
}

/** 母婴档案（预约信息） */
export interface FamilyArchive {
  id: string;
  babyName: string;
  gender: 'male' | 'female';
  birthDate: string;
  gestationalWeeks: number;
  birthWeightG: number;
  delivery: DeliveryType;
  feedingMode: FeedingMode;
  jaundiceRiskAtBirth: JaundiceRiskAtBirth;
  /** 高危因素：溶血、G6PD 缺乏、头皮血肿、同胞光疗史等 */
  riskFactorsAtBirth: string[];
  motherName: string;
  motherWound: WoundStatus;
  address: string;
  contactName: string;
  contactPhone: string;
  /** 家属端访问码（演示用） */
  accessCode: string;
  scheduledAt: string;
  status: VisitStatus;
  nurseId: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface ConsultMessage {
  id: string;
  archiveId: string;
  from: Role;
  text: string;
  createdAt: string;
  syncStatus: SyncStatus;
}

export interface NurseUser {
  id: string;
  name: string;
  phone: string;
  community: string;
}

export interface ServerSnapshot {
  version: number;
  archives: FamilyArchive[];
  visits: Visit[];
  followUps: FollowUpTask[];
  messages: ConsultMessage[];
  documents: FamilyDocument[];
  nurses: NurseUser[];
}
