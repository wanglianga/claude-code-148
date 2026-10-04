import { useEffect } from 'react';
import { usePiniaStore } from '@/stores/bridge';
import { useAuthStore } from '@/stores/auth';
import { useDataStore } from '@/stores/data';
import { useSyncStore } from '@/stores/sync';
import { useHashRoute, parseRoute } from '@/hooks/useHashRoute';
import { Login } from '@/pages/Login';
import { NurseDashboard } from '@/pages/NurseDashboard';
import { ArchiveDetail } from '@/pages/ArchiveDetail';
import { FollowUpCenter } from '@/pages/FollowUpCenter';
import { FamilyPortal } from '@/pages/FamilyPortal';
import { SyncCenter } from '@/pages/SyncCenter';

export function App() {
  const auth = usePiniaStore(useAuthStore);
  const data = usePiniaStore(useDataStore);
  const sync = usePiniaStore(useSyncStore);
  const [path, navigate] = useHashRoute();
  const route = parseRoute(path);

  // 首次加载：先本地镜像、再拉服务端；联网恢复时自动重放队列
  useEffect(() => {
    void data.hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 从离线切回联网：自动同步
  useEffect(() => {
    if (sync.effectiveOnline && data.queueCount > 0) {
      void data.processQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.online, sync.serverFaulty]);

  if (!auth.role) {
    return <Login />;
  }

  // 同步中心：护士/家属均可进入
  if (route.name === 'sync') {
    return <SyncCenter onBack={() => navigate(auth.isNurse ? '/home' : '/family')} />;
  }

  if (auth.isFamily) {
    return <FamilyPortal onSyncCenter={() => navigate('/sync')} />;
  }

  // —— 护士端路由 ——
  if (route.name === 'archive' && route.params[0]) {
    return <ArchiveDetail archiveId={route.params[0]} onBack={() => navigate('/home')} />;
  }
  if (route.name === 'followups') {
    return (
      <>
        <FollowUpCenter onOpenArchive={(id) => navigate(`/archive/${id}`)} />
        <BottomNav current="followups" onNav={navigate} queueCount={data.queueCount} pendingCount={data.pendingCount} />
      </>
    );
  }

  return (
    <>
      <NurseDashboard onOpen={(id) => navigate(`/archive/${id}`)} onSyncCenter={() => navigate('/sync')} />
      <BottomNav current="home" onNav={navigate} queueCount={data.queueCount} pendingCount={data.pendingCount} />
    </>
  );
}

function BottomNav({ current, onNav, queueCount, pendingCount }: {
  current: 'home' | 'followups';
  onNav: (to: string) => void;
  queueCount: number;
  pendingCount: number;
}) {
  return (
    <nav className="bottom-nav">
      <a href="#/home" className={current === 'home' ? 'active' : ''} onClick={(e) => { e.preventDefault(); onNav('/home'); }}>
        <span className="nav-ico">🏠</span>工作台
      </a>
      <a href="#/followups" className={current === 'followups' ? 'active' : ''} onClick={(e) => { e.preventDefault(); onNav('/followups'); }} style={{ position: 'relative' }}>
        <span className="nav-ico">🔄</span>随访闭环
        {pendingCount > 0 && <span className="nav-badge">{pendingCount > 99 ? '99+' : pendingCount}</span>}
      </a>
      <a href="#/sync" onClick={(e) => { e.preventDefault(); onNav('/sync'); }} style={{ position: 'relative' }}>
        <span className="nav-ico">📶</span>同步
        {queueCount > 0 && <span className="nav-badge">{queueCount > 99 ? '99+' : queueCount}</span>}
      </a>
    </nav>
  );
}
