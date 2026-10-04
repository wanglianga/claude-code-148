import { useEffect, useRef, useState } from 'react';
import type { PhotoRef } from '@/types';
import { deletePhoto, fileToDataUrl, getPhoto, putPhoto } from '@/lib/idb';
import { uid } from '@/lib/id';

/** 照片网格：本地 IndexedDB 存取，随草稿离线保存 */
export function PhotoGrid({ photos, onChange, readOnly = false }: { photos: PhotoRef[]; onChange: (next: PhotoRef[]) => void; readOnly?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const next: PhotoRef[] = [...photos];
      for (const file of Array.from(files).slice(0, 6 - photos.length)) {
        const data = await fileToDataUrl(file);
        const id = uid('ph');
        await putPhoto({ id, data, createdAt: new Date().toISOString() });
        next.push({ id, name: file.name, createdAt: new Date().toISOString() });
      }
      onChange(next);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(id: string) {
    await deletePhoto(id);
    onChange(photos.filter((p) => p.id !== id));
  }

  return (
    <div className="photo-grid">
      {photos.map((p) => (
        <PhotoThumb key={p.id} photo={p} onRemove={readOnly ? undefined : () => void remove(p.id)} />
      ))}
      {!readOnly && photos.length < 6 && (
        <label className="photo-add">
          <span className="plus">+</span>
          <span>{busy ? '处理中…' : '拍照/相册'}</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </label>
      )}
    </div>
  );
}

export function PhotoThumb({ photo, onRemove }: { photo: PhotoRef; onRemove?: () => void }) {
  const [url, setUrl] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [viewer, setViewer] = useState(false);

  useEffect(() => {
    let alive = true;
    void getPhoto(photo.id).then((d) => {
      if (alive) {
        setUrl(d);
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [photo.id]);

  return (
    <>
      <div className="photo-thumb" onClick={() => url && setViewer(true)}>
        {url ? (
          <img src={url} alt={photo.name} />
        ) : (
          <div className="empty" style={{ padding: 8, fontSize: 11 }}>{loaded ? '🖼️ 待同步' : '加载中'}</div>
        )}
        {onRemove && (
          <button
            className="del"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            ×
          </button>
        )}
      </div>
      {viewer && url && (
        <div className="photo-viewer" onClick={() => setViewer(false)}>
          <button className="close">×</button>
          <img src={url} alt={photo.name} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}
