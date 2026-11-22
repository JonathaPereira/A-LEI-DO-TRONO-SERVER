export const APP_RELEASE_VERSION = '2.1.0';
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
  subtitle: 'Melhorias inspiradas no Discord para conversar e jogar sem interrupções.',
  items: Object.freeze([
    Object.freeze({
      id: 'presence-status',
      tag: 'Presença',
      title: 'Status Online, Ausente e Não Perturbar',
      description:
        'Alterne seu status pelo menu do perfil. No modo Não Perturbar, todos os avisos, sons e notificações são silenciados enquanto suas mensagens continuam chegando normalmente.',
    }),
    Object.freeze({
      id: 'game-overlay',
      tag: 'Windows',
      title: 'Overlay discreto para jogos',
      description:
        'Ative em Configurações → Aplicativo (ou use Ctrl + Shift + O) para ver quem está falando na call, quem está assistindo à sua tela e mini-avisos sem tirar o foco do jogo.',
    }),
    Object.freeze({
      id: 'windows-image-notifications',
      tag: 'Notificações',
      title: 'Prévias de imagens nas notificações do Windows',
      description:
        'Quando alguém enviar uma foto no chat ou por mensagem privada enquanto você estiver em outro aplicativo, a notificação do Windows exibe o conteúdo da imagem.',
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
