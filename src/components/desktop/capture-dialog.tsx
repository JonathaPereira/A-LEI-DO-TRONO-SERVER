import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppIcon as Icon } from '../application/icons';
import styles from '../application/media-dialog.module.css';
import type { DesktopCapture } from '../../lib/desktop/capture';

export function DesktopCaptureDialog({ controller }: { controller: DesktopCapture }) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const dialog = useRef<HTMLDialogElement>(null),
    audio = useRef<HTMLSelectElement>(null),
    shown = useRef<string | null>(null);
  const [category, setCategory] = useState<'window' | 'screen'>('window');
  const request = state.request,
    windowSource = !!state.source?.startsWith('window:');
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (request?.id !== shown.current)
      setCategory(state.source?.startsWith('screen:') ? 'screen' : 'window');
    shown.current = request?.id ?? null;
    if (request && !element.open) element.showModal();
    else if (!request && element.open) element.close();
  }, [request]);
  const help =
    state.audioMode === 'system'
      ? 'Áudio do computador inteiro pode incluir as vozes da chamada e causar eco.'
      : state.audioMode === 'application'
        ? 'Somente o aplicativo escolhido e seus processos de áudio serão capturados. Abas do mesmo navegador podem compartilhar processos; prefira a janela do jogo.'
        : 'Captura sem áudio. Áudio isolado por aplicativo requer Windows 11 ou Windows build 20348 ou superior.';
  return (
    <dialog
      closedby="any"
      ref={dialog}
      className={styles.dialog + ' ' + styles.capture}
      aria-label="Escolher tela ou janela"
      onCancel={(event) => {
        event.preventDefault();
        controller.cancel();
      }}
      onClose={() => {
        if (!dialog.current?.open && controller.getSnapshot().request?.id === shown.current)
          controller.cancel();
      }}
    >
      <header className={styles.header}>
        <div>
          <span className="section-eyebrow">CAPTURA LOCAL OU COMPARTILHAMENTO</span>
          <h2>Qual tela ou janela?</h2>
        </div>
        <button
          type="button"
          className="dialog-close"
          aria-label="Cancelar captura"
          onClick={() => controller.cancel()}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className={styles.captureTabs} role="tablist" aria-label="Tipo de captura">
        {(
          [
            ['window', 'Aplicativos', 'pc'],
            ['screen', 'Tela inteira', 'screen'],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={category === id}
            tabIndex={category === id ? 0 : -1}
            onClick={() => setCategory(id)}
            onKeyDown={(e) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === 'Home'
                    ? 'window'
                    : e.key === 'End'
                      ? 'screen'
                      : category === 'window'
                        ? 'screen'
                        : 'window';
                setCategory(next);
                const buttons =
                  e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]');
                buttons?.[next === 'window' ? 0 : 1]?.focus();
              }
            }}
          >
            <Icon name={icon} size={18} />
            {label}
          </button>
        ))}
      </div>
      <div
        className={styles.sources}
        role="tabpanel"
        aria-label={category === 'window' ? 'Aplicativos' : 'Tela inteira'}
      >
        {request?.sources
          .filter((source) => source.id.startsWith(category + ':'))
          .map((source) => (
            <button
              key={source.id}
              data-source-kind={category}
              type="button"
              aria-pressed={state.source === source.id}
              onClick={() => controller.selectSource(source.id)}
            >
              {/* Native thumbnails are local previews, not public Next image assets. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={source.thumbnail || undefined} alt="" />
              <span>{source.name}</span>
            </button>
          ))}
        {request && !request.sources.some((source) => source.id.startsWith(category + ':')) && (
          <p>
            {category === 'window'
              ? 'Nenhum aplicativo disponível. Você pode escolher Tela inteira.'
              : 'Nenhuma tela disponível. Você pode escolher Aplicativos.'}
          </p>
        )}
      </div>
      <div
        className="desktop-audio-options"
        hidden={!request?.audio}
        style={!request?.audio ? { display: 'none' } : undefined}
      >
        <label>
          Áudio
          <select
            id="desktopAudioMode"
            value={state.audioMode}
            onChange={(event) => controller.setAudioMode(event.currentTarget.value)}
          >
            <option value="none">Sem áudio</option>
            <option value="application" disabled={!request?.applicationAudio}>
              Aplicativo escolhido · isolado
            </option>
            <option value="system" disabled={!request?.windows || !!request?.remote}>
              Computador inteiro
            </option>
          </select>
        </label>
        <label
          id="desktopAudioSourceLabel"
          hidden={state.audioMode !== 'application' || windowSource}
          style={
            state.audioMode !== 'application' || windowSource ? { display: 'none' } : undefined
          }
        >
          Aplicativo para o áudio da tela
          <select
            id="desktopAudioSource"
            ref={audio}
            value={state.audioSource}
            onChange={(event) => controller.setAudioSource(event.currentTarget.value)}
          >
            <option value="">Escolha um aplicativo</option>
            {(request?.audioSources ?? request?.sources ?? [])
              .filter((source) => source.id.startsWith('window:'))
              .map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <p className="desktop-capture-help">{help}</p>
      <p id="desktopCaptureMessage" role="status">
        {state.message}
      </p>
      <div className="dialog-actions">
        <button type="button" onClick={() => controller.cancel()}>
          Cancelar
        </button>
        <button
          id="desktopCaptureConfirm"
          type="button"
          className="primary-button"
          disabled={!state.source?.startsWith(category + ':')}
          onClick={() => {
            if (!state.source?.startsWith(category + ':')) return;
            if (!controller.confirm()) audio.current?.focus();
          }}
        >
          Iniciar captura
        </button>
      </div>
    </dialog>
  );
}
