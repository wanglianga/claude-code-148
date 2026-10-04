// 联网状态：上门现场可能断网。护士可手动切换"现场离线/回中心联网"，
// 同时监听浏览器 online/offline 事件。
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { mockServer } from '@/lib/server';

export const useSyncStore = defineStore('sync', () => {
  const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine);
  const serverFaulty = ref(false);
  const lastSyncAt = ref<string | null>(null);
  const syncing = ref(false);

  const effectiveOnline = computed(() => online.value && !serverFaulty.value);

  function applyToServer() {
    mockServer.online = online.value;
    mockServer.faulty = serverFaulty.value;
  }

  function setOnline(v: boolean) {
    online.value = v;
    applyToServer();
  }

  function setFaulty(v: boolean) {
    serverFaulty.value = v;
    applyToServer();
  }

  function setSyncing(v: boolean) {
    syncing.value = v;
  }

  function markSynced() {
    lastSyncAt.value = new Date().toISOString();
  }

  applyToServer();

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));
  }

  return { online, serverFaulty, effectiveOnline, lastSyncAt, syncing, setOnline, setFaulty, setSyncing, markSynced };
});
