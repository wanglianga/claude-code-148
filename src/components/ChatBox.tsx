import { useEffect, useRef, useState } from 'react';
import { usePiniaStore } from '@/stores/bridge';
import { useDataStore } from '@/stores/data';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/lib/labels';
import type { Role } from '@/types';

export function ChatBox({ archiveId, from }: { archiveId: string; from: Role }) {
  const data = usePiniaStore(useDataStore);
  const auth = usePiniaStore(useAuthStore);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const messages = data.messagesFor(archiveId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  function send() {
    const t = text.trim();
    if (!t) return;
    data.sendMessage(archiveId, from, t);
    setText('');
  }

  return (
    <div className="card">
      <h2>线上咨询{from === 'family' ? '（社区护士 24 小时内回复）' : ''}</h2>
      <div className="chat" style={{ maxHeight: 320, overflowY: 'auto' }}>
        {messages.length === 0 && <div className="muted" style={{ padding: '8px 0' }}>可以就黄疸、喂养、脐带护理等问题提问。</div>}
        {messages.map((m) => {
          const mine = m.from === from || (from === 'nurse' && m.from === 'nurse');
          return (
            <div key={m.id} className={`bubble ${mine ? 'nurse' : 'family'}`}>
              {m.text}
              <div className="b-meta">
                {m.from === 'nurse' ? '社区护士' : '家属'} · {formatDateTime(m.createdAt)}
                {m.syncStatus !== 'synced' && ' · 待同步'}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input">
        <input
          type="text"
          value={text}
          placeholder={auth.isNurse ? '回复家属…' : '描述宝宝情况，例如黄疸是否加重…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn btn-primary btn-sm" style={{ width: 72 }} onClick={send}>发送</button>
      </div>
    </div>
  );
}
