// 离线访视草稿：先保存本地，回到社区网络恢复后批量同步（幂等）
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { VisitPayload } from '../types'

export interface Draft {
  clientId: string
  label: string            // 例如 “李安安 · 初访”
  savedAt: string
  status: '待同步' | '同步失败'
  error?: string
  payload: VisitPayload
}

interface DraftState {
  drafts: Draft[]
  save: (d: Draft) => void
  markFailed: (clientId: string, error: string) => void
  remove: (clientId: string) => void
}

export const newClientId = () =>
  `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export const useDrafts = create<DraftState>()(
  persist(
    (set) => ({
      drafts: [],
      save: (d) =>
        set((s) => ({ drafts: [d, ...s.drafts.filter((x) => x.clientId !== d.clientId)] })),
      markFailed: (clientId, error) =>
        set((s) => ({
          drafts: s.drafts.map((x) => (x.clientId === clientId ? { ...x, status: '同步失败', error } : x)),
        })),
      remove: (clientId) => set((s) => ({ drafts: s.drafts.filter((x) => x.clientId !== clientId) })),
    }),
    { name: 'nbv-drafts' },
  ),
)
