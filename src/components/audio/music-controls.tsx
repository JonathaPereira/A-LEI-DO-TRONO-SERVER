'use client';
import { useSyncExternalStore } from 'react';
import type { AudioPlayer } from '../../lib/audio/player';
import { musicTracks } from '../../lib/audio/catalog';

export function MusicControlHost({ id }: { id: string }) {
  return <span data-music-control={id} style={{ display: 'contents' }} />;
}
export function MusicControls({ client, section }: { client: AudioPlayer; section: string }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const toggle = (id: string, className: string) => (
    <button
      id={id}
      type="button"
      title="Ativar ou silenciar música"
      className={className + (state.musicEnabled ? ' music-active' : ' muted')}
      aria-pressed={state.musicEnabled}
      onClick={() => void client.toggleMusic()}
    >
      {state.musicEnabled ? '♫ Música ligada' : '♫ Música silenciada'}
    </button>
  );
  const tracks = (className: string) => (
    <div className={className} aria-label="Escolha da trilha">
      {Object.entries(musicTracks).map(([id, track]) => (
        <button
          key={id}
          type="button"
          className={'track-btn' + (state.currentTrack === id ? ' active' : '')}
          data-track={id}
          title={`${track.title} — ${track.artist} • ${track.license}`}
          onClick={() => client.setMusicTrack(id)}
        >
          {track.label}
        </button>
      ))}
    </div>
  );
  const slider = (id: string, label: string) => (
    <>
      <span>{label}</span>
      <input
        id={id}
        type="range"
        min="0"
        max="100"
        value={state.musicVolume}
        aria-label="Volume da música"
        onChange={(event) => client.setMusicVolume(event.currentTarget.value)}
      />
      <output id={id + 'Value'}>{state.musicVolume}%</output>
    </>
  );
  switch (section) {
    case 'game-volume':
      return (
        <div className="music-volume" title="Volume da música de fundo">
          {slider('musicVolume', '♫')}
        </div>
      );
    case 'game-tracks':
      return tracks('music-track-select top-track-select');
    case 'game-toggle':
      return toggle('musicBtn', 'icon-btn');
    case 'lobby':
      return (
        <div className="lobby-audio-panel" aria-label="Controles de áudio do lobby">
          {toggle('lobbyMusicBtn', 'royal-btn lobby-music-toggle')}
          <label className="lobby-volume">{slider('lobbyMusicVolume', 'Volume')}</label>
          {tracks('music-track-select lobby-track-select')}
        </div>
      );
    case 'portal-tracks':
      return tracks('portal-track-select');
    case 'portal-toggle':
      return toggle('portalMusicBtn', 'portal-music-btn');
    case 'portal-volume':
      return <label className="portal-volume">{slider('portalMusicVolume', 'Volume')}</label>;
    case 'portal-status':
      return (
        <small
          id="portalMusicStatus"
          className="music-playback-status"
          role="status"
          aria-live="polite"
        >
          {state.musicStatus}
        </small>
      );
    default:
      return null;
  }
}
