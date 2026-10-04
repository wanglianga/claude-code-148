import { useMemo, useState } from 'react';
import { usePiniaStore } from '@/stores/bridge';
import { useAuthStore } from '@/stores/auth';
import { useDataStore } from '@/stores/data';
import { Header } from '@/components/Header';
import { PhotoThumb } from '@/components/PhotoGrid';
import { ChatBox } from '@/components/ChatBox';
import {
  DOCUMENT_TYPE_LABEL, FOLLOWUP_KIND_LABEL, ageText, formatDateTime,
  fromDatetimeLocalValue, toDatetimeLocalValue,
} from '@/lib/labels';
import { effectiveBilirubin } from '@/lib/risk';
import { fileToDataUrl, putPhoto } from '@/lib/idb';
import { uid, nowIso } from '@/lib/id';
import type { DocumentType } from '@/types';

type Tab = 'home' | 'recheck' | 'docs' | 'chat';

const FAMILY_DOC_TYPES: Array<[DocumentType, string, string]> = [
  ['birth_cert', '📄 出生证明', '临时补充出生证明照片'],
  ['discharge_summary', '🏥 出院小结', '出院时医院给的小结'],
  ['feeding_log', '🍼 喂养记录', '记录每次喂奶时间/奶量'],
  ['other', '📷 其他资料', '黄疸报告等'],
];

export function FamilyPortal({ onSyncCenter }: { onSyncCenter: () => void }) {
  const auth = usePiniaStore(useAuthStore);
  const data = usePiniaStore(useDataStore);
  const archive = data.archiveByCode(auth.familyAccessCode ?? '');
  const [tab, setTab] = useState<Tab>('home');
  const [busy, setBusy] = useState(false);

  const visits = useMemo(() => (archive ? data.visitsFor(archive.id) : []), [data, archive]);
  const latest = visits[visits.length - 1];
  const assessment = latest?.assessment;
  const followUps = useMemo(() => (archive ? data.followUpsFor(archive.id) : []), [data, archive]);
  const documents = useMemo(() => (archive ? data.documentsFor(archive.id) : []), [data, archive]);
  const openTasks = followUps.filter((f) => f.status !== 'done');
  const nextRecheck = openTasks
    .filter((f) => f.kind === 'recheck' || f.kind === 'rescheduled_visit' || f.kind === 'referral')
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];

  if (!archive) {
    return (
      <div className="app-shell">
        <Header title="档案未找到" right={<button className="icon-btn" onClick={() => auth.logout()}>退出</button>} />
        <div className="empty">访问码可能有误，请退出后重新输入。</div>
      </div>
    );
  }

  async function upload(files: FileList | null, type: DocumentType) {
    if (!files?.length || !archive) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const photoId = uid('doc');
        const dataUrl = await fileToDataUrl(file, 1280, 0.75);
        await putPhoto({ id: photoId, data: dataUrl, createdAt: nowIso() });
        data.addDocument({
          id: uid('fd'), archiveId: archive.id, type, name: file.name || DOCUMENT_TYPE_LABEL[type],
          photoId, uploadedBy: 'family', createdAt: nowIso(), syncStatus: 'queued',
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <Header
        title={`${archive.babyName} 的家庭护理页`}
        sub={`出生 ${ageText(archive.birthDate)} · ${archive.gender === 'female' ? '女' : '男'}宝`}
        right={
          <>
            <button className="icon-btn" onClick={onSyncCenter}>同步</button>
            <button className="icon-btn" onClick={() => auth.logout()}>退出</button>
          </>
        }
      />

      <div className="page">
        <div className="chip-row">
          {([
            ['home', '护理建议'],
            ['recheck', '复查安排'],
            ['docs', '我的资料'],
            ['chat', '问护士'],
          ] as Array<[Tab, string]>).map(([t, label]) => (
            <button key={t} className={`chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{label}</button>
          ))}
        </div>

        {tab === 'home' && (
          <>
            {assessment ? (
              <>
                <div className={`assess-panel ${assessment.overall}`}>
                  <div className="ap-title">宝宝目前情况：{FAMILY_RISK_WORD[assessment.overall]}</div>
                  <div className="ap-sub">
                    最近一次访视：{formatDateTime(latest.performedAt)}
                    {typeof latest.weightG === 'number' && ` · 体重 ${latest.weightG}g`}
                    {effectiveBilirubin(latest.jaundice) !== undefined && ` · 黄疸值 ${effectiveBilirubin(latest.jaundice)!.toFixed(1)}`}
                  </div>
                </div>
                <div className="family-explain">{assessment.familyExplanation}</div>
                {assessment.advice.length > 0 && (
                  <div className="card">
                    <h2>✅ 居家护理建议</h2>
                    <ul className="advice-list">
                      {assessment.advice.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
                {assessment.overall === 'red' && (
                  <div className="card" style={{ border: '2px solid var(--red)' }}>
                    <strong style={{ color: 'var(--red)', fontSize: 16 }}>🚨 请立即就医</strong>
                    <div className="small" style={{ marginTop: 6 }}>
                      如出现下列任何情况不要等复查：精神差、叫不醒、哭声尖锐、吃奶明显减少、黄染蔓延到手脚心、大便灰白、发热 ≥38℃。请直接去新生儿急诊或拨打 120。
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="card empty" style={{ padding: 30 }}>
                <div className="e-ico">🏠</div>
                社区护士还未上门访视，访视后这里会显示宝宝的风险说明和护理建议。
                <div className="small" style={{ marginTop: 8 }}>当前预约：{formatDateTime(archive.scheduledAt)}</div>
              </div>
            )}

            <div className="card">
              <h2>🍼 日常观察小清单</h2>
              <div className="small" style={{ lineHeight: 2 }}>
                ▫ 每天喂奶 8-12 次，观察尿量（第 5 天后每天 ≥6 片湿尿布）<br />
                ▫ 在自然光下观察黄染范围：脸→躯干→四肢→手脚心，范围扩大及时联系护士<br />
                ▫ 大便颜色应为黄色/黄绿色；出现 <strong style={{ color: 'var(--red)' }}>灰白陶土色立即就医</strong><br />
                ▫ 脐带保持干燥，有红肿、流脓、臭味及时就诊<br />
                ▫ 妈妈也需要被关心：持续情绪低落、失眠、伤害自己或宝宝的念头，请立刻告诉护士
              </div>
            </div>
          </>
        )}

        {tab === 'recheck' && (
          <>
            {nextRecheck && (
              <div className="card" style={{ borderLeft: '4px solid var(--teal-600)' }}>
                <h2>下一次时间安排</h2>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--teal-900)' }}>{formatDateTime(nextRecheck.dueAt)}</div>
                <div className="muted" style={{ marginTop: 4 }}>{nextRecheck.title}</div>
              </div>
            )}
            <div className="card">
              <h2>全部复查 / 转诊 / 随访</h2>
              {followUps.length === 0 && <div className="empty">暂无安排，护士访视后会自动生成</div>}
              {followUps.map((f) => (
                <div key={f.id} className="queue-item">
                  <div style={{ flex: 1 }}>
                    <div className="row-flex wrap" style={{ gap: 6 }}>
                      <span className="badge badge-teal">{FOLLOWUP_KIND_LABEL[f.kind]}</span>
                      {f.status === 'done' ? <span className="badge badge-green">已完成</span> : new Date(f.dueAt).getTime() < Date.now() ? <span className="badge badge-red">已过时间</span> : <span className="badge badge-yellow">待前往</span>}
                    </div>
                    <div style={{ marginTop: 5 }}>{f.title}</div>
                    <div className="muted">{formatDateTime(f.dueAt)}</div>
                    {f.closureNote && <div className="small" style={{ marginTop: 4, color: 'var(--teal-900)' }}>反馈：{f.closureNote}</div>}
                  </div>
                </div>
              ))}
            </div>
            <RescheduleRequest archiveId={archive.id} current={archive.scheduledAt} />
          </>
        )}

        {tab === 'docs' && (
          <div className="card">
            <h2>补交出生证明 / 出院小结 / 喂养记录</h2>
            <p className="muted" style={{ marginTop: 0 }}>网络不好也可以先拍，资料会保存在手机里，联网后自动交给社区护士。</p>
            {busy && <div className="muted">正在处理照片…</div>}
            <div className="grid2" style={{ gap: 8 }}>
              {FAMILY_DOC_TYPES.map(([type, label, hint]) => (
                <label key={type} className="photo-add" style={{ aspectRatio: 'auto', padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 15 }}>{label}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{hint}</div>
                  <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => void upload(e.target.files, type)} />
                </label>
              ))}
            </div>
            <div className="section-title">已上传（{documents.length}）</div>
            {documents.length === 0 && <div className="empty">还没有上传资料</div>}
            {documents.map((d) => (
              <div key={d.id} className="queue-item">
                <div style={{ width: 46 }}><PhotoThumb photo={{ id: d.photoId, name: d.name, createdAt: d.createdAt }} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{DOCUMENT_TYPE_LABEL[d.type]}</div>
                  <div className="muted">{formatDateTime(d.createdAt)}{d.syncStatus !== 'synced' ? ' · 待联网上传' : ' · 已提交'}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'chat' && <ChatBox archiveId={archive.id} from="family" />}
      </div>
    </div>
  );
}

const FAMILY_RISK_WORD = {
  green: '平稳，按计划随访即可',
  yellow: '有几项需要观察，请看护理建议',
  orange: '需要尽快复查或就诊，请不要拖延',
  red: '有紧急信号，请立即就医',
} as const;

function RescheduleRequest({ archiveId, current }: { archiveId: string; current: string }) {
  const data = usePiniaStore(useDataStore);
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(toDatetimeLocalValue(new Date(Date.now() + 26 * 3600_000).toISOString()));
  const [reason, setReason] = useState('');

  return (
    <div className="card">
      <div className="switch-row">
        <div>
          <strong>需要改时间？</strong>
          <div className="muted">当前预约：{formatDateTime(current)}</div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => setOpen((v) => !v)}>{open ? '取消' : '申请改约'}</button>
      </div>
      {open && (
        <div>
          <div className="field">
            <label>希望护士什么时候来</label>
            <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="field">
            <label>原因（选填）</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如：带宝宝去医院复查" />
          </div>
          <button className="btn btn-primary" onClick={() => { data.reschedule(archiveId, fromDatetimeLocalValue(time), reason, 'family'); setOpen(false); }}>提交改约申请</button>
          <div className="muted small" style={{ marginTop: 8 }}>提交后护士端会收到改约随访任务并与您电话确认。</div>
        </div>
      )}
    </div>
  );
}
