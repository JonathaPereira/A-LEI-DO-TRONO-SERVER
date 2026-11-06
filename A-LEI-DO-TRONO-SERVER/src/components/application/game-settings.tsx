'use client';
import { useModel, type ApplicationServices } from './services';
import { musicTracks, type MusicTrack } from '../../lib/audio/catalog';
import { tabletopGameKeys, tabletopGames } from '../../lib/games/tabletop-audio';
export function GameSettings({ runtime }: { runtime: ApplicationServices }) {
  const client = runtime.TronoAudio,
    state = useModel(client);
  return (
    <>
      <h2>Áudio dos jogos</h2>
      <p>Preferências locais. A voz da chamada tem seus próprios controles.</p>
      <label>
        <input
          type="checkbox"
          checked={state.musicEnabled}
          onChange={(e) => void client.setMusicEnabled(e.target.checked)}
        />{' '}
        Música de fundo
      </label>
      <label>
        Trilha sonora
        <select
          value={state.currentTrack}
          onChange={(e) => client.setMusicTrack(e.target.value as MusicTrack)}
        >
          {Object.entries(musicTracks).map(([key, track]) => (
            <option key={key} value={key}>
              {track.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Volume da música
        <input
          type="range"
          aria-label="Volume da música"
          min="0"
          max="100"
          value={state.musicVolume}
          onChange={(e) => client.setMusicVolume(e.target.value)}
        />
        <output>{state.musicVolume}%</output>
      </label>
      <label>
        <input
          type="checkbox"
          checked={state.sfxEnabled}
          onChange={(e) => client.setSfxEnabled(e.target.checked)}
        />{' '}
        Efeitos dos jogos
      </label>
      {tabletopGameKeys.map((key) => (
        <label key={key}>
          Efeitos de {tabletopGames[key].label}
          <input
            type="range"
            min="0"
            max="100"
            value={state.volumes[key]}
            onChange={(e) => client.setGameVolume(key, Number(e.target.value))}
          />
          <output>{state.volumes[key]}%</output>
        </label>
      ))}
      <p role="status">{state.musicStatus}</p>
      <details>
        <summary>Créditos das trilhas</summary>
        <p>
          Faixas externas publicadas pelos autores em CC0. Quando a origem está indisponível, o
          player usa as composições locais distribuídas com o projeto.
        </p>
        <ul>
          {Object.values(musicTracks).map((track) => (
            <li key={track.title}>
              <a href={track.src} target="_blank" rel="noopener noreferrer">
                {track.title}
              </a>{' '}
              · {track.artist} · {track.license}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
