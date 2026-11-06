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
] as const;
export type Theme = (typeof THEMES)[number]['id'];
const theme = (value: unknown): Theme => THEMES.find((theme) => theme.id === value)?.id ?? 'purple';

interface AppearanceOptions {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  style: Pick<CSSStyleDeclaration, 'removeProperty'>;
  events: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  accountId(): string | null;
  authReady: Promise<unknown>;
  applyTheme(value: Theme): void;
}
/** Local presentation only. Theme and feedback have one owner across both settings shells. */
export function createAppearancePreferences(options: AppearanceOptions) {
  let state = Object.freeze<{ theme: Theme; message: string }>({ theme: 'purple', message: '' });
  let account = options.accountId(),
    started = false,
    disposed = false;
  const listeners = new Set<() => void>();
  const key = () => 'mnTheme:' + (options.accountId() || 'guest');
  function update(next: typeof state) {
    if (disposed || (next.theme === state.theme && next.message === state.message)) return;
    state = Object.freeze(next);
    for (const listener of listeners) listener();
  }
  function read() {
    if (disposed) return;
    let saved: unknown;
    try {
      saved = options.storage.getItem(key());
    } catch {
      /* Use the default theme. */
    }
    const nextAccount = options.accountId(),
      next = theme(saved);
    // The retired resizer no longer restores geometry that users cannot adjust.
    clearPanelDimensions(options.style);
    update({ theme: next, message: account === nextAccount ? state.message : '' });
    account = nextAccount;
    options.applyTheme(next);
  }
  return {
    getSnapshot: () => state,
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
      try {
        options.storage.setItem(key(), next);
      } catch {
        /* Apply even without persistence. */
      }
      update({ theme: next, message: 'Tema aplicado.' });
      options.applyTheme(next);
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
