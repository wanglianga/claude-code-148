import { useMemo, useState } from 'react';
import type {
  BreastStatus,
  CordStatus,
  EmotionStatus,
  FamilyArchive,
  PhotoRef,
  SpitUpLevel,
  StoolColor,
  Visit,
  WoundStatus,
} from '@/types';
import { useDataStore } from '@/stores/data';
import { usePiniaStore } from '@/stores/bridge';
import { assess, effectiveBilirubin } from '@/lib/risk';
import { uid, nowIso } from '@/lib/id';
import {
  BREAST_LABEL, CORD_LABEL, EMOTION_LABEL, FEEDING_LABEL, SPITUP_LABEL, STOOL_COLOR_LABEL, WOUND_LABEL,
  fromDatetimeLocalValue, toDatetimeLocalValue,
} from '@/lib/labels';
import { PhotoGrid } from '@/components/PhotoGrid';
import { AssessmentPanel } from '@/components/AssessmentPanel';
import { SyncBadge } from '@/components/Badges';

type Mode = 'normal' | 'not_home' | 'refused' | 'reschedule';

function blankVisit(archive: FamilyArchive, visitNumber: number, source?: Visit): Visit {
  const base: Visit = source
    ? JSON.parse(JSON.stringify(source))
    : {
        id: uid('v'),
        clientId: uid('c'),
        archiveId: archive.id,
        visitNumber,
        performedAt: nowIso(),
        photos: [],
        syncStatus: 'local_draft',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
  return base;
}

export function VisitForm({ archive, existing, onDone, onCancel }: {
  archive: FamilyArchive;
  existing?: Visit;
  onDone: () => void;
  onCancel: () => void;
}) {
  const data = usePiniaStore(useDataStore);
  const prevVisits = data.visitsFor(archive.id);
  const [draft, setDraft] = useState<Visit>(() => blankVisit(archive, prevVisits.length + 1, existing));
  const [submitting, setSubmitting] = useState(false);

  const mode: Mode = draft.refusedEntry ? 'refused' : draft.familyNotHome ? 'not_home' : draft.rescheduledTo ? 'reschedule' : 'normal';

  const set = <K extends keyof Visit>(key: K, value: Visit[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const preview = useMemo(() => {
    // 实时预览：不写库，仅帮助护士现场判断
    const previous = [...prevVisits].reverse().find((v) => v.id !== draft.id);
    const prevBili = previous ? effectiveBilirubin(previous.jaundice) : undefined;
    try {
      return assess({
        archive,
        visit: draft,
        previousWeightG: previous?.weightG,
        previousBilirubin: prevBili !== undefined && previous ? { value: prevBili, at: previous.performedAt } : undefined,
      });
    } catch {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, archive]);

  function setMode(m: Mode) {
    setDraft((d) => {
      const next = { ...d };
      next.familyNotHome = m === 'not_home';
      next.refusedEntry = m === 'refused';
      if (m !== 'reschedule') next.rescheduledTo = undefined;
      if (m === 'normal') {
        next.familyNotHome = false;
        next.refusedEntry = false;
        next.rescheduledTo = undefined;
      }
      return next;
    });
  }

  function saveDraftLocal() {
    data.saveDraft(draft);
    onDone();
  }

  function submit() {
    setSubmitting(true);
    // 异常上门情形允许测量为空
    data.saveVisit(archive, draft);
    setSubmitting(false);
    onDone();
  }

  return (
    <div className="page">
      {existing && (
        <div className="row-flex" style={{ marginBottom: 10 }}>
          <span className="muted">继续编辑第 {existing.visitNumber} 次访视记录</span>
          <span className="spacer" />
          <SyncBadge status={existing.syncStatus} />
        </div>
      )}

      {/* —— 上门结果 —— */}
      <details className="form-section" open>
        <summary><span className="arrow">›</span>上门情况<span className="fs-tag muted">{MODE_TEXT[mode]}</span></summary>
        <div className="fs-body">
          <div className="seg" style={{ marginBottom: 12 }}>
            {([
              ['normal', '✅ 正常入户访视'],
              ['not_home', '🚪 无人在家'],
              ['refused', '🚫 家属不愿开门'],
              ['reschedule', '🕐 家庭临时改约'],
            ] as Array<[Mode, string]>).map(([m, t]) => (
              <button key={m} type="button" className={`opt ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>{t}</button>
            ))}
          </div>
          <div className="field">
            <label>访视时间</label>
            <input
              type="datetime-local"
              value={toDatetimeLocalValue(draft.performedAt)}
              onChange={(e) => set('performedAt', fromDatetimeLocalValue(e.target.value))}
            />
          </div>
          {mode === 'reschedule' && (
            <div className="field">
              <label>改约到什么时间</label>
              <input
                type="datetime-local"
                value={draft.rescheduledTo ? toDatetimeLocalValue(draft.rescheduledTo) : ''}
                onChange={(e) => set('rescheduledTo', e.target.value ? fromDatetimeLocalValue(e.target.value) : undefined)}
              />
            </div>
          )}
          {mode !== 'normal' && (
            <div className="field">
              <label>情况说明（隔门沟通/联系产妇本人等）</label>
              <textarea value={draft.outcomeNote ?? ''} onChange={(e) => set('outcomeNote', e.target.value)} placeholder="例如：老人拒绝开门，已隔门宣教并电话联系产妇" />
            </div>
          )}
          <label className="check-row">
            <input
              type="checkbox"
              checked={!!draft.onlineConsultRequested}
              onChange={(e) => set('onlineConsultRequested', e.target.checked)}
            />
            家长提出线上咨询需求（24 小时内回复）
          </label>
        </div>
      </details>

      {mode === 'normal' && (
        <>
          {/* —— 婴儿测量 —— */}
          <details className="form-section" open>
            <summary><span className="arrow">›</span>婴儿测量：体重 · 黄疸值</summary>
            <div className="fs-body">
              <div className="grid2">
                <div className="field">
                  <label>当前体重（g）</label>
                  <input type="number" inputMode="decimal" value={draft.weightG ?? ''} onChange={(e) => set('weightG', e.target.value ? Number(e.target.value) : undefined)} placeholder={`出生 ${archive.birthWeightG} g`} />
                </div>
                <div className="field">
                  <label>访视时出生小时</label>
                  <input type="text" disabled value={`${preview?.ageHours.toFixed(0) ?? '—'} 小时`} />
                </div>
              </div>

              <div className="field">
                <label>经皮胆红素 TcB（mg/dL）<span className="hint">额部 / 胸部，取高值参与判断</span></label>
                <div className="grid2">
                  <input type="number" step="0.1" inputMode="decimal" placeholder="额部" value={draft.jaundice?.forehead ?? ''} onChange={(e) => set('jaundice', { ...draft.jaundice, forehead: e.target.value ? Number(e.target.value) : undefined })} />
                  <input type="number" step="0.1" inputMode="decimal" placeholder="胸部" value={draft.jaundice?.chest ?? ''} onChange={(e) => set('jaundice', { ...draft.jaundice, chest: e.target.value ? Number(e.target.value) : undefined })} />
                </div>
              </div>
              <div className="field">
                <label>血清胆红素 TSB（mg/dL）<span className="hint">有上级医院回报时填写，优先采用</span></label>
                <input type="number" step="0.1" inputMode="decimal" value={draft.jaundice?.tsb ?? ''} onChange={(e) => set('jaundice', { ...draft.jaundice, tsb: e.target.value ? Number(e.target.value) : undefined })} />
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={!!draft.jaundice?.deviceFault}
                  onChange={(e) => set('jaundice', { ...(draft.jaundice ?? {}), deviceFault: e.target.checked })}
                />
                社区设备故障 / 未带仪器，本次未能测量
              </label>
            </div>
          </details>

          {/* —— 观察：脐带/大小便/喂养/吐奶/睡眠 —— */}
          <details className="form-section" open>
            <summary><span className="arrow">›</span>观察：脐带 · 大小便 · 喂养 · 吐奶 · 睡眠</summary>
            <div className="fs-body">
              <div className="field">
                <label>脐带情况（可多选）</label>
                <div className="seg">
                  {(Object.keys(CORD_LABEL) as CordStatus[]).map((c) => {
                    const on = draft.cord?.includes(c);
                    const danger = c === 'odor' || c === 'redness';
                    return (
                      <button
                        type="button"
                        key={c}
                        className={`opt ${on ? `on ${danger ? 'danger' : ''}` : ''}`}
                        onClick={() => {
                          const set0 = new Set(draft.cord ?? []);
                          if (on) set0.delete(c);
                          else {
                            set0.clear();
                            set0.add(c === 'dry' ? 'dry' : c);
                            if (c !== 'dry') set0.delete('dry');
                          }
                          set('cord', [...set0]);
                        }}
                      >
                        {CORD_LABEL[c]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid2">
                <div className="field">
                  <label>24h 小便次数</label>
                  <input type="number" inputMode="numeric" value={draft.urineCount24h ?? ''} onChange={(e) => set('urineCount24h', e.target.value ? Number(e.target.value) : undefined)} placeholder="次" />
                </div>
                <div className="field">
                  <label>24h 大便次数</label>
                  <input type="number" inputMode="numeric" value={draft.stool?.count24h ?? ''} onChange={(e) => set('stool', { count24h: e.target.value ? Number(e.target.value) : 0, color: draft.stool?.color ?? 'yellow', meconiumCleared: draft.stool?.meconiumCleared ?? true })} placeholder="次" />
                </div>
              </div>
              <div className="field">
                <label>大便颜色<span className="hint">灰白陶土便为紧急红旗征</span></label>
                <div className="seg">
                  {(Object.keys(STOOL_COLOR_LABEL) as StoolColor[]).map((c) => (
                    <button type="button" key={c} className={`opt ${draft.stool?.color === c ? `on ${c === 'gray_white' ? 'danger' : c === 'light' ? 'warn' : ''}` : ''}`} onClick={() => set('stool', { count24h: draft.stool?.count24h ?? 0, color: c, meconiumCleared: draft.stool?.meconiumCleared ?? true })}>
                      {STOOL_COLOR_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="check-row">
                <input type="checkbox" checked={draft.stool?.meconiumCleared ?? true} onChange={(e) => set('stool', { count24h: draft.stool?.count24h ?? 0, color: draft.stool?.color ?? 'yellow', meconiumCleared: e.target.checked })} />
                胎便已转黄（未转黄且超过 72 小时提示喂养不足）
              </label>

              <div className="field">
                <label>喂养方式</label>
                <div className="seg">
                  {(Object.keys(FEEDING_LABEL) as Array<keyof typeof FEEDING_LABEL>).map((m) => (
                    <button type="button" key={m} className={`opt ${draft.feeding?.mode === m ? 'on' : ''}`} onClick={() => set('feeding', { mode: m, frequency24h: draft.feeding?.frequency24h ?? 8, effectiveLatch: draft.feeding?.effectiveLatch ?? true, supplement: draft.feeding?.supplement })}>
                      {FEEDING_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid2">
                <div className="field">
                  <label>24h 喂养次数<span className="hint">母乳建议 ≥8 次</span></label>
                  <input type="number" inputMode="numeric" value={draft.feeding?.frequency24h ?? ''} onChange={(e) => set('feeding', { mode: draft.feeding?.mode ?? archive.feedingMode, frequency24h: e.target.value ? Number(e.target.value) : 0, effectiveLatch: draft.feeding?.effectiveLatch ?? true, supplement: draft.feeding?.supplement })} />
                </div>
                <div className="field">
                  <label>含接是否有效</label>
                  <div className="seg">
                    <button type="button" className={`opt ${draft.feeding?.effectiveLatch === true ? 'on' : ''}`} onClick={() => set('feeding', { mode: draft.feeding?.mode ?? archive.feedingMode, frequency24h: draft.feeding?.frequency24h ?? 8, effectiveLatch: true, supplement: draft.feeding?.supplement })}>有效</button>
                    <button type="button" className={`opt ${draft.feeding?.effectiveLatch === false ? 'on warn' : ''}`} onClick={() => set('feeding', { mode: draft.feeding?.mode ?? archive.feedingMode, frequency24h: draft.feeding?.frequency24h ?? 8, effectiveLatch: false, supplement: draft.feeding?.supplement })}>无效</button>
                  </div>
                </div>
              </div>
              {(draft.feeding?.mode === 'mixed' || draft.feeding?.mode === 'formula') && (
                <div className="field">
                  <label>补授/配方奶情况</label>
                  <input type="text" value={draft.feeding?.supplement ?? ''} onChange={(e) => set('feeding', { ...draft.feeding!, supplement: e.target.value })} placeholder="如：每次母乳后补 30ml 配方奶" />
                </div>
              )}
              <div className="grid2">
                <div className="field">
                  <label>吐奶</label>
                  <select value={draft.spitUp ?? 'none'} onChange={(e) => set('spitUp', e.target.value as SpitUpLevel)}>
                    {(Object.keys(SPITUP_LABEL) as SpitUpLevel[]).map((s) => <option key={s} value={s}>{SPITUP_LABEL[s]}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>睡眠</label>
                  <select value={draft.sleepQuality ?? 'good'} onChange={(e) => set('sleepQuality', e.target.value as 'good' | 'restless')}>
                    <option value="good">安稳</option>
                    <option value="restless">烦躁/易醒</option>
                  </select>
                </div>
              </div>
            </div>
          </details>

          {/* —— 产妇 —— */}
          <details className="form-section" open>
            <summary><span className="arrow">›</span>产妇：乳房 · 情绪 · 伤口</summary>
            <div className="fs-body">
              <div className="field">
                <label>乳房情况</label>
                <div className="seg">
                  {(Object.keys(BREAST_LABEL) as BreastStatus[]).map((b) => (
                    <button type="button" key={b} className={`opt ${draft.mother?.breast === b ? `on ${b === 'mastitis' ? 'danger' : ''}` : ''}`} onClick={() => set('mother', { ...(draft.mother ?? defaultMother()), breast: b })}>{BREAST_LABEL[b]}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>情绪状态</label>
                <div className="seg">
                  {(Object.keys(EMOTION_LABEL) as EmotionStatus[]).map((em) => (
                    <button type="button" key={em} className={`opt ${draft.mother?.emotion === em ? `on ${em === 'epds_risk' ? 'danger' : ''}` : ''}`} onClick={() => set('mother', { ...(draft.mother ?? defaultMother()), emotion: em })}>{EMOTION_LABEL[em]}</button>
                  ))}
                </div>
              </div>
              <div className="grid2">
                <div className="field">
                  <label>EPDS 评分（0-30）<span className="hint">≥9 关注 / ≥13 高危</span></label>
                  <input type="number" min={0} max={30} inputMode="numeric" value={draft.mother?.epdsScore ?? ''} onChange={(e) => set('mother', { ...(draft.mother ?? defaultMother()), epdsScore: e.target.value ? Number(e.target.value) : undefined })} />
                </div>
                <div className="field">
                  <label>会阴/腹部伤口</label>
                  <select value={draft.mother?.wound ?? 'good'} onChange={(e) => set('mother', { ...(draft.mother ?? defaultMother()), wound: e.target.value as WoundStatus })}>
                    {(Object.keys(WOUND_LABEL) as WoundStatus[]).map((w) => <option key={w} value={w}>{WOUND_LABEL[w]}</option>)}
                  </select>
                </div>
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={!!draft.mother?.selfHarmThought}
                  onChange={(e) => set('mother', { ...(draft.mother ?? defaultMother()), selfHarmThought: e.target.checked })}
                />
                <span style={{ color: draft.mother?.selfHarmThought ? 'var(--red)' : undefined, fontWeight: draft.mother?.selfHarmThought ? 700 : undefined }}>
                  EPDS 第 10 题阳性（有自伤/伤害婴儿念头）——立即心理危机干预
                </span>
              </label>
            </div>
          </details>

          {/* —— 家庭照护能力 —— */}
          <details className="form-section">
            <summary><span className="arrow">›</span>家庭照护能力</summary>
            <div className="fs-body">
              <div className="field">
                <label>主要照护者</label>
                <input type="text" value={draft.careAbility?.primaryCaregiver ?? ''} onChange={(e) => set('careAbility', { primaryCaregiver: e.target.value, confidence: draft.careAbility?.confidence ?? 'medium', concerns: draft.careAbility?.concerns })} placeholder="如：母亲+奶奶" />
              </div>
              <div className="field">
                <label>照护信心</label>
                <div className="seg">
                  {([['high', '充足'], ['medium', '一般'], ['low', '不足']] as const).map(([v, t]) => (
                    <button type="button" key={v} className={`opt ${draft.careAbility?.confidence === v ? `on ${v === 'low' ? 'warn' : ''}` : ''}`} onClick={() => set('careAbility', { primaryCaregiver: draft.careAbility?.primaryCaregiver ?? archive.contactName, confidence: v, concerns: draft.careAbility?.concerns })}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>具体顾虑/家庭问题</label>
                <textarea value={draft.careAbility?.concerns ?? ''} onChange={(e) => set('careAbility', { primaryCaregiver: draft.careAbility?.primaryCaregiver ?? archive.contactName, confidence: draft.careAbility?.confidence ?? 'medium', concerns: e.target.value })} placeholder="如：不会洗澡、纯老人照护、居住拥挤等" />
              </div>
            </div>
          </details>

          {/* —— 照片与备注 —— */}
          <details className="form-section" open>
            <summary><span className="arrow">›</span>现场照片与备注</summary>
            <div className="fs-body">
              <p className="muted" style={{ marginTop: 0 }}>建议拍摄：黄疸比色卡/黄染范围、脐带、大便颜色。照片先存本机，回社区后随记录同步。</p>
              <PhotoGrid photos={draft.photos} onChange={(ps: PhotoRef[]) => set('photos', ps)} />
              <div className="field" style={{ marginTop: 12 }}>
                <label>护士备注</label>
                <textarea value={draft.nurseNote ?? ''} onChange={(e) => set('nurseNote', e.target.value)} placeholder="查体所见、家属诉求、已做宣教等" />
              </div>
            </div>
          </details>

          {/* —— 实时风险预览 —— */}
          {preview && (
            <div className="section-title" style={{ marginLeft: 4 }}>📋 现场实时综合判断（提交后写入随访记录）</div>
          )}
          {preview && <AssessmentPanel a={preview} />}
        </>
      )}

      {/* —— 底部操作 —— */}
      <div className="fab-savebar">
        <button className="btn btn-outline" onClick={saveDraftLocal}>💾 存本地草稿</button>
        <button className="btn btn-primary" disabled={submitting} onClick={submit}>
          {mode === 'normal' ? '✅ 提交访视并生成随访' : '提交情况并安排跟进'}
        </button>
      </div>
      <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={onCancel}>取消</button>
    </div>
  );
}

const MODE_TEXT: Record<Mode, string> = {
  normal: '正常入户',
  not_home: '无人在家',
  refused: '拒绝入门',
  reschedule: '临时改约',
};

function defaultMother() {
  return { breast: 'good' as const, emotion: 'good' as const, wound: 'good' as const };
}
