import { useMemo, useState } from 'react';
import { usePiniaStore } from '@/stores/bridge';
import { useAuthStore } from '@/stores/auth';
import { useDataStore } from '@/stores/data';
import { Header } from '@/components/Header';
import { FOLLOWUP_KIND_LABEL, formatDateTime } from '@/lib/labels';

type Filter = 'pending' | 'overdue' | 'done';

export function FollowUpCenter({ onOpenArchive }: { onOpenArchive: (id: string) => void }) {
  const auth = usePiniaStore(useAuthStore);
  const data = usePiniaStore(useDataStore);
  const [filter, setFilter] = useState<Filter>('pending');

  const nurseArchiveIds = useMemo(
    () => new Set(data.archives.filter((a) => a.nurseId === auth.nurse?.id).map((a) => a.id)),
    [data.archives, auth.nurse?.id],
  );

  const items = useMemo(() => {
    const now = Date.now();
    return data.followUps
      .filter((f) => nurseArchiveIds.has(f.archiveId))
      .map((f) => ({ f, archive: data.archiveById(f.archiveId), overdue: f.status !== 'done' && new Date(f.dueAt).getTime() < now }))
      .filter((x) => x.archive)
      .filter((x) => {
        if (filter === 'done') return x.f.status === 'done';
        if (filter === 'overdue') return x.overdue;
        return x.f.status !== 'done' && !x.overdue;
      })
      .sort((a, b) => a.f.dueAt.localeCompare(b.f.dueAt));
  }, [data, nurseArchiveIds, filter]);

  const counts = useMemo(() => {
    const now = Date.now();
    const mine = data.followUps.filter((f) => nurseArchiveIds.has(f.archiveId));
    return {
      pending: mine.filter((f) => f.status !== 'done' && new Date(f.dueAt).getTime() >= now).length,
      overdue: mine.filter((f) => f.status !== 'done' && new Date(f.dueAt).getTime() < now).length,
      done: mine.filter((f) => f.status === 'done').length,
    };
  }, [data.followUps, nurseArchiveIds]);

  return (
    <div className="app-shell">
      <Header title="随访闭环" sub="复查 · 转诊 · 母乳指导 · 电话随访" />
      <div className="page">
        <div className="chip-row">
          <button className={`chip ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>待处理 ({counts.pending})</button>
          <button className={`chip ${filter === 'overdue' ? 'active' : ''}`} onClick={() => setFilter('overdue')}>已逾期 ({counts.overdue})</button>
          <button className={`chip ${filter === 'done' ? 'active' : ''}`} onClick={() => setFilter('done')}>已闭环 ({counts.done})</button>
        </div>

        {items.length === 0 && <div className="empty"><div className="e-ico">🎉</div>{filter === 'done' ? '还没有闭环记录' : '没有这类随访任务'}</div>}

        {items.map(({ f, archive, overdue }) => (
          <div key={f.id} className="card" onClick={() => onOpenArchive(archive!.id)} style={{ cursor: 'pointer' }}>
            <div className="row-flex wrap">
              <strong>{archive!.babyName}</strong>
              <span className="badge badge-teal">{FOLLOWUP_KIND_LABEL[f.kind]}</span>
              <span className="spacer" />
              {f.status === 'done' ? <span className="badge badge-green">已闭环</span> : overdue ? <span className="badge badge-red">已逾期</span> : <span className="badge badge-yellow">待处理</span>}
            </div>
            <div style={{ marginTop: 8 }}>{f.title}</div>
            <div className="muted" style={{ marginTop: 4 }}>
              {f.status === 'done' ? `闭环于 ${formatDateTime(f.closedAt)}` : `应完成时间：${formatDateTime(f.dueAt)}`}
            </div>
            {f.closureNote && (
              <div style={{ marginTop: 6, background: 'var(--teal-50)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }}>
                {f.closureNote}
              </div>
            )}
            <div className="muted small" style={{ marginTop: 6 }}>📍 {archive!.address} · {archive!.contactName} {archive!.contactPhone}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
