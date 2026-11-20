import settings from '../../../electron/atalaia-config.cjs';

export const atalaiaUrl = settings.url;
interface Options {
  openView(): void;
  desktop: boolean;
  launchNative?: () => Promise<unknown>;
  launchWeb(): void;
}
/** Owns only game launching. Navigation never acquires or stops call media. */
export function createAtalaia(options: Options) {
  let state: Readonly<{ busy: boolean; status: string }> = Object.freeze({
    busy: false,
    status: 'Pronto para defender o cristal.',
  });
  const listeners = new Set<() => void>();
  let disposed = false;
  const update = (patch: Partial<typeof state>) => {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    listeners.forEach((fn) => fn());
  };
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    open() {
      if (!disposed) options.openView();
    },
    async launch() {
      if (disposed || state.busy) return;
      if (!options.desktop) {
        options.launchWeb();
        update({
          status:
            'Atalaia abre em outra aba. Sua chamada continua aqui. O progresso é salvo na aba do jogo.',
        });
        return;
      }
      if (!options.launchNative) {
        update({ status: 'Atualize o MN Trono para jogar Atalaia.' });
        return;
      }
      update({ busy: true, status: 'Abrindo Atalaia…' });
      try {
        await options.launchNative();
        update({
          status:
            'Atalaia aberto na janela do jogo. Sua chamada continua no Trono. F11 alterna a tela cheia.',
        });
      } catch (error) {
        update({
          status: `Não foi possível abrir Atalaia: ${error instanceof Error ? error.message : String(error)}. Tente novamente.`,
        });
      } finally {
        update({ busy: false });
      }
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}
export type Atalaia = ReturnType<typeof createAtalaia>;
export function initializeAtalaia(target: Window) {
  const runtime = target as Window & {
    TronoAtalaia?: Atalaia;
    TronoPortal?: { showOnly(id: string): void };
    TronoSocial?: { showForRoom(show: boolean): void };
    TronoDesktop?: { openAtalaia?: () => Promise<unknown> };
  };
  if (runtime.TronoAtalaia) return;
  runtime.TronoAtalaia = createAtalaia({
    desktop: Boolean(runtime.TronoDesktop),
    launchWeb: () => {
      target.open(atalaiaUrl, '_blank', 'noopener,noreferrer');
    },
    launchNative: runtime.TronoDesktop?.openAtalaia,
    openView() {
      runtime.TronoPortal?.showOnly('atalaiaScreen');
      runtime.TronoSocial?.showForRoom(false);
      target.document.body.dataset.gamesView = 'atalaia';
    },
  });
}
