import type { OverallRisk, SyncStatus, VisitStatus } from '@/types';
import { OVERALL_LABEL } from '@/lib/labels';

const RISK_CLASS: Record<OverallRisk, string> = {
  green: 'badge-green',
  yellow: 'badge-yellow',
  orange: 'badge-orange',
  red: 'badge-red',
};

export function RiskBadge({ risk, text }: { risk: OverallRisk; text?: string }) {
  return <span className={`badge ${RISK_CLASS[risk]}`}>● {text ?? OVERALL_LABEL[risk]}</span>;
}

export const STATUS_META: Record<VisitStatus, { label: string; cls: string }> = {
  scheduled: { label: '待访视', cls: 'badge-blue' },
  completed: { label: '已完成', cls: 'badge-green' },
  rescheduled: { label: '已改约', cls: 'badge-yellow' },
  no_entry: { label: '未入门', cls: 'badge-red' },
};

export function StatusBadge({ status }: { status: VisitStatus }) {
  const m = STATUS_META[status];
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}

const SYNC_META: Record<SyncStatus, { label: string; cls: string }> = {
  local_draft: { label: '本地草稿', cls: 'badge-gray' },
  queued: { label: '待同步', cls: 'badge-yellow' },
  syncing: { label: '同步中', cls: 'badge-blue' },
  synced: { label: '已同步', cls: 'badge-green' },
  failed: { label: '同步失败', cls: 'badge-red' },
};

export function SyncBadge({ status }: { status: SyncStatus }) {
  if (status === 'synced') return null;
  const m = SYNC_META[status];
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}
