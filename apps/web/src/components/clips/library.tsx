'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ClipLibrary } from '../../lib/clips/library';
import type { LocalClip } from '../../types/clips';

function Preview({ blob, name }: { blob: Blob; name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const url = URL.createObjectURL(blob);
    video.src = url;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    };
    window.addEventListener('pagehide', release, { once: true });
    return () => {
      window.removeEventListener('pagehide', release);
      release();
    };
  }, [blob]);
  return (
    <video ref={ref} controls playsInline preload="metadata" aria-label={'Prévia de ' + name} />
  );
}
function ClipCard({
  clip,
  client,
  busy,
  emergency,
}: {
  clip: Readonly<LocalClip>;
  client: ClipLibrary;
  busy: boolean;
  emergency: boolean;
}) {
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    const close = () => setPreview(false),
      dialog = document.getElementById('clipsDialog');
    dialog?.addEventListener('close', close);
    window.addEventListener('pagehide', close);
    return () => {
      dialog?.removeEventListener('close', close);
      window.removeEventListener('pagehide', close);
    };
  }, []);
  const name = clip.name || 'Clipe';
  return (
    <article className="clip-card" data-clip-id={clip.id}>
      {clip.blob && (
        <div className="clip-preview" hidden={!preview}>
          {preview && <Preview blob={clip.blob} name={name} />}
        </div>
      )}
      <strong>{name}</strong>
      <small>
        {Math.round(clip.duration ?? 0)} s · {clip.quality || 'Qualidade original'} ·{' '}
        {clip.fps ?? 0} FPS · {((clip.bytes ?? clip.blob?.size ?? 0) / 1048576).toFixed(1)} MB
      </small>
      <span className="clip-state">
        {clip.state === 'saved'
          ? 'Salvo na pasta escolhida'
          : clip.state === 'download'
            ? 'Download solicitado · cópia local mantida'
            : emergency
              ? 'Somente nesta sessão · salve antes de fechar'
              : 'Armazenado no navegador · pendente'}
      </span>
      <div className="clip-actions">
        {clip.blob && (
          <>
            <button type="button" disabled={busy} onClick={() => setPreview((value) => !value)}>
              Prévia
            </button>
            <button type="button" disabled={busy} onClick={() => void client.save(clip.id)}>
              Salvar
            </button>
          </>
        )}
        <button type="button" disabled={busy} onClick={() => void client.discard(clip.id)}>
          {clip.blob ? 'Descartar' : 'Remover da lista'}
        </button>
      </div>
    </article>
  );
}
/** React owns only the library subtree; replay controls remain with their current coordinator. */
export function ClipLibraryCards({ client }: { client: ClipLibrary }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return (
    <>
      {state.clips.length ? (
        state.clips.map((clip) => (
          <ClipCard
            key={state.owner + ':' + clip.id}
            clip={clip}
            client={client}
            busy={state.busyIds.includes(clip.id)}
            emergency={state.emergencyIds.includes(clip.id)}
          />
        ))
      ) : (
        <p className="clips-empty">Seus clipes ficam aqui até você decidir salvar ou descartar.</p>
      )}
    </>
  );
}
