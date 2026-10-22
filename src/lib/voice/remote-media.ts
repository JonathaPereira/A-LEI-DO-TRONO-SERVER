import type { VoiceMediaKind, VoicePeerConnection } from '../../types/voice';

interface Interest {
  camera: boolean;
  screen: boolean;
}
interface Streams {
  readonly av: MediaStream;
  readonly screen: MediaStream;
}
interface RemoteMediaOptions {
  enabled(): boolean;
  createStream(): MediaStream;
  getPeer(id: string): VoicePeerConnection | undefined;
  isPeerCurrent(id: string, peer: VoicePeerConnection): boolean;
  getInterest(id: string): Interest;
  isCameraHidden(id: string): boolean;
  onVoiceReceiver(id: string, receiver: RTCRtpReceiver, added: boolean): void;
  onAudioReady(id: string, kind: 'audio' | 'screen-audio'): void;
  onChange(): void;
  onRecover(id: string, missing: Interest, isCurrent: () => boolean): Promise<boolean>;
  now?: () => number;
  warn?: (error: unknown) => void;
}
interface Binding {
  readonly owner: object;
  readonly kind: VoiceMediaKind;
  readonly track: MediaStreamTrack;
  readonly receiver?: RTCRtpReceiver;
  readonly subscription: boolean;
  unlisten(): void;
}
interface Entry {
  readonly streams: Streams;
  readonly bindings: Map<VoiceMediaKind, Binding>;
  readonly healthy: Map<'camera' | 'screen', { track: MediaStreamTrack; at: number }>;
  recovery: ReturnType<typeof setTimeout> | undefined;
  recovering: boolean;
  revision: number;
}
interface SubscriptionTrack {
  id: string;
  kind: VoiceMediaKind;
  track: MediaStreamTrack;
  owner: object;
  receiver?: RTCRtpReceiver;
  isCurrent(): boolean;
}
const screenKind = (kind: VoiceMediaKind) => kind === 'screen' || kind === 'screen-audio';

/** Owns received stream membership, track listeners, video grace and recovery timers.
 * P2P tracks belong to their peer; SFU tracks are stopped when detached, as before.
 * Streams are borrowed by players. No audio graph, sender or capture is created here.
 */
export function createRemoteMedia(options: RemoteMediaOptions) {
  const entries = new Map<string, Entry>();
  const now = options.now ?? Date.now;
  const warn = options.warn ?? ((error: unknown) => console.warn('[RemoteMedia]', error));
  function entryFor(id: string): Entry {
    let entry = entries.get(id);
    if (!entry) {
      entry = {
        streams: Object.freeze({ av: options.createStream(), screen: options.createStream() }),
        bindings: new Map(),
        healthy: new Map(),
        recovery: undefined,
        recovering: false,
        revision: 0,
      };
      entries.set(id, entry);
    }
    return entry;
  }
  function streamFor(entry: Entry, kind: VoiceMediaKind) {
    return screenKind(kind) ? entry.streams.screen : entry.streams.av;
  }
  function insert(entry: Entry, kind: VoiceMediaKind, track: MediaStreamTrack) {
    const stream = streamFor(entry, kind);
    for (const previous of stream.getTracks())
      if (previous !== track && previous.kind === track.kind) stream.removeTrack(previous);
    if (!stream.getTracks().includes(track)) stream.addTrack(track);
  }
  function cancelRecovery(id: string) {
    const entry = entries.get(id);
    if (!entry) return;
    entry.revision++;
    clearTimeout(entry.recovery);
    entry.recovery = undefined;
    entry.recovering = false;
  }
  function remove(id: string, entry: Entry, binding: Binding) {
    binding.unlisten();
    if (entry.bindings.get(binding.kind) === binding) entry.bindings.delete(binding.kind);
    const stream = streamFor(entry, binding.kind);
    if (stream.getTracks().includes(binding.track)) stream.removeTrack(binding.track);
    if (binding.kind === 'camera' || binding.kind === 'screen') {
      if (entry.healthy.get(binding.kind)?.track === binding.track)
        entry.healthy.delete(binding.kind);
    }
    if (binding.receiver && binding.kind === 'audio')
      options.onVoiceReceiver(id, binding.receiver, false);
    if (binding.subscription) {
      try {
        binding.track.stop();
      } catch (error) {
        warn(error);
      }
    }
  }
  function bind(input: SubscriptionTrack, subscription: boolean) {
    if (!options.enabled() || !input.isCurrent()) return;
    const { id, kind, track, owner, receiver } = input;
    const entry = entryFor(id),
      previous = entry.bindings.get(kind);
    if (previous?.track === track && previous.owner === owner) return;
    if (previous) remove(id, entry, previous);
    insert(entry, kind, track);
    if (kind === 'camera' && !subscription) track.enabled = !options.isCameraHidden(id);
    const current = () =>
      options.enabled() &&
      entries.get(id) === entry &&
      entry.bindings.get(kind) === binding &&
      input.isCurrent() &&
      streamFor(entry, kind).getTracks().includes(track);
    const healthy = () => {
      if (kind === 'camera' || kind === 'screen') entry.healthy.set(kind, { track, at: now() });
    };
    const ended = () => {
      if (current() && (!subscription || track.kind === 'video')) options.onChange();
    };
    const muted = () => {
      if (current() && !subscription && track.kind === 'video') scheduleRecovery(id);
    };
    const unmuted = () => {
      if (!current()) return;
      if (kind === 'audio' || (kind === 'screen-audio' && options.getInterest(id).screen))
        options.onAudioReady(id, kind);
      healthy();
      if (!subscription) cancelRecovery(id);
      if (!subscription || track.kind === 'video') options.onChange();
    };
    const binding: Binding = {
      owner,
      kind,
      track,
      receiver,
      subscription,
      unlisten() {
        track.removeEventListener('ended', ended);
        track.removeEventListener('mute', muted);
        track.removeEventListener('unmute', unmuted);
      },
    };
    entry.bindings.set(kind, binding);
    track.addEventListener('ended', ended);
    track.addEventListener('mute', muted);
    track.addEventListener('unmute', unmuted);
    if (receiver && kind === 'audio') options.onVoiceReceiver(id, receiver, true);
    if (kind === 'audio' || (kind === 'screen-audio' && options.getInterest(id).screen))
      options.onAudioReady(id, kind);
    if (track.kind === 'video' && !track.muted) healthy();
    options.onChange();
  }
  function recover(id: string): Streams {
    const entry = entryFor(id),
      peer = options.getPeer(id);
    if (peer && options.isPeerCurrent(id, peer)) {
      for (const [kind, transceiver] of [
        ['audio', peer._tronoAudioTransceiver],
        ['camera', peer._tronoVideoTransceiver],
        ['screen', peer._tronoScreenTransceiver],
        ['screen-audio', peer._tronoScreenAudioTransceiver],
      ] as const)
        if (transceiver?.receiver.track) insert(entry, kind, transceiver.receiver.track);
    }
    return entry.streams;
  }
  function scheduleRecovery(id: string) {
    if (!id || !options.enabled()) return;
    const entry = entryFor(id);
    if (entry.recovery !== undefined || entry.recovering) return;
    const revision = entry.revision;
    const current = () =>
      options.enabled() && entries.get(id) === entry && entry.revision === revision;
    entry.recovery = setTimeout(() => {
      entry.recovery = undefined;
      if (!current()) return;
      const interest = options.getInterest(id),
        streams = recover(id);
      const live = (stream: MediaStream) =>
        stream.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted);
      const missing = {
        camera: interest.camera && !live(streams.av),
        screen: interest.screen && !live(streams.screen),
      };
      if (!missing.camera && !missing.screen) return;
      entry.recovering = true;
      void options
        .onRecover(id, missing, current)
        .then((retry) => {
          if (!current()) return;
          entry.recovering = false;
          if (retry) scheduleRecovery(id);
        })
        .catch((error) => {
          if (current()) entry.recovering = false;
          warn(error);
        });
    }, 3800);
  }
  function clear(id: string) {
    const entry = entries.get(id);
    if (!entry) return;
    cancelRecovery(id);
    entries.delete(id);
    for (const binding of [...entry.bindings.values()]) remove(id, entry, binding);
    for (const stream of [entry.streams.av, entry.streams.screen])
      for (const track of stream.getTracks()) stream.removeTrack(track);
  }
  return {
    getStreams: (id: string) => entryFor(id).streams,
    recover,
    attachPeer(id: string, track: MediaStreamTrack, transceiver: RTCRtpTransceiver) {
      const peer = options.getPeer(id);
      if (!peer || !options.isPeerCurrent(id, peer)) return;
      // ontrack can precede answerer transceiver binding; use received m-line order.
      const all = peer.getTransceivers().filter((t) => t.receiver.track.kind === track.kind);
      const screen =
        (track.kind === 'video'
          ? peer._tronoScreenTransceiver
          : peer._tronoScreenAudioTransceiver) === transceiver || all.indexOf(transceiver) === 1;
      const kind =
        track.kind === 'audio' ? (screen ? 'screen-audio' : 'audio') : screen ? 'screen' : 'camera';
      bind(
        {
          id,
          kind,
          track,
          owner: peer,
          receiver: transceiver.receiver,
          isCurrent: () => options.isPeerCurrent(id, peer),
        },
        false,
      );
    },
    attachSubscription(input: SubscriptionTrack) {
      bind(input, true);
    },
    detachSubscription(owner: object) {
      for (const [id, entry] of entries)
        for (const binding of [...entry.bindings.values()])
          if (binding.owner === owner) remove(id, entry, binding);
    },
    videoUsable(id: string, stream: MediaStream | null | undefined, kind: 'camera' | 'screen') {
      const track = stream?.getVideoTracks().find((t) => t.readyState === 'live');
      if (!track) return false;
      const entry = entryFor(id);
      if (!track.muted) {
        entry.healthy.set(kind, { track, at: now() });
        return true;
      }
      const last = entry.healthy.get(kind);
      return last?.track === track && now() - last.at < 5200;
    },
    cancelRecovery,
    scheduleRecovery,
    clear,
    reset() {
      for (const id of [...entries.keys()]) clear(id);
    },
  };
}
export type RemoteMedia = ReturnType<typeof createRemoteMedia>;
