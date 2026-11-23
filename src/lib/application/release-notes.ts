export const APP_RELEASE_VERSION = '2.2.0';
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
    'Atalho personalizado no Overlay em segundo plano e atualizações automáticas mais rápidas.',
  items: Object.freeze([
    Object.freeze({
      id: 'overlay-custom-shortcut',
      tag: 'Overlay',
      title: 'Atalho personalizável funcionando em segundo plano',
      description:
        'Escolha qualquer combinação em Configurações → Aplicativo → Definir atalho. Agora o overlay ativa instantaneamente mesmo com o Trono minimizado ou no segundo plano do jogo.',
    }),
    Object.freeze({
      id: 'fast-auto-updates',
      tag: 'Atualização',
      title: 'Atualização rápida, automática e visível na barra lateral',
      description:
        'Novas versões agora baixam muito mais rápido por atualização diferencial com novas tentativas automáticas, botão direto na barra lateral e instalação em 1 clique.',
    }),
    Object.freeze({
      id: 'presence-and-images',
      tag: 'Comunicação',
      title: 'Status Online/Ausente/Não Perturbar e imagens nas notificações',
      description:
        'Alterne seu status no menu do perfil (com silêncio total em Não Perturbar) e visualize prévias de imagens recebidas diretamente nas notificações do Windows.',
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
