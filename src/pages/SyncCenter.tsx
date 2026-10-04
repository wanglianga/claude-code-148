import { usePiniaStore } from '@/stores/bridge';
import { useDataStore } from '@/stores/data';
import { useSyncStore } from '@/stores/sync';
import { Header } from '@/components/Header';
import { formatDateTime } from '@/lib/labels';

export function SyncCenter({ onBack }: { onBack: () => void }) {
  const sync = usePiniaStore(useSyncStore);
  const data = usePiniaStore(useDataStore);

  return (
    <div className="app-shell">
      <Header title="离线草稿与同步中心" sub="先存本地草稿，回到社区后补齐同步" onBack={onBack} />
      <div className="page">
        <div className="card">
          <h2>现场网络模拟</h2>
          <div className="switch-row">
            <div>
              <div style={{ fontWeight: 600 }}>📶 设备联网</div>
              <div className="muted">关闭后模拟上门现场信号差：所有内容只存本机</div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={sync.online} onChange={(e) => sync.setOnline(e.target.checked)} />
              <span className="track" />
            </label>
          </div>
          <div className="switch-row">
            <div>
              <div style={{ fontWeight: 600 }}>🏥 社区服务端状态</div>
              <div className="muted">开启故障模拟：队列会保留并可在恢复后重试</div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={!sync.serverFaulty} onChange={(e) => sync.setFaulty(!e.target.checked)} />
              <span className="track" />
            </label>
          </div>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary" disabled={!sync.effectiveOnline || sync.syncing || data.queueCount === 0} onClick={() => void data.processQueue()}>
              {sync.syncing ? '正在同步…' : `立即同步（${data.queueCount} 条待发）`}
            </button>
            <button className="btn btn-outline" onClick={() => { if (confirm('确认重置全部演示数据？本地草稿也会清除。')) data.resetDemo(); }}>
              重置演示
            </button>
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            上次成功同步：{sync.lastSyncAt ? formatDateTime(sync.lastSyncAt) : '本次会话尚未同步'}
          </div>
        </div>

        <div className="card">
          <h2>同步队列（FIFO，按发生顺序重放）</h2>
          {data.queue.length === 0 && <div className="empty"><div className="e-ico">✅</div>队列已空，本地内容均已同步到社区</div>}
          {data.queue.map((q) => (
            <div key={q.id} className="queue-item">
              <div style={{ flex: 1 }}>
                <div>{q.label}</div>
                <div className="muted">{formatDateTime(q.createdAt)} · 已尝试 {q.attempts} 次{q.lastError ? ` · ${q.lastError}` : ''}</div>
              </div>
              <span className={`badge ${q.status === 'failed' ? 'badge-red' : q.status === 'syncing' ? 'badge-blue' : 'badge-yellow'}`}>
                {q.status === 'failed' ? '失败，待重试' : q.status === 'syncing' ? '同步中' : '排队中'}
              </span>
            </div>
          ))}
        </div>

        <div className="card">
          <h2>本地草稿/待同步访视</h2>
          {data.visits.filter((v) => v.syncStatus !== 'synced').length === 0 && <div className="empty">没有未同步的访视记录</div>}
          {data.visits
            .filter((v) => v.syncStatus !== 'synced')
            .map((v) => {
              const a = data.archiveById(v.archiveId);
              return (
                <div key={v.clientId} className="queue-item">
                  <div style={{ flex: 1 }}>
                    <div>{a?.babyName ?? v.archiveId} · 第 {v.visitNumber} 次访视</div>
                    <div className="muted">{formatDateTime(v.updatedAt)} · 体重 {v.weightG ?? '—'}g · 照片 {v.photos.length} 张</div>
                  </div>
                  <span className={`badge ${v.syncStatus === 'local_draft' ? 'badge-gray' : 'badge-yellow'}`}>
                    {v.syncStatus === 'local_draft' ? '本地草稿（未提交）' : '待同步'}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
