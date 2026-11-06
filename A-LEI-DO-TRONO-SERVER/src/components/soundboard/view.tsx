import { AppIcon as Icon } from '../application/icons';
import styles from './soundboard.module.css';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Soundboard, SoundboardSnapshot } from '../../lib/soundboard/controller';

function TrimNumber({
  id,
  value,
  max,
  min,
  disabled,
  commit,
}: {
  id: string;
  value: number;
  max: number;
  min: number;
  disabled: boolean;
  commit(value: number): void;
}) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(2))));
  useEffect(() => setDraft(String(Number(value.toFixed(2)))), [value]);
  return (
    <input
      id={id}
      type="number"
      min={min}
      max={max}
      step="0.01"
      inputMode="decimal"
      disabled={disabled}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => {
        if (draft !== '' && Number.isFinite(Number(draft))) commit(Number(draft));
        setDraft(String(Number(value.toFixed(2))));
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
function SoundWaveform({
  clip,
  start,
  end,
  seek,
}: {
  clip: SoundboardSnapshot['clip'];
  start: number;
  end: number;
  seek(position: number): void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const element = canvas.current,
        context = element?.getContext('2d');
      if (!clip || !element || !context) return;
      const style = getComputedStyle(document.documentElement),
        width = element.width,
        height = element.height;
      const accent = style.getPropertyValue('--theme-accent').trim() || '#a99cff';
      const muted = style.getPropertyValue('--theme-muted').trim() || '#a5acc8';
      context.clearRect(0, 0, width, height);
      context.fillStyle = style.getPropertyValue('--theme-bg').trim() || '#0c0e18';
      context.fillRect(0, 0, width, height);
      const from = (start / clip.duration) * width,
        to = (end / clip.duration) * width;
      context.fillStyle = accent;
      context.globalAlpha = 0.2;
      context.fillRect(from, 0, to - from, height);
      context.globalAlpha = 1;
      clip.peaks.forEach((peak, index) => {
        const x = index * 3,
          bar = Math.max(3, peak * (height - 20));
        context.fillStyle = x >= from && x <= to ? accent : muted;
        context.fillRect(x, (height - bar) / 2, 2, bar);
      });
      context.fillStyle = accent;
      context.fillRect(from, 0, 2, height);
      context.fillRect(Math.max(0, to - 2), 0, 2, height);
    };
    draw();
    window.addEventListener('trono-theme-change', draw);
    return () => window.removeEventListener('trono-theme-change', draw);
  }, [clip, start, end]);
  return (
    <canvas
      id="soundWaveform"
      ref={canvas}
      width={640}
      height={100}
      aria-hidden="true"
      onClick={(event) => {
        if (!clip) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width) seek(((event.clientX - rect.left) / rect.width) * clip.duration);
      }}
    />
  );
}
export function SoundboardView({ client, close }: { client: Soundboard; close(): void }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const menu = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const sounds = state.sounds.filter((file) =>
    file.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  useEffect(() => {
    if (!state.open) setQuery('');
  }, [state.open]);
  useLayoutEffect(() => {
    if (state.open && !menu.current?.open) {
      const active = document.activeElement;
      if (document.querySelector('dialog:modal')) menu.current?.showModal();
      else menu.current?.show();
      if (
        menu.current?.closest<HTMLElement>('#soundboardRoot')?.dataset.hover === 'true' &&
        active instanceof HTMLElement
      )
        active.focus({ preventScroll: true });
    } else if (!state.open && menu.current?.open) menu.current.close();
    const position = () => {
      if (state.open && menu.current) {
        const root = menu.current.closest<HTMLElement>('#soundboardRoot'),
          anchor = document.getElementById(root?.dataset.anchor || 'soundboardToggle');
        const box = anchor?.getBoundingClientRect();
        if (box) {
          const n = menu.current;
          n.style.left =
            Math.max(12, Math.min(box.left, window.innerWidth - n.offsetWidth - 12)) + 'px';
          const modal = n.matches(':modal') || !anchor?.getClientRects().length;
          const height = modal
            ? Math.min(600, window.innerHeight - 32)
            : Math.min(window.innerHeight - 32, Math.max(380, Math.min(520, box.top - 22)));
          if (modal) n.style.left = Math.max(12, (window.innerWidth - n.offsetWidth) / 2) + 'px';
          n.style.maxHeight = height + 'px';
          n.style.top =
            (modal
              ? Math.max(16, (window.innerHeight - height) / 2)
              : Math.max(12, box.top - height - 10)) + 'px';
        }
      }
    };
    position();
    window.addEventListener('resize', position);
    if (
      state.open &&
      menu.current?.closest<HTMLElement>('#soundboardRoot')?.dataset.hover !== 'true'
    )
      menu.current
        ?.querySelector<HTMLInputElement>('#soundboardSearch')
        ?.focus({ preventScroll: true });
    return () => window.removeEventListener('resize', position);
  }, [state.open]);
  const disabled = state.uploading || state.loading || !state.clip;
  return (
    <dialog
      closedby="any"
      id="soundboardDialog"
      ref={menu}
      className={styles.menu + ' feature-dialog soundboard-menu'}
      aria-labelledby="soundboardTitle"
      role="dialog"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={() => {
        if (!menu.current?.open && state.open) close();
      }}
    >
      <header className="soundboard-heading">
        <div>
          <span className="section-eyebrow">NA CHAMADA</span>
          <h2 id="soundboardTitle">Efeitos sonoros</h2>
        </div>
        <button
          id="soundboardClose"
          className="dialog-close"
          type="button"
          aria-label="Fechar efeitos"
          onClick={close}
        >
          <Icon name="close" size={18} />
        </button>
      </header>
      <label className="sound-search">
        <Icon name="search" size={18} />
        <input
          id="soundboardSearch"
          type="search"
          aria-label="Buscar efeitos sonoros"
          placeholder="Encontre um som…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p id="soundboardCallHint">
        {state.accountId && state.joined
          ? 'Clique para tocar. Clique novamente para reiniciar na chamada.'
          : 'Entre na voz para enviar efeitos. As prévias tocam só para você.'}
      </p>
      <div className="sound-volume">
        <label htmlFor="soundboardVolume">Volume para mim</label>
        <input
          id="soundboardVolume"
          type="range"
          min="0"
          max="100"
          value={state.volume}
          onChange={(event) => client.setVolume(Number(event.currentTarget.value))}
        />
        <output id="soundboardVolumeValue">{state.volume}%</output>
        <button
          id="soundStop"
          aria-label="Parar áudio"
          title="Parar áudio"
          className="secondary-button"
          type="button"
          onClick={client.stop}
        >
          <Icon name="stop" size={17} />
        </button>
      </div>
      <div id="soundboardList" className="soundboard-list">
        {sounds.map((file) => {
          const label = file.name.replace(/\.wav$/i, '');
          return (
            <article className="sound-card" key={file.id}>
              <button
                type="button"
                data-play-sound={file.id}
                className="sound-play"
                title={'Tocar ' + label + ' na chamada'}
                aria-label={'Tocar ' + label + ' na chamada'}
                disabled={!state.accountId || !state.joined}
                onClick={() => client.play(file.id)}
              >
                <span className="sound-thumbnail" aria-hidden="true">
                  <Icon name="music" size={17} />
                </span>
                <strong>{label}</strong>
                <small>{(file.durationMs / 1000).toFixed(1)} s</small>
              </button>
              <div className="sound-card-actions">
                <button
                  type="button"
                  className="sound-preview"
                  aria-label={'Ouvir prévia de ' + file.name}
                  onClick={() => void client.preview(file.id)}
                >
                  <Icon name="headphones" size={14} />
                </button>
                {(file.ownerId === state.accountId || state.moderateFiles) && (
                  <button
                    type="button"
                    className="sound-delete"
                    aria-label={'Excluir efeito ' + label}
                    title={'Excluir efeito ' + label}
                    disabled={state.deleting.includes(file.id)}
                    onClick={() => void client.remove(file.id)}
                  >
                    <Icon name="close" size={18} />
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {!sounds.length && (
          <p className="sound-empty">
            {query ? 'Nenhum som encontrado.' : 'Adicione seu primeiro efeito sonoro.'}
          </p>
        )}
      </div>
      <details
        id="soundUploadDetails"
        className="sound-upload-details"
        open={state.detailsOpen}
        onToggle={(event) => {
          if (event.currentTarget.open !== state.detailsOpen)
            client.setDetails(event.currentTarget.open);
        }}
      >
        <summary>＋ Adicionar efeito</summary>
        <form
          id="soundUploadForm"
          className="sound-upload-form"
          onSubmit={(event) => {
            event.preventDefault();
            void client.upload();
          }}
        >
          <label>
            Nome
            <input
              id="soundName"
              maxLength={40}
              required
              placeholder="Ex.: aplausos"
              value={state.name}
              disabled={state.uploading}
              onChange={(event) => client.setName(event.currentTarget.value)}
            />
          </label>
          <label>
            Escolher áudio
            <input
              id="soundFile"
              key={state.fileRevision}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm"
              required
              disabled={state.uploading}
              onChange={(event) => void client.load(event.currentTarget.files?.[0] ?? null)}
            />
            <small>Até 20 MB. Áudios longos podem ser recortados abaixo.</small>
          </label>
          <section
            id="soundTrimEditor"
            className="sound-trim-editor"
            aria-label="Recortar áudio"
            hidden={!state.clip}
          >
            <div className="trim-heading">
              <strong>Escolha seu trecho</strong>
              <output id="soundTrimDuration">
                {state.clip ? (state.trimEnd - state.trimStart).toFixed(2) + ' s / 15 s' : ''}
              </output>
            </div>
            <SoundWaveform
              clip={state.clip}
              start={state.trimStart}
              end={state.trimEnd}
              seek={client.seek}
            />
            <div className="trim-fields">
              {(['start', 'end'] as const).map((kind) => (
                <label key={kind}>
                  {kind === 'start' ? 'Início (s)' : 'Fim (s)'}
                  <TrimNumber
                    id={kind === 'start' ? 'soundTrimStart' : 'soundTrimEnd'}
                    value={kind === 'start' ? state.trimStart : state.trimEnd}
                    max={state.clip?.duration ?? 15}
                    min={kind === 'start' ? 0 : 0.05}
                    disabled={state.uploading}
                    commit={(value) => client.changeTrim(kind, value)}
                  />
                </label>
              ))}
            </div>
            {(['start', 'end'] as const).map((kind) => (
              <label key={kind}>
                {kind === 'start' ? 'Posição inicial' : 'Posição final'}
                <input
                  id={kind === 'start' ? 'soundTrimStartRange' : 'soundTrimEndRange'}
                  className="trim-range"
                  aria-label={
                    kind === 'start' ? 'Posição inicial do recorte' : 'Posição final do recorte'
                  }
                  type="range"
                  min="0"
                  step="0.01"
                  max={state.clip?.duration ?? 15}
                  value={Number((kind === 'start' ? state.trimStart : state.trimEnd).toFixed(2))}
                  disabled={state.uploading}
                  onChange={(event) => client.changeTrim(kind, Number(event.currentTarget.value))}
                />
              </label>
            ))}
            <div className="trim-footer">
              <small>Trecho de até 15 segundos. Ajuste os dois pontos ou clique na onda.</small>
              <button
                id="soundTrimPreview"
                className="secondary-button"
                type="button"
                disabled={disabled}
                onClick={() => void client.previewTrim()}
              >
                ▶ Ouvir trecho
              </button>
            </div>
          </section>
          <button id="soundUpload" type="submit" className="primary-button" disabled={disabled}>
            ↑ Enviar trecho
          </button>
        </form>
      </details>
      <p id="soundboardMessage" className="feature-message" role="status" aria-live="polite">
        {state.message}
      </p>
    </dialog>
  );
}
