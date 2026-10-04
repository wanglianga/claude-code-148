// 同步中心：离线草稿批量上传（幂等），失败可重试
import { useState } from 'react'
import { api } from '../../api'
import { useDrafts } from '../../store/drafts'
import { useNet } from '../../store/net'
import { Badge, Empty, toast } from '../../components/ui'

export default function SyncCenter() {
  const { drafts, remove, markFailed } = useDrafts()
  const { offline, setOffline } = useNet()
  const [busy, setBusy] = useState(false)

  async function syncAll() {
    if (offline) return toast('当前处于离线模式，请先切回在线')
    if (drafts.length === 0) return
    setBusy(true)
    try {
      const r = await api.post<{ results: { client_id: string; ok: boolean; duplicated?: boolean; error?: string }[] }>(
        '/api/sync/visits',
        { visits: drafts.map((d) => d.payload) },
      )
      let okCount = 0
      for (const res of r.results) {
        if (res.ok) { remove(res.client_id); okCount++ }
        else markFailed(res.client_id, res.error || '同步失败')
      }
      toast(`同步完成：成功 ${okCount} 条${r.results.length - okCount ? `，失败 ${r.results.length - okCount} 条` : ''}`)
    } catch (e: any) {
      toast(`同步失败：${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-title">草稿与同步</div>
      <div className="page-sub">上门现场网络不稳定时，访视先保存本地草稿；回到社区网络恢复后在此批量补齐同步</div>

      <div className="card row between">
        <div>
          <div className="strong">当前网络</div>
          <div className="small muted">{offline ? '📵 离线模式（草稿仅保存在本机）' : '📶 在线，可以同步'}</div>
        </div>
        <button className="btn ghost sm" onClick={() => setOffline(!offline)}>{offline ? '切换为在线' : '切换为离线'}</button>
      </div>

      {drafts.length === 0 && <Empty text="没有待同步的离线草稿" icon="📡" />}
      {drafts.map((d) => (
        <div key={d.clientId} className="card">
          <div className="row between">
            <span className="strong">{d.label}</span>
            <Badge color={d.status === '待同步' ? 'amber' : 'red'}>{d.status}</Badge>
          </div>
          <div className="small muted mt8">
            保存于 {d.savedAt} · 体重 {d.payload.weight ?? '-'}g · 黄疸 {d.payload.bilirubin ?? '-'} µmol/L
            {d.payload.device_issue ? ' · 设备故障手工记录' : ''}
          </div>
          {d.error && <div className="small" style={{ color: 'var(--red)' }}>{d.error}</div>}
          <div className="row mt8">
            <button className="btn danger sm" onClick={() => { if (window.confirm('确定删除该草稿？删除后不可恢复')) remove(d.clientId) }}>删除</button>
          </div>
        </div>
      ))}

      {drafts.length > 0 && (
        <button className="btn primary block" disabled={busy || offline} onClick={syncAll}>
          {busy ? '同步中…' : `⬆ 立即同步 ${drafts.length} 条草稿`}
        </button>
      )}
    </div>
  )
}
