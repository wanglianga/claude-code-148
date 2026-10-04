// 跨视图选择器：最新访视、异常黄疸、产妇风险、待闭环随访
import type { FamilyArchive, FollowUpTask, OverallRisk, Visit } from '@/types';

export interface DataLike {
  archives: FamilyArchive[];
  visits: Visit[];
  followUps: FollowUpTask[];
  visitsFor: (id: string) => Visit[];
  followUpsFor: (id: string) => FollowUpTask[];
  latestAssessment: (id: string) => Visit['assessment'] | undefined;
}

export function latestVisit(data: DataLike, archiveId: string): Visit | undefined {
  const list = data.visitsFor(archiveId);
  return list.length ? list[list.length - 1] : undefined;
}

export function openFollowUps(data: DataLike, archiveId: string): FollowUpTask[] {
  return data.followUpsFor(archiveId).filter((f) => f.status !== 'done');
}

const ABNORMAL_ZONES: Array<NonNullable<Visit['assessment']>['bilirubinZone']> = ['high', 'high_intermediate'];
const ABNORMAL_OVERALL: OverallRisk[] = ['orange', 'red'];

/** 异常黄疸：最近一次评估处于中高危/高危区，或综合分级橙/红且与胆红素/大便相关 */
export function jaundiceAbnormal(data: DataLike, archiveId: string): boolean {
  const a = data.latestAssessment(archiveId);
  if (!a) return false;
  if (a.bilirubinZone && ABNORMAL_ZONES.includes(a.bilirubinZone)) return true;
  if (a.bilirubinNearThreshold) return true;
  if (ABNORMAL_OVERALL.includes(a.overall) && a.factors.some((f) => ['bili_high', 'bili_emergency', 'rapid_rise', 'bili_near', 'acholic_stool', 'pale_stool'].includes(f.code))) {
    return true;
  }
  return false;
}

/** 产妇风险：以最近一次访视为准（EPDS 关注及以上、乳房/伤口异常） */
export function maternalRisk(data: DataLike, archiveId: string): boolean {
  const list = data.visitsFor(archiveId);
  const m = list[list.length - 1]?.mother;
  if (!m) return false;
  return (
    m.selfHarmThought === true ||
    (typeof m.epdsScore === 'number' && m.epdsScore >= 9) ||
    m.emotion === 'epds_risk' ||
    m.breast === 'mastitis' ||
    m.wound === 'secretion' ||
    m.wound === 'dehiscence'
  );
}
