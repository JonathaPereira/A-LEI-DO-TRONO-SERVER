'use client';
import { useLayoutEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { Portal } from '../../lib/navigation/portal';
import { ParticipantCard } from './participant-card';
import { MediaTile } from './media-tile';
import type { StageRuntime } from './media-tile';
export interface StageHosts {
  roster: HTMLElement;
  cameras: HTMLElement;
  screens: HTMLElement;
  stage: HTMLElement;
  title: HTMLElement;
  room: HTMLElement;
  connectedRoom: HTMLElement;
}
export function CallStageView({ runtime, hosts }: { runtime: StageRuntime; hosts: StageHosts }) {
  const client = runtime.TronoCallStage;
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const portal = (runtime as StageRuntime & { TronoPortal: Portal }).TronoPortal;
  const route = useSyncExternalStore(portal.subscribe, portal.getSnapshot, portal.getSnapshot);
  const external = !['setupScreen', 'roomScreen', 'gameScreen'].includes(route.screen);
  useLayoutEffect(() => {
    for (const [name, on] of Object.entries({
      'has-camera': state.hasCamera,
      'has-screen': state.hasScreen,
      'screens-layout': state.screensLayout,
      'room-idle': state.idle,
    }))
      hosts.stage.classList.toggle(name, on);
    hosts.roster.classList.toggle('voice-roster-private', !state.joined);
    hosts.cameras.classList.toggle('camera-grid-private', !state.joined);
    hosts.cameras.classList.toggle('camera-grid-docked', state.joined && state.cameraDocked);
    hosts.cameras.classList.toggle(
      'camera-grid-empty',
      !state.joined || (!state.cameras.length && !state.cameraDocked),
    );
    hosts.cameras.classList.toggle('one-camera', state.joined && state.cameras.length === 1);
    hosts.screens.classList.toggle('hidden', !state.joined || !state.community);
    hosts.screens.classList.toggle('screen-share-empty', !state.screens.length);
    client.recoverVisible();
  });
  const roster = state.joined ? (
    state.participants.map((p) => (
      <ParticipantCard
        key={p.id}
        person={p}
        client={client}
        desktop={!!runtime.TronoDesktop}
        openProfile={(id) => void runtime.TronoProfile.openMini(id)}
      />
    ))
  ) : (
    <div className="voice-privacy-note">
      <span>{state.publicActive ? '🎙️' : '○'}</span>
      <strong>{state.publicActive ? 'Há alguém na chamada' : 'Ninguém na chamada'}</strong>
      <small>
        {state.publicActive
          ? 'Entre na voz para ver participantes, câmeras e microfones.'
          : 'Entre na voz quando quiser conversar.'}
      </small>
    </div>
  );
  const undockedScreens = state.screens.filter((p) => !p.screenDock || !p.watching);
  return (
    <>
      {createPortal(roster, hosts.roster)}
      {createPortal(
        !state.joined ? (
          <div className="camera-grid-note">Entre na voz para acessar as câmeras da chamada.</div>
        ) : !state.cameras.length && !state.cameraDocked ? (
          <div className="camera-grid-note">Nenhuma câmera visível nesta chamada.</div>
        ) : null,
        hosts.cameras,
      )}
      {createPortal(
        state.joined && state.community && !undockedScreens.length ? (
          <div className="screen-share-note">
            {state.screens.length
              ? 'Transmissões exibidas nos perfis.'
              : 'Nenhuma tela compartilhada.'}
          </div>
        ) : null,
        hosts.screens,
      )}
      {createPortal(state.idle ? 'Na chamada' : 'Câmeras & telas', hosts.title)}
      {createPortal(state.roomName, hosts.room)}
      {createPortal('Voz conectada · ' + state.roomName, hosts.connectedRoom)}
      {state.cameras.map((p) => (
        <MediaTile
          key={'camera:' + p.id}
          person={p}
          kind="camera"
          snapshot={state}
          runtime={runtime}
          external={external}
        />
      ))}
      {state.screens.map((p) => (
        <MediaTile
          key={'screen:' + p.id}
          person={p}
          kind="screen"
          snapshot={state}
          runtime={runtime}
          external={external}
        />
      ))}
    </>
  );
}
