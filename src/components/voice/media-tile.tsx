'use client';
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CallStage, ParticipantView, StageSnapshot } from '../../lib/voice/stage';
import { BorrowedVideo } from './borrowed-video';
import { bindMediaResize } from '../../lib/voice/media-resize';

export interface StageRuntime {
  TronoCallStage: CallStage;
  TronoStorage: Storage;
  TronoDesktop?: object;
  TronoProfile: {
    openMini(id: string): Promise<unknown>;
  };
  TronoStreamControls: {
    update(tile: HTMLElement, active: boolean): void;
    dispose(tile: HTMLElement): void;
  };
}
/** The portal target stays stable when docking. Reparenting never recreates the video. */
export function MediaTile({
  person: p,
  kind,
  snapshot,
  runtime,
}: {
  person: ParticipantView;
  kind: 'camera' | 'screen';
  snapshot: StageSnapshot;
  runtime: StageRuntime;
}) {
  const client = runtime.TronoCallStage;
  const [tile] = useState(() => document.createElement('div'));
  const screen = kind === 'screen',
    watching = !screen || p.watching;
  const paused = screen && p.self && snapshot.previewPaused,
    live = screen ? watching && p.screenLive : p.cameraLive;
  const docked = screen ? p.screenDock && watching : p.cameraDock;
  const host = screen ? 'screenShareGrid' : 'cameraGrid';
  useLayoutEffect(() => {
    tile.dataset.peer = p.id;
    tile.style.order = String(
      snapshot.participants.findIndex((person) => person.id === p.id) * 2 + (screen ? 0 : 1),
    );
    tile.classList.add(screen ? 'screen-share-tile' : 'camera-tile');
    if (!screen) tile.classList.add('camera-live');
    for (const [name, on] of Object.entries({
      'has-video': live || paused,
      speaking: !screen && p.speaking,
      'stream-invitation': screen && !watching,
      'local-preview-paused': paused,
      'share-collapsed': screen && p.collapsed,
    }))
      tile.classList.toggle(name, on);
    if (screen) tile.setAttribute('aria-label', 'Transmissão de ' + p.name);
    const card = [...document.querySelectorAll<HTMLElement>('#voiceRoster .voice-person')].find(
      (card) => card.dataset.peer === p.id,
    );
    const target =
      docked && card
        ? card.querySelector(screen ? '.participant-screen-slot' : '.participant-camera-slot')
        : document.getElementById(host);
    if (
      target &&
      tile.parentElement !== target &&
      document.fullscreenElement !== tile &&
      !tile.classList.contains('media-maximized')
    )
      target.append(tile);
    if (screen) runtime.TronoStreamControls.update(tile, live && !p.collapsed && !paused);
  });
  useLayoutEffect(
    () =>
      bindMediaResize(tile, kind, { storage: runtime.TronoStorage, inChatHub: () => snapshot.hub }),
    [tile, kind, snapshot.hub, runtime],
  );
  useLayoutEffect(
    () => () => {
      void client.releaseFocus(tile);
      runtime.TronoStreamControls.dispose(tile);
      tile.remove();
    },
    [tile, runtime, client],
  );
  const fullscreen = () => void client.fullscreen(tile);
  const volume = (value: string) => void client.setScreenVolume(p.id, value);
  const collapseTitle = p.collapsed ? 'Restaurar compartilhamento' : 'Minimizar compartilhamento';
  return createPortal(
    <>
      <BorrowedVideo
        stream={screen ? p.screenStream : p.cameraStream}
        active={screen ? watching && !paused && live : live}
        onDoubleClick={fullscreen}
      />
      {screen ? (
        <>
          <div className="screen-share-placeholder">
            {paused ? (
              <>
                <strong>⚡ Economia local ativa</strong>
                <small>Sua tela continua sendo transmitida.</small>
              </>
            ) : (
              'Conectando compartilhamento…'
            )}
          </div>
          <div className="mn-stream-invite">
            <strong>{p.name} está transmitindo</strong>
            <small>Escolha quando abrir a transmissão.</small>
          </div>
          <button
            className="mn-watch-stream"
            type="button"
            hidden={p.self}
            onClick={() => void client.toggleScreen(p.id)}
          >
            {watching ? 'Parar de assistir' : 'Assistir stream'}
          </button>
          <button
            className="media-fullscreen-btn"
            type="button"
            title="Maximizar compartilhamento"
            aria-label="Maximizar compartilhamento"
            hidden={!watching}
            onClick={fullscreen}
          >
            ⛶
          </button>
          <button
            className="screen-collapse-btn"
            type="button"
            title={collapseTitle}
            aria-label={p.collapsed ? 'Restaurar prévia' : 'Minimizar prévia'}
            hidden={!watching}
            onClick={() => void client.collapse(p.id, tile)}
          >
            {p.collapsed ? '▣' : '—'}
          </button>
          <button
            className={'screen-resource-btn' + (p.self ? '' : ' hidden')}
            type="button"
            title="Ocultar apenas a prévia local sem interromper a transmissão"
            onClick={() => void client.togglePreview()}
          >
            {paused ? '👁 Mostrar prévia' : '⚡ Economizar recursos'}
          </button>
          <button
            className="screen-switch-btn"
            type="button"
            hidden={!p.self}
            disabled={snapshot.switching}
            title="Escolher outra tela ou janela sem encerrar o compartilhamento"
            onClick={() => void client.switchSource()}
          >
            ⇄ Trocar tela
          </button>
          <label className="mn-stream-volume" hidden={p.self || !watching}>
            <span>Áudio da stream</span>
            <input
              type="range"
              min="0"
              max="300"
              step="5"
              value={p.screenVolume}
              disabled={!p.hasScreenAudio}
              onInput={(event) => volume(event.currentTarget.value)}
              onChange={(event) => volume(event.currentTarget.value)}
            />
            <output>{p.screenVolume}%</output>
          </label>
          <small className="mn-stream-audio-state" hidden={!watching}>
            {p.hasScreenAudio
              ? 'Áudio da stream disponível'
              : 'Transmissão sem áudio compartilhado'}
          </small>
          <span className="mn-stream-name">
            🖥 {p.name}
            {p.self ? ' • você • transmitindo' : ''}
          </span>
        </>
      ) : (
        <>
          <div className="camera-placeholder">Conectando vídeo…</div>
          <button
            type="button"
            className="media-dock-btn"
            title={p.cameraDock ? 'Ampliar câmera' : 'Minimizar câmera no perfil'}
            aria-label={p.cameraDock ? 'Ampliar câmera' : 'Minimizar câmera no perfil'}
            onClick={() => client.dockCamera(p.id)}
          >
            {p.cameraDock ? '↗' : '↙'}
          </button>
          <button
            type="button"
            className="media-fullscreen-btn"
            title="Maximizar câmera"
            aria-label="Maximizar câmera"
            onClick={fullscreen}
          >
            ⛶
          </button>
          <span>
            {p.name}
            {p.self ? ' • você' : ''}
          </span>
        </>
      )}
      <button
        type="button"
        className="media-resize-grip"
        hidden={snapshot.hub}
        title="Redimensionar"
        aria-label="Redimensionar janela"
      >
        ↘
      </button>
    </>,
    tile,
  );
}
