'use client';

import { useSyncExternalStore } from 'react';
import type { AudioPreferences } from '../../lib/voice/audio-preferences';

export function VoiceAudioPreferences({ client }: { client: AudioPreferences }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return (
    <>
      <label className="mn-gain-label call-alert-volume">
        <span>Avisos de entrada e saída</span>
        <output id="callAlertVolumeValue">{state.alertVolume}%</output>
        <input
          id="callAlertVolume"
          type="range"
          min="0"
          max="100"
          step="5"
          value={state.alertVolume}
          aria-label="Volume dos avisos da chamada"
          onInput={(event) => void client.setAlertVolume(event.currentTarget.value)}
          onChange={(event) => void client.setAlertVolume(event.currentTarget.value)}
        />
      </label>
      <label className="auth-check">
        <input
          id="muteCallAlerts"
          type="checkbox"
          checked={state.alertsMuted}
          onChange={(event) => void client.setAlertsMuted(event.currentTarget.checked)}
        />{' '}
        Silenciar avisos de entrada e saída
      </label>
      <button
        id="testCallAlert"
        className="royal-btn settings-secondary"
        type="button"
        data-no-click-sfx="1"
        onClick={() => void client.testAlert()}
      >
        Ouvir aviso de chamada
      </button>
      <div className="settings-action-grid">
        <button
          id="voiceSfxBtn"
          className={`royal-btn settings-secondary audio-pref-btn${state.sfxEnabled ? '' : ' audio-muted'}`}
          type="button"
          title="Ativar ou silenciar efeitos da interface e avisos da chamada"
          aria-pressed={state.sfxEnabled}
          onClick={() => void client.toggleSfx()}
        >
          {state.sfxEnabled ? '🔔 Efeitos: Ligados' : '🔕 Efeitos: Mutados'}
        </button>
        <button
          id="voiceMusicBtn"
          className={`royal-btn settings-secondary audio-pref-btn${state.musicEnabled ? '' : ' audio-muted'}`}
          type="button"
          title="Ativar ou silenciar a música da aplicação"
          aria-pressed={state.musicEnabled}
          onClick={() => void client.toggleMusic()}
        >
          {state.musicEnabled ? '♫ Música: Ligada' : '♫ Música: Mutada'}
        </button>
      </div>
      <label className="auth-check">
        <input
          id="voiceProtection"
          type="checkbox"
          checked={state.protection}
          onChange={(event) => void client.setProtection(event.currentTarget.checked)}
        />{' '}
        Proteger a voz recebida durante jogos
      </label>
      <small id="voiceProtectionStatus" className="settings-context-help">
        {state.protection
          ? 'Ativa · margem de voz de 60 a 140 ms quando suportada.'
          : 'WebRTC gerencia a reprodução sem margem solicitada pelo app.'}
      </small>
      <small className="settings-context-help">
        Pode acrescentar um pequeno atraso para tolerar oscilações. No Windows, solicita prioridade
        moderada somente ao serviço de áudio do app. Não reserva CPU e não altera os volumes.
      </small>
      <div className="voice-devices voice-devices-vertical">
        <label>
          <span>Música de fundo</span>
          <select
            id="voiceMusicTrackSelect"
            aria-label="Trocar música do chat de voz"
            value={state.currentTrack}
            onChange={(event) => void client.selectTrack(event.currentTarget.value)}
          >
            {state.tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.label} • {track.artist}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mn-gain-label">
        <span>Volume da música</span>
        <output id="voiceMusicVolumeValue">{state.musicVolume}%</output>
        <input
          id="voiceMusicVolume"
          type="range"
          min="0"
          max="100"
          value={state.musicVolume}
          aria-label="Volume da música"
          onInput={(event) => void client.setMusicVolume(event.currentTarget.value)}
          onChange={(event) => void client.setMusicVolume(event.currentTarget.value)}
        />
      </label>
      <small
        id="voiceMusicStatus"
        className="music-playback-status"
        role="status"
        aria-live="polite"
      >
        {state.musicStatus}
      </small>
      <small className="settings-context-help">
        Avisos de entrada, saída e mensagens. Escolha sua música aqui; a preferência vale para este
        dispositivo.
      </small>
    </>
  );
}
