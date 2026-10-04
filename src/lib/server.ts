// 模拟服务端：localStorage 持久化 + 随机延迟/可切换故障，
// 离线时 store 直接绕过它写本地草稿，恢复后由同步队列重放。
import type {
  ConsultMessage,
  FamilyArchive,
  FamilyDocument,
  FollowUpTask,
  ServerSnapshot,
  Visit,
} from '@/types';
import { seedSnapshot } from './seed';

const STORAGE_KEY = 'cnv_server_snapshot_v1';

function loadSnapshot(): ServerSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ServerSnapshot;
  } catch {
    // ignore
  }
  const fresh = seedSnapshot();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

function save(s: ServerSnapshot) {
  s.version += 1;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Mutation {
  type: 'saveVisit' | 'saveArchive' | 'saveFollowUp' | 'closeFollowUp' | 'saveMessage' | 'saveDocument';
  payload: unknown;
}

class MockServer {
  online = true;
  /** 模拟故障开关：开启后写入请求失败（用于演示同步重试） */
  faulty = false;

  private snapshot(): ServerSnapshot {
    return loadSnapshot();
  }

  async fetchAll(): Promise<ServerSnapshot> {
    await delay(200);
    if (!this.online) throw new Error('网络不可用');
    return this.snapshot();
  }

  async mutate(m: Mutation): Promise<{ ok: true }> {
    await delay(350);
    if (!this.online) throw new Error('网络不可用');
    if (this.faulty) throw new Error('社区服务端暂时不可用，请稍后重试');

    const s = this.snapshot();
    switch (m.type) {
      case 'saveVisit': {
        const v = m.payload as Visit;
        const i = s.visits.findIndex((x) => x.clientId === v.clientId || x.id === v.id);
        const synced: Visit = { ...v, syncStatus: 'synced' };
        if (i >= 0) s.visits[i] = synced;
        else s.visits.push(synced);
        break;
      }
      case 'saveArchive': {
        const a = m.payload as FamilyArchive;
        const i = s.archives.findIndex((x) => x.id === a.id);
        const synced = { ...a, syncStatus: 'synced' as const };
        if (i >= 0) s.archives[i] = synced;
        else s.archives.push(synced);
        break;
      }
      case 'saveFollowUp': {
        const t = m.payload as FollowUpTask;
        const i = s.followUps.findIndex((x) => x.id === t.id);
        const synced = { ...t, syncStatus: 'synced' as const };
        if (i >= 0) s.followUps[i] = synced;
        else s.followUps.push(synced);
        break;
      }
      case 'closeFollowUp': {
        const { id, closureNote, closedAt } = m.payload as { id: string; closureNote: string; closedAt: string };
        const t = s.followUps.find((x) => x.id === id);
        if (t) {
          t.status = 'done';
          t.closureNote = closureNote;
          t.closedAt = closedAt;
        }
        break;
      }
      case 'saveMessage': {
        const msg = m.payload as ConsultMessage;
        s.messages.push({ ...msg, syncStatus: 'synced' });
        break;
      }
      case 'saveDocument': {
        const doc = m.payload as FamilyDocument;
        const i = s.documents.findIndex((x) => x.id === doc.id);
        const synced = { ...doc, syncStatus: 'synced' as const };
        if (i >= 0) s.documents[i] = synced;
        else s.documents.push(synced);
        break;
      }
    }
    save(s);
    return { ok: true };
  }

  /** 演示/测试用：清空并重新播种 */
  reset(): ServerSnapshot {
    const fresh = seedSnapshot();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  }
}

export const mockServer = new MockServer();
