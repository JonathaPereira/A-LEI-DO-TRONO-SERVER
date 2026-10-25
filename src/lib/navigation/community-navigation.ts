import type { NetworkClient } from '../socket/client';
import type { ChannelsController } from '../channels/catalog';
import type { CallNavigation } from '../voice/navigation';
import type { VoiceRuntime } from '../voice/runtime';
import type { IdentityValidation, PrimaryScreen } from './portal';
import type { SocketMessage } from '../../types/socket';
import { readNavigationRoom } from '../voice/navigation-protocol.ts';

export interface CommunityEntry {
  textOnly?: boolean;
  validatedIdentity?: IdentityValidation;
  channelId?: string;
  isCurrent?(): boolean;
  showScreen?(): void;
}
interface Options {
  network: Pick<
    NetworkClient,
    | 'currentRoom'
    | 'primaryRoom'
    | 'gameRoom'
    | 'connected'
    | 'independentGameVoice'
    | 'joinChatChannel'
    | 'joinTextChannel'
    | 'leaveVoiceRoom'
    | 'requestChatChannels'
    | 'onMessage'
    | 'requestRooms'
  >;
  channels: Pick<ChannelsController, 'get' | 'getSnapshot'>;
  navigation: Pick<CallNavigation, 'getSnapshot'>;
  voice: Pick<
    VoiceRuntime,
    | 'voiceJoined'
    | 'joinVoice'
    | 'leaveVoice'
    | 'showForRoom'
    | 'setChatHubMode'
    | 'consumeRoom'
    | 'consumeChatRoom'
    | 'clearChannelChat'
  >;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  session: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  accountId(): string | null;
  screen(): PrimaryScreen | null;
  desktop: boolean;
  name(): string;
  openLogin(): void;
  validateIdentity(): Promise<IdentityValidation>;
  refreshPermissions(): Promise<unknown>;
  ensureAudio(): Promise<unknown>;
  showCommunity(): void;
  showPortal(): void;
  focusIdentity(): void;
  clearLobby(): void;
  subscribeSource(fn: () => void): () => void;
  schedule(fn: () => void, ms: number): () => void;
  notify(message: string, duration: number): void;
  warn(error: unknown): void;
}
interface Snapshot {
  readonly status: string;
  readonly roomName: string;
  readonly chatTitle: string;
  readonly count: number;
  readonly filesAvailable: boolean;
}
interface Operation {
  generation: number;
  account: string | null;
  screen: PrimaryScreen | null;
  external(): boolean;
  done: Promise<unknown>;
  kind: 'enter' | 'switch' | 'leave';
  showing: boolean;
}
const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;
/** Owns navigation intentions and labels, never membership, channel catalogs or media. */
export function createCommunityNavigation(options: Options) {
  const { network, channels, navigation, voice } = options;
  let state: Snapshot = Object.freeze({
    status: 'Conectando ao salão de conversa...',
    roomName: 'Geral',
    chatTitle: '# conversa',
    count: 0,
    filesAvailable: true,
  });
  let generation = 0,
    disposed = false,
    started = false,
    touched = false;
  let pending: Operation | null = null,
    resume: { id: string; operation: Operation } | null = null;
  let releaseTimer: (() => void) | null = null;
  let summary = '',
    selectedId: string | null = null,
    identity = options.accountId(),
    wasConnected = network.connected;
  const listeners = new Set<() => void>(),
    cleanup: (() => void)[] = [];
  function update(patch: Partial<Snapshot>) {
    if (disposed) return;
    const next = { ...state, ...patch };
    if (
      Object.keys(next).every((key) => next[key as keyof Snapshot] === state[key as keyof Snapshot])
    )
      return;
    state = Object.freeze(next);
    listeners.forEach((fn) => fn());
  }
  function valid(op: Operation) {
    return (
      !disposed &&
      op.generation === generation &&
      op.account === options.accountId() &&
      (op.showing || op.screen === options.screen()) &&
      op.external()
    );
  }
  function invalidate() {
    generation++;
    pending = null;
    resume = null;
    releaseTimer?.();
    releaseTimer = null;
  }
  function sync() {
    const account = options.accountId();
    if (
      (wasConnected && !network.connected) ||
      identity !== account ||
      (pending && !valid(pending)) ||
      (resume && !valid(resume.operation))
    )
      invalidate();
    identity = account;
    wasConnected = network.connected;
    const room = readNavigationRoom(navigation.getSnapshot().textRoom);
    if (
      !navigation.getSnapshot().hub ||
      !room ||
      room.kind !== 'chat' ||
      room.id !== network.currentRoom
    )
      return;
    const count =
      Number.isSafeInteger(room.count) && (room.count as number) >= 0
        ? (room.count as number)
        : Array.isArray(room.players)
          ? room.players.length
          : 0;
    const name = room.name || 'Comunidade';
    const key = JSON.stringify([room.id, name, room.channelType, count]);
    if (summary === key) return;
    summary = key;
    selectedId = room.id;
    update({
      roomName: name,
      chatTitle: '# ' + (room.name || 'conversa'),
      count,
      filesAvailable: room.channelType !== 'voice',
      status: network.connected
        ? `${name} · ${room.channelType === 'text' ? 'Canal de texto' : room.channelType === 'voice' ? 'Canal de voz' : 'Texto e voz'}`
        : 'Reconectando ao servidor...',
    });
    if (account)
      try {
        options.session.setItem('mn-resume-chat', JSON.stringify({ id: room.id, userId: account }));
      } catch {
        /* Navigation also works without storage. */
      }
  }
  function launch(
    kind: Operation['kind'],
    external: () => boolean,
    work: (op: Operation) => Promise<unknown>,
  ) {
    invalidate();
    touched = true;
    const op: Operation = {
      generation,
      account: options.accountId(),
      screen: options.screen(),
      external,
      kind,
      showing: false,
      done: Promise.resolve(),
    };
    pending = op;
    // Defer work until the record is installed so reentrant calls share the same intention.
    op.done = Promise.resolve()
      .then(() => work(op))
      .finally(() => {
        if (pending === op) pending = null;
      });
    return op.done;
  }
  function enter(entry: CommunityEntry = {}): Promise<boolean> {
    sync();
    if (disposed || entry.isCurrent?.() === false) return Promise.resolve(false);
    if (pending?.kind === 'enter') return pending.done as Promise<boolean>;
    return launch('enter', entry.isCurrent ?? (() => true), async (op) => {
      if (!valid(op)) return false;
      if (!options.accountId()) {
        options.openLogin();
        return false;
      }
      try {
        const validation = entry.validatedIdentity ?? (await options.validateIdentity());
        if (!valid(op)) return false;
        if (!validation.ok) {
          options.notify(validation.message || 'Escolha um nome disponível.', 1800);
          options.showPortal();
          options.focusIdentity();
          return false;
        }
        const name = validation.name || options.name().trim();
        if (!name) {
          options.notify('Digite um nome para entrar.', 1600);
          options.showPortal();
          return false;
        }
        try {
          options.storage.setItem('tronoPlayerName', name);
        } catch {
          /* Optional persistence. */
        }
        await options.refreshPermissions().catch(() => {});
        if (!valid(op)) return false;
        const requested = channels.get(entry.channelId)?.id ?? null;
        const current = network.currentRoom;
        const restore = channels.get(current) && (!requested || requested === current);
        const preserveVoice = !requested && network.independentGameVoice && voice.voiceJoined;
        const channelId =
          requested ??
          (preserveVoice
            ? channels.getSnapshot().channels.find((c) => c.type !== 'voice')?.id
            : (options.desktop
                ? channels.getSnapshot().channels.find((c) => c.type !== 'text')?.id
                : null) || channels.getSnapshot().channels[0]?.id);
        if (!network.gameRoom) options.clearLobby();
        summary = '';
        op.screen = 'chatOnlyScreen';
        op.showing = true;
        try {
          voice.setChatHubMode(true);
          voice.showForRoom(true);
          (entry.showScreen ?? options.showCommunity)();
        } catch (error) {
          voice.setChatHubMode(false);
          throw error;
        } finally {
          op.showing = false;
        }
        if (!valid(op)) return false;
        if (restore) {
          sync();
          return true;
        }
        if (!channelId) {
          update({
            status: preserveVoice
              ? 'Sua chamada continua conectada. Selecione uma sala de voz para trocar de chamada.'
              : 'Nenhum canal disponível. Crie um canal para começar.',
          });
          if (!preserveVoice) {
            network.leaveVoiceRoom();
            voice.consumeRoom(null);
          }
          return true;
        }
        update({ status: 'Abrindo a comunidade...' });
        void options.ensureAudio().catch(() => {});
        const text = entry.textOnly || preserveVoice || channels.get(channelId)?.type === 'text';
        if (!text && network.primaryRoom !== channelId && voice.voiceJoined)
          await voice.leaveVoice();
        if (!valid(op)) return false;
        const online = await (text
          ? network.joinTextChannel(channelId, name, () => valid(op))
          : network.joinChatChannel(channelId, name, () => valid(op)));
        if (!valid(op)) return false;
        network.requestChatChannels();
        if (!online)
          update({
            status:
              'Servidor indisponível. Aguarde a reconexão ou volte ao início para tentar novamente.',
          });
        return true;
      } catch (error) {
        if (!valid(op)) return false;
        options.warn(error);
        if (navigation.getSnapshot().hub)
          update({
            status:
              'Conexão interrompida. Aguarde a reconexão ou volte ao início para tentar novamente.',
          });
        else {
          options.showPortal();
          options.notify(messageOf(error, 'Não foi possível abrir o chat.'), 3000);
        }
        return false;
      }
    }) as Promise<boolean>;
  }
  async function switchChannel(id: string, { connectVoice = false } = {}): Promise<void> {
    sync();
    if (disposed || !navigation.getSnapshot().hub || !channels.get(id)) return;
    if (pending) {
      await pending.done;
      return;
    }
    await launch(
      'switch',
      () => true,
      async (op) => {
        const channel = channels.get(id)!;
        if (!valid(op)) return;
        try {
          if (
            network.currentRoom === id &&
            (channel.type === 'text' || network.primaryRoom === id)
          ) {
            if (connectVoice && channel.type !== 'text' && !voice.voiceJoined)
              await voice.joinVoice();
            return;
          }
          const wasInVoice = voice.voiceJoined,
            text = channel.type === 'text';
          if (!text && id !== network.primaryRoom) await voice.leaveVoice();
          if (!valid(op)) return;
          let savedName: string | null = null;
          try {
            savedName = options.storage.getItem('tronoPlayerName');
          } catch {
            /* Optional persistence. */
          }
          const name = (savedName || options.name()).trim();
          if (!name) {
            options.notify('Informe seu nome no portal para entrar.', 1800);
            return;
          }
          resume =
            (wasInVoice || connectVoice) && !text && !voice.voiceJoined
              ? { id, operation: op }
              : null;
          const online = await (text
            ? network.joinTextChannel(id, name, () => valid(op))
            : network.joinChatChannel(id, name, () => valid(op)));
          if (!valid(op)) return;
          if (!online) throw new Error('Servidor indisponível.');
          update({
            status: text ? 'Abrindo mensagens...' : `Entrando no canal ${channel.name}...`,
          });
          voice.clearChannelChat();
        } catch (error) {
          if (valid(op)) {
            resume = null;
            options.notify(messageOf(error, 'Não foi possível trocar de canal.'), 2200);
          }
        }
      },
    );
  }
  async function leave(): Promise<void> {
    if (disposed) return;
    if (pending?.kind === 'leave') {
      await pending.done;
      return;
    }
    await launch(
      'leave',
      () => true,
      async (op) => {
        if (!valid(op)) return;
        try {
          options.session.removeItem('mn-resume-chat');
        } catch {
          /* Optional persistence. */
        }
        try {
          await voice.leaveVoice();
        } catch (error) {
          if (valid(op)) options.warn(error);
        }
        if (!valid(op)) return;
        voice.showForRoom(false);
        voice.setChatHubMode(false);
        network.leaveVoiceRoom();
        summary = '';
        selectedId = null;
        op.screen = 'portalScreen';
        op.showing = true;
        try {
          options.showPortal();
        } finally {
          op.showing = false;
        }
        releaseTimer = options.schedule(() => {
          releaseTimer = null;
          if (!disposed && generation === op.generation) network.requestRooms();
        }, 120);
      },
    );
  }
  function message(msg: SocketMessage) {
    sync();
    if (disposed) return;
    if (msg.type === 'connection' && navigation.getSnapshot().hub)
      update({
        status: msg.connected
          ? 'Servidor reconectado.'
          : 'Conexão interrompida; tentando reconectar...',
      });
    if (msg.type === 'channel-deleted' && typeof msg.roomId === 'string') {
      if (resume?.id === msg.roomId) resume = null;
      if (selectedId === msg.roomId && navigation.getSnapshot().hub) {
        invalidate();
        summary = '';
        selectedId = null;
        try {
          options.session.removeItem('mn-resume-chat');
        } catch {
          /* Optional persistence. */
        }
        voice.consumeChatRoom(null);
        voice.clearChannelChat();
        network.requestChatChannels();
        update({ status: 'Este canal foi excluído. Escolha outro canal.' });
      }
    }
    if (msg.type === 'joined-room' || msg.type === 'joined-text-channel') {
      const room = readNavigationRoom(msg.room);
      if (
        !room ||
        room.kind !== 'chat' ||
        room.id !== network.currentRoom ||
        !navigation.getSnapshot().hub
      )
        return;
      summary = '';
      sync();
      network.requestChatChannels();
      if (
        msg.type === 'joined-room' &&
        resume?.id === room.id &&
        valid(resume.operation) &&
        network.primaryRoom === room.id
      ) {
        resume = null;
        void voice.joinVoice().catch(options.warn);
      }
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    enter,
    switchChannel,
    leave,
    async restore() {
      if (disposed || touched || !options.accountId()) return;
      try {
        const saved: unknown = JSON.parse(options.session.getItem('mn-resume-chat') || 'null');
        if (
          typeof saved === 'object' &&
          saved &&
          'id' in saved &&
          typeof saved.id === 'string' &&
          'userId' in saved &&
          saved.userId === options.accountId()
        )
          await enter({ channelId: saved.id });
      } catch (error) {
        options.warn(error);
      }
    },
    start() {
      if (started || disposed) return;
      started = true;
      cleanup.push(options.subscribeSource(sync), network.onMessage(message));
      sync();
    },
    dispose() {
      if (disposed) return;
      invalidate();
      disposed = true;
      cleanup.splice(0).forEach((off) => off());
      listeners.clear();
    },
  };
}
export type CommunityNavigation = ReturnType<typeof createCommunityNavigation>;
