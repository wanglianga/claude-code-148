// Pinia → React 桥接：
// Pinia store 是 reactive proxy，引用恒等不变，useSyncExternalStore 无法靠快照引用感知变更，
// 因此订阅 $subscribe 并 bump 版本号强制重新渲染；渲染期间直接读取 store 的最新值（含 getter）。
import { useSyncExternalStore } from 'react';
import { pinia } from './pinia';

const versions = new WeakMap<object, { n: number }>();

function getVersion(store: object): { n: number } {
  let v = versions.get(store);
  if (!v) {
    v = { n: 0 };
    versions.set(store, v);
  }
  return v;
}

// 最小结构类型，避免依赖 Pinia 未导出的内部类型
export interface AnyPiniaStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $subscribe: (cb: () => void, options?: { flush?: 'sync' | 'pre' | 'post'; detached?: boolean }) => () => void;
}

export function usePiniaStore<T extends AnyPiniaStore>(useStore: (p: typeof pinia) => T): T {
  const store = useStore(pinia);
  const version = getVersion(store);
  useSyncExternalStore(
    (onChange) =>
      store.$subscribe(
        () => {
          version.n += 1;
          onChange();
        },
        { flush: 'sync' },
      ),
    () => version.n,
    () => version.n,
  );
  return store;
}
