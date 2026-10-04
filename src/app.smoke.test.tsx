import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { App } from './App';
import { pinia } from './stores/pinia';
import { useDataStore } from './stores/data';
import { useSyncStore } from './stores/sync';
import { useAuthStore } from './stores/auth';
import { mockServer } from './lib/server';
import { assess } from './lib/risk';
import type { Visit } from './types';
import { uid, nowIso } from './lib/id';

beforeEach(() => {
  // 先显式登出（防止上一个 DOM 用例的 store 状态残留），再清本地存储与 Pinia 注册表
  useAuthStore(pinia).logout();
  localStorage.clear();
  (pinia as unknown as { _s: Map<string, unknown> })._s.clear();
  mockServer.online = true;
  mockServer.faulty = false;
});

async function waitFor(predicate: () => boolean, timeout = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  }
  if (!predicate()) throw new Error('waitFor 超时');
}

function click(el: Element | null, what?: string) {
  if (!el) throw new Error(`点击目标不存在：${what ?? ''}`);
  (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

const mountedRoots: Array<{ root: ReturnType<typeof createRoot>; el: HTMLElement }> = [];

afterEach(() => {
  mountedRoots.splice(0).forEach(({ root, el }) => {
    act(() => { root.unmount(); });
    el.remove();
  });
});

describe('应用渲染冒烟', () => {
  it('未登录时渲染登录页与双端入口', () => {
    const html = renderToString(React.createElement(App));
    expect(html).toContain('社区新生儿访视');
    expect(html).toContain('社区护士端');
    expect(html).toContain('家属端');
  });
});

function newVisit(archiveId: string, overrides: Partial<Visit> = {}): Visit {
  const now = nowIso();
  return {
    id: uid('v'), clientId: uid('c'), archiveId, visitNumber: 1,
    performedAt: now, photos: [], syncStatus: 'local_draft', createdAt: now, updatedAt: now,
    ...overrides,
  };
}

describe('离线草稿 → 回中心同步全链路', () => {
  it('断网下提交访视只入本地队列，联网后重放并标记已同步', async () => {
    const data = useDataStore(pinia);
    const sync = useSyncStore(pinia);
    await data.hydrate();
    expect(data.archives.length).toBe(7);

    const arc = data.archiveById('arc-1')!;

    // 1) 上门现场断网：胆红素 21（紧急）
    sync.setOnline(false);
    expect(sync.effectiveOnline).toBe(false);

    const v = newVisit('arc-1', {
      weightG: 3200,
      jaundice: { forehead: 20.8, chest: 21.2 },
      cord: ['dry'],
      urineCount24h: 6,
      stool: { count24h: 3, color: 'yellow', meconiumCleared: true },
      feeding: { mode: 'breast', frequency24h: 9, effectiveLatch: true },
      mother: { breast: 'good', emotion: 'good', wound: 'good' },
    });
    const { assessment } = data.saveVisit(arc, v);

    expect(assessment!.overall).toBe('red');
    expect(assessment!.actions).toContain('emergency');
    // 自动生成急诊随访任务
    expect(data.followUpsFor('arc-1').some((f) => f.kind === 'referral')).toBe(true);
    // 离线：实体待同步、队列有内容
    expect(data.queueCount).toBeGreaterThan(0);
    expect(data.visitsFor('arc-1').at(-1)!.syncStatus).toBe('queued');

    // 本地镜像持久化（模拟刷新）
    (pinia as unknown as { _s: Map<string, unknown> })._s.delete('data');
    const reloaded = useDataStore(pinia);
    expect(reloaded.visitsFor('arc-1').length).toBeGreaterThan(0);
    expect(reloaded.queueCount).toBeGreaterThan(0);

    // 2) 回到社区联网：FIFO 重放
    sync.setOnline(true);
    const result = await reloaded.processQueue();
    expect(result.sent).toBeGreaterThan(0);
    expect(result.failed).toBe(0);
    expect(reloaded.queueCount).toBe(0);
    expect(reloaded.visitsFor('arc-1').at(-1)!.syncStatus).toBe('synced');
  });

  it('服务端故障时队列保留并可在恢复后重试成功', async () => {
    const data = useDataStore(pinia);
    const sync = useSyncStore(pinia);
    await data.hydrate();
    const arc = data.archiveById('arc-1')!;

    sync.setFaulty(true);
    const v = newVisit('arc-1', {
      weightG: 3300,
      jaundice: { forehead: 9 },
      feeding: { mode: 'breast', frequency24h: 10, effectiveLatch: true },
      stool: { count24h: 4, color: 'yellow', meconiumCleared: true },
      mother: { breast: 'good', emotion: 'good', wound: 'good' },
    });
    data.saveVisit(arc, v);
    const qLen = data.queueCount;
    const r1 = await data.processQueue();
    expect(r1.failed).toBe(1);
    expect(data.queueCount).toBe(qLen); // 失败保留

    sync.setFaulty(false);
    const r2 = await data.processQueue();
    expect(r2.sent).toBe(qLen);
    expect(data.queueCount).toBe(0);
  });

  it('本地草稿不改变预约状态、不入队列；提交后才生成随访', async () => {
    const data = useDataStore(pinia);
    await data.hydrate();
    const arc = data.archiveById('arc-1')!;
    expect(arc.status).toBe('scheduled');

    const draft = newVisit('arc-1', { weightG: 3200, jaundice: { forehead: 10 } });
    data.saveDraft(draft);
    expect(data.queueCount).toBe(0);
    expect(data.archiveById('arc-1')!.status).toBe('scheduled');
    expect(data.visitsFor('arc-1').at(-1)!.syncStatus).toBe('local_draft');
  });

  it('规则引擎可直接用于护士端提交前预览', async () => {
    const data = useDataStore(pinia);
    await data.hydrate();
    const arc = data.archiveById('arc-2')!;
    const a = assess({
      archive: arc,
      visit: newVisit('arc-2', { weightG: 2500, jaundice: { chest: 12 }, feeding: { mode: 'mixed', frequency24h: 7, effectiveLatch: false }, stool: { count24h: 2, color: 'green', meconiumCleared: false } }),
    });
    // 早产 + 体重下降 >7% + 喂养问题 → 至少复查与母乳指导
    expect(a.actions).toContain('lactation');
    expect(a.factors.length).toBeGreaterThan(1);
  });
});

describe('双端真实 DOM 交互', () => {
  async function mount() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(App));
    });
    await waitFor(() => (container.textContent?.includes('王秀兰') || container.textContent?.includes('访问码无效')) ?? false);
    mountedRoots.push({ root, el: container });
    return { container, root };
  }

  it('护士登录 → 工作台显示未访视家庭与风险统计', async () => {
    const { container } = await mount();
    const submit = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('进入工作台'))!;
    await act(async () => { click(submit); });
    await waitFor(() => container.textContent?.includes('未访视家庭') ?? false);
    expect(container.textContent).toContain('张一诺');
    expect(container.textContent).toContain('异常黄疸');
    expect(container.textContent).toContain('随访待闭环');
  });

  it('家属凭访问码 A1003 登录 → 看到复查安排与风险说明', async () => {
    const { container } = await mount();
    const familyTab = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '家属端');
    await act(async () => { click(familyTab ?? null, '家属端 tab'); });
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    await act(async () => {
      input.value = 'A1003';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const submit = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('进入母婴档案'));
    await act(async () => { click(submit ?? null, '进入母婴档案按钮'); });
    await waitFor(() => container.textContent?.includes('王乐瑶') ?? false);
    expect(container.textContent).toContain('居家护理建议');
    // 切到复查安排
    const recheckTab = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.startsWith('复查安排'));
    await act(async () => { click(recheckTab ?? null, '复查安排 tab'); });
    await waitFor(() => container.textContent?.includes('复测胆红素') ?? false);
    expect(container.textContent).toContain('复测胆红素');
  });
});
