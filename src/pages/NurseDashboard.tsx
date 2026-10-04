import { useMemo, useState } from 'react';
import type { FamilyArchive, Visit } from '@/types';
import { usePiniaStore } from '@/stores/bridge';
import { useAuthStore } from '@/stores/auth';
import { useDataStore } from '@/stores/data';
import { useSyncStore } from '@/stores/sync';
import { Header } from '@/components/Header';
import { RiskBadge, StatusBadge, SyncBadge } from '@/components/Badges';
import { ageText, DELIVERY_LABEL, FEEDING_LABEL, formatDateTime } from '@/lib/labels';
import { jaundiceAbnormal, maternalRisk, latestVisit, openFollowUps } from '@/lib/selectors';

type Filter = 'all' | 'today' | 'jaundice' | 'mother' | 'open' | 'exception' | 'draft';

const FILTERS: Array<[Filter, string]> = [
  ['all', '全部家庭'],
  ['today', '今日待访视'],
  ['jaundice', '异常黄疸'],
  ['mother', '产妇风险'],
  ['open', '随访未闭环'],
  ['exception', '未入门/改约'],
  ['draft', '本地草稿'],
];

export function NurseDashboard({ onOpen, onSyncCenter }: { onOpen: (id: string) => void; onSyncCenter: () => void }) {
  const auth = usePiniaStore(useAuthStore);
  const data = usePiniaStore(useDataStore);
  const sync = usePiniaStore(useSyncStore);
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => {
    const nurseId = auth.nurse?.id;
    return data.archives
      .filter((a) => a.nurseId === nurseId)
      .map((a) => {
        const visits = data.visitsFor(a.id) as Visit[];
        const last = latestVisit(data, a.id);
        const open = openFollowUps(data, a.id);
        const overdue = open.filter((f) => f.status === 'overdue' || (f.status === 'pending' && new Date(f.dueAt).getTime() < Date.now()));
        return {
          archive: a,
          visits,
          last,
          overall: last?.assessment?.overall,
          jaundice: jaundiceAbnormal(data, a.id),
          mother: maternalRisk(data, a.id),
          openCount: open.length,
          overdueCount: overdue.length,
          draft: visits.some((v) => v.syncStatus === 'local_draft') || a.syncStatus !== 'synced',
        };
      });
  }, [data, auth.nurse?.id]);

  const stats = useMemo(() => {
    const today = rows.filter((r) => r.archive.status === 'scheduled');
    return {
      scheduled: today.length,
      jaundice: rows.filter((r) => r.jaundice).length,
      mother: rows.filter((r) => r.mother).length,
      open: rows.reduce((n, r) => n + r.openCount, 0),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const list = rows.filter((r) => {
      switch (filter) {
        case 'today': {
          const t = new Date(r.archive.scheduledAt).getTime();
          return r.archive.status === 'scheduled' && t < now + 30 * 3600_000;
        }
        case 'jaundice': return r.jaundice;
        case 'mother': return r.mother;
        case 'open': return r.openCount > 0;
        case 'exception': return r.archive.status === 'no_entry' || r.archive.status === 'rescheduled';
        case 'draft': return r.draft;
        default: return true;
      }
    });
    const order = { red: 0, orange: 1, yellow: 2, green: 3, scheduled: 4 };
    return list.sort((x, y) => {
      if ((x.overdueCount > 0 ? 0 : 1) !== (y.overdueCount > 0 ? 0 : 1)) return x.overdueCount > 0 ? -1 : 1;
      const ox = x.overall ?? (x.archive.status === 'scheduled' ? 'scheduled' : 'green');
      const oy = y.overall ?? (y.archive.status === 'scheduled' ? 'scheduled' : 'green');
      return order[ox as keyof typeof order] - order[oy as keyof typeof order];
    });
  }, [rows, filter]);

  return (
    <div className="app-shell">
      <Header
        title={`你好，${auth.nurse?.name ?? '护士'}`}
        sub={auth.nurse?.community}
        right={
          <>
            <button className="icon-btn" onClick={onSyncCenter}>
              同步{data.queueCount > 0 ? `(${data.queueCount})` : ''}
            </button>
            <button className="icon-btn" onClick={() => auth.logout()}>退出</button>
          </>
        }
      />

      <div className="page">
        <div className="stat-grid">
          <div className="stat-tile info" onClick={() => setFilter('today')}>
            <div className="num">{stats.scheduled}</div>
            <div className="lbl">未访视家庭</div>
          </div>
          <div className="stat-tile danger" onClick={() => setFilter('jaundice')}>
            <div className="num">{stats.jaundice}</div>
            <div className="lbl">异常黄疸</div>
          </div>
          <div className="stat-tile warn" onClick={() => setFilter('mother')}>
            <div className="num">{stats.mother}</div>
            <div className="lbl">产妇风险</div>
          </div>
          <div className="stat-tile primary" onClick={() => setFilter('open')}>
            <div className="num">{stats.open}</div>
            <div className="lbl">随访待闭环</div>
          </div>
        </div>

        <div className="chip-row">
          {FILTERS.map(([f, t]) => (
            <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{t}</button>
          ))}
        </div>

        {!sync.online && (
          <div className="card" style={{ borderLeft: '4px solid var(--yellow)' }}>
            <strong>📴 离线现场模式</strong>
            <div className="muted" style={{ marginTop: 4 }}>
              访视、测量、照片会先存为本地草稿；回到社区联网后在「同步」里一键补齐。
            </div>
          </div>
        )}

        {filtered.length === 0 && <div className="empty"><div className="e-ico">🗒️</div>当前筛选下没有家庭</div>}

        {filtered.map((r) => (
          <FamilyRow
            key={r.archive.id}
            archive={r.archive}
            latest={r.last}
            jaundice={r.jaundice}
            mother={r.mother}
            openCount={r.openCount}
            overdueCount={r.overdueCount}
            hasDraft={r.visits.some((v) => v.syncStatus === 'local_draft')}
            onClick={() => onOpen(r.archive.id)}
          />
        ))}

        <div className="desktop-hint">数据为演示数据，可在「同步」页切换离线/故障并重置演示</div>
      </div>
    </div>
  );
}

function FamilyRow({ archive, latest, jaundice, mother, openCount, overdueCount, hasDraft, onClick }: {
  archive: FamilyArchive;
  latest?: Visit;
  jaundice: boolean;
  mother: boolean;
  openCount: number;
  overdueCount: number;
  hasDraft: boolean;
  onClick: () => void;
}) {
  const riskClass = latest?.assessment ? `risk-${latest.assessment.overall === 'green' ? 'yellow' : latest.assessment.overall}` : '';
  return (
    <div className={`family-item ${riskClass}`} onClick={onClick}>
      <div className="avatar">{archive.babyName.slice(0, 1)}</div>
      <div className="fi-main">
        <div className="fi-title">
          {archive.babyName}
          {latest?.assessment && <RiskBadge risk={latest.assessment.overall} />}
          <StatusBadge status={archive.status} />
        </div>
        <div className="fi-sub">
          {archive.motherName} · {ageText(archive.birthDate)} · {DELIVERY_LABEL[archive.delivery]} · {FEEDING_LABEL[archive.feedingMode]}
        </div>
        <div className="fi-sub">📍 {archive.address} · 预约 {formatDateTime(archive.scheduledAt)}</div>
        <div className="fi-tags">
          {jaundice && <span className="badge badge-red">异常黄疸</span>}
          {mother && <span className="badge badge-orange">产妇风险</span>}
          {overdueCount > 0 && <span className="badge badge-red">{overdueCount} 项已逾期</span>}
          {openCount > 0 && <span className="badge badge-blue">{openCount} 项随访中</span>}
          {hasDraft && <SyncBadge status="local_draft" />}
          {archive.syncStatus !== 'synced' && !hasDraft && <SyncBadge status={archive.syncStatus} />}
        </div>
      </div>
      <div style={{ color: 'var(--ink-300)', alignSelf: 'center', fontSize: 18 }}>›</div>
    </div>
  );
}
