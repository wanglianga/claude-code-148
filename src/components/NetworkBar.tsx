import { usePiniaStore } from '@/stores/bridge';
import { useSyncStore } from '@/stores/sync';
import { useDataStore } from '@/stores/data';
import { formatDateTime } from '@/lib/labels';

export function NetworkBar() {
  const sync = usePiniaStore(useSyncStore);
  const data = usePiniaStore(useDataStore);

  return (
    <div className={`network-bar ${sync.serverFaulty ? 'faulty' : sync.online ? 'online' : 'offline'}`}>
      <span>{sync.online ? (sync.serverFaulty ? '⚠ 服务端故障' : '🟢 已联网') : '📴 现场离线模式'}</span>
      {sync.lastSyncAt && <span className="muted" style={{ color: 'inherit', opacity: 0.75 }}>· 上次同步 {formatDateTime(sync.lastSyncAt)}</span>}
      <span className="spacer" />
      {data.queueCount > 0 && <span>{data.queueCount} 条待发</span>}
      {!sync.online && (
        <button onClick={() => sync.setOnline(true)}>回到中心，联网</button>
      )}
      {sync.online && data.queueCount > 0 && (
        <button onClick={() => void data.processQueue()} disabled={sync.syncing}>
          {sync.syncing ? '同步中…' : '立即同步'}
        </button>
      )}
    </div>
  );
}
