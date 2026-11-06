import type { SocketMessage } from '../../types/socket';
import type { VoiceCallSnapshot } from '../../types/voice-call';
import type { VoiceTransportSnapshot } from '../../types/voice-transport';
import type { VoiceParticipant, VoiceNotice, VoiceRosterSnapshot } from '../../types/voice-roster';
import type { P2pPeers } from './p2p-peers';
import type { SfuSession } from './sfu-session';
import {
  isRecord,
  isParticipantId,
  parseVoiceParticipants,
  parseVoiceState,
  parseVoiceNotice,
} from './roster-protocol.ts';

interface RosterOptions {
  localId(): string | null | undefined;
  call(): Pick<VoiceCallSnapshot, 'joined' | 'generation'>;
  transport(): VoiceTransportSnapshot['mode'];
  peers: Pick<P2pPeers, 'connections' | 'ensure' | 'negotiate' | 'handleSignal'>;
  /** Also clears received media when the connection has already been removed. */
  closePeer(id: string): void;
  sfu: Pick<
    SfuSession,
    | 'subscriptions'
    | 'setPublications'
    | 'getPublications'
    | 'closeSubscription'
    | 'syncSubscriptions'
  >;
  hasGain(id: string): boolean;
  restoreGain(id: string, accountId: string): void;
  onSound(kind: 'join' | 'leave' | 'disconnect', id: string): void;
  onNotice(notice: VoiceNotice): void;
  onLocalModeration?(moderation: { serverMuted?: boolean; mediaBlocked?: boolean }): void;
  onChange(): void;
  onMessage(listener: (message: SocketMessage) => void): () => void;
  warn?(error: unknown): void;
}

/** Owns private membership and its listeners; borrows the existing peer/media owners. */
export function createVoiceRoster(options: RosterOptions) {
  const members = new Map<string, VoiceParticipant>();
  let snapshot: VoiceRosterSnapshot = Object.freeze({
    participants: Object.freeze([]),
    initialized: false,
    eventsSupported: false,
  });
  let roomId: string | null = null,
    revision = 0,
    disposed = false;
  let unsubscribe: (() => void) | undefined;
  const warn = options.warn ?? ((error: unknown) => console.warn('[VoiceRoster]', error));
  function update(initialized = snapshot.initialized, eventsSupported = snapshot.eventsSupported) {
    snapshot = Object.freeze({
      participants: Object.freeze(
        [...members.values()].sort((a, b) => (a.seat ?? 999) - (b.seat ?? 999)),
      ),
      initialized,
      eventsSupported,
    });
  }
  function background(action: () => Promise<unknown>) {
    const epoch = revision,
      generation = options.call().generation;
    const report = (error: unknown) => {
      if (!disposed && revision === epoch && options.call().generation === generation) warn(error);
    };
    try {
      void action().catch(report);
    } catch (error) {
      report(error);
    }
  }
  function closePeers() {
    for (const id of [...options.peers.connections.keys()]) options.closePeer(id);
  }
  function sync() {
    if (disposed) return;
    const mode = options.transport();
    if (!options.call().joined || mode !== 'p2p') {
      closePeers();
      if (options.call().joined && mode === 'sfu') background(options.sfu.syncSubscriptions);
    } else {
      // Both endpoints must announce readiness before we initiate SDP.
      const active = new Set(
        snapshot.participants
          .filter((p) => p.id !== options.localId() && p.transport === 'p2p')
          .map((p) => p.id),
      );
      for (const id of active) {
        const peer = options.peers.ensure(id);
        if (peer?.connectionState === 'failed') options.peers.negotiate(id, true, true);
      }
      for (const id of [...options.peers.connections.keys()])
        if (!active.has(id)) options.closePeer(id);
    }
    options.onChange();
  }
  function reset() {
    revision++;
    members.clear();
    update(false);
  }
  function consumeRoster(value: unknown) {
    if (!options.call().joined) return;
    const participants = parseVoiceParticipants(value);
    if (!participants) return;
    const next = new Map(participants.map((p) => [p.id, p]));
    if (snapshot.initialized && !snapshot.eventsSupported) {
      for (const id of next.keys())
        if (id !== options.localId() && !members.has(id)) options.onSound('join', id);
      for (const id of members.keys())
        if (id !== options.localId() && !next.has(id)) options.onSound('leave', id);
    }
    for (const p of participants) {
      if (p.accountId && (members.get(p.id)?.accountId !== p.accountId || !options.hasGain(p.id)))
        options.restoreGain(p.id, p.accountId);
      if (p.id === options.localId())
        options.onLocalModeration?.({
          serverMuted: !!p.serverMuted,
          mediaBlocked: !!p.mediaBlocked,
        });
    }
    members.clear();
    for (const [id, p] of next) members.set(id, p);
    update(true);
    sync();
  }
  function removeParticipant(id: string) {
    const wasInCall = members.delete(id);
    if (
      !snapshot.eventsSupported &&
      options.call().joined &&
      snapshot.initialized &&
      wasInCall &&
      id !== options.localId()
    )
      options.onSound('leave', id);
    update();
    options.closePeer(id);
    if (options.transport() === 'sfu') {
      for (const kind of ['audio', 'camera', 'screen', 'screen-audio']) {
        const key = `${id}:${kind}`;
        if (options.sfu.subscriptions.has(key))
          background(() => options.sfu.closeSubscription(key));
      }
      options.sfu.setPublications(options.sfu.getPublications().filter((p) => p.ownerId !== id));
      background(options.sfu.syncSubscriptions);
    }
    options.onChange();
  }
  function receive(message: SocketMessage) {
    if (disposed) return;
    if (message.type === 'welcome') {
      if (
        message.features === undefined ||
        (isRecord(message.features) &&
          (message.features.voiceEvents === undefined ||
            typeof message.features.voiceEvents === 'boolean'))
      )
        update(
          snapshot.initialized,
          isRecord(message.features) && message.features.voiceEvents === true,
        );
      return;
    }
    if (
      message.type === 'connection' &&
      message.connected === false &&
      message.recovering !== true
    ) {
      reset();
      update(false, false);
      closePeers();
      options.onChange();
      return;
    }
    if (!roomId) return;
    // Old voice-state and current signaling envelopes omit roomId. Check it when supplied.
    const inRoom = message.roomId === roomId;
    const optionalRoom = message.roomId === undefined || inRoom;
    if (message.type === 'voice-roster' && inRoom) consumeRoster(message.players);
    else if (message.type === 'voice-event' && inRoom) {
      const notice = parseVoiceNotice(message);
      if (!notice || notice.playerId === options.localId()) return;
      options.onNotice(notice);
      options.onSound(
        notice.kind === 'joined' ? 'join' : notice.kind === 'disconnected' ? 'disconnect' : 'leave',
        notice.playerId,
      );
    } else if (message.type === 'voice-state' && optionalRoom && options.call().joined) {
      const state = parseVoiceState(message);
      if (!state) return;
      const old = members.get(state.playerId),
        was = !!old;
      if (state.joined) {
        const serverMuted = state.serverMuted ?? old?.serverMuted ?? false;
        const mediaBlocked = state.mediaBlocked ?? old?.mediaBlocked ?? false;
        members.set(
          state.playerId,
          Object.freeze({
            id: state.playerId,
            accountId: old?.accountId ?? null,
            name: old?.name ?? state.name ?? 'Participante',
            avatar_preset: old?.avatar_preset ?? 'crown',
            avatar_file_id: old?.avatar_file_id ?? null,
            role: old?.role ?? 'member',
            seat: old?.seat ?? state.seat,
            joined: true,
            muted: state.muted || serverMuted,
            serverMuted,
            mediaBlocked,
            deafened: state.deafened,
            camera: !mediaBlocked && state.camera,
            screen: !mediaBlocked && state.screen,
            transport: state.transport ?? old?.transport ?? 'p2p',
            quality: state.quality ?? old?.quality ?? 'balanced',
          }),
        );
      } else members.delete(state.playerId);
      if (
        !snapshot.eventsSupported &&
        snapshot.initialized &&
        state.playerId !== options.localId() &&
        was !== state.joined
      )
        options.onSound(state.joined ? 'join' : 'leave', state.playerId);
      update();
      sync();
    } else if (
      message.type === 'voice-signal' &&
      optionalRoom &&
      options.call().joined &&
      options.transport() === 'p2p'
    ) {
      background(() => options.peers.handleSignal(message));
    } else if (message.type === 'player-left' && inRoom && isParticipantId(message.playerId))
      removeParticipant(message.playerId);
    else if (message.type === 'sfu-publications' && inRoom) {
      options.sfu.setPublications(message.publications);
      if (options.transport() === 'sfu') background(options.sfu.syncSubscriptions);
    }
  }
  return {
    members: members as ReadonlyMap<string, VoiceParticipant>,
    getSnapshot: () => snapshot,
    sync,
    reset,
    setRoom(id: string | null) {
      if (disposed || id === roomId) return;
      roomId = id;
      reset();
      closePeers();
    },
    start() {
      if (!disposed && !unsubscribe) unsubscribe = options.onMessage(receive);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe?.();
      unsubscribe = undefined;
      reset();
      closePeers();
    },
  };
}
