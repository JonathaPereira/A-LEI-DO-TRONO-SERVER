import type { AvatarAppearance } from '../../types/domain';
import type { NavigationRoom } from '../../types/call-navigation';

export type AppLayoutMode = 'original' | 'discord';
export type AppArea = 'home' | 'game' | 'community';
export type AppRoute = AppArea | 'throne' | 'profile' | 'settings' | 'clips';
type GameScreen = 'setupScreen' | 'roomScreen' | 'gameScreen';
export interface AppLayoutSource {
  user: ({ nickname?: string } & AvatarAppearance) | null;
  guestNickname: string | null;
  connected: boolean;
  currentRoom: string | null;
  gameRoom: string | null;
  callGeneration: number;
  joined: boolean;
  joining: boolean;
  deafened: boolean;
  microphoneEnabled: boolean;
  voiceRoom: NavigationRoom | null;
  voiceStatus: Readonly<{ text: string; kind: string }>;
  communityVisible: boolean;
  homeVisible: boolean;
  visibleGame: GameScreen | null;
}
interface AppLayoutSnapshot {
  readonly layout: AppLayoutMode;
  readonly area: AppArea;
  readonly profile: Readonly<AvatarAppearance>;
  readonly name: string;
  readonly online: boolean;
  readonly userStatus: string;
  readonly connectionState: 'connecting' | 'connected' | 'disconnected';
  readonly voiceLabel: string;
  readonly voiceChannel: string;
  readonly voiceLocationTitle: string;
  readonly canOpenVoice: boolean;
  readonly layoutStatus: string;
}
interface AppLayoutOptions {
  read(): AppLayoutSource;
  readPreference(): unknown;
  authReady: Promise<unknown>;
  events: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  subscribeSource(listener: () => void): () => void;
  writeLayout(layout: AppLayoutMode, save: boolean): void;
  layoutChanged(layout: AppLayoutMode): void;
  desktopNavigate(): ((route: AppRoute) => Promise<unknown>) | undefined;
  showScreen(screen: 'portalScreen' | 'chatOnlyScreen' | GameScreen): void;
  openLibrary(): unknown;
  openGame(requireIdentity: boolean): unknown;
  requestRooms(): void;
  hasChannel(id: string): boolean;
  showCommunity(): void;
  openVoice(): Promise<unknown>;
  switchChannel(id: string): Promise<unknown>;
  openProfile(): unknown;
}
const normalizeLayout = (value: unknown): AppLayoutMode =>
  value === 'discord' ? 'discord' : 'original';
const isRoute = (value: unknown): value is AppRoute =>
  typeof value === 'string' &&
  ['home', 'game', 'community', 'throne', 'profile', 'settings', 'clips'].includes(value);
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Layout and route presentation only. Existing owners keep membership, channels and media. */
export function createAppLayout(options: AppLayoutOptions) {
  let layout: AppLayoutMode = 'original',
    layoutStatus = '',
    lastGame: GameScreen = 'setupScreen',
    started = false,
    disposed = false,
    navigationRevision = 0;
  const listeners = new Set<() => void>(),
    cleanup: (() => void)[] = [];
  function project(): AppLayoutSnapshot {
    const source = options.read(),
      room = source.voiceRoom,
      eligible = !!room && room.channelType !== 'text',
      joined = source.joined && eligible,
      joining = source.joining && !joined,
      failed = !joined && !joining && source.voiceStatus.kind === 'error';
    if (source.visibleGame) lastGame = source.visibleGame;
    const voiceChannel = failed
      ? source.voiceStatus.text
      : eligible
        ? (room.name || 'Canal de voz') +
          (room.kind === 'game' ? ' / A Lei do Trono' : ' / Comunidade M&N')
        : 'Selecione um canal de voz';
    return Object.freeze({
      layout,
      area: source.communityVisible ? 'community' : source.homeVisible ? 'home' : 'game',
      profile: Object.freeze({
        avatar_preset: source.user?.avatar_preset,
        avatar_file_id: source.user?.avatar_file_id,
      }),
      name: source.user?.nickname || source.guestNickname || 'Visitante',
      online: !!(source.user || source.guestNickname) && source.connected,
      userStatus: source.deafened
        ? 'Áudio silenciado'
        : source.joined
          ? source.microphoneEnabled
            ? 'Em voz'
            : 'Microfone mutado'
          : source.connected
            ? 'Disponível'
            : 'Reconectando…',
      connectionState: joining ? 'connecting' : joined ? 'connected' : 'disconnected',
      voiceLabel: joining
        ? 'Conectando…'
        : joined
          ? 'Voz conectada'
          : failed
            ? 'Falha ao conectar'
            : 'Fora da chamada',
      voiceChannel,
      voiceLocationTitle: joined
        ? 'Abrir canal de voz: ' + (room.name || 'Canal de voz')
        : voiceChannel,
      canOpenVoice: joined,
      layoutStatus,
    });
  }
  let snapshot = project();
  function refresh() {
    if (disposed) return;
    const next = project();
    const sameProfile =
      snapshot.profile.avatar_preset === next.profile.avatar_preset &&
      snapshot.profile.avatar_file_id === next.profile.avatar_file_id;
    if (
      sameProfile &&
      Object.keys(next).every(
        (key) =>
          key === 'profile' ||
          snapshot[key as keyof AppLayoutSnapshot] === next[key as keyof AppLayoutSnapshot],
      )
    )
      return;
    snapshot = next;
    for (const listener of listeners) listener();
  }
  function apply(value: unknown, { save = false }: { save?: boolean } = {}) {
    if (!started || disposed) return;
    layout = normalizeLayout(value);
    if (save)
      layoutStatus =
        'Layout ' + (layout === 'discord' ? 'Discord' : 'Original / Padrão') + ' aplicado.';
    options.writeLayout(layout, save);
    refresh();
    options.layoutChanged(layout);
  }
  const readPreference = () => apply(options.readPreference());
  async function route(view: AppRoute) {
    const desktop = options.desktopNavigate();
    if (desktop) return desktop(view);
    if (view === 'home') return options.showScreen('portalScreen');
    if (view === 'game') return options.openLibrary();
    if (view === 'profile' || view === 'settings') return options.openProfile();
    if (view === 'clips') return;
    if (view === 'throne') {
      const source = options.read();
      if (!source.user && !source.guestNickname) return options.openGame(true);
      if (!source.gameRoom) lastGame = 'setupScreen';
      options.showScreen(lastGame);
      options.requestRooms();
      return;
    }
    const room = options.read().currentRoom;
    if (room && options.hasChannel(room)) {
      options.showScreen('chatOnlyScreen');
      options.showCommunity();
      return;
    }
    return options.openVoice();
  }
  async function navigate(view: unknown) {
    if (disposed || !isRoute(view)) return;
    navigationRevision++;
    return route(view);
  }
  async function openVoiceChannel() {
    if (disposed) return;
    const source = options.read(),
      room = source.voiceRoom,
      generation = source.callGeneration;
    if (!source.joined || !room || room.channelType === 'text') return;
    if (source.communityVisible && source.currentRoom === room.id) return;
    const revision = ++navigationRevision;
    if (room.kind === 'game') return route('throne');
    await route('community');
    const current = options.read();
    if (
      !disposed &&
      revision === navigationRevision &&
      current.callGeneration === generation &&
      current.joined &&
      current.voiceRoom?.id === room.id
    )
      await options.switchChannel(room.id);
  }
  function listen(name: string, listener: EventListener) {
    options.events.addEventListener(name, listener);
    cleanup.push(() => options.events.removeEventListener(name, listener));
  }
  return {
    get current() {
      return layout;
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    apply,
    navigate,
    openVoiceChannel,
    openProfile() {
      if (!disposed) options.openProfile();
    },
    refresh,
    start() {
      if (started || disposed) return;
      started = true;
      cleanup.push(options.subscribeSource(refresh));
      listen('trono-auth-change', () => {
        navigationRevision++;
        readPreference();
      });
      listen('trono-profile-change', refresh);
      listen('trono-call-change', refresh);
      listen('trono-personal-change', (event) => {
        if (
          record((event as CustomEvent<unknown>).detail)?.key === 'appLayout' &&
          normalizeLayout(options.readPreference()) !== layout
        )
          readPreference();
      });
      readPreference();
      void options.authReady.then(() => {
        if (!disposed) readPreference();
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      navigationRevision++;
      for (const release of cleanup.splice(0)) release();
      listeners.clear();
    },
  };
}
export type AppLayout = ReturnType<typeof createAppLayout>;
