'use client';
import { useModel, type ApplicationServices } from './services';
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
    </>
  );
}
