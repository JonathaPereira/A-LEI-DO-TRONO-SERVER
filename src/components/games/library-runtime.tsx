import { createGameLibrary } from '../../lib/games/library';
import type { GameLibrary, GameDestination } from '../../lib/games/library';

interface LibraryRuntime extends Window {
  TronoAuth: { readonly user: object | null };
  TronoPortal: {
    showOnly(id: string): void;
    openGame(direct?: boolean): void;
    openVoice(): Promise<boolean>;
    showPortal(): void;
  };
  TronoSocial: { showForRoom(show: boolean): void };
  TronoAzul: {
    open(): void;
    leaveView(): void;
    refreshRooms(): Promise<unknown>;
    readonly room: unknown;
    readonly animating: boolean;
  };
  TronoSplendor: { open(): void };
  TronoTicketToRide: { open(): void };
  TronoLoveLetter: { open(): void };
  TronoRoguelite: { open(): void };
  TronoAtalaia: { open(): void };
  TronoNexus: { open(): void };
  TronoGameLibrary?: GameLibrary;
  TronoGames?: {
    openLibrary(): Promise<void>;
    openThrone(): Promise<void>;
    openAzul(): Promise<void>;
    readonly room: unknown;
    readonly animating: boolean;
  };
}
const screenRoutes: Readonly<Record<string, GameDestination>> = Object.freeze({
  gamesScreen: 'library',
  setupScreen: 'throne',
  roomScreen: 'throne',
  gameScreen: 'throne',
  azulScreen: 'azul',
  rogueliteScreen: 'roguelite',
  splendorScreen: 'splendor',
  ticketToRideScreen: 'ticket-to-ride',
  loveLetterScreen: 'love-letter',
  nexusScreen: 'nexus',
  atalaiaScreen: 'atalaia',
});
const installed = new WeakMap<Window, () => void>();
export function initializeGameLibrary(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as LibraryRuntime,
    doc = target.document;
  const controller = createGameLibrary({
    read: () =>
      Object.entries(screenRoutes).find(([id]) => {
        const screen = doc.getElementById(id);
        return screen && !screen.classList.contains('hidden');
      })?.[1] ?? null,
    subscribeSource(listener) {
      const observer = new MutationObserver(listener);
      for (const id of Object.keys(screenRoutes)) {
        const node = doc.getElementById(id);
        if (node) observer.observe(node, { attributes: true, attributeFilter: ['class'] });
      }
      return () => observer.disconnect();
    },
    navigate(destination) {
      if (destination !== 'azul') runtime.TronoAzul.leaveView();
      switch (destination) {
        case 'library':
          runtime.TronoPortal.showOnly('gamesScreen');
          runtime.TronoSocial.showForRoom(false);
          doc.body.dataset.gamesView = 'library';
          if (runtime.TronoAuth.user) void runtime.TronoAzul.refreshRooms();
          return;
        case 'throne':
          return runtime.TronoPortal.openGame(true);
        case 'azul':
          return runtime.TronoAzul.open();
        case 'roguelite':
          return runtime.TronoRoguelite.open();
        case 'splendor':
          return runtime.TronoSplendor.open();
        case 'ticket-to-ride':
          return runtime.TronoTicketToRide.open();
        case 'love-letter':
          return runtime.TronoLoveLetter.open();
        case 'atalaia':
          return runtime.TronoAtalaia.open();
        case 'nexus':
          return runtime.TronoNexus.open();
        default:
          return runtime.TronoAuth.user
            ? runtime.TronoPortal.openVoice()
            : runtime.TronoPortal.showPortal();
      }
    },
    warn: (error) => console.warn('[GameLibrary]', error),
  });
  runtime.TronoGameLibrary = controller;
  const facade = {
    openLibrary: () => controller.open('library'),
    openThrone: () => controller.open('throne'),
    openAzul: () => controller.open('azul'),
    get room() {
      return runtime.TronoAzul.room;
    },
    get animating() {
      return runtime.TronoAzul.animating;
    },
  };
  runtime.TronoGames = facade;
  const bind = () => controller.start();
  target.addEventListener('trono:ready', bind, { once: true });
  const dispose = () => {
    target.removeEventListener('trono:ready', bind);
    controller.dispose();
    if (runtime.TronoGames === facade) delete runtime.TronoGames;
    if (runtime.TronoGameLibrary === controller) delete runtime.TronoGameLibrary;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
