// 网络状态：现场网络不稳定时可手动切到“离线模式”，访视先存本地草稿
import { create } from 'zustand'

interface NetState {
  offline: boolean
  setOffline: (v: boolean) => void
}

export const useNet = create<NetState>((set) => ({
  offline: false,
  setOffline: (v) => set({ offline: v }),
}))

export const isOfflineNow = () => useNet.getState().offline || !navigator.onLine
