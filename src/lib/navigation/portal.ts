import type { NameAvailability } from '../../types/network';
import type { SocketMessage } from '../../types/socket';

export const primaryScreens = [
  'portalScreen',
  'setupScreen',
  'roomScreen',
  'chatOnlyScreen',
  'gameScreen',
  'gamesScreen',
  'azulScreen',
  'nexusScreen',
  'atalaiaScreen',
  'rogueliteScreen',
  'splendorScreen',
  'ticketToRideScreen',
  'loveLetterScreen',
  'similoScreen',
] as const;
export type PrimaryScreen = (typeof primaryScreens)[number];
export interface PortalIdentity {
  user: { id: string; nickname: string } | null;
  guest: { id: string; nickname: string } | null;
}
export interface IdentityValidation {
  ok: boolean;
  name?: string;
  code?: string | null;
  message?: string;
}
export interface PortalSnapshot {
  readonly screen: PrimaryScreen;
  readonly name: string;
  readonly label: string;
  readonly readOnly: boolean;
  readonly feedback: Readonly<NameAvailability>;
  readonly target: 'home' | 'game' | 'voice';
  readonly connected: boolean;
  readonly serverStatus: string;
  readonly entryStatus: string;
  readonly busy: boolean;
  readonly nowPlaying: string;
  readonly creditsOpen: boolean;
}
interface Options {
  entry?: 'home' | 'community';
  gameScreen?(): 'setupScreen' | 'roomScreen' | 'gameScreen';
  identity(): PortalIdentity;
  authReady: Promise<unknown>;
  subscribeIdentity(fn: () => void): () => void;
  subscribeMessages(fn: (message: SocketMessage) => void): () => void;
  connected(): boolean;
  checkName(name: string): Promise<NameAvailability>;
  persistName(name: string): void;
  showScreen(screen: PrimaryScreen): void;
  openAuth(mode: 'login' | 'guest'): void;
  openLibrary(): unknown;
  requestRooms(): void;
  focusIdentity(lobby: boolean): void;
  ensureAudio(): Promise<unknown>;
  enterCommunity(
    validation: IdentityValidation,
    current: () => boolean,
    show: () => void,
  ): Promise<boolean>;
  communityVisible(): boolean;
  schedule?(fn: () => void, ms: number): () => void;
  warn?(error: unknown): void;
}
export const safePlayerName = (value: unknown) =>
  [
    ...String(value ?? '')
      .replace(/[<>]/g, '')
      .replace(/[\u0000-\u001F\u007F]/g, ' '),
  ]
    .slice(0, 20)
    .join('');
const cancelled = (): IdentityValidation => ({ ok: false, code: 'CANCELLED' });
/** Owns identity feedback and navigation intents, never call membership or media. */
export function createPortal(options: Options) {
  let validationCheck: {
    epoch: number;
    account: string;
    name: string;
    version: number;
    users: number;
    promise: Promise<NameAvailability>;
  } | null = null;
  let state: PortalSnapshot = Object.freeze({
    screen: 'portalScreen',
    name: '',
    label: 'Visitante',
    readOnly: true,
    feedback: Object.freeze({ available: false, message: 'Entre ou jogue como convidado' }),
    target: 'home',
    connected: false,
    serverStatus: 'Conectando à Corte…',
    entryStatus: '',
    busy: false,
    nowPlaying: 'Lo-fi • omfgdude',
    creditsOpen: false,
  });
  let started = false,
    disposed = false,
    epoch = 0,
    checkVersion = 0,
    navigation = 0;
  let cancelCheck: (() => void) | undefined;
  let validating = 0;
  let opening: { id: number; promise: Promise<boolean> } | null = null;
  const listeners = new Set<() => void>(),
    cleanup: (() => void)[] = [];
  const schedule =
    options.schedule ??
    ((fn, ms) => {
      const timer = setTimeout(fn, ms);
      return () => clearTimeout(timer);
    });
  function update(patch: Partial<PortalSnapshot>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    listeners.forEach((fn) => fn());
  }
  const owner = () => {
    const { user, guest } = options.identity();
    return user ? `user:${user.id}` : guest ? `guest:${guest.id}` : '';
  };
  function cancelNameCheck() {
    checkVersion++;
    cancelCheck?.();
    cancelCheck = undefined;
  }
  function cancelNavigation() {
    navigation++;
    opening = null;
    validationCheck = null;
  }
  function syncIdentity(value: unknown, { persist = true } = {}) {
    if (disposed) return state.name;
    const { user, guest } = options.identity();
    const name = safePlayerName(user?.nickname ?? (guest ? value || guest.nickname : ''));
    update({
      name,
      label: guest ? `${name} · Convidado` : name || 'Visitante',
      readOnly: !!user || !guest,
    });
    if (persist) options.persistName(name);
    return name;
  }
  function setNameFeedback(value: Partial<NameAvailability> = {}) {
    if (disposed) return state.feedback;
    const feedback = Object.freeze({
      available: !!value.available,
      code: value.code ?? '',
      message: value.message ?? '',
    });
    update({ feedback });
    return feedback;
  }
  function identityChanged() {
    epoch++;
    cancelNameCheck();
    cancelNavigation();
    const { user, guest } = options.identity();
    const name = safePlayerName(user?.nickname || guest?.nickname || '');
    // Publish one snapshot: subscribers must never see the old account's feedback.
    update({
      name,
      label: guest ? `${name} · Convidado` : name || 'Visitante',
      readOnly: !!user || !guest,
      busy: false,
      entryStatus: '',
      creditsOpen: false,
      feedback: Object.freeze({
        available: false,
        message: user
          ? 'Apelido da sua conta'
          : guest
            ? 'Convidado · acesso ao jogo e à voz da mesa'
            : 'Entre ou jogue como convidado',
      }),
    });
    if (options.entry === 'community') {
      if (user) void openVoice();
      else if (!guest) showPortal();
    }
  }
  function queueNameCheck(value: unknown) {
    if (disposed) return;
    cancelNameCheck();
    const identity = options.identity();
    if (!identity.user && !identity.guest) {
      syncIdentity('');
      setNameFeedback({ code: 'AUTH_REQUIRED', message: 'Entre ou jogue como convidado.' });
      return;
    }
    const name = syncIdentity(value).trim(),
      version = checkVersion,
      account = owner(),
      generation = epoch;
    if (!name) {
      setNameFeedback({ code: 'NAME_REQUIRED', message: 'Digite um nome para entrar.' });
      return;
    }
    const current = () =>
      !disposed &&
      version === checkVersion &&
      generation === epoch &&
      account === owner() &&
      name === state.name.trim();
    setNameFeedback({ code: 'CHECKING', message: 'Verificando disponibilidade…' });
    cancelCheck = schedule(() => {
      if (!current()) return;
      cancelCheck = undefined;
      void options
        .checkName(name)
        .then((result) => {
          if (current()) setNameFeedback(result);
        })
        .catch(() => {
          if (current())
            setNameFeedback({
              code: 'NETWORK_OFFLINE',
              message: 'Aguardando servidor para validar o nome.',
            });
        });
    }, 300);
  }
  async function validateIdentity({
    silent = false,
    game = false,
  } = {}): Promise<IdentityValidation> {
    const generation = epoch,
      account = owner();
    const current = () => !disposed && generation === epoch && account === owner();
    await options.authReady;
    if (!current()) return cancelled();
    const identity = options.identity();
    if (!identity.user && !(game && identity.guest)) {
      options.openAuth(game ? 'guest' : 'login');
      return {
        ok: false,
        code: 'AUTH_REQUIRED',
        message: game
          ? 'Escolha um nome de convidado ou entre na sua conta.'
          : 'O chat M&N exige login. Entre na sua conta para continuar.',
      };
    }
    const name = syncIdentity(state.name.trim());
    if (!name.trim()) {
      cancelNameCheck();
      setNameFeedback({ code: 'NAME_REQUIRED', message: 'Digite um nome para entrar.' });
      return { ok: false, name: '', code: 'NAME_REQUIRED' };
    }
    // Session restoration and a manual entry can validate the same name together.
    // Share the request instead of cancelling the other caller's navigation.
    let check = validationCheck;
    if (
      !check ||
      check.epoch !== generation ||
      check.account !== account ||
      check.name !== name ||
      check.version !== checkVersion
    ) {
      cancelNameCheck();
      check = {
        epoch: generation,
        account,
        name,
        version: checkVersion,
        users: 0,
        promise: Promise.resolve().then(() => options.checkName(name)),
      };
      validationCheck = check;
    }
    const version = check.version;
    const valid = () => current() && version === checkVersion && name === state.name;
    check.users++;
    validating++;
    try {
      const result = await check.promise;
      if (!valid()) return cancelled();
      setNameFeedback(result);
      return {
        ok: result.available,
        name: result.name || name,
        code: result.code ?? null,
        message: result.message ?? '',
      };
    } catch (error) {
      if (!valid()) return cancelled();
      if (!silent)
        setNameFeedback({
          code: 'NETWORK_OFFLINE',
          message: 'Não foi possível validar o nome agora.',
        });
      return {
        ok: false,
        name,
        code: 'NAME_CHECK_FAILED',
        message: error instanceof Error ? error.message : 'Não foi possível validar o nome agora.',
      };
    } finally {
      validating--;
      if (--check.users === 0 && validationCheck === check) validationCheck = null;
    }
  }
  function present(screen: PrimaryScreen) {
    options.showScreen(screen);
    update({
      screen,
      target: screen === 'portalScreen' ? 'home' : screen === 'chatOnlyScreen' ? 'voice' : 'game',
      ...(screen !== 'portalScreen' ? { creditsOpen: false } : {}),
    });
  }
  function showOnly(screen: string) {
    if (disposed) return;
    if (!primaryScreens.includes(screen as PrimaryScreen)) throw new Error('Tela desconhecida.');
    cancelNavigation();
    present(screen as PrimaryScreen);
    update({ busy: false, entryStatus: '' });
  }
  function showPortal() {
    showOnly('portalScreen');
  }
  function openGame(direct = false) {
    if (disposed) return;
    cancelNavigation();
    update({ busy: false, entryStatus: '' });
    if (!direct) return options.openLibrary();
    const { user, guest } = options.identity();
    if (!user && !guest) {
      options.openAuth('guest');
      return;
    }
    syncIdentity(state.name);
    present(options.gameScreen?.() ?? 'setupScreen');
    options.requestRooms();
    options.focusIdentity(true);
  }
  function openVoice(): Promise<boolean> {
    if (disposed) return Promise.resolve(false);
    if (opening) return opening.promise;
    const id = ++navigation,
      generation = epoch,
      account = owner();
    const current = () =>
      !disposed && id === navigation && generation === epoch && account === owner();
    // Schedule the work after assigning its identity; synchronous failures cannot retain a stale lock.
    const promise = Promise.resolve().then(async () => {
      try {
        if (!current()) return false;
        update({ entryStatus: 'Verificando seu nome…', busy: true });
        void options.ensureAudio().catch(() => {});
        const validation = await validateIdentity();
        if (!current()) return false;
        if (!validation.ok) {
          update({ entryStatus: validation.message || 'Escolha um nome disponível.' });
          options.focusIdentity(false);
          return false;
        }
        syncIdentity(validation.name);
        update({ entryStatus: 'Abrindo o chat…' });
        const entered = await options.enterCommunity(validation, current, () => {
          if (current()) present('chatOnlyScreen');
        });
        if (!current()) return false;
        if (!entered || !options.communityVisible())
          throw new Error('Não foi possível abrir a tela de voz. Recarregue com Ctrl+F5.');
        update({ target: 'voice', entryStatus: '' });
        return true;
      } catch (error) {
        if (current()) {
          options.warn?.(error);
          present('portalScreen');
          update({
            entryStatus:
              error instanceof Error
                ? error.message
                : 'Não foi possível abrir o chat. Tente novamente.',
          });
        }
        return false;
      } finally {
        if (opening?.id === id) {
          opening = null;
          update({ busy: false });
        }
      }
    });
    opening = { id, promise };
    return promise;
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    syncIdentity,
    setNameFeedback,
    queueNameCheck,
    validateIdentity,
    showOnly,
    showPortal,
    openGame,
    openVoice,
    setNowPlaying(text: string) {
      update({ nowPlaying: text });
    },
    setCredits(open: boolean) {
      update({ creditsOpen: open });
    },
    start() {
      if (started || disposed) return;
      started = true;
      identityChanged();
      update({
        connected: options.connected(),
        serverStatus: options.connected() ? 'Servidor conectado' : 'Conectando à Corte…',
      });
      cleanup.push(
        options.subscribeIdentity(identityChanged),
        options.subscribeMessages((message) => {
          if (message.type === 'connection' && typeof message.connected === 'boolean') {
            update({
              connected: message.connected,
              serverStatus: message.connected ? 'Servidor conectado' : 'Reconectando…',
            });
            if (!message.connected) {
              cancelNameCheck();
              cancelNavigation();
              update({ busy: false, entryStatus: '' });
            }
          }
          if (message.type === 'welcome') {
            update({
              connected: true,
              serverStatus: `Servidor ${typeof message.serverVersion === 'string' ? message.serverVersion : 'online'}`,
            });
            // A welcome can arrive from the connection opened by validateIdentity itself.
            // Its background check must not supersede the explicit entry validation.
            if (!validating) queueNameCheck(state.name);
          }
        }),
      );
    },
    dispose() {
      if (disposed) return;
      cancelNameCheck();
      cancelNavigation();
      disposed = true;
      cleanup.splice(0).forEach((fn) => fn());
      listeners.clear();
    },
  };
}
export type Portal = ReturnType<typeof createPortal>;
