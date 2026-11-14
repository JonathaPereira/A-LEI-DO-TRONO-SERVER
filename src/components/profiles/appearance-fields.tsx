'use client';

import { useSyncExternalStore, type CSSProperties } from 'react';
import { THEMES, CURSORS, type AppearancePreferences } from '../../lib/profiles/appearance';

export function AppearanceFields({ client }: { client: AppearancePreferences }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const currentCursor = useSyncExternalStore(
    client.subscribe,
    () => client.getCursor(),
    () => 'royal' as const,
  );
  const reducedMotion = useSyncExternalStore(
    client.subscribe,
    () => client.getReducedMotion(),
    () => false,
  );
  const baseThemeLabel =
    THEMES.find((item) => item.id === client.getBaseTheme())?.label ?? 'Roxo · padrão';
  const christmasActive = state.theme === 'natal';
  return (
    <>
      <div className="christmas-setting-card" data-christmas-active={christmasActive}>
        <div className="christmas-setting-copy">
          <strong>Tema de Natal</strong>
          <small>
            {christmasActive
              ? `Ativo na Corte. Ao desativar, retorna ao tema ${baseThemeLabel}.`
              : 'Especial de fim de ano em verde-pinho, bordô e dourado com luzes suaves e neve.'}
          </small>
        </div>
        <label className="christmas-toggle-label">
          <input
            type="checkbox"
            role="switch"
            aria-label="Tema de Natal"
            checked={christmasActive}
            onChange={(e) => client.setChristmasEnabled(e.target.checked)}
          />
          <span>{christmasActive ? 'Ativado' : 'Desativado'}</span>
        </label>
      </div>

      <label className="reduced-motion-setting">
        <input
          type="checkbox"
          aria-label="Reduzir animações decorativas"
          checked={reducedMotion}
          onChange={(e) => client.setReducedMotion(e.target.checked)}
        />
        <span>
          <strong>Reduzir animações decorativas</strong>
          <small>
            Suaviza pisca-piscas, brilhos e flocos de neve decorativos para máxima fluidez ou
            conforto visual.
          </small>
        </span>
      </label>

      <fieldset className="theme-picker">
        <legend>Cores do aplicativo e das mesas</legend>
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
        Transforma as cores de toda a aplicação (sidebar, chamadas, canais e mesas). O tema de Natal
        inclui neve suave, decorações e toques festivos na Corte.
      </p>

      <fieldset className="cursor-picker">
        <legend>Cursor do mouse</legend>
        {CURSORS.map((c) => (
          <label key={c.id} className="cursor-option">
            <input
              type="radio"
              name="cursorPreference"
              value={c.id}
              checked={currentCursor === c.id}
              onChange={() => client.selectCursor(c.id)}
            />
            <span className="cursor-swatch" aria-hidden="true">
              {c.id === 'royal' ? (
                <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                  <path
                    d="M2 2 L14.5 7.5 L19.5 12.5 L12.5 19.5 L7.5 14.5 Z"
                    fill="#e6e3da"
                    stroke="#0c0d10"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <line
                    x1="5"
                    y1="5"
                    x2="15"
                    y2="15"
                    stroke="#d6b779"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                  <path
                    d="M10.5 20.5 C13 18 18 13 20.5 10.5"
                    stroke="#0c0d10"
                    strokeWidth="3.8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M10.5 20.5 C13 18 18 13 20.5 10.5"
                    stroke="#d6b779"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                  />
                  <line
                    x1="16.5"
                    y1="16.5"
                    x2="23"
                    y2="23"
                    stroke="#0c0d10"
                    strokeWidth="3.6"
                    strokeLinecap="round"
                  />
                  <line
                    x1="16.5"
                    y1="16.5"
                    x2="23"
                    y2="23"
                    stroke="#8a6c34"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="24.2"
                    cy="24.2"
                    r="2.4"
                    fill="#d6b779"
                    stroke="#0c0d10"
                    strokeWidth="1.2"
                  />
                </svg>
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#d6b779"
                  strokeWidth="2"
                >
                  <path d="M3 3l7 18 3-7 7-3L3 3z" />
                </svg>
              )}
            </span>
            <span>{c.label}</span>
          </label>
        ))}
      </fieldset>
      <p className="appearance-help">
        Você pode alternar entre a Espada Real de 32px estilizada ou voltar ao ponteiro tradicional
        do sistema a qualquer momento.
      </p>

      <p id="appearanceMessage" className="appearance-help" role="status" aria-live="polite">
        {state.message}
      </p>
    </>
  );
}
