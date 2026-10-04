// 演示种子数据：时间均相对“当前时刻”生成，保证黄疸小时龄判断始终可复现。
import type {
  ConsultMessage,
  FamilyArchive,
  FamilyDocument,
  FollowUpTask,
  NurseUser,
  ServerSnapshot,
  Visit,
} from '@/types';
import { assess } from './risk';

const iso = (offsetHours: number) => new Date(Date.now() + offsetHours * 3_600_000).toISOString();

export const NURSES: NurseUser[] = [
  { id: 'n1', name: '王秀兰', phone: '13800000001', community: '阳光社区卫生服务中心' },
  { id: 'n2', name: '李梅', phone: '13800000002', community: '阳光社区卫生服务中心' },
];

interface SeedSpec {
  archive: Omit<FamilyArchive, 'createdAt' | 'updatedAt' | 'syncStatus'>;
  visits?: Array<Partial<Visit> & { performedOffset: number }>;
  followUps?: Array<{
    kind: FollowUpTask['kind'];
    title: string;
    dueOffset: number;
    status: FollowUpTask['status'];
    closureNote?: string;
    visitIndex?: number;
  }>;
  documents?: Array<{ type: FamilyDocument['type']; name: string; photoId: string; offset: number }>;
  messages?: Array<{ from: ConsultMessage['from']; text: string; offset: number }>;
}

function makeArchive(base: SeedSpec['archive']): FamilyArchive {
  const now = new Date().toISOString();
  return { ...base, createdAt: iso(-72), updatedAt: now, syncStatus: 'synced' };
}

type VisitSpec = NonNullable<SeedSpec['visits']>[number];

function makeVisit(archive: FamilyArchive, spec: VisitSpec, n: number): Visit {
  const performedAt = iso(spec.performedOffset);
  const partial: Visit = {
    id: `${archive.id}-v${n}`,
    clientId: `${archive.id}-v${n}`,
    archiveId: archive.id,
    visitNumber: n,
    performedAt,
    photos: [],
    syncStatus: 'synced',
    createdAt: performedAt,
    updatedAt: performedAt,
    ...spec,
  } as Visit;
  delete (partial as Partial<Visit> & { performedOffset?: number }).performedOffset;
  partial.assessment = assess({ archive, visit: partial });
  return partial;
}

export function seedSnapshot(): ServerSnapshot {
  const specs: SeedSpec[] = [
    {
      // 1) 今日待访视：健康足月、低危
      archive: {
        id: 'arc-1',
        babyName: '张一诺',
        gender: 'female',
        birthDate: iso(-30),
        gestationalWeeks: 39,
        birthWeightG: 3350,
        delivery: 'vaginal',
        feedingMode: 'breast',
        jaundiceRiskAtBirth: 'low',
        riskFactorsAtBirth: [],
        motherName: '陈静',
        motherWound: 'good',
        address: '阳光花园 3 栋 2 单元 501',
        contactName: '张建国（父亲）',
        contactPhone: '13911110001',
        accessCode: 'A1001',
        scheduledAt: iso(3),
        status: 'scheduled',
        nurseId: 'n1',
      },
    },
    {
      // 2) 今日待访视：早产 + 高危因素，重点
      archive: {
        id: 'arc-2',
        babyName: '林小宝',
        gender: 'male',
        birthDate: iso(-55),
        gestationalWeeks: 36,
        birthWeightG: 2680,
        delivery: 'cesarean',
        feedingMode: 'mixed',
        jaundiceRiskAtBirth: 'high',
        riskFactorsAtBirth: ['G6PD 缺乏家族史', '哥哥曾因高胆红素血症光疗'],
        motherName: '赵琳',
        motherWound: 'pain',
        address: '阳光花园 7 栋 1 单元 302',
        contactName: '林大勇（父亲）',
        contactPhone: '13911110002',
        accessCode: 'A1002',
        scheduledAt: iso(6),
        status: 'scheduled',
        nurseId: 'n1',
      },
    },
    {
      // 3) 昨日已访：胆红素接近阈值，等待 12h 复查（进行中闭环）
      archive: {
        id: 'arc-3',
        babyName: '王乐瑶',
        gender: 'female',
        birthDate: iso(-88),
        gestationalWeeks: 40,
        birthWeightG: 3520,
        delivery: 'vaginal',
        feedingMode: 'breast',
        jaundiceRiskAtBirth: 'medium',
        riskFactorsAtBirth: ['头皮血肿'],
        motherName: '孙丽',
        motherWound: 'good',
        address: '和平里 12 栋 3 单元 401',
        contactName: '王海（父亲）',
        contactPhone: '13911110003',
        accessCode: 'A1003',
        scheduledAt: iso(-20),
        status: 'completed',
        nurseId: 'n1',
      },
      visits: [
        {
          performedOffset: -20,
          weightG: 3310,
          jaundice: { forehead: 15.2, chest: 15.6, deviceName: 'JM-105 #02' },
          cord: ['dry'],
          urineCount24h: 6,
          stool: { count24h: 3, color: 'yellow_green', meconiumCleared: true },
          feeding: { mode: 'breast', frequency24h: 8, effectiveLatch: true },
          spitUp: 'small',
          sleepQuality: 'good',
          mother: { breast: 'good', emotion: 'anxious', wound: 'good' },
          careAbility: { primaryCaregiver: '母亲+外婆', confidence: 'medium', concerns: '担心黄疸影响大脑' },
          nurseNote: '颜面至躯干黄染，吃奶可，家属焦虑明显，已宣教。',
        },
      ],
      followUps: [
        { kind: 'recheck', title: '12 小时内复测胆红素（临界值）', dueOffset: -8, status: 'pending', visitIndex: 0 },
        { kind: 'phone', title: '电话安抚并解答黄疸疑问', dueOffset: -18, status: 'done', closureNote: '已电话解释小时龄分区与光疗指征，家属情绪缓解。', visitIndex: 0 },
      ],
      messages: [
        { from: 'family', text: '护士您好，宝宝眼白也有点黄，要不要紧？', offset: -16 },
        { from: 'nurse', text: '已为您安排今天上午复测，请按时到中心；期间多喂奶、2-3 小时一次。', offset: -15 },
      ],
    },
    {
      // 4) 体重下降过多 + 喂养不足：母乳指导 + 复查（已逾期）
      archive: {
        id: 'arc-4',
        babyName: '刘念安',
        gender: 'male',
        birthDate: iso(-120),
        gestationalWeeks: 39,
        birthWeightG: 3200,
        delivery: 'assisted',
        feedingMode: 'breast',
        jaundiceRiskAtBirth: 'low',
        riskFactorsAtBirth: [],
        motherName: '周敏',
        motherWound: 'redness',
        address: '和平里 5 栋 2 单元 202',
        contactName: '刘强（父亲）',
        contactPhone: '13911110004',
        accessCode: 'A1004',
        scheduledAt: iso(-26),
        status: 'completed',
        nurseId: 'n1',
      },
      visits: [
        {
          performedOffset: -26,
          weightG: 2830,
          jaundice: { forehead: 11.2, chest: 11.8, deviceName: 'JM-105 #02' },
          cord: ['dry'],
          urineCount24h: 4,
          stool: { count24h: 2, color: 'green', meconiumCleared: false },
          feeding: { mode: 'breast', frequency24h: 6, effectiveLatch: false, supplement: '家属反映吃不饱但未加配方奶' },
          spitUp: 'none',
          sleepQuality: 'restless',
          mother: { breast: 'cracked', emotion: 'low', epdsScore: 10, wound: 'redness' },
          careAbility: { primaryCaregiver: '母亲（新手）', confidence: 'low', concerns: '不会含接、孩子哭闹就不敢喂' },
          nurseNote: '乳头皲裂、含接差；胎便未转黄；母亲情绪低落。',
        },
      ],
      followUps: [
        { kind: 'lactation', title: '上门一对一母乳指导（含接/频次）', dueOffset: -2, status: 'overdue', visitIndex: 0 },
        { kind: 'recheck', title: '24 小时复测体重与胆红素', dueOffset: -2, status: 'pending', visitIndex: 0 },
        { kind: 'phone', title: 'EPDS 10 分，情绪支持电话随访', dueOffset: 2, status: 'pending', visitIndex: 0 },
      ],
      documents: [
        { type: 'discharge_summary', name: '出院小结.jpg', photoId: 'doc-seed-arc4-1', offset: -24 },
        { type: 'feeding_log', name: '喂养记录（家属补拍）.jpg', photoId: 'doc-seed-arc4-2', offset: -10 },
      ],
    },
    {
      // 5) 上门不愿开门：未完成访视
      archive: {
        id: 'arc-5',
        babyName: '陈小满',
        gender: 'female',
        birthDate: iso(-70),
        gestationalWeeks: 38,
        birthWeightG: 3100,
        delivery: 'vaginal',
        feedingMode: 'mixed',
        jaundiceRiskAtBirth: 'medium',
        riskFactorsAtBirth: [],
        motherName: '吴倩',
        motherWound: 'good',
        address: '幸福小区 2 栋 4 单元 601',
        contactName: '陈立（爷爷）',
        contactPhone: '13911110005',
        accessCode: 'A1005',
        scheduledAt: iso(-5),
        status: 'no_entry',
        nurseId: 'n1',
      },
      visits: [
        {
          performedOffset: -5,
          refusedEntry: true,
          outcomeNote: '老人称月子里不能见外人，拒绝开门；已隔门宣教并电话联系产妇本人。',
        },
      ],
      followUps: [{ kind: 'phone', title: '联系产妇本人，视频方式完成初步评估', dueOffset: 1, status: 'pending', visitIndex: 0 }],
    },
    {
      // 6) 家庭改约
      archive: {
        id: 'arc-6',
        babyName: '赵知行',
        gender: 'male',
        birthDate: iso(-40),
        gestationalWeeks: 41,
        birthWeightG: 3680,
        delivery: 'cesarean',
        feedingMode: 'formula',
        jaundiceRiskAtBirth: 'low',
        riskFactorsAtBirth: [],
        motherName: '钱多多',
        motherWound: 'secretion',
        address: '幸福小区 9 栋 1 单元 102',
        contactName: '赵刚（父亲）',
        contactPhone: '13911110006',
        accessCode: 'A1006',
        scheduledAt: iso(26),
        status: 'rescheduled',
        nurseId: 'n2',
      },
      followUps: [{ kind: 'rescheduled_visit', title: '按家属改约时间上门访视', dueOffset: 26, status: 'pending' }],
    },
    {
      // 7) 已闭环：灰白便急诊转诊成功 + 产妇情绪危机转介
      archive: {
        id: 'arc-7',
        babyName: '孙果果',
        gender: 'female',
        birthDate: iso(-240),
        gestationalWeeks: 39,
        birthWeightG: 3400,
        delivery: 'vaginal',
        feedingMode: 'mixed',
        jaundiceRiskAtBirth: 'medium',
        riskFactorsAtBirth: [],
        motherName: '林小果',
        motherWound: 'good',
        address: '和平里 1 栋 1 单元 101',
        contactName: '孙磊（父亲）',
        contactPhone: '13911110007',
        accessCode: 'A1007',
        scheduledAt: iso(-150),
        status: 'completed',
        nurseId: 'n2',
      },
      visits: [
        {
          performedOffset: -150,
          weightG: 3180,
          jaundice: { forehead: 15.2, chest: 16.1, deviceName: 'JM-105 #01' },
          cord: ['dry'],
          urineCount24h: 5,
          stool: { count24h: 2, color: 'gray_white', meconiumCleared: true },
          feeding: { mode: 'mixed', frequency24h: 9, effectiveLatch: true },
          spitUp: 'none',
          sleepQuality: 'restless',
          mother: { breast: 'good', emotion: 'epds_risk', epdsScore: 15, selfHarmThought: false, wound: 'good' },
          careAbility: { primaryCaregiver: '父母', confidence: 'medium' },
          nurseNote: '陶土样大便，立即转诊；EPDS 15 分同步转介心理门诊。',
        },
        {
          performedOffset: -96,
          weightG: 3520,
          jaundice: { tsb: 12.4 },
          cord: ['dry'],
          urineCount24h: 8,
          stool: { count24h: 4, color: 'yellow', meconiumCleared: true },
          feeding: { mode: 'mixed', frequency24h: 10, effectiveLatch: true },
          spitUp: 'none',
          sleepQuality: 'good',
          mother: { breast: 'good', emotion: 'anxious', epdsScore: 8, wound: 'good' },
          careAbility: { primaryCaregiver: '父母', confidence: 'high' },
          nurseNote: '外院确诊胆道闭锁已行 Kasai 术后恢复中，大便转黄；母亲情绪好转。',
        },
      ],
      followUps: [
        { kind: 'referral', title: '急诊转儿童医院（陶土便/黄疸）', dueOffset: -149, status: 'done', closureNote: '儿童医院确诊胆道闭锁，已行 Kasai 手术，术后大便转黄。', visitIndex: 0 },
        { kind: 'psych_referral', title: '产后抑郁转介心理门诊', dueOffset: -146, status: 'done', closureNote: '心理门诊接诊，随访 EPDS 降至 8 分。', visitIndex: 0 },
      ],
    },
  ];

  const archives: FamilyArchive[] = [];
  const visits: Visit[] = [];
  const followUps: FollowUpTask[] = [];
  const messages: ConsultMessage[] = [];
  const documents: FamilyDocument[] = [];

  specs.forEach((spec, idx) => {
    const archive = makeArchive(spec.archive);
    archives.push(archive);

    (spec.visits ?? []).forEach((vs, i) => {
      const visit = makeVisit(archive, vs, i + 1);
      visits.push(visit);
    });

    spec.followUps?.forEach((f, i) => {
      const dueAt = iso(f.dueOffset);
      const isDone = f.status === 'done';
      followUps.push({
        id: `${archive.id}-f${i + 1}`,
        archiveId: archive.id,
        visitId: f.visitIndex !== undefined ? `${archive.id}-v${f.visitIndex + 1}` : undefined,
        kind: f.kind,
        title: f.title,
        dueAt,
        status: f.status,
        closureNote: f.closureNote,
        closedAt: isDone ? iso(f.dueOffset + 1) : undefined,
        createdAt: iso(Math.min(f.dueOffset - 2, -1)),
        syncStatus: 'synced',
      });
    });

    spec.documents?.forEach((d, i) => {
      documents.push({
        id: `${archive.id}-d${i + 1}`,
        archiveId: archive.id,
        type: d.type,
        name: d.name,
        photoId: d.photoId,
        uploadedBy: 'family',
        createdAt: iso(d.offset),
        syncStatus: 'synced',
      });
    });

    spec.messages?.forEach((msg, i) => {
      messages.push({
        id: `${archive.id}-m${i + 1}`,
        archiveId: archive.id,
        from: msg.from === 'family' ? 'family' : 'nurse',
        text: msg.text,
        createdAt: iso(msg.offset),
        syncStatus: 'synced',
      });
    });
    void idx;
  });

  return { version: 1, archives, visits, followUps, messages, documents, nurses: NURSES };
}
