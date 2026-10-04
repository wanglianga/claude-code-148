import type { RiskAssessment } from '@/types';
import { ACTION_LABEL, OVERALL_LABEL } from '@/lib/labels';

const FACTOR_TEXT_CLASS: Record<string, string> = {
  critical: 'critical',
  warning: 'warning',
  watch: 'watch',
  info: 'info',
};

export function AssessmentPanel({ a, familyView = false }: { a: RiskAssessment; familyView?: boolean }) {
  return (
    <div>
      <div className={`assess-panel ${a.overall}`}>
        <div className="ap-title">综合风险分级：{OVERALL_LABEL[a.overall]}</div>
        <div className="ap-sub">
          出生 {a.ageHours.toFixed(0)} 小时
          {typeof a.weightLossPct === 'number' && ` · 体重较出生 ${a.weightLossPct > 0 ? `下降 ${a.weightLossPct}%` : `增长 ${Math.abs(a.weightLossPct)}%`}`}
          {a.bilirubinZone && a.bilirubinZone !== 'unmeasured' && ` · 胆红素分区：${zoneText(a.bilirubinZone)}`}
          {a.bilirubinNearThreshold && ' · 接近阈值'}
        </div>
        {a.actions.length > 0 && (
          <div className="row-flex wrap" style={{ marginTop: 10, gap: 6 }}>
            {a.actions.map((act) => (
              <span key={act} className="badge" style={{ background: 'rgba(255,255,255,.22)', color: '#fff' }}>
                {ACTION_LABEL[act] ?? act}
              </span>
            ))}
          </div>
        )}
      </div>

      {!familyView && (
        <div className="card">
          <h2>判断依据（不只看单次黄疸值）</h2>
          {a.factors.map((f, i) => (
            <div key={`${f.code}-${i}`} className={`factor ${FACTOR_TEXT_CLASS[f.level]}`}>
              <span className="f-dot" />
              <span>{f.text}</span>
            </div>
          ))}
        </div>
      )}

      {a.advice.length > 0 && (
        <div className="card">
          <h2>护理建议{familyView ? '' : '（可在此基础上电话补充）'}</h2>
          <ul className="advice-list">
            {a.advice.map((ad, i) => (
              <li key={i}>{ad}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function zoneText(z: NonNullable<RiskAssessment['bilirubinZone']>): string {
  return { low: '低危区', low_intermediate: '低中危区', high_intermediate: '中高危区', high: '高危区', unmeasured: '未测' }[z];
}
