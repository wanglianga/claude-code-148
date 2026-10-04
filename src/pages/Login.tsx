import { useState } from 'react';
import { usePiniaStore } from '@/stores/bridge';
import { useAuthStore } from '@/stores/auth';
import { useDataStore } from '@/stores/data';

export function Login() {
  const auth = usePiniaStore(useAuthStore);
  const data = usePiniaStore(useDataStore);
  const [role, setRole] = useState<'nurse' | 'family'>('nurse');
  const [nurseId, setNurseId] = useState('n1');
  const [code, setCode] = useState('A1003');
  const [error, setError] = useState('');

  function login() {
    setError('');
    if (role === 'nurse') {
      const n = data.nurses.find((x) => x.id === nurseId.trim());
      if (!n) {
        setError('未找到该护士账号');
        return;
      }
      auth.loginNurse(n);
    } else {
      const a = data.archiveByCode(code);
      if (!a) {
        setError('访问码无效，请使用预约短信中的 5 位访问码（如 A1003）');
        return;
      }
      auth.loginFamily(a.accessCode);
    }
  }

  return (
    <div className="app-shell">
      <div className="login-wrap">
        <div className="login-logo">👶</div>
        <div className="login-title">社区新生儿访视</div>
        <div className="login-sub">上门访视 · 黄疸记录 · 复查转诊闭环</div>

        <div className="role-tabs">
          <button className={role === 'nurse' ? 'active' : ''} onClick={() => setRole('nurse')}>社区护士端</button>
          <button className={role === 'family' ? 'active' : ''} onClick={() => setRole('family')}>家属端</button>
        </div>

        {role === 'nurse' ? (
          <div className="field">
            <label>选择护士账号</label>
            <select value={nurseId} onChange={(e) => setNurseId(e.target.value)}>
              {data.nurses.map((n) => (
                <option key={n.id} value={n.id}>{n.name} · {n.community}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="field">
            <label>母婴档案访问码</label>
            <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="如 A1003" maxLength={6} style={{ letterSpacing: 2 }} />
          </div>
        )}

        {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <button className="btn btn-primary" disabled={!data.loaded} onClick={login}>
          {data.loaded ? `进入${role === 'nurse' ? '工作台' : '母婴档案'}` : '正在加载档案…'}
        </button>

        <div className="demo-account">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>演示账号</div>
          护士端：直接选择 <code>王秀兰</code> 或 <code>李梅</code> 登录<br />
          家属端访问码：<code>A1001</code>～<code>A1007</code>（如临界黄疸家庭 <code>A1003</code>）
        </div>
      </div>
    </div>
  );
}
