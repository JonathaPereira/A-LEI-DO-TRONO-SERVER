export const APP_RELEASE_VERSION = '2.3.1';
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
    'Transmissão de tela em 1080p 60 FPS por hardware sem engasgos, contador de FPS ao vivo para espectadores e chamadas de voz com menor latência.',
  items: Object.freeze([
    Object.freeze({
      id: 'screen-share-1080p60',
      tag: 'Transmissão',
      title: 'Transmissão em 1080p 60 FPS por Hardware sem travadas',
      description:
        'Reescrita do pipeline de tela com detecção automática de codificador por GPU (AV1 e H.264 High Profile via hardware), buffer adaptativo nativo em tempo real, imunidade a telas estáticas do Windows e captura enxuta via D3D11.',
    }),
    Object.freeze({
      id: 'viewer-live-fps',
      tag: 'Espectador',
      title: 'Contador de resolução e FPS ao vivo para quem assiste',
      description:
        'Espectadores agora enxergam em tempo real a resolução e a taxa real de quadros por segundo (FPS) entregues na própria tela durante a transmissão.',
    }),
    Object.freeze({
      id: 'realtime-voice-latency',
      tag: 'Voz',
      title: 'Chamadas de voz em tempo real com menor atraso',
      description:
        'Contexto de áudio interativo de baixa latência e buffer NetEq nativo por padrão, eliminando atraso artificial nas conversas e aplicando margem extra apenas sob oscilação severa de rede.',
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
