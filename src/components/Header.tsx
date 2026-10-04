import type { ReactNode } from 'react';
import { NetworkBar } from './NetworkBar';

export function Header({ title, sub, onBack, right }: { title: string; sub?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <>
      <header className="app-header">
        <div className="row">
          {onBack && (
            <button className="back-btn" aria-label="返回" onClick={onBack}>‹</button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1>{title}</h1>
            {sub && <div className="sub">{sub}</div>}
          </div>
          {right}
        </div>
      </header>
      <NetworkBar />
    </>
  );
}
