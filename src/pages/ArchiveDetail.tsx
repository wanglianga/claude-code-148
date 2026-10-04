import { useMemo, useState } from 'react';
import type { FamilyArchive, FollowUpTask, Visit } from '@/types';
import { usePiniaStore } from '@/stores/bridge';
import { useDataStore } from '@/stores/data';
import { Header } from '@/components/Header';
import { RiskBadge, StatusBadge, SyncBadge } from '@/components/Badges';
import { AssessmentPanel } from '@/components/AssessmentPanel';
import { PhotoGrid, PhotoThumb } from '@/components/PhotoGrid';
import { VisitForm } from '@/components/VisitForm';
import {
  DELIVERY_LABEL, DOCUMENT_TYPE_LABEL, FEEDING_LABEL, FOLLOWUP_KIND_LABEL,
  JAUNDICE_RISK_LABEL, WOUND_LABEL, ageText, formatDateTime, formatDate, fromDatetimeLocalValue, toDatetimeLocalValue,
} from '@/lib/labels';
import { effectiveBilirubin } from '@/lib/risk';
import { fileToDataUrl, putPhoto } from '@/lib/idb';
import { uid } from '@/lib/id';
import { ChatBox } from '@/components/ChatBox';

type Tab = 'record' | 'followup' | 'docs' | 'chat';

export function ArchiveDetail({ archiveId, onBack }: { archiveId: string; onBack: () => void }) {
  const data = usePiniaStore(useDataStore);
  const archive = data.archiveById(archiveId);
  const [tab, setTab] = useState<Tab>('record');
  const [editing, setEditing] = useState<Visit | 'new' | null>(null);
  const [visitView, setVisitView] = useState<string | null>(null);

  const visits = useMemo(() => data.visitsFor(archiveId), [data, archiveId]);
  const followUps = useMemo(() => data.followUpsFor(archiveId), [data, archiveId]);
  const documents = useMemo(() => data.documentsFor(archiveId), [data, archiveId]);
  const draft = visits.find((v) => v.syncStatus === 'local_draft');
  const latest = visits[visits.length - 1];

  if (!archive) {
    return (
      <div className="app-shell">
        <Header title="档案不存在" onBack={onBack} />
        <div className="empty">该档案可能尚未同步到本机，请回到社区联网后重试。</div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="app-shell">
        <Header title={editing === 'new' ? `上门访视 · ${archive.babyName}` : `编辑访视 · ${archive.babyName}`} sub={`${formatDate(archive.birthDate)} 出生 · 出生 ${archive.birthWeightG}g`} onBack={() => setEditing(null)} />
        <VisitForm
          archive={archive}
          existing={editing === 'new' ? undefined : editing}
          onDone={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Header title={`${archive.babyName} 的母婴档案`} sub={`${archive.gender === 'female' ? '女' : '男'}宝 · 出生 ${ageText(archive.birthDate)}`} onBack={onBack} />

      <div className="page">
        {/* 预约信息 */}
        <div className="card">
          <h2>
            出院与预约信息
            <span className="more"><StatusBadge status={archive.status} /></span>
          </h2>
          <div className="kv"><span className="k">出生日期</span><span className="v">{formatDate(archive.birthDate)}（{ageText(archive.birthDate)}）</span></div>
          <div className="kv"><span className="k">出生体重</span><span className="v">{archive.birthWeightG} g · 孕 {archive.gestationalWeeks} 周</span></div>
          <div className="kv"><span className="k">分娩方式</span><span className="v">{DELIVERY_LABEL[archive.delivery]}</span></div>
          <div className="kv"><span className="k">喂养方式</span><span className="v">{FEEDING_LABEL[archive.feedingMode]}</span></div>
          <div className="kv">
            <span className="k">出院黄疸风险</span>
            <span className="v">
              <span className={`badge ${archive.jaundiceRiskAtBirth === 'high' ? 'badge-red' : archive.jaundiceRiskAtBirth === 'medium' ? 'badge-yellow' : 'badge-green'}`}>
                {JAUNDICE_RISK_LABEL[archive.jaundiceRiskAtBirth]}
              </span>
            </span>
          </div>
          {archive.riskFactorsAtBirth.length > 0 && (
            <div className="kv"><span className="k">高危因素</span><span className="v" style={{ maxWidth: '62%' }}>{archive.riskFactorsAtBirth.join('、')}</span></div>
          )}
          <div className="kv"><span className="k">产妇伤口</span><span className="v">{WOUND_LABEL[archive.motherWound]}</span></div>
          <div className="kv"><span className="k">家庭地址</span><span className="v" style={{ maxWidth: '62%' }}>📍 {archive.address}</span></div>
          <div className="kv"><span className="k">家属联系人</span><span className="v">{archive.contactName} · {archive.contactPhone}</span></div>
          <div className="kv"><span className="k">预约时间</span><span className="v">{formatDateTime(archive.scheduledAt)}</span></div>
        </div>

        {/* 最新综合判断 */}
        {latest?.assessment ? (
          <AssessmentPanel a={latest.assessment} />
        ) : (
          <div className="card empty" style={{ padding: 22 }}>
            <div className="e-ico">🏠</div>
            尚无访视记录，按预约时间上门后填写
          </div>
        )}

        {/* Tabs */}
        <div className="chip-row" style={{ marginTop: 2 }}>
          {([
            ['record', `访视记录 (${visits.length})`],
            ['followup', `复查转诊 (${followUps.filter((f) => f.status !== 'done').length})`],
            ['docs', `资料 (${documents.length})`],
            ['chat', '咨询'],
          ] as Array<[Tab, string]>).map(([t, label]) => (
            <button key={t} className={`chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{label}</button>
          ))}
        </div>

        {tab === 'record' && (
          <VisitsTimeline visits={visits} onOpen={(id) => setVisitView(id)} viewId={visitView} onCloseView={() => setVisitView(null)} />
        )}
        {tab === 'followup' && <FollowUpList followUps={followUps} archive={archive} />}
        {tab === 'docs' && <DocsList archiveId={archiveId} />}
        {tab === 'chat' && <ChatBox archiveId={archiveId} from="nurse" />}

        {/* 操作区 */}
        <div className="btn-row" style={{ marginTop: 14 }}>
          {draft ? (
            <>
              <button className="btn btn-primary" onClick={() => setEditing(draft)}>📝 继续填写本地草稿</button>
              <button className="btn btn-outline" onClick={() => setEditing('new')}>新建访视</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => setEditing('new')}>📋 开始上门访视</button>
          )}
        </div>
        <RescheduleBox archive={archive} />
      </div>
    </div>
  );
}

function VisitsTimeline({ visits, onOpen, viewId, onCloseView }: { visits: Visit[]; onOpen: (id: string) => void; viewId: string | null; onCloseView: () => void }) {
  if (!visits.length) return <div className="empty"><div className="e-ico">📄</div>还没有访视记录</div>;
  return (
    <div className="card">
      <h2>访视时间线</h2>
      <div className="timeline">
        {[...visits].reverse().map((v) => {
          const bili = effectiveBilirubin(v.jaundice);
          const a = v.assessment;
          const special = v.refusedEntry ? '家属不愿开门' : v.familyNotHome ? '无人在家' : v.rescheduledTo ? '临时改约' : undefined;
          return (
            <div key={v.id} className={`tl-item ${a?.overall ?? 'gray'}`}>
              <div className="row-flex wrap" onClick={() => onOpen(v.id)} style={{ cursor: 'pointer' }}>
                <strong>第 {v.visitNumber} 次访视</strong>
                <span className="muted">{formatDateTime(v.performedAt)}</span>
                <span className="spacer" />
                {a && <RiskBadge risk={a.overall} />}
                <SyncBadge status={v.syncStatus} />
              </div>
              <div className="small muted" style={{ marginTop: 4 }}>
                {special ? (
                  <span style={{ color: 'var(--red)' }}>{special}{v.outcomeNote ? `：${v.outcomeNote}` : ''}</span>
                ) : (
                  <>
                    {v.weightG ? `体重 ${v.weightG}g` : '体重未测'}
                    {bili !== undefined ? ` · 黄疸 ${bili.toFixed(1)} mg/dL` : v.jaundice?.deviceFault ? ' · 仪器故障未测' : ''}
                    {v.feeding ? ` · 喂奶 ${v.feeding.frequency24h}次/日` : ''}
                    {v.stool ? ` · ${v.stool.color === 'gray_white' ? '陶土便⚠' : '大便' + v.stool.count24h + '次'}` : ''}
                  </>
                )}
              </div>
              {v.photos.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  {v.photos.slice(0, 4).map((p) => (
                    <div key={p.id} style={{ width: 52 }}>
                      <PhotoThumb photo={p} />
                    </div>
                  ))}
                </div>
              )}
              {viewId === v.id && (
                <VisitDetailCard visit={v} onClose={onCloseView} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VisitDetailCard({ visit, onClose }: { visit: Visit; onClose: () => void }) {
  return (
    <div className="card" style={{ marginTop: 8, boxShadow: 'none', border: '1px solid var(--ink-100)' }}>
      <h2>本次记录明细<span className="more" onClick={onClose}>收起</span></h2>
      <div className="measure-hero" style={{ marginBottom: 10 }}>
        <div className={`mh ${typeof visit.assessment?.weightLossPct === 'number' && visit.assessment.weightLossPct > 10 ? 'alarm' : visit.assessment?.weightLossPct && visit.assessment.weightLossPct > 7 ? 'warn' : ''}`}>
          <div className="v">{visit.weightG ?? '—'}</div><div className="l">体重 g</div>
        </div>
        <div className={`mh ${visit.assessment?.bilirubinZone === 'high' ? 'alarm' : visit.assessment?.bilirubinZone === 'high_intermediate' || visit.assessment?.bilirubinNearThreshold ? 'warn' : ''}`}>
          <div className="v">{effectiveBilirubin(visit.jaundice)?.toFixed(1) ?? (visit.jaundice?.deviceFault ? '故障' : '—')}</div>
          <div className="l">胆红素 mg/dL{visit.assessment?.bilirubinZone && visit.assessment.bilirubinZone !== 'unmeasured' ? ` · ${zoneName(visit.assessment.bilirubinZone)}` : ''}</div>
        </div>
        <div className="mh">
          <div className="v">{visit.urineCount24h ?? '—'}/{visit.stool?.count24h ?? '—'}</div><div className="l">小便/大便 24h</div>
        </div>
        <div className="mh">
          <div className="v">{visit.feeding?.frequency24h ?? '—'}</div><div className="l">喂养次数</div>
        </div>
      </div>
      {visit.assessment && <AssessmentPanel a={visit.assessment} />}
      {visit.nurseNote && <div className="kv"><span className="k">护士备注</span><span className="v" style={{ maxWidth: '70%', textAlign: 'right' }}>{visit.nurseNote}</span></div>}
      {visit.photos.length > 0 && (
        <>
          <div className="section-title" style={{ margin: '8px 0' }}>现场照片</div>
          <PhotoGrid photos={visit.photos} onChange={() => undefined} readOnly />
        </>
      )}
    </div>
  );
}

function zoneName(z: NonNullable<Visit['assessment']>['bilirubinZone']): string {
  return { low: '低危', low_intermediate: '低中危', high_intermediate: '中高危', high: '高危', unmeasured: '未测' }[z ?? 'unmeasured'];
}

function FollowUpList({ followUps, archive }: { followUps: FollowUpTask[]; archive: FamilyArchive }) {
  const data = usePiniaStore(useDataStore);
  const [closing, setClosing] = useState<string | null>(null);
  const [note, setNote] = useState('');

  return (
    <div className="card">
      <h2>复查 · 转诊 · 随访闭环</h2>
      {followUps.length === 0 && <div className="empty">暂无随访任务</div>}
      {followUps.map((f) => {
        const overdue = f.status !== 'done' && new Date(f.dueAt).getTime() < Date.now();
        return (
          <div key={f.id} className="queue-item" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div className="row-flex wrap">
                <span className="badge badge-teal">{FOLLOWUP_KIND_LABEL[f.kind]}</span>
                {f.status === 'done' ? (
                  <span className="badge badge-green">已闭环</span>
                ) : overdue ? (
                  <span className="badge badge-red">已逾期</span>
                ) : (
                  <span className="badge badge-yellow">待处理</span>
                )}
                <SyncBadge status={f.syncStatus} />
              </div>
              <div style={{ marginTop: 6, fontWeight: 600 }}>{f.title}</div>
              <div className="muted">到期：{formatDateTime(f.dueAt)}</div>
              {f.closureNote && (
                <div style={{ marginTop: 5, background: 'var(--teal-50)', borderRadius: 8, padding: '6px 9px', fontSize: 12.5 }}>
                  ✅ 闭环记录（{formatDateTime(f.closedAt)}）：{f.closureNote}
                </div>
              )}
              {f.status !== 'done' && closing !== f.id && (
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => { setClosing(f.id); setNote(''); }}>记录结果并闭环</button>
              )}
              {closing === f.id && (
                <div style={{ marginTop: 8 }}>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={`如：复测 TcB 11.2，较前下降；或${FOLLOWUP_KIND_LABEL[f.kind]}已接诊…`} />
                  <div className="btn-row" style={{ marginTop: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => { if (note.trim()) { data.closeFollowUp(f.id, note.trim()); setClosing(null); } }}>确认闭环</button>
                    <button className="btn btn-outline btn-sm" onClick={() => setClosing(null)}>取消</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {archive.status === 'completed' && followUps.filter((f) => f.status !== 'done').length === 0 && (
        <div className="muted" style={{ textAlign: 'center', paddingTop: 8 }}>本档案随访已全部闭环 ✓</div>
      )}
    </div>
  );
}

function DocsList({ archiveId }: { archiveId: string }) {
  const data = usePiniaStore(useDataStore);
  const docs = data.documentsFor(archiveId);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const photoId = uid('doc');
        const dataUrl = await fileToDataUrl(file, 1280, 0.75);
        await putPhoto({ id: photoId, data: dataUrl, createdAt: new Date().toISOString() });
        data.addDocument({
          id: uid('fd'), archiveId, type: 'other', name: file.name, photoId,
          uploadedBy: 'nurse', createdAt: new Date().toISOString(), syncStatus: 'queued',
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>出生证明 / 出院小结 / 喂养记录</h2>
      <p className="muted" style={{ marginTop: 0 }}>家属可能在现场临时补交资料，拍照后先存本机，随同步队列上传。</p>
      <label className="photo-add" style={{ aspectRatio: 'auto', padding: 12, marginBottom: 12 }}>
        {busy ? '处理中…' : '📷 拍照 / 选择资料图片'}
        <input type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }} onChange={(e) => void upload(e.target.files)} />
      </label>
      {docs.length === 0 && <div className="empty">暂无资料</div>}
      {docs.map((d) => (
        <div key={d.id} className="queue-item">
          <PhotoThumb photo={{ id: d.photoId, name: d.name, createdAt: d.createdAt }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{d.name}</div>
            <div className="muted">{DOCUMENT_TYPE_LABEL[d.type]} · {d.uploadedBy === 'family' ? '家属上传' : '护士上传'} · {formatDateTime(d.createdAt)}</div>
          </div>
          <SyncBadge status={d.syncStatus} />
        </div>
      ))}
    </div>
  );
}

function RescheduleBox({ archive }: { archive: FamilyArchive }) {
  const data = usePiniaStore(useDataStore);
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(toDatetimeLocalValue(new Date(Date.now() + 26 * 3600_000).toISOString()));
  const [reason, setReason] = useState('');
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="switch-row">
        <strong>🕐 家庭临时改约</strong>
        <button className="btn btn-outline btn-sm" onClick={() => setOpen((v) => !v)}>{open ? '取消' : '改约'}</button>
      </div>
      {open && (
        <div>
          <div className="field">
            <label>新的上门时间</label>
            <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="field">
            <label>改约原因</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如：宝宝去外婆家 / 母亲复诊" />
          </div>
          <button className="btn btn-primary" onClick={() => { data.reschedule(archive.id, fromDatetimeLocalValue(time), reason, 'nurse'); setOpen(false); }}>确认改约并通知家属端</button>
        </div>
      )}
      {!open && <div className="muted">当前预约：{formatDateTime(archive.scheduledAt)}</div>}
    </div>
  );
}
