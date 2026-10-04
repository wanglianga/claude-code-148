// 家属端：补充出生证明、出院小结、喂养记录等材料
import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { FamilyOverview } from '../../types'
import { Badge, Empty, fmtTime, toast } from '../../components/ui'

const TYPES = ['出生证明', '出院小结', '喂养记录', '其他']

export default function FamilyDocs() {
  const [d, setD] = useState<FamilyOverview | null>(null)
  const [type, setType] = useState('出生证明')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<{ name: string; dataUrl: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  function load() { api.get<FamilyOverview>('/api/family/overview').then(setD) }
  useEffect(() => { load() }, [])

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 4 * 1024 * 1024) return toast('文件不能超过 4MB')
    const reader = new FileReader()
    reader.onload = () => setFile({ name: f.name, dataUrl: String(reader.result) })
    reader.readAsDataURL(f)
    e.target.value = ''
  }

  async function submit() {
    if (!file) return toast('请先选择要上传的照片/文件')
    setBusy(true)
    try {
      await api.post('/api/documents', { type, filename: file.name, dataUrl: file.dataUrl, note })
      toast('已提交，护士会在档案中查看')
      setFile(null); setNote(''); load()
    } catch (e: any) { toast(e.message) } finally { setBusy(false) }
  }

  if (!d) return <Empty text="加载中…" icon="⏳" />

  return (
    <div>
      <div className="page-title">补充材料</div>
      <div className="page-sub">出生证明、出院小结、喂养记录等可随时拍照补充，会归入宝宝的母婴档案</div>

      <div className="card">
        <div className="field">
          <label>材料类型</label>
          <div className="seg">
            {TYPES.map((t) => <span key={t} className={`opt ${type === t ? 'on' : ''}`} onClick={() => setType(t)}>{t}</span>)}
          </div>
        </div>
        <div className="field">
          <label>备注（可选）</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：近 3 天喂养与大小便记录" />
        </div>
        <div className="field">
          <label>照片/文件（限 4MB）</label>
          {file ? (
            <div className="row between">
              <span className="small">📄 {file.name}</span>
              <button className="btn danger sm" onClick={() => setFile(null)}>移除</button>
            </div>
          ) : (
            <button className="btn ghost" onClick={() => ref.current?.click()}>📷 拍照 / 选择文件</button>
          )}
          <input ref={ref} type="file" accept="image/*,.pdf" hidden onChange={pick} />
        </div>
        <button className="btn primary block" disabled={busy} onClick={submit}>{busy ? '提交中…' : '提交材料'}</button>
      </div>

      <div className="card">
        <div className="card-title"><span className="dot" />已提交材料</div>
        {d.documents.length === 0 && <Empty text="还没有提交过材料" icon="📎" />}
        {d.documents.map((doc) => (
          <div key={doc.id} className="row between small" style={{ padding: '7px 0', borderBottom: '1px dashed var(--line)' }}>
            <span><Badge color="teal">{doc.type}</Badge> {doc.filename}</span>
            <span className="muted">{fmtTime(doc.created_at)}</span>
          </div>
        ))}
        {d.documents.some((x) => x.data_url) && (
          <div className="photo-row mt8">
            {d.documents.filter((x) => x.data_url).map((x) => <img key={x.id} src={x.data_url} alt={x.filename} />)}
          </div>
        )}
      </div>
    </div>
  )
}
