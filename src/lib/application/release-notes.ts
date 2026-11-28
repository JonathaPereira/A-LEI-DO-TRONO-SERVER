export const APP_RELEASE_VERSION = '2.3.3';
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
    'Transmissão de tela mais estável com Simulcast em 2 camadas (PC + Celular), voz sem picotes, perfis/avatares instantâneos e telemetria dedicada de transmissão.',
  items: Object.freeze([
    Object.freeze({
      id: 'screen-share-simulcast-2layer',
      tag: 'Transmissão',
      title: 'Simulcast em 2 camadas (1080p60 no PC + 720p30 leve no Celular)',
      description:
        'A transmissão de tela agora publica uma camada principal para PC e uma camada leve automática para celulares/Android, evita queda para 360p/480p em falso-positivo de rede, mantém dimensões sempre pares e blinda o modo automático contra OpenH264 em software.',
    }),
    Object.freeze({
      id: 'screen-share-telemetry',
      tag: 'Diagnóstico',
      title: 'Telemetria especializada de Screen Share (sem perder dados da chamada)',
      description:
        'O diagnóstico copiado agora inclui uma seção dedicada de transmissão com BWE estimado, RIDs publicados/negociados, perfil de codec, QP médio, tempos de limitação, trocas de resolução e métricas separadas de envio e recepção.',
    }),
    Object.freeze({
      id: 'voice-stability-and-fast-profiles',
      tag: 'Voz & Perfis',
      title: 'Voz estável sem áudio robótico + Perfis, avatares e GIFs instantâneos',
      description:
        'Proteção de recepção de voz restaurada para eliminar picotes e robotização no desktop, somada a cache inteligente de perfis e avatares com URLs em cache de disco para abertura imediata.',
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
