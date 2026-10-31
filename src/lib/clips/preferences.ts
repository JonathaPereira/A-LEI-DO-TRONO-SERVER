import type { ClipSettings, ClipShortcut } from '../../types/clips';

const qualities = {
  light: Object.freeze({ width: 1280, height: 720, bitrate: 6000000, label: '720p' }),
  balanced: Object.freeze({ width: 1920, height: 1080, bitrate: 16000000, label: '1080p' }),
  high: Object.freeze({ width: 2560, height: 1440, bitrate: 28000000, label: '1440p' }),
} as const;
const defaultShortcut = (): ClipShortcut =>
  Object.freeze({ code: 'KeyX', ctrl: true, shift: true, alt: false, meta: false });
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const codeAllowed = (code: unknown): code is string =>
  typeof code === 'string' && /^(Key[A-Z]|Digit[0-9]|F([1-9]|1\d|2[0-4]))$/.test(code);
function shortcutAllowed(shortcut: ClipShortcut) {
  return (
    codeAllowed(shortcut.code) &&
    !['F5', 'F11', 'F12'].includes(shortcut.code) &&
    !(
      (shortcut.ctrl || shortcut.meta) &&
      ['KeyR', 'KeyW', 'KeyT', 'KeyL', 'KeyN', 'KeyP'].includes(shortcut.code)
    ) &&
    (shortcut.ctrl || shortcut.alt || shortcut.meta || /^F\d/.test(shortcut.code))
  );
}
function readShortcut(value: unknown): ClipShortcut {
  const data = record(value);
  const shortcut = {
    code: typeof data.code === 'string' ? data.code : '',
    ctrl: data.ctrl === true,
    alt: data.alt === true,
    shift: data.shift === true,
    meta: data.meta === true,
  };
  return shortcutAllowed(shortcut) ? Object.freeze(shortcut) : defaultShortcut();
}
/** Retains the existing version-two key and the version-one quality/FPS migration. */
export function readClipSettings(value: unknown): ClipSettings {
  const data = record(value),
    current = data.version === 2;
  const quality = current
    ? Object.hasOwn(data, 'quality')
      ? data.quality
      : 'balanced'
    : data.quality === 'high'
      ? 'high'
      : 'balanced';
  const fps = current ? (Object.hasOwn(data, 'fps') ? data.fps : 60) : 60;
  const seconds = data.seconds ?? 30;
  return Object.freeze({
    version: 2,
    quality:
      quality === 'balanced' || quality === 'high' || quality === 'light' ? quality : 'light',
    fps: fps === 60 ? 60 : 30,
    seconds: seconds === 15 || seconds === 60 || seconds === 120 ? seconds : 30,
    auto: data.auto !== false,
    desktopAuto: data.desktopAuto !== false,
    shortcut: readShortcut(data.shortcut),
  });
}
export interface ClipPreferencesSnapshot {
  readonly owner: string;
  readonly settings: ClipSettings;
  readonly choosingShortcut: boolean;
  readonly message: string;
  readonly messageVersion: number;
}
type ShortcutKey = Pick<
  KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'repeat'
>;
/** Preferences own settings; consumers may observe changes but never mutate a borrowed snapshot. */
export function createClipPreferences(storage: () => Pick<Storage, 'getItem' | 'setItem'>) {
  let disposed = false;
  let state: ClipPreferencesSnapshot = Object.freeze({
    owner: 'local',
    settings: readClipSettings(null),
    choosingShortcut: false,
    message: '',
    messageVersion: 0,
  });
  const listeners = new Set<() => void>();
  function publish(patch: Partial<ClipPreferencesSnapshot>, message?: string) {
    if (disposed) return;
    state = Object.freeze({
      ...state,
      ...patch,
      ...(message === undefined ? {} : { message, messageVersion: state.messageVersion + 1 }),
    });
    for (const listener of listeners) listener();
  }
  function save(settings: ClipSettings, success?: string) {
    let message = success;
    try {
      storage().setItem('tronoClips:' + state.owner, JSON.stringify(settings));
    } catch {
      message =
        'As preferências valem nesta sessão, mas não foi possível guardá-las neste navegador.';
    }
    publish({ settings, choosingShortcut: false }, message);
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setOwner(owner: string) {
      if (disposed) return;
      let saved: unknown;
      try {
        saved = JSON.parse(storage().getItem('tronoClips:' + owner) || '{}');
      } catch {}
      publish({ owner, settings: readClipSettings(saved), choosingShortcut: false }, '');
    },
    setSetting(key: 'quality' | 'fps' | 'seconds' | 'auto' | 'desktopAuto', value: unknown) {
      if (disposed) return;
      const valid =
        key === 'quality'
          ? typeof value === 'string' && ['light', 'balanced', 'high'].includes(value)
          : key === 'fps'
            ? value === 30 || value === 60
            : key === 'seconds'
              ? [15, 30, 60, 120].includes(value as number)
              : typeof value === 'boolean';
      if (!valid || state.settings[key] === value) return;
      save(readClipSettings({ ...state.settings, [key]: value }));
    },
    setPreset(preset: 'economic' | 'excellent') {
      if (disposed) return;
      save(
        readClipSettings({
          ...state.settings,
          quality: preset === 'excellent' ? 'high' : 'light',
          fps: preset === 'excellent' ? 60 : 30,
        }),
      );
    },
    beginShortcut() {
      publish({ choosingShortcut: true }, 'Pressione o novo atalho. Esc cancela.');
    },
    cancelShortcut() {
      if (state.choosingShortcut) publish({ choosingShortcut: false });
    },
    handleKey(
      event: ShortcutKey,
      editable: boolean,
      globalActive: boolean,
    ): 'handled' | 'clip' | null {
      if (disposed) return null;
      if (state.choosingShortcut) {
        if (event.key === 'Escape') {
          publish({ choosingShortcut: false });
          return 'handled';
        }
        if (!codeAllowed(event.code)) return null;
        const shortcut: ClipShortcut = {
          code: event.code,
          ctrl: event.ctrlKey,
          alt: event.altKey,
          shift: event.shiftKey,
          meta: event.metaKey,
        };
        if (!shortcutAllowed(shortcut)) {
          publish(
            {},
            'Use Ctrl/Alt/Meta com uma tecla ou uma tecla F livre. Evite atalhos reservados do navegador.',
          );
          return 'handled';
        }
        save(
          Object.freeze({ ...state.settings, shortcut: Object.freeze(shortcut) }),
          'Atalho configurado para esta página. O componente Windows recebe a configuração quando conectado.',
        );
        return 'handled';
      }
      const shortcut = state.settings.shortcut;
      if (
        event.repeat ||
        editable ||
        event.code !== shortcut.code ||
        event.ctrlKey !== shortcut.ctrl ||
        event.altKey !== shortcut.alt ||
        event.shiftKey !== shortcut.shift ||
        event.metaKey !== shortcut.meta
      )
        return null;
      return globalActive ? 'handled' : 'clip';
    },
    getQuality: () => qualities[state.settings.quality],
    shortcutLabel: () => clipShortcutLabel(state.settings.shortcut),
    captureProfile: () =>
      state.settings.auto
        ? {
            width: qualities[state.settings.quality].width,
            height: qualities[state.settings.quality].height,
            fps: state.settings.fps,
          }
        : null,
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}
export type ClipPreferences = ReturnType<typeof createClipPreferences>;
export function clipShortcutLabel(shortcut: ClipShortcut) {
  return [
    shortcut.ctrl ? 'Ctrl' : '',
    shortcut.alt ? 'Alt' : '',
    shortcut.shift ? 'Shift' : '',
    shortcut.meta ? 'Meta' : '',
    shortcut.code.replace(/^Key|^Digit/, ''),
  ]
    .filter(Boolean)
    .join(' + ');
}
