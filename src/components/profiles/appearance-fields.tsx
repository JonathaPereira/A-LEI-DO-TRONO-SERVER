'use client';

import { useSyncExternalStore, type CSSProperties } from 'react';
import { THEMES, type AppearancePreferences } from '../../lib/profiles/appearance';

export function AppearanceFields({ client }: { client: AppearancePreferences }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return (
    <>
      <fieldset className="theme-picker">
        <legend>Cores das mesas</legend>
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
        Personaliza as mesas compatíveis neste aparelho. Sua escolha é individual e não altera as
        cores da Corte ou dos outros participantes.
      </p>
      <p id="appearanceMessage" className="appearance-help" role="status" aria-live="polite">
        {state.message}
      </p>
    </>
  );
}
