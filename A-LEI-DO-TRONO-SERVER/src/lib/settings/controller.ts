export const SETTINGS_TOPICS = {
  account: 'Meu perfil',
  appearance: 'Aparência',
  audio: '🎙 Áudio',
  video: '▣ Vídeo',
  capture: 'Captura de tela',
  game: 'Jogo',
  activity: 'Atividade',
  files: 'Meus arquivos',
  resources: 'Recursos',
  connection: '⌁ Conexão',
  privacy: 'Privacidade',
  notifications: 'Notificações',
  application: 'Aplicativo',
} as const;
export type SettingsTopic = keyof typeof SETTINGS_TOPICS;
export interface SettingsSnapshot {
  readonly open: boolean;
  readonly topic: SettingsTopic;
}

/** One selection/open state shared by React and remaining navigation adapters. */
export function createSettingsController(
  desktop: boolean,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
) {
  const topics: readonly SettingsTopic[] = desktop
    ? (Object.keys(SETTINGS_TOPICS) as SettingsTopic[])
    : [
        'account',
        'appearance',
        'files',
        'resources',
        'audio',
        'video',
        'game',
        'connection',
        'notifications',
      ];
  const valid = (value: string): SettingsTopic =>
    topics.includes(value as SettingsTopic) ? (value as SettingsTopic) : 'audio';
  let snapshot: SettingsSnapshot = Object.freeze({
    open: false,
    topic: desktop ? 'audio' : valid(storage.getItem('tronoVoiceSettingsTab') || 'audio'),
  });
  const listeners = new Set<() => void>();
  function update(open: boolean, topic = snapshot.topic) {
    if (snapshot.open === open && snapshot.topic === topic) return;
    snapshot = Object.freeze({ open, topic });
    storage.setItem('tronoVoiceSettingsTab', topic);
    for (const listener of listeners) listener();
  }
  return {
    topics,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    select(topic: string) {
      update(snapshot.open, valid(topic));
    },
    open(topic?: string) {
      update(true, topic === undefined ? snapshot.topic : valid(topic));
    },
    close() {
      update(false);
    },
    toggle(force?: boolean) {
      update(force ?? !snapshot.open);
    },
  };
}
export type SettingsController = ReturnType<typeof createSettingsController>;
