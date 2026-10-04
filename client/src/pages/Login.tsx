import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../store/auth'
import type { User } from '../types'

const QUICK = [
  { u: 'nurse', p: 'nurse123', label: '护士端', sub: '王芳' },
  { u: 'doctor', p: 'doctor123', label: '医生端', sub: '张启明' },
  { u: 'family', p: 'family123', label: '家属端', sub: '李婷家属' },
]

export default function Login() {
  const [username, setUsername] = useState('nurse')
  const [password, setPassword] = useState('nurse123')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const setAuth = useAuth((s) => s.setAuth)
  const nav = useNavigate()

  async function submit(u = username, p = password) {
    setErr(''); setLoading(true)
    try {
      const r = await api.post<{ token: string; user: User }>('/api/auth/login', { username: u, password: p })
      setAuth(r.token, r.user)
      nav(r.user.role === 'family' ? '/family' : r.user.role === 'doctor' ? '/doctor' : '/nurse')
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>👶 社区新生儿访视</h1>
        <div className="sub">上门访视预约 · 黄疸记录 · 复查转诊 · 随访闭环</div>
        <div className="field">
          <label>账号</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" autoFocus />
        </div>
        <div className="field">
          <label>密码</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="密码" onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        {err && <div className="alert-box danger">{err}</div>}
        <button className="btn primary block" disabled={loading} onClick={() => submit()}>
          {loading ? '登录中…' : '登 录'}
        </button>
        <div className="quick-accounts">
          {QUICK.map((q) => (
            <button key={q.u} onClick={() => { setUsername(q.u); setPassword(q.p); submit(q.u, q.p) }}>
              <b>{q.label}</b>{q.sub}
            </button>
          ))}
        </div>
        <div className="small muted mt12" style={{ textAlign: 'center' }}>
          演示账号：nurse/nurse123 · doctor/doctor123 · family/family123
        </div>
      </div>
    </div>
  )
}
