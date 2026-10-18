import type { SettingsController } from '../settings/controller';

export const CALL_CONTROL_IDS = [
  'joinVoiceBtn',
  'muteMicBtn',
  'deafenVoiceBtn',
  'cameraBtn',
  'screenShareBtn',
  'voiceSettingsBtn',
] as const;
export type CallControlId = (typeof CALL_CONTROL_IDS)[number];
export interface ToolbarSource {
  joined: boolean;
  joining: boolean;
  eligible: boolean;
  textOnly: boolean;
  communityVoice: boolean;
  discord: boolean;
  desktop: boolean;
  micMuted: boolean;
  deafened: boolean;
  camera: boolean;
  cameraPending: boolean;
  cameraLoading: boolean;
  screen: boolean;
  blocked: boolean;
}
interface ToolbarOptions {
  read(): ToolbarSource;
  workspace(id: CallControlId): boolean;
  settings(): Pick<SettingsController, 'getSnapshot' | 'subscribe' | 'toggle'> | undefined;
  actions: Record<Exclude<CallControlId, 'voiceSettingsBtn'>, () => unknown>;
  resume(): unknown;
  warn?(error: unknown): void;
}

/** UI projection only; participation, controls, capture and audio remain borrowed. */
export function createCallToolbar(options: ToolbarOptions) {
  const listeners = new Set<() => void>();
  const warn = options.warn ?? ((error: unknown) => console.warn('[CallToolbar]', error));
  let status: Readonly<{ text: string; kind: string }> = Object.freeze({
    text: 'Fora do chat de voz.',
    kind: '',
  });
  let unsubscribe: (() => void) | undefined,
    disposed = false;
  function read() {
    const s = options.read(),
      joining = s.joining && !s.joined;
    const button = (
      id: CallControlId,
      label: string,
      glyph: string,
      short: string,
      disabled: boolean,
      active: boolean,
      activeClass: string,
      title = label,
    ) =>
      Object.freeze({
        id,
        label,
        glyph,
        short,
        disabled,
        active,
        activeClass,
        title,
        workspace: options.workspace(id),
      });
    return Object.freeze({
      status,
      blocked: s.blocked,
      buttons: Object.freeze({
        joinVoiceBtn: button(
          'joinVoiceBtn',
          joining ? 'Conectando…' : s.joined ? 'Sair da voz' : 'Entrar na voz',
          '☎',
          s.joined ? 'Sair' : 'Conectar',
          !s.eligible || joining,
          s.joined,
          'call-active' + (joining ? ' call-joining' : ''),
        ),
        muteMicBtn: button(
          'muteMicBtn',
          s.micMuted ? 'Ativar microfone' : 'Mutar microfone',
          s.micMuted ? '🔇' : '🎙',
          'Microfone',
          !s.joined || s.deafened,
          s.micMuted,
          'danger-active',
          s.deafened
            ? 'Ative o áudio da chamada para liberar o microfone.'
            : s.micMuted
              ? 'Ativar microfone'
              : 'Mutar microfone',
        ),
        deafenVoiceBtn: button(
          'deafenVoiceBtn',
          s.deafened ? 'Ouvir voz' : 'Silenciar voz',
          s.deafened ? '🔈' : '🔊',
          'Áudio',
          !s.joined,
          s.deafened,
          'danger-active',
        ),
        cameraBtn: button(
          'cameraBtn',
          s.camera ? 'Desligar câmera' : 'Ligar câmera',
          s.camera ? '▧' : '▣',
          s.camera ? 'Desligar' : 'Câmera',
          s.textOnly ||
            joining ||
            (!s.camera && (s.cameraPending || s.cameraLoading)) ||
            (s.discord && !s.joined),
          s.camera,
          'camera-active',
        ),
        screenShareBtn: button(
          'screenShareBtn',
          s.screen ? (s.desktop ? 'Parar tela' : 'Parar compartilhamento') : 'Compartilhar tela',
          s.screen ? '■' : '▤',
          s.screen ? 'Parar tela' : 'Tela',
          !s.joined || !s.communityVoice,
          s.screen,
          'screen-active',
          s.screen ? 'Parar compartilhamento' : 'Compartilhar tela',
        ),
        voiceSettingsBtn: button(
          'voiceSettingsBtn',
          'Configurações',
          '⚙',
          'Ajustes',
          false,
          options.settings()?.getSnapshot().open ?? false,
          'settings-active',
        ),
      }),
      joining,
    });
  }
  let snapshot: ReturnType<typeof read> | undefined;
  const getSnapshot = () => (snapshot ??= read());
  function refresh() {
    if (disposed) return;
    snapshot = read();
    for (const listener of listeners) listener();
  }
  async function run(action: () => unknown) {
    if (disposed) return;
    try {
      const pending = action(); // Native pickers and audio activation begin in the original event.
      refresh();
      await pending;
    } catch (error) {
      warn(error);
    } finally {
      refresh();
    }
  }
  return {
    getSnapshot,
    refresh,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (!disposed && !unsubscribe) unsubscribe = options.settings()?.subscribe(refresh);
      refresh();
    },
    setStatus(text: string, kind = '') {
      if (disposed || (status.text === text && status.kind === kind)) return;
      status = Object.freeze({ text, kind });
      refresh();
    },
    activate(id: CallControlId) {
      return run(() => {
        if (read().buttons[id].disabled) return;
        return id === 'voiceSettingsBtn' ? options.settings()?.toggle() : options.actions[id]();
      });
    },
    resume: () => run(options.resume),
    dispose() {
      disposed = true;
      unsubscribe?.();
      unsubscribe = undefined;
      listeners.clear();
    },
  };
}
export type CallToolbar = ReturnType<typeof createCallToolbar>;
