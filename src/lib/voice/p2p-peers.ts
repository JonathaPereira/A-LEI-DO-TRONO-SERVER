import type { PeerSignal, VoiceMediaKind, VoicePeerConnection } from '../../types/voice';
import { parsePeerSignal } from './peer-protocol.ts';

type Status = 'connected' | 'reconnecting' | 'offer-timeout' | 'connection-timeout';
interface PeerOptions {
  getSettings(): { enabled: boolean; localId: string | null | undefined };
  createConnection(): RTCPeerConnection;
  getTracks(): Record<VoiceMediaKind, MediaStreamTrack | null>;
  applyQuality(sender: RTCRtpSender, kind: VoiceMediaKind): Promise<void>;
  sendSignal(id: string, type: PeerSignal['signalType'], data: PeerSignal['data']): void;
  getScreenWatch(id: string): boolean;
  onTrack(id: string, track: MediaStreamTrack, transceiver: RTCRtpTransceiver): void;
  onClosed(id: string, peer: VoicePeerConnection): void;
  onStateChange(): void;
  onStatus(status: Status): void;
  warn?: (error: unknown) => void;
}
interface Session {
  readonly id: string;
  readonly peer: VoicePeerConnection;
  readonly initiator: boolean;
  closed: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  renegotiate: boolean;
  iceRestart: boolean;
  watching: boolean;
  offerRetries: number;
  connectAttempts: number;
  pendingIce: RTCIceCandidateInit[];
  signalQueue: Promise<void>;
  trackQueue: Promise<void>;
  timers: Partial<
    Record<'negotiation' | 'offer' | 'connect' | 'initial', ReturnType<typeof setTimeout>>
  >;
}
const slots = [
  ['audio', '_tronoAudioTransceiver', '_tronoAudioSender'],
  ['camera', '_tronoVideoTransceiver', '_tronoVideoSender'],
  ['screen', '_tronoScreenTransceiver', '_tronoScreenSender'],
  ['screen-audio', '_tronoScreenAudioTransceiver', '_tronoScreenAudioSender'],
] as const;

/** Owns P2P connections, negotiation queues, timers and ICE, never local capture or sockets. */
export function createP2pPeers(options: PeerOptions) {
  const connections = new Map<string, VoicePeerConnection>();
  const sessions = new WeakMap<RTCPeerConnection, Session>();
  const warn = options.warn ?? ((error: unknown) => console.warn('[P2pPeers]', error));
  function current(session: Session) {
    return (
      !session.closed &&
      options.getSettings().enabled &&
      connections.get(session.id) === session.peer
    );
  }
  function clear(session: Session, name: keyof Session['timers']) {
    clearTimeout(session.timers[name]);
    delete session.timers[name];
  }
  function later(
    session: Session,
    name: keyof Session['timers'],
    delay: number,
    callback: () => void,
  ) {
    clear(session, name);
    session.timers[name] = setTimeout(() => {
      delete session.timers[name];
      if (current(session)) callback();
    }, delay);
  }
  function send(session: Session, type: PeerSignal['signalType'], data: PeerSignal['data']) {
    if (current(session)) options.sendSignal(session.id, type, data);
  }
  function description(session: Session, type: 'offer' | 'answer') {
    const local = session.peer.localDescription;
    if (local?.type === type) send(session, type, { type, sdp: local.sdp });
  }
  function close(id: string): boolean {
    const peer = connections.get(id),
      session = peer && sessions.get(peer);
    if (!peer || !session || session.closed) return false;
    session.closed = true;
    connections.delete(id);
    for (const name of Object.keys(session.timers) as (keyof Session['timers'])[])
      clear(session, name);
    session.pendingIce.length = 0;
    peer.onicecandidate = null;
    peer.onicecandidateerror = null;
    peer.onnegotiationneeded = null;
    peer.onconnectionstatechange = null;
    peer.oniceconnectionstatechange = null;
    peer.ontrack = null;
    // Let receiver/renderer owners detach while browser receivers are still available.
    try {
      options.onClosed(id, peer);
    } finally {
      try {
        peer.close();
      } catch (error) {
        warn(error);
      }
    }
    return true;
  }
  function desired(session: Session, kind: VoiceMediaKind) {
    return (kind === 'screen' || kind === 'screen-audio') && !session.watching
      ? null
      : options.getTracks()[kind];
  }
  async function syncNow(session: Session) {
    for (const [kind, , senderKey] of slots) {
      if (!current(session)) return;
      const sender = session.peer[senderKey];
      if (!sender) continue;
      let track: MediaStreamTrack | null;
      do {
        track = desired(session, kind);
        await sender.replaceTrack(track);
        if (!current(session)) return;
      } while (desired(session, kind) !== track);
      await options.applyQuality(sender, kind);
    }
  }
  function syncTracks(peer: RTCPeerConnection): Promise<void> {
    const session = sessions.get(peer);
    if (!session || !current(session)) return Promise.resolve();
    const next = session.trackQueue.catch(() => {}).then(() => syncNow(session));
    session.trackQueue = next;
    return next;
  }
  function configure(session: Session, answerer: boolean) {
    const peer = session.peer;
    const all = answerer ? peer.getTransceivers() : [];
    const audio = all.filter((t) => t.receiver.track.kind === 'audio');
    const video = all.filter((t) => t.receiver.track.kind === 'video');
    // Only the initiator allocates m-lines, ordered audio/camera/screen/screen-audio.
    // The answerer reuses the received transceivers to preserve bidirectional media.
    const received = [audio[0], video[0], video[1], audio[1]];
    for (const [i, [kind, transceiverKey, senderKey]] of slots.entries()) {
      const transceiver = answerer
        ? received[i]
        : peer.addTransceiver(kind === 'audio' || kind === 'screen-audio' ? 'audio' : 'video', {
            direction: 'sendrecv',
          });
      if (!transceiver) continue;
      transceiver.direction = 'sendrecv';
      peer[transceiverKey] = transceiver;
      peer[senderKey] = transceiver.sender;
    }
  }
  function scheduleOffer(session: Session) {
    later(session, 'offer', 2500, () => {
      if (session.peer.signalingState !== 'have-local-offer') return;
      if (++session.offerRetries > 5) {
        options.onStatus('offer-timeout');
        return;
      }
      description(session, 'offer');
      scheduleOffer(session);
    });
  }
  async function makeOffer(session: Session, iceRestart: boolean) {
    const peer = session.peer;
    if (!current(session) || !session.initiator) return;
    if (session.makingOffer) {
      session.renegotiate = true;
      session.iceRestart ||= iceRestart;
      return;
    }
    if (peer.signalingState !== 'stable') {
      if (peer.signalingState === 'have-local-offer' && peer.localDescription?.type === 'offer') {
        description(session, 'offer');
        scheduleOffer(session);
      }
      if (iceRestart) {
        session.renegotiate = true;
        session.iceRestart = true;
      }
      return;
    }
    session.makingOffer = true;
    try {
      await syncTracks(peer);
      if (!current(session)) return;
      if (iceRestart) {
        try {
          peer.restartIce();
        } catch {}
      }
      const offer = await peer.createOffer({ iceRestart });
      if (!current(session)) return;
      if (peer.signalingState !== 'stable') {
        session.renegotiate = true;
        return;
      }
      await peer.setLocalDescription(offer);
      if (!current(session)) return;
      session.offerRetries = 0;
      description(session, 'offer');
      scheduleOffer(session);
    } catch (error) {
      if (current(session)) warn(error);
    } finally {
      session.makingOffer = false;
    }
  }
  function negotiate(id: string, iceRestart = false, immediate = false) {
    const peer = connections.get(id),
      session = peer && sessions.get(peer);
    if (!session || !current(session)) return;
    if (!session.initiator) {
      send(session, 'renegotiate-request', { iceRestart });
      return;
    }
    // Keep a queued ICE restart even if a later negotiationneeded only requests SDP.
    session.iceRestart ||= iceRestart;
    later(session, 'negotiation', immediate ? 0 : 90, () => {
      const restart = session.iceRestart;
      session.iceRestart = false;
      void makeOffer(session, restart);
    });
  }
  function scheduleConnect(session: Session) {
    clear(session, 'connect');
    if (session.peer.connectionState === 'connected') return;
    later(session, 'connect', 10000, () => {
      if (session.peer.connectionState === 'connected') return;
      if (++session.connectAttempts > 2) {
        options.onStatus('connection-timeout');
        return;
      }
      negotiate(session.id, true, true);
      scheduleConnect(session);
    });
  }
  function ensure(id: string): VoicePeerConnection | null {
    const settings = options.getSettings();
    if (!settings.enabled || !settings.localId || !id || id === settings.localId) return null;
    const existing = connections.get(id);
    if (existing) return existing;
    const peer = options.createConnection();
    const session: Session = {
      id,
      peer,
      initiator: String(settings.localId) < id,
      closed: false,
      makingOffer: false,
      ignoreOffer: false,
      renegotiate: false,
      iceRestart: false,
      watching: false,
      offerRetries: 0,
      connectAttempts: 0,
      pendingIce: [],
      signalQueue: Promise.resolve(),
      trackQueue: Promise.resolve(),
      timers: {},
    };
    connections.set(id, peer);
    sessions.set(peer, session);
    peer.onicecandidate = (event) => {
      if (event.candidate) send(session, 'ice', event.candidate.toJSON());
    };
    peer.onicecandidateerror = (event) => {
      if (current(session)) warn(new Error(`ICE ${event.errorCode}: ${event.errorText}`));
    };
    peer.ontrack = (event) => {
      if (current(session)) options.onTrack(id, event.track, event.transceiver);
    };
    peer.onnegotiationneeded = () => {
      if (current(session)) negotiate(id);
    };
    peer.onconnectionstatechange = () => {
      if (!current(session)) return;
      if (peer.connectionState === 'failed') {
        negotiate(id, true, true);
        options.onStatus('reconnecting');
      }
      if (peer.connectionState === 'connected') {
        clear(session, 'connect');
        session.connectAttempts = 0;
        options.onStatus('connected');
        send(session, 'stream-watch', { watching: options.getScreenWatch(id) });
      }
      if (peer.connectionState === 'closed') close(id);
      options.onStateChange();
    };
    peer.oniceconnectionstatechange = () => {
      if (current(session) && peer.iceConnectionState === 'failed') negotiate(id, true, true);
    };
    if (session.initiator) {
      configure(session, false);
      negotiate(id, false, true);
    } else
      later(session, 'initial', 120, () =>
        send(session, 'renegotiate-request', { iceRestart: false }),
      );
    scheduleConnect(session);
    return peer;
  }
  async function handleNow(session: Session, signal: PeerSignal) {
    if (!current(session)) return;
    const peer = session.peer;
    try {
      if (signal.signalType === 'stream-watch') {
        session.watching = signal.data.watching;
        await syncTracks(peer);
        return;
      }
      if (signal.signalType === 'renegotiate-request') {
        if (session.initiator) negotiate(session.id, signal.data.iceRestart, true);
        return;
      }
      if (signal.signalType === 'ice') {
        if (!peer.remoteDescription) {
          session.pendingIce.push(signal.data);
          return;
        }
        try {
          await peer.addIceCandidate(signal.data);
        } catch (error) {
          if (!session.ignoreOffer) throw error;
        }
        return;
      }
      const isOffer = signal.signalType === 'offer';
      if (!isOffer && peer.signalingState !== 'have-local-offer') return;
      const collision = isOffer && (session.makingOffer || peer.signalingState !== 'stable');
      session.ignoreOffer = session.initiator && collision;
      if (session.ignoreOffer) return;
      if (collision && !session.initiator && peer.signalingState !== 'stable') {
        try {
          await peer.setLocalDescription({ type: 'rollback' });
        } catch {}
        if (!current(session)) return;
      }
      await peer.setRemoteDescription(signal.data);
      if (!current(session)) return;
      if (!isOffer) clear(session, 'offer');
      if (isOffer) {
        configure(session, true);
        await syncTracks(peer);
      }
      if (!current(session)) return;
      for (const candidate of session.pendingIce.splice(0)) {
        try {
          await peer.addIceCandidate(candidate);
        } catch {}
        if (!current(session)) return;
      }
      if (isOffer) {
        const answer = await peer.createAnswer();
        if (!current(session)) return;
        await peer.setLocalDescription(answer);
        if (current(session)) description(session, 'answer');
      } else if (peer.signalingState === 'stable' && session.renegotiate) {
        const restart = session.iceRestart;
        session.renegotiate = false;
        session.iceRestart = false;
        await makeOffer(session, restart);
      }
    } catch (error) {
      if (current(session)) warn(error);
    }
  }
  function handleSignal(value: unknown): Promise<void> {
    const signal = parsePeerSignal(value);
    if (!signal) return Promise.resolve();
    const peer = ensure(signal.fromId),
      session = peer && sessions.get(peer);
    if (!session) return Promise.resolve();
    const next = session.signalQueue.catch(() => {}).then(() => handleNow(session, signal));
    session.signalQueue = next;
    return next;
  }
  return {
    connections: connections as ReadonlyMap<string, VoicePeerConnection>,
    ensure,
    close,
    handleSignal,
    negotiate,
    syncTracks,
    isCurrent(id: string, peer: RTCPeerConnection) {
      const session = sessions.get(peer);
      return !!session && session.id === id && current(session);
    },
    stopWatching(peer: RTCPeerConnection) {
      const session = sessions.get(peer);
      if (session) session.watching = false;
    },
  };
}
export type P2pPeers = ReturnType<typeof createP2pPeers>;
