'use client';

import { useSyncExternalStore, type CSSProperties } from 'react';
import { THEMES, type AppearancePreferences } from '../../lib/profiles/appearance';

export function AppearanceFields({ client }: { client: AppearancePreferences }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return (
    <>
      <fieldset className="theme-picker">
        <legend>Cores do tema</legend>
        {THEMES.map((theme) => (
          <label
            key={theme.id}
            className="theme-option"
            style={{ '--swatch': theme.color } as CSSProperties}
          >
            <input
              type="radio"
              name="profileTheme"
              value={theme.id}
              checked={state.theme === theme.id}
              onChange={() => client.selectTheme(theme.id)}
            />
            <span className="theme-swatch" aria-hidden="true" />
            <span>{theme.label}</span>
          </label>
        ))}
      </fieldset>
      <p className="appearance-help">
        Aplica na hora, só para você neste aparelho. Não muda o tema dos outros na chamada.
      </p>
      <div className="profile-layout">
        <div>
          <strong>Layout dos painéis</strong>
          <p className="appearance-help">Restaure os tamanhos padrão dos painéis neste aparelho.</p>
        </div>
        <button
          id="layoutResetBtn"
          className="secondary-button"
          type="button"
          onClick={client.resetPanels}
        >
          ↺ Voltar ao padrão
        </button>
      </div>
      <p id="appearanceMessage" className="appearance-help" role="status" aria-live="polite">
        {state.message}
      </p>
    </>
  );
}
