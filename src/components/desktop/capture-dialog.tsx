import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
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
  const request = state.request,
    windowSource = !!state.source?.startsWith('window:');
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
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
      ref={dialog}
      className="feature-dialog desktop-capture-dialog"
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
      <header>
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
          ×
        </button>
      </header>
      <div className="desktop-capture-sources">
        {request?.sources.map((source) => (
          <button
            key={source.id}
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
        {request && !request.sources.length && (
          <p>Nenhuma tela ou janela disponível. Feche e tente novamente.</p>
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
            <option value="system" disabled={!request?.windows}>
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
            {request?.sources
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
        <button
          id="desktopCaptureConfirm"
          type="button"
          className="primary-button"
          disabled={!state.source}
          onClick={() => {
            if (!controller.confirm()) audio.current?.focus();
          }}
        >
          Iniciar captura
        </button>
      </div>
    </dialog>
  );
}
