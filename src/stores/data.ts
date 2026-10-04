// 核心数据 store：
// - 启动时先读本地镜像（离线可立即查看/继续编辑草稿），再尝试拉取服务端并合并
// - 所有写操作立即落本地（localStorage 镜像 + 照片在 IndexedDB）并入同步队列
// - 回到社区联网后按 FIFO 重放，成功后实体标记 synced 并出队
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  ActionType,
  ConsultMessage,
  FamilyArchive,
  FamilyDocument,
  FollowUpTask,
  NurseUser,
  Visit,
} from '@/types';
import { mockServer, type Mutation } from '@/lib/server';
import { seedSnapshot } from '@/lib/seed';
import { assess, effectiveBilirubin } from '@/lib/risk';
import { uid, nowIso, addHours } from '@/lib/id';
import { useSyncStore } from './sync';

const LOCAL_KEY = 'cnv_local_db_v1';

export interface QueueItem {
  id: string;
  mutation: Mutation;
  archiveId: string;
  label: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
  status: 'queued' | 'syncing' | 'failed';
}

interface LocalDb {
  archives: FamilyArchive[];
  visits: Visit[];
  followUps: FollowUpTask[];
  messages: ConsultMessage[];
  documents: FamilyDocument[];
  queue: QueueItem[];
}

function emptyDb(): LocalDb {
  return { archives: [], visits: [], followUps: [], messages: [], documents: [], queue: [] };
}

function loadLocal(): LocalDb | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw) as LocalDb;
  } catch {
    // ignore
  }
  return null;
}

const AUTO_NOTE = 'auto-assessment';

function followUpFromAction(action: ActionType, archiveId: string, visitId: string, recheckAt?: string): FollowUpTask | null {
  const now = nowIso();
  const base = {
    id: uid('fu'),
    archiveId,
    visitId,
    status: 'pending' as const,
    note: AUTO_NOTE,
    createdAt: now,
    syncStatus: 'queued' as const,
  };
  switch (action) {
    case 'recheck':
      return { ...base, kind: 'recheck', title: recheckAt ? '按时复测胆红素/体重' : '安排黄疸复查', dueAt: recheckAt ?? addHours(now, 24) };
    case 'pediatric_referral':
      return { ...base, kind: 'referral', title: '转上级医院儿科评估', dueAt: addHours(now, 4) };
    case 'emergency':
      return { ...base, kind: 'referral', title: '立即新生儿急诊！', dueAt: now };
    case 'lactation':
      return { ...base, kind: 'lactation', title: '安排母乳指导（含接/频次/乳房问题）', dueAt: addHours(now, 24) };
    case 'psych_referral':
      return { ...base, kind: 'psych_referral', title: '产后情绪问题转介心理门诊', dueAt: addHours(now, 24) };
    case 'phone_followup':
      return { ...base, kind: 'phone', title: '增加电话随访', dueAt: addHours(now, 48) };
    default:
      return null;
  }
}

export const useDataStore = defineStore('data', () => {
  const local = loadLocal() ?? emptyDb();
  const archives = ref<FamilyArchive[]>(local.archives);
  const visits = ref<Visit[]>(local.visits);
  const followUps = ref<FollowUpTask[]>(local.followUps);
  const messages = ref<ConsultMessage[]>(local.messages);
  const documents = ref<FamilyDocument[]>(local.documents);
  const queue = ref<QueueItem[]>(local.queue);
  const nurses = ref<NurseUser[]>([]);
  const loaded = ref(false);
  const pullError = ref<string | null>(null);

  // ---------- 持久化 ----------
  function persist() {
    const db: LocalDb = {
      archives: archives.value,
      visits: visits.value,
      followUps: followUps.value,
      messages: messages.value,
      documents: documents.value,
      queue: queue.value,
    };
    localStorage.setItem(LOCAL_KEY, JSON.stringify(db));
  }

  /** 写操作后尝试同步：现场离线/服务端故障时不发请求，等回中心或手动触发 */
  function scheduleFlush() {
    const sync = useSyncStore();
    if (sync.effectiveOnline && !sync.syncing) void processQueue();
  }

  function enqueue(mutation: Mutation, archiveId: string, label: string) {
    queue.value.push({ id: uid('q'), mutation, archiveId, label, createdAt: nowIso(), attempts: 0, status: 'queued' });
  }

  // ---------- 服务端拉取与合并 ----------
  async function hydrate() {
    const sync = useSyncStore();
    try {
      const snap = await mockServer.fetchAll();
      nurses.value = snap.nurses;
      pullError.value = null;
      mergeServer(snap);
      loaded.value = true;
      sync.markSynced();
      // 联网恢复后若有待发内容，立即尝试重放
      if (queue.value.length) await processQueue();
    } catch (e) {
      // 离线：使用本地镜像；首次使用且无镜像时从种子播种（演示数据）
      pullError.value = (e as Error).message;
      if (!loaded.value && archives.value.length === 0) {
        const seed = seedSnapshot();
        archives.value = seed.archives;
        visits.value = seed.visits;
        followUps.value = seed.followUps;
        messages.value = seed.messages;
        documents.value = seed.documents;
        nurses.value = seed.nurses;
        persist();
      }
      loaded.value = true;
    }
  }

  /** 用服务端快照替换已提交数据；保留本地尚未同步成功的草稿/队列项 */
  function mergeServer(snap: Awaited<ReturnType<typeof mockServer.fetchAll>>) {
    const queuedVisitIds = new Set(queue.value.filter((q) => q.mutation.type === 'saveVisit').map((q) => (q.mutation.payload as Visit).clientId));
    const queuedIds = new Set(queue.value.flatMap((q) => {
      const p = q.mutation.payload as { id?: string; clientId?: string };
      return [p.id, p.clientId].filter(Boolean) as string[];
    }));

    const serverVisits = snap.visits;
    const localOnlyVisits = visits.value.filter(
      (v) => !serverVisits.some((s) => s.clientId === v.clientId || s.id === v.id) && (v.syncStatus !== 'synced' || queuedVisitIds.has(v.clientId)),
    );
    visits.value = [...serverVisits, ...localOnlyVisits];

    const mergeById = <T extends { id: string }>(serverItems: T[], localItems: T[]): T[] => {
      const localOnly = localItems.filter((li) => !serverItems.some((si) => si.id === li.id) && queuedIds.has(li.id));
      return [...serverItems, ...localOnly];
    };
    archives.value = mergeById(snap.archives, archives.value);
    followUps.value = mergeById(snap.followUps, followUps.value);
    messages.value = mergeById(snap.messages, messages.value);
    documents.value = mergeById(snap.documents, documents.value);

    // 服务端可能已含队列实体（其他设备同步）→ 清理出队
    queue.value = queue.value.filter((q) => {
      const p = q.mutation.payload as { id?: string; clientId?: string };
      const exists =
        (p.id && [...snap.archives, ...snap.visits, ...snap.followUps, ...snap.messages, ...snap.documents].some((x) => x.id === p.id)) ||
        (p.clientId && snap.visits.some((v) => v.clientId === p.clientId));
      return !exists;
    });
    persist();
  }

  // ---------- 同步队列 ----------
  async function processQueue(): Promise<{ sent: number; failed: number }> {
    const sync = useSyncStore();
    if (sync.syncing) return { sent: 0, failed: 0 };
    // 设备离线直接不发请求；服务端故障仍尝试一次以便暴露错误并保留队列
    if (!sync.online) return { sent: 0, failed: queue.value.length };
    sync.setSyncing(true);
    let sent = 0;
    let failed = 0;
    // 从最早的开始，逐条重放
    while (queue.value.length) {
      const item = queue.value[0];
      item.status = 'syncing';
      try {
        await mockServer.mutate(item.mutation);
        applySynced(item);
        queue.value.shift();
        sent += 1;
      } catch (e) {
        item.attempts += 1;
        item.lastError = (e as Error).message;
        item.status = 'failed';
        failed += 1;
        // 队头失败则暂停，保持顺序（后续改约/转诊可能依赖前面的访视）
        break;
      }
    }
    persist();
    sync.setSyncing(false);
    if (sent > 0) {
      sync.markSynced();
      // 拉取最新服务端状态，得到他人协作更新
      try {
        const snap = await mockServer.fetchAll();
        mergeServer(snap);
      } catch {
        // 忽略，本地已更新
      }
    }
    return { sent, failed };
  }

  function applySynced(item: QueueItem) {
    const p = item.mutation.payload;
    switch (item.mutation.type) {
      case 'saveVisit': {
        const v = p as Visit;
        const t = visits.value.find((x) => x.clientId === v.clientId);
        if (t) t.syncStatus = 'synced';
        break;
      }
      case 'saveArchive': {
        const a = p as FamilyArchive;
        const t = archives.value.find((x) => x.id === a.id);
        if (t) t.syncStatus = 'synced';
        break;
      }
      case 'saveFollowUp':
      case 'saveDocument':
      case 'saveMessage': {
        const t = [followUps.value, documents.value, messages.value].flat().find((x) => x.id === (p as { id: string }).id);
        if (t) t.syncStatus = 'synced';
        break;
      }
      case 'closeFollowUp':
        break;
    }
  }

  // ---------- 业务写操作 ----------

  /** 仅保存本地草稿：不入同步队列、不改变预约状态、不产生随访任务，可随时继续编辑 */
  function saveDraft(draft: Visit) {
    draft.syncStatus = 'local_draft';
    draft.updatedAt = nowIso();
    const existing = visits.value.findIndex((v) => v.clientId === draft.clientId);
    if (existing >= 0) visits.value[existing] = draft;
    else visits.value.push(draft);
    persist();
  }

  /** 保存访视（离线为本地草稿）。重新评估风险并重建该访视的自动随访任务。 */
  function saveVisit(archive: FamilyArchive, draft: Visit): { visit: Visit; assessment: Visit['assessment'] } {
    const prevVisits = visits.value
      .filter((v) => v.archiveId === archive.id && v.clientId !== draft.clientId)
      .sort((a, b) => a.performedAt.localeCompare(b.performedAt));
    const previous = prevVisits[prevVisits.length - 1];

    const prevBili = previous ? effectiveBilirubin(previous.jaundice) : undefined;
    const assessment = assess({
      archive,
      visit: draft,
      previousWeightG: previous?.weightG,
      previousBilirubin: prevBili !== undefined ? { value: prevBili, at: previous!.performedAt } : undefined,
    });
    draft.assessment = assessment;
    draft.updatedAt = nowIso();
    draft.syncStatus = 'queued';

    const existing = visits.value.findIndex((v) => v.clientId === draft.clientId);
    if (existing >= 0) visits.value[existing] = draft;
    else visits.value.push(draft);

    // 档案状态
    archive.status = draft.refusedEntry ? 'no_entry' : draft.familyNotHome ? 'no_entry' : draft.rescheduledTo ? 'rescheduled' : 'completed';
    archive.updatedAt = nowIso();
    archive.syncStatus = 'queued';
    upsertArchive(archive, false);

    // 重建自动随访任务（保留护士手工关闭/新增的）
    followUps.value = followUps.value.filter((f) => !(f.visitId === draft.id && f.note === AUTO_NOTE && f.status === 'pending'));
    assessment.actions.forEach((action) => {
      const fu = followUpFromAction(action, archive.id, draft.id, assessment.recheckAt);
      if (fu) followUps.value.push(fu);
    });
    if (draft.onlineConsultRequested) {
      followUps.value.push({
        id: uid('fu'), archiveId: archive.id, visitId: draft.id, kind: 'online_consult',
        title: '回复家属线上咨询', dueAt: addHours(nowIso(), 24), status: 'pending',
        note: AUTO_NOTE, createdAt: nowIso(), syncStatus: 'queued',
      });
    }
    if (draft.rescheduledTo) {
      followUps.value.push({
        id: uid('fu'), archiveId: archive.id, visitId: draft.id, kind: 'rescheduled_visit',
        title: '按家属改约时间重新上门', dueAt: draft.rescheduledTo, status: 'pending',
        note: AUTO_NOTE, createdAt: nowIso(), syncStatus: 'queued',
      });
    }

    // 新随访任务入队
    followUps.value
      .filter((f) => f.visitId === draft.id && f.syncStatus === 'queued')
      .forEach((f) => enqueue({ type: 'saveFollowUp', payload: f }, f.archiveId, `随访任务：${f.title}`));

    enqueue({ type: 'saveVisit', payload: draft }, archive.id, `第 ${draft.visitNumber} 次访视记录`);
    enqueue({ type: 'saveArchive', payload: archive }, archive.id, '档案状态更新');
    persist();
    scheduleFlush();
    return { visit: draft, assessment };
  }

  function upsertArchive(a: FamilyArchive, withQueue = true) {
    const i = archives.value.findIndex((x) => x.id === a.id);
    if (i >= 0) archives.value[i] = a;
    else archives.value.push(a);
    if (withQueue) {
      enqueue({ type: 'saveArchive', payload: a }, a.id, '档案更新');
      persist();
      scheduleFlush();
    }
  }

  /** 家属/护士改约 */
  function reschedule(archiveId: string, newTime: string, reason: string, by: 'nurse' | 'family') {
    const a = archives.value.find((x) => x.id === archiveId);
    if (!a) return;
    a.scheduledAt = newTime;
    a.status = 'rescheduled';
    a.updatedAt = nowIso();
    a.syncStatus = 'queued';
    const fu: FollowUpTask = {
      id: uid('fu'), archiveId, kind: 'rescheduled_visit',
      title: `${by === 'family' ? '家属申请' : '护士'}改约：${reason || '时间调整'}`,
      dueAt: newTime, status: 'pending', createdAt: nowIso(), syncStatus: 'queued',
    };
    followUps.value.push(fu);
    enqueue({ type: 'saveFollowUp', payload: fu }, archiveId, fu.title);
    enqueue({ type: 'saveArchive', payload: a }, archiveId, '改约');
    persist();
    scheduleFlush();
  }

  function closeFollowUp(id: string, closureNote: string) {
    const t = followUps.value.find((x) => x.id === id);
    if (!t) return;
    const closedAt = nowIso();
    t.status = 'done';
    t.closureNote = closureNote;
    t.closedAt = closedAt;
    persist();
    enqueue({ type: 'closeFollowUp', payload: { id, closureNote, closedAt } }, t.archiveId, `关闭随访：${t.title}`);
    scheduleFlush();
  }

  function sendMessage(archiveId: string, from: ConsultMessage['from'], text: string) {
    const msg: ConsultMessage = { id: uid('msg'), archiveId, from, text, createdAt: nowIso(), syncStatus: 'queued' };
    messages.value.push(msg);
    enqueue({ type: 'saveMessage', payload: msg }, archiveId, '咨询消息');
    persist();
    scheduleFlush();
  }

  function addDocument(doc: FamilyDocument) {
    documents.value.push(doc);
    enqueue({ type: 'saveDocument', payload: doc }, doc.archiveId, '家属上传资料');
    persist();
    scheduleFlush();
  }

  // ---------- 计算 ----------
  const visitsByArchive = computed(() => {
    const map = new Map<string, Visit[]>();
    visits.value.forEach((v) => {
      const list = map.get(v.archiveId) ?? [];
      list.push(v);
      map.set(v.archiveId, list);
    });
    map.forEach((list) => list.sort((a, b) => a.performedAt.localeCompare(b.performedAt)));
    return map;
  });

  const followUpsByArchive = computed(() => {
    const map = new Map<string, FollowUpTask[]>();
    followUps.value.forEach((f) => {
      const list = map.get(f.archiveId) ?? [];
      list.push(f);
      map.set(f.archiveId, list);
    });
    return map;
  });

  function archiveById(id: string): FamilyArchive | undefined {
    return archives.value.find((a) => a.id === id);
  }
  function archiveByCode(code: string): FamilyArchive | undefined {
    return archives.value.find((a) => a.accessCode.toUpperCase() === code.trim().toUpperCase());
  }
  function visitsFor(id: string): Visit[] {
    return visitsByArchive.value.get(id) ?? [];
  }
  function followUpsFor(id: string): FollowUpTask[] {
    return (followUpsByArchive.value.get(id) ?? []).slice().sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  }
  function messagesFor(id: string): ConsultMessage[] {
    return messages.value.filter((m) => m.archiveId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  function documentsFor(id: string): FamilyDocument[] {
    return documents.value.filter((d) => d.archiveId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** 家属可见的最新一次评估（家属端只暴露护理建议/复查/风险说明） */
  function latestAssessment(id: string): Visit['assessment'] | undefined {
    const list = visitsFor(id);
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].assessment) return list[i].assessment;
    }
    return undefined;
  }

  const pendingCount = computed(() => followUps.value.filter((f) => f.status !== 'done').length);
  const queueCount = computed(() => queue.value.length);
  const hasLocalDraft = computed(() =>
    visits.value.some((v) => v.syncStatus === 'queued' || v.syncStatus === 'local_draft' || v.syncStatus === 'failed') || queue.value.length > 0,
  );

  function resetDemo() {
    localStorage.removeItem(LOCAL_KEY);
    const fresh = mockServer.reset();
    archives.value = fresh.archives;
    visits.value = fresh.visits;
    followUps.value = fresh.followUps;
    messages.value = fresh.messages;
    documents.value = fresh.documents;
    nurses.value = fresh.nurses;
    queue.value = [];
    persist();
  }

  return {
    // state
    archives, visits, followUps, messages, documents, nurses, queue, loaded, pullError,
    // actions
    hydrate, processQueue, saveDraft, saveVisit, reschedule, closeFollowUp, sendMessage, addDocument, resetDemo,
    persist,
    // getters
    visitsByArchive, followUpsByArchive, pendingCount, queueCount, hasLocalDraft,
    archiveById, archiveByCode, visitsFor, followUpsFor, messagesFor, documentsFor, latestAssessment,
  };
});
