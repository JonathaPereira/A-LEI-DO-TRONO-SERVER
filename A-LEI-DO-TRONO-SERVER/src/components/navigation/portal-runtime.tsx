import {
  createPortal,
  primaryScreens,
  type PortalIdentity,
  type Portal,
  type IdentityValidation,
} from '../../lib/navigation/portal';
import type { NetworkClient } from '../../lib/socket/client';

interface Runtime extends Window {
  TronoAuth: PortalIdentity & {
    ready: Promise<unknown>;
    open(mode: 'login'): void;
    openGuest(): void;
  };
  TronoNetwork: NetworkClient;
  TronoThroneMatch?: { getSnapshot(): { match: unknown } };
  TronoThroneLocalEngine?: { getState(): unknown };
  TronoStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  TronoPortal?: Portal;
  TronoGames?: { openLibrary(): unknown };
  TronoSocial?: {
    readonly voiceJoined: boolean;
    showForRoom(show: boolean): void;
    showPanel(show: boolean): void;
    setChatHubMode(show: boolean): void;
  };
  TronoChatHub?: {
    enter(options: {
      validatedIdentity: IdentityValidation;
      textOnly?: boolean;
      isCurrent(): boolean;
      showScreen(): void;
    }): Promise<boolean>;
  };
  TronoAudio?: { ensureAudio(): Promise<unknown> };
  TRONO_MUSIC_TRACKS?: Record<string, { label: string; artist: string }>;
}
const installed = new WeakMap<Window, () => void>();
export function initializePortal(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document;
  const storage = runtime.TronoStorage ?? target.localStorage;
  let disposed = false,
    focusFrame = 0;
  const input = (id: string) => doc.getElementById(id) as HTMLInputElement | null;
  const controller = createPortal({
    entry: 'community',
    gameScreen: () =>
      runtime.TronoNetwork.gameRoom
        ? runtime.TronoThroneMatch?.getSnapshot().match
          ? 'gameScreen'
          : 'roomScreen'
        : runtime.TronoThroneLocalEngine?.getState()
          ? 'gameScreen'
          : 'setupScreen',
    identity: () => runtime.TronoAuth,
    authReady: runtime.TronoAuth.ready,
    subscribeIdentity(fn) {
      target.addEventListener('trono-auth-change', fn);
      return () => target.removeEventListener('trono-auth-change', fn);
    },
    subscribeMessages: (fn) => runtime.TronoNetwork.onMessage(fn),
    connected: () => runtime.TronoNetwork.connected,
    checkName: (name) => runtime.TronoNetwork.checkName(name),
    persistName(name) {
      try {
        storage.setItem('tronoPlayerName', name);
      } catch {
        /* Storage may be unavailable; navigation still works. */
      }
    },
    showScreen(id) {
      const selected = doc.getElementById(id);
      if (!selected)
        throw new Error('A tela solicitada não terminou de carregar. Recarregue com Ctrl+F5.');
      target.cancelAnimationFrame(focusFrame);
      for (const screenId of primaryScreens)
        doc.getElementById(screenId)?.classList.toggle('hidden', screenId !== id);
      doc.body.classList.toggle('portal-active', id === 'portalScreen');
      if (id !== 'chatOnlyScreen') doc.body.classList.remove('chat-only-active');
      runtime.TronoSocial?.setChatHubMode(id === 'chatOnlyScreen');
      if (id === 'portalScreen') runtime.TronoSocial?.showForRoom(false);
      if (id === 'gameScreen' || id === 'roomScreen') {
        runtime.TronoSocial?.showForRoom(!!runtime.TronoSocial.voiceJoined);
        runtime.TronoSocial?.showPanel(false);
      }
    },
    openAuth: (mode) =>
      mode === 'guest' ? runtime.TronoAuth.openGuest() : runtime.TronoAuth.open('login'),
    openLibrary: () => runtime.TronoGames?.openLibrary(),
    requestRooms: () => runtime.TronoNetwork.requestRooms(),
    focusIdentity(lobby) {
      target.cancelAnimationFrame(focusFrame);
      focusFrame = target.requestAnimationFrame(() => {
        if (!disposed)
          input(lobby ? 'playerIdentity' : 'authEmail')?.focus({ preventScroll: true });
      });
    },
    ensureAudio: () => runtime.TronoAudio?.ensureAudio() ?? Promise.resolve(false),
    enterCommunity: (validatedIdentity, isCurrent, showScreen) => {
      if (!runtime.TronoChatHub?.enter)
        throw new Error('O chat não terminou de carregar. Recarregue com Ctrl+F5.');
      return runtime.TronoChatHub.enter({
        validatedIdentity,
        isCurrent,
        showScreen,
        textOnly: true,
      });
    },
    communityVisible: () => !doc.getElementById('chatOnlyScreen')?.classList.contains('hidden'),
    warn: (error) => console.warn('[Portal]', error),
  });
  runtime.TronoPortal = controller;
  // The remaining throne lobby reads these inputs synchronously. It owns its DOM;
  // the portal owns their values/feedback until the throne controller is converted.
  let bridgeName: string | undefined, bridgeReadOnly: boolean | undefined;
  const releaseBridge = controller.subscribe(() => {
    const state = controller.getSnapshot(),
      lobby = input('playerIdentity'),
      local = input('p0Name');
    const identityChanged = bridgeName !== state.name || bridgeReadOnly !== state.readOnly;
    if (lobby && identityChanged) {
      lobby.value = state.name;
      lobby.readOnly = state.readOnly;
      lobby.setAttribute('aria-readonly', String(state.readOnly));
    }
    if (local && identityChanged) local.value = state.name;
    bridgeName = state.name;
    bridgeReadOnly = state.readOnly;
    const feedback = doc.getElementById('nameAvailability');
    if (feedback) {
      feedback.textContent = state.feedback.message || '';
      for (const [style, enabled] of Object.entries({
        available: state.feedback.available,
        taken: state.feedback.code === 'NAME_TAKEN',
        required: state.feedback.code === 'NAME_REQUIRED',
        checking: state.feedback.code === 'CHECKING',
      }))
        feedback.classList.toggle(style, enabled);
    }
  });
  function track(event?: Event) {
    const detail = (event as CustomEvent<{ id?: string }> | undefined)?.detail;
    let id = detail?.id;
    if (!id) {
      try {
        id = storage.getItem('tronoMusicTrack') || 'lofi';
      } catch {
        id = 'lofi';
      }
    }
    const tracks = runtime.TRONO_MUSIC_TRACKS,
      chosen = tracks?.[id] ?? tracks?.lofi;
    if (chosen) controller.setNowPlaying(`${chosen.label} • ${chosen.artist}`);
  }
  function lobbyInput(event: Event) {
    controller.queueNameCheck((event.target as HTMLInputElement).value);
  }
  function back() {
    if (runtime.TronoAuth.user) void controller.openVoice();
    else if (runtime.TronoAuth.guest) void runtime.TronoGames?.openLibrary();
    else controller.showPortal();
  }
  function bind() {
    if (disposed) return;
    controller.start();
    if (
      !primaryScreens.some(
        (id) => id !== 'portalScreen' && !doc.getElementById(id)?.classList.contains('hidden'),
      )
    )
      doc.body.classList.add('portal-active');
    input('playerIdentity')?.addEventListener('input', lobbyInput);
    doc.getElementById('backFromLobbyBtn')?.addEventListener('click', back);
    target.addEventListener('trono-music-track', track);
    track();
  }
  target.addEventListener('trono:ready', bind, { once: true });
  const dispose = () => {
    disposed = true;
    target.cancelAnimationFrame(focusFrame);
    target.removeEventListener('trono:ready', bind);
    target.removeEventListener('trono-music-track', track);
    input('playerIdentity')?.removeEventListener('input', lobbyInput);
    doc.getElementById('backFromLobbyBtn')?.removeEventListener('click', back);
    releaseBridge();
    controller.dispose();
    if (runtime.TronoPortal === controller) delete runtime.TronoPortal;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
