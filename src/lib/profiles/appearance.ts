import { clearPanelDimensions, resetPanelPreferences } from '../layout/panel-preferences.ts';

export const THEMES = [
  { id: 'purple', color: '#a99cff', label: 'Roxo · padrão' },
  { id: 'green', color: '#69d29b', label: 'Verde e preto' },
  { id: 'red', color: '#f47b85', label: 'Preto e vermelho' },
  { id: 'blue', color: '#75bdf2', label: 'Azul e preto' },
  { id: 'yellow', color: '#efd470', label: 'Amarelo e preto' },
  { id: 'teal', color: '#5fddcc', label: 'Turquesa e preto' },
  { id: 'orange', color: '#ffad72', label: 'Laranja e preto' },
  { id: 'rose', color: '#efa3cd', label: 'Rosa e preto' },
  { id: 'indigo', color: '#99acff', label: 'Índigo e preto' },
  { id: 'graphite', color: '#c1cad6', label: 'Grafite e preto' },
  { id: 'natal', color: '#e63946', label: 'Natal da Corte 🎄' },
] as const;
export type Theme = (typeof THEMES)[number]['id'];
const theme = (value: unknown): Theme => THEMES.find((theme) => theme.id === value)?.id ?? 'purple';

export const CURSORS = [
  { id: 'royal', label: 'Espada Real (32px · Tema Corte)' },
  { id: 'default', label: 'Padrão do sistema (Seta normal)' },
] as const;
export type CursorPreference = (typeof CURSORS)[number]['id'];
const cursor = (value: unknown): CursorPreference =>
  CURSORS.find((c) => c.id === value)?.id ?? 'royal';

export const CHRISTMAS_CAMPAIGN_ID = '2026-natal-v1';

interface AppearanceOptions {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  style: Pick<CSSStyleDeclaration, 'removeProperty'>;
  events: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  accountId(): string | null;
  authReady: Promise<unknown>;
  applyTheme(value: Theme): void;
  applyCursor?(value: CursorPreference): void;
  applyReducedMotion?(reduced: boolean): void;
}
/** Local presentation only. Theme and feedback have one owner across both settings shells. */
export function createAppearancePreferences(options: AppearanceOptions) {
  let state = Object.freeze<{ theme: Theme; message: string }>({ theme: 'purple', message: '' });
  let currentCursor: CursorPreference = 'royal';
  let baseTheme: Theme = 'purple';
  let reducedMotion = false;
  let promoDismissedOrAccepted = false;
  let account = options.accountId(),
    started = false,
    disposed = false;
  const listeners = new Set<() => void>();
  const key = () => 'mnTheme:' + (options.accountId() || 'guest');
  const baseKey = () => 'mnBaseTheme:' + (options.accountId() || 'guest');
  const cursorKey = () => 'mnCursor:' + (options.accountId() || 'guest');
  const reducedMotionKey = () => 'mnReducedMotion:' + (options.accountId() || 'guest');
  const promoKey = () => 'mnChristmasPromo:' + (options.accountId() || 'guest');
  const notify = () => {
    for (const listener of listeners) listener();
  };
  function update(next: typeof state, forceNotify = false) {
    if (disposed) return;
    const changed = next.theme !== state.theme || next.message !== state.message;
    if (!changed && !forceNotify) return;
    if (changed) state = Object.freeze(next);
    notify();
  }
  function saveItem(storageKey: string, value: string) {
    try {
      options.storage.setItem(storageKey, value);
    } catch {
      /* Apply even without persistence. */
    }
  }
  function read() {
    if (disposed) return;
    let saved: unknown,
      savedBase: unknown,
      savedCursor: unknown,
      savedMotion: unknown,
      savedPromo: unknown;
    try {
      saved = options.storage.getItem(key());
      savedBase = options.storage.getItem(baseKey());
      savedCursor = options.storage.getItem(cursorKey());
      savedMotion = options.storage.getItem(reducedMotionKey());
      savedPromo = options.storage.getItem(promoKey());
    } catch {
      /* Use the default theme. */
    }
    const nextAccount = options.accountId(),
      next = theme(saved),
      parsedBase = theme(savedBase);
    baseTheme = next !== 'natal' ? next : parsedBase !== 'natal' ? parsedBase : 'purple';
    currentCursor = cursor(savedCursor);
    reducedMotion = savedMotion === '1' || savedMotion === 'true';
    promoDismissedOrAccepted =
      typeof savedPromo === 'string' && savedPromo.startsWith(CHRISTMAS_CAMPAIGN_ID + ':');
    // The retired resizer no longer restores geometry that users cannot adjust.
    clearPanelDimensions(options.style);
    update({ theme: next, message: account === nextAccount ? state.message : '' }, true);
    account = nextAccount;
    options.applyTheme(next);
    options.applyCursor?.(currentCursor);
    options.applyReducedMotion?.(reducedMotion);
  }
  return {
    getSnapshot: () => state,
    getCursor: () => currentCursor,
    getReducedMotion: () => reducedMotion,
    isChristmasActive: () => state.theme === 'natal',
    getBaseTheme: () => baseTheme,
    shouldShowChristmasPromo: () =>
      !disposed && state.theme !== 'natal' && !promoDismissedOrAccepted,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (started || disposed) return;
      started = true;
      options.events.addEventListener('trono-auth-change', read);
      read();
      void options.authReady.then(read);
    },
    selectTheme(value: unknown) {
      if (disposed) return;
      const next = theme(value);
      if (next !== 'natal') {
        baseTheme = next;
        saveItem(baseKey(), next);
      } else if (state.theme !== 'natal') {
        baseTheme = state.theme;
        saveItem(baseKey(), baseTheme);
      }
      saveItem(key(), next);
      update({ theme: next, message: 'Tema aplicado.' });
      options.applyTheme(next);
    },
    setChristmasEnabled(enabled: boolean) {
      if (disposed) return;
      if (enabled) {
        if (state.theme !== 'natal') {
          baseTheme = state.theme;
          saveItem(baseKey(), baseTheme);
        }
        promoDismissedOrAccepted = true;
        saveItem(promoKey(), CHRISTMAS_CAMPAIGN_ID + ':accepted');
        saveItem(key(), 'natal');
        update({ theme: 'natal', message: 'Tema de Natal ativado na Corte.' }, true);
        options.applyTheme('natal');
        return;
      }
      const restore = baseTheme !== 'natal' ? baseTheme : 'purple';
      saveItem(key(), restore);
      update({ theme: restore, message: 'Tema original restaurado.' }, true);
      options.applyTheme(restore);
    },
    acceptChristmasPromo() {
      if (disposed) return;
      if (state.theme !== 'natal') {
        baseTheme = state.theme;
        saveItem(baseKey(), baseTheme);
      }
      promoDismissedOrAccepted = true;
      saveItem(promoKey(), CHRISTMAS_CAMPAIGN_ID + ':accepted');
      saveItem(key(), 'natal');
      update({ theme: 'natal', message: 'Tema de Natal ativado na Corte.' }, true);
      options.applyTheme('natal');
    },
    dismissChristmasPromo() {
      if (disposed) return;
      promoDismissedOrAccepted = true;
      saveItem(promoKey(), CHRISTMAS_CAMPAIGN_ID + ':dismissed');
      notify();
    },
    setReducedMotion(reduced: boolean) {
      if (disposed) return;
      reducedMotion = !!reduced;
      saveItem(reducedMotionKey(), reducedMotion ? '1' : '0');
      options.applyReducedMotion?.(reducedMotion);
      update(
        {
          ...state,
          message: reducedMotion
            ? 'Animações decorativas reduzidas.'
            : 'Animações decorativas ativadas.',
        },
        true,
      );
    },
    selectCursor(value: unknown) {
      if (disposed) return;
      currentCursor = cursor(value);
      saveItem(cursorKey(), currentCursor);
      options.applyCursor?.(currentCursor);
      update({ ...state, message: 'Cursor atualizado.' }, true);
    },
    resetPanels() {
      if (disposed) return;
      resetPanelPreferences(options.storage, options.style, options.accountId());
      update({ ...state, message: 'Layout restaurado ao padrão.' });
    },
    dispose() {
      disposed = true;
      options.events.removeEventListener('trono-auth-change', read);
      listeners.clear();
    },
  };
}
export type AppearancePreferences = ReturnType<typeof createAppearancePreferences>;
