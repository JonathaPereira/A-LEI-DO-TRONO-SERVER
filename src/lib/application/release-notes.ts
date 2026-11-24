export const APP_RELEASE_VERSION = '2.3.0';
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
    'Transmissão de tela mais estável com Modo Fluidez, Auto-Ausente inteligente e atualizações automáticas no Android.',
  items: Object.freeze([
    Object.freeze({
      id: 'screen-share-fluidez',
      tag: 'Transmissão',
      title: 'Transmissão de tela mais estável + Modo Fluidez (~2s de buffer)',
      description:
        'Melhorias no H.264, recuperação suave sem derrubar o envio em congestão, indicador de estabilidade por percentual real e a nova opção Modo Fluidez em Configurações → Transmissão para suavizar oscilações da rede mantendo a voz em tempo real.',
    }),
    Object.freeze({
      id: 'auto-away-presence',
      tag: 'Presença',
      title: 'Auto-Ausente inteligente após 10 minutos sem interação',
      description:
        'Quando estiver fora de chamada ou com o microfone mutado por 10 minutos sem interagir no app, seu status muda automaticamente para Ausente e volta para Online ao clicar novamente — sem alterar Não Perturbar ou Ausente manual.',
    }),
    Object.freeze({
      id: 'android-auto-updates',
      tag: 'Android',
      title: 'Atualizações automáticas no Android com verificação SHA-256',
      description:
        'O app Android agora verifica novas versões automaticamente, baixa o APK validando a integridade SHA-256 e abre o instalador nativo com 1 toque.',
    }),
    Object.freeze({
      id: 'lighter-windows-installer',
      tag: 'Windows',
      title: 'Instalador mais leve sem Clipes/FFmpeg',
      description:
        'A função de Clipes e o pacote FFmpeg foram removidos para deixar o aplicativo mais leve. A gravação manual e os demais recursos seguem funcionando normalmente.',
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
