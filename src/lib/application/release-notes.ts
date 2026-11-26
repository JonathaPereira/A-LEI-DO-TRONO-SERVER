export const APP_RELEASE_VERSION = '2.3.2';
export const RELEASE_NOTES_STORAGE_KEY = 'trono:release-notes:seen';
export const RELEASE_NOTES_OPEN_EVENT = 'trono:open-release-notes';

export interface ReleaseNoteItem {
  readonly id: string;
  readonly tag: string;
  readonly title: string;
  readonly description: string;
}

export interface ReleaseNotesEntry {
  readonly version: string;
  readonly heading: string;
  readonly subtitle: string;
  readonly items: readonly ReleaseNoteItem[];
}

export const CURRENT_RELEASE_NOTES: ReleaseNotesEntry = Object.freeze({
  version: APP_RELEASE_VERSION,
  heading: `Novidades da versão ${APP_RELEASE_VERSION}`,
  subtitle:
    'Novo visual limpo no celular/Android com aba dedicada de Voz e chamadas ininterruptas mesmo com a tela do celular desligada.',
  items: Object.freeze([
    Object.freeze({
      id: 'android-rework-voice-hub',
      tag: 'Android & Mobile',
      title: 'Novo visual mobile em 4 abas + Salas de Voz em 1 toque',
      description:
        'Navegação simplificada (Voz · Chat · Jogos · Perfil), hub dedicado de Salas de Voz com cartão pré-entrada (microfone e saída de áudio), palco de chamada limpo sem atalhos de PC e lista de Membros sob demanda.',
    }),
    Object.freeze({
      id: 'android-screen-off-calls',
      tag: 'Segundo Plano',
      title: 'Chamadas estáveis com a tela do celular desligada',
      description:
        'Assistente automático de permissões logo ao abrir o app (Microfone, Notificações, Bateria sem restrições e Bluetooth), AudioFocus de chamada, troca rápida entre Viva-voz/Bluetooth/Auricular e botões Mutar/Desligar na tela bloqueada.',
    }),
    Object.freeze({
      id: 'screen-share-1080p60-carry',
      tag: 'Transmissão',
      title: 'Transmissão 1080p 60 FPS por hardware + Contador de FPS ao vivo',
      description:
        'Mantém todas as melhorias de transmissão por GPU (AV1 e H.264 High Profile), contador real de resolução/FPS para espectadores e voz de baixa latência.',
    }),
  ]),
});

export function readSeenReleaseVersion(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): string {
  if (!storage) return '';
  try {
    return storage.getItem(RELEASE_NOTES_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function shouldShowReleaseNotes(
  storage: Pick<Storage, 'getItem'> | null | undefined,
  version = APP_RELEASE_VERSION,
): boolean {
  if (!storage) return false;
  return readSeenReleaseVersion(storage) !== version;
}

export function markReleaseNotesSeen(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  version = APP_RELEASE_VERSION,
): void {
  if (!storage) return;
  try {
    storage.setItem(RELEASE_NOTES_STORAGE_KEY, version);
  } catch {}
}

export function openReleaseNotesPanel(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(RELEASE_NOTES_OPEN_EVENT));
}
