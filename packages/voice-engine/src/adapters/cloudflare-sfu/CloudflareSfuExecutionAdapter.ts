import type {
  PublishTrackItem,
  SdpDescription,
  SfuClientAction,
  SfuMediaKind,
  SfuPublicationDescriptor,
  SfuQualityPreset,
  SfuSimulcastRid,
} from '@trono/protocol';
import type {
  CameraOptions,
  MicrophoneOptions,
  RemoteTrackKind,
  ScreenAudioOptions,
  ScreenShareOptions,
} from '../../protocol/types.ts';
import type {
  CloudflareSfuMediaPort,
  ConnectMediaParams,
  ConnectMediaResult,
  PublishedTrackResult,
  SubscriptionPort,
  VoiceEngineHostPorts,
} from '../../ports/index.ts';
import type { ScreenShareSenderTarget } from '../../policies/screenShareOptions.ts';
import { SourceLifecycleRegistry } from '../../source-isolation/SourceLifecycleRegistry.ts';
import {
  createDisplayScreenShareTracks,
  type DisplayMediaDevicesLike,
  type DisplayMediaStreamLike,
  type DisplayMediaTrackLike,
} from '../screen-share/DisplayMediaCapture.ts';
import {
  applyScreenContentHint,
  clearKeepAliveSink,
  enforceScreenShareSenderParameters,
  ensureKeepAliveSink,
  prioritizeScreenCodec,
  type KeepAliveDocumentLike,
  type ScreenCodecCapability,
  type ScreenShareSenderLike,
  type ScreenTransceiverLike,
} from '../screen-share/ScreenShareTrackPlumbing.ts';

export interface MediaStreamTrackLike extends DisplayMediaTrackLike {
  enabled?: boolean;
}

export interface MediaStreamLike extends DisplayMediaStreamLike {
  getTracks(): MediaStreamTrackLike[];
  getVideoTracks(): MediaStreamTrackLike[];
  getAudioTracks(): MediaStreamTrackLike[];
}

export interface MediaDevicesAdapterLike extends DisplayMediaDevicesLike {
  getUserMedia?(constraints: {
    audio?: MediaTrackConstraints | boolean;
    video?: MediaTrackConstraints | boolean;
  }): Promise<MediaStreamLike>;
}

export interface RtpSenderLike extends ScreenShareSenderLike {
  track?: MediaStreamTrackLike | null;
  replaceTrack(track: MediaStreamTrackLike | null): Promise<void>;
}

export interface RtpTransceiverLike extends ScreenTransceiverLike {
  mid: string | null;
  direction: string;
  sender: RtpSenderLike;
  receiver?: { track?: MediaStreamTrackLike };
}

export interface PeerConnectionLike {
  signalingState?: string;
  localDescription?: SdpDescription | null;
  remoteDescription?: SdpDescription | null;
  ontrack:
    | ((event: {
        track: MediaStreamTrackLike;
        transceiver?: RtpTransceiverLike;
        streams?: readonly unknown[];
      }) => void)
    | null;
  addTransceiver?(
    trackOrKind: MediaStreamTrackLike | 'audio' | 'video',
    init?: { direction?: string; sendEncodings?: Array<Record<string, unknown>> },
  ): RtpTransceiverLike;
  addTrack?(track: MediaStreamTrackLike, ...streams: unknown[]): RtpSenderLike;
  getTransceivers?(): RtpTransceiverLike[];
  createOffer(): Promise<SdpDescription>;
  createAnswer(): Promise<SdpDescription>;
  setLocalDescription(description: SdpDescription): Promise<void>;
  setRemoteDescription(description: SdpDescription): Promise<void>;
  close(): void;
}

export interface SignalingTransportLike {
  request<T = unknown>(
    action: SfuClientAction,
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T>;
}

export interface RemoteTrackDelivery {
  participantId: string;
  kind: RemoteTrackKind;
  mid: string;
  track: MediaStreamTrackLike;
  streams?: readonly unknown[];
  transceiver?: RtpTransceiverLike;
}

export interface CloudflareSfuExecutionAdapterOptions {
  signaling: SignalingTransportLike;
  createPeerConnection?: (config: RTCConfiguration) => PeerConnectionLike;
  mediaDevices?: MediaDevicesAdapterLike | null;
  captureRegistry?: SourceLifecycleRegistry;
  keepAliveDoc?: KeepAliveDocumentLike | null;
  getCodecCapabilities?: (
    kind: 'video' | 'audio',
  ) =>
    | { codecs?: readonly ScreenCodecCapability[] }
    | readonly ScreenCodecCapability[]
    | null
    | undefined;
  onRemoteTrack?: (delivery: RemoteTrackDelivery) => void;
  onRemoteTrackEnded?: (info: {
    participantId: string;
    kind: RemoteTrackKind;
    mid: string;
  }) => void;
  onLocalCapture?: (info: {
    kind: SfuMediaKind;
    captureId?: string;
    track: MediaStreamTrackLike;
    stream?: unknown;
  }) => void;
  onPeerConnectionCreated?: (role: 'publish' | 'subscribe', pc: PeerConnectionLike) => void;
}

interface PublishedLocalEntry {
  kind: SfuMediaKind;
  mid: string;
  trackId: string;
  captureId: string | null;
  track: MediaStreamTrackLike;
  transceiver: RtpTransceiverLike;
  rids: SfuSimulcastRid[];
}

interface RemoteSubscriptionEntry {
  key: string;
  participantId: string;
  kind: RemoteTrackKind;
  mid: string;
  preferredRid: SfuSimulcastRid | null;
  transceiver?: RtpTransceiverLike;
}

interface EnsureSessionResponse {
  sessionId: string;
}

interface PublishTracksResponse {
  sessionId: string;
  sessionDescription: SdpDescription;
  publications: SfuPublicationDescriptor[];
}

interface SubscribeTracksResponse {
  sessionId: string;
  sessionDescription: SdpDescription;
  tracks: Array<{
    mid: string;
    publisherId: string;
    publisherSessionId: string;
    trackName: string;
    kind: SfuMediaKind;
    preferredRid: SfuSimulcastRid | null;
  }>;
}

const SIMULCAST_ENCODINGS: Array<Record<string, unknown>> = [
  { rid: 'f', scaleResolutionDownBy: 1 },
  { rid: 'h', scaleResolutionDownBy: 2 },
  { rid: 'q', scaleResolutionDownBy: 4 },
];
const SIMULCAST_RIDS: SfuSimulcastRid[] = ['f', 'h', 'q'];

function defaultCreatePeerConnection(config: RTCConfiguration): PeerConnectionLike {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('RTCPeerConnection is not available in this environment.');
  }
  return new RTCPeerConnection(config) as unknown as PeerConnectionLike;
}

function normalizeIceServers(raw: unknown): RTCIceServer[] {
  if (Array.isArray(raw)) return raw as RTCIceServer[];
  if (
    raw &&
    typeof raw === 'object' &&
    Array.isArray((raw as { iceServers?: unknown }).iceServers)
  ) {
    return (raw as { iceServers: RTCIceServer[] }).iceServers;
  }
  return [];
}

function resolveMediaDevices(
  injected: MediaDevicesAdapterLike | null | undefined,
): MediaDevicesAdapterLike | null {
  if (injected !== undefined) return injected;
  if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
    return navigator.mediaDevices as unknown as MediaDevicesAdapterLike;
  }
  return null;
}

function toSenderTarget(options: ScreenShareOptions): ScreenShareSenderTarget {
  return {
    frameRate: options.frameRate,
    maxFramerate: options.frameRate,
    maxBitrateBps: options.maxBitrateBps,
    contentHint: options.contentHint,
  };
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Operation aborted.');
  }
}

function trackIdOf(track: MediaStreamTrackLike, fallback: string): string {
  return track.id && track.id.length > 0 ? track.id : fallback;
}

/**
 * Asymmetric WebRTC execution adapter for Cloudflare Realtime SFU.
 * Enforces at most 1 Publisher RTCPeerConnection and 1 Subscriber RTCPeerConnection
 * per call, strictly serializing SDP mutations on each connection.
 */
export class CloudflareSfuExecutionAdapter implements CloudflareSfuMediaPort, SubscriptionPort {
  readonly #signaling: SignalingTransportLike;
  readonly #createPeerConnection: (config: RTCConfiguration) => PeerConnectionLike;
  readonly #mediaDevices: MediaDevicesAdapterLike | null;
  readonly #captureRegistry: SourceLifecycleRegistry;
  readonly #keepAliveDoc: KeepAliveDocumentLike | null | undefined;
  readonly #getCodecCapabilities: CloudflareSfuExecutionAdapterOptions['getCodecCapabilities'];
  readonly #onRemoteTrack: CloudflareSfuExecutionAdapterOptions['onRemoteTrack'];
  readonly #onRemoteTrackEnded: CloudflareSfuExecutionAdapterOptions['onRemoteTrackEnded'];
  readonly #onLocalCapture: CloudflareSfuExecutionAdapterOptions['onLocalCapture'];
  readonly #onPeerConnectionCreated: CloudflareSfuExecutionAdapterOptions['onPeerConnectionCreated'];

  #connected = false;
  #quality: SfuQualityPreset = 'balanced';
  #publisherSessionId: string | null = null;
  #subscriberSessionId: string | null = null;
  #publisherPc: PeerConnectionLike | null = null;
  #subscriberPc: PeerConnectionLike | null = null;

  #publisherQueue: Promise<void> = Promise.resolve();
  #subscriberQueue: Promise<void> = Promise.resolve();

  #published = new Map<SfuMediaKind, PublishedLocalEntry>();
  #subscriptions = new Map<string, RemoteSubscriptionEntry>();
  #subscriptionsByMid = new Map<string, RemoteSubscriptionEntry>();
  #screenAudioExplicitlyStarted = false;
  #captureSeq = 0;

  constructor(options: CloudflareSfuExecutionAdapterOptions) {
    this.#signaling = options.signaling;
    this.#createPeerConnection = options.createPeerConnection ?? defaultCreatePeerConnection;
    this.#mediaDevices = resolveMediaDevices(options.mediaDevices);
    this.#captureRegistry = options.captureRegistry ?? new SourceLifecycleRegistry();
    this.#keepAliveDoc = options.keepAliveDoc;
    this.#getCodecCapabilities = options.getCodecCapabilities;
    this.#onRemoteTrack = options.onRemoteTrack;
    this.#onRemoteTrackEnded = options.onRemoteTrackEnded;
    this.#onLocalCapture = options.onLocalCapture;
    this.#onPeerConnectionCreated = options.onPeerConnectionCreated;
  }

  get media(): CloudflareSfuMediaPort {
    return this;
  }

  get subscriptions(): SubscriptionPort {
    return this;
  }

  get hostPorts(): VoiceEngineHostPorts {
    return {
      media: this,
      subscriptions: this,
    };
  }

  async connect(params: ConnectMediaParams): Promise<ConnectMediaResult> {
    if (this.#connected && this.#publisherSessionId && this.#subscriberSessionId) {
      await this.#teardownConnections(false);
    }

    assertNotAborted(params.signal);
    this.#quality = params.quality;

    const rawIce = await this.#signaling.request('ice-config', {}, params.signal);
    assertNotAborted(params.signal);
    const iceServers = normalizeIceServers(rawIce);

    const [pubSession, subSession] = await Promise.all([
      this.#signaling.request<EnsureSessionResponse>(
        'ensure-session',
        { purpose: 'publish' },
        params.signal,
      ),
      this.#signaling.request<EnsureSessionResponse>(
        'ensure-session',
        { purpose: 'subscribe' },
        params.signal,
      ),
    ]);
    assertNotAborted(params.signal);

    this.#publisherSessionId = pubSession.sessionId;
    this.#subscriberSessionId = subSession.sessionId;

    this.#publisherPc = this.#createPeerConnection({ iceServers });
    this.#onPeerConnectionCreated?.('publish', this.#publisherPc);

    this.#subscriberPc = this.#createPeerConnection({ iceServers });
    this.#subscriberPc.ontrack = (event) => {
      const mid = event.transceiver?.mid ?? null;
      if (!mid) return;
      const entry = this.#subscriptionsByMid.get(mid);
      if (!entry) return;
      entry.transceiver = event.transceiver;
      this.#onRemoteTrack?.({
        participantId: entry.participantId,
        kind: entry.kind,
        mid,
        track: event.track,
        streams: event.streams,
        transceiver: event.transceiver,
      });
    };
    this.#onPeerConnectionCreated?.('subscribe', this.#subscriberPc);

    this.#connected = true;
    return {
      publisherSessionId: pubSession.sessionId,
      subscriberSessionId: subSession.sessionId,
    };
  }

  async disconnect(_params: { roomId: string | null; reason?: string }): Promise<void> {
    await this.#teardownConnections(true);
  }

  async startMicrophone(params: {
    options: MicrophoneOptions & { track?: MediaStreamTrackLike };
    signal?: AbortSignal;
  }): Promise<PublishedTrackResult> {
    return this.#enqueuePublisherMutation(async () => {
      this.#assertPublisherReady(params.signal);

      let track = params.options.track ?? null;
      let stream: MediaStreamLike | undefined;
      if (!track) {
        if (!this.#mediaDevices?.getUserMedia) {
          throw new Error('getUserMedia is not supported for microphone capture.');
        }
        stream = await this.#mediaDevices.getUserMedia({
          audio: {
            deviceId: params.options.deviceId,
            echoCancellation: params.options.echoCancellation ?? true,
            noiseSuppression: params.options.noiseSuppression ?? true,
            autoGainControl: params.options.autoGainControl ?? true,
          },
          video: false,
        });
        track = stream.getAudioTracks()[0] ?? stream.getTracks()[0] ?? null;
        if (!track) throw new Error('Microphone capture returned no audio track.');
      }

      if (params.options.muted !== undefined) {
        track.enabled = !params.options.muted;
      }

      const captureId = `mic-${++this.#captureSeq}`;
      this.#captureRegistry.registerCapture(captureId, [track], {
        sourceKey: 'microphone',
        replacePrevious: true,
      });
      this.#onLocalCapture?.({ kind: 'audio', captureId, track, stream });

      await this.#unpublishKindIfActive('audio', params.signal);

      const entry = await this.#publishSingleLocalTrack({
        kind: 'audio',
        track,
        captureId,
        rids: [],
        signal: params.signal,
      });
      return { trackId: entry.trackId, mid: entry.mid };
    });
  }

  setMicrophoneMuted(muted: boolean): void {
    const entry = this.#published.get('audio');
    if (entry) {
      entry.track.enabled = !muted;
    }
  }

  async stopMicrophone(): Promise<void> {
    return this.#enqueuePublisherMutation(async () => {
      const entry = this.#published.get('audio');
      await this.#unpublishKindIfActive('audio');
      if (entry?.captureId) {
        this.#captureRegistry.stopCapture(entry.captureId);
      }
    });
  }

  async startCamera(params: {
    options: CameraOptions & { track?: MediaStreamTrackLike };
    signal?: AbortSignal;
  }): Promise<PublishedTrackResult> {
    return this.#enqueuePublisherMutation(async () => {
      this.#assertPublisherReady(params.signal);

      let track = params.options.track ?? null;
      let stream: MediaStreamLike | undefined;
      if (!track) {
        if (!this.#mediaDevices?.getUserMedia) {
          throw new Error('getUserMedia is not supported for camera capture.');
        }
        stream = await this.#mediaDevices.getUserMedia({
          audio: false,
          video: {
            deviceId: params.options.deviceId,
            width: params.options.width ? { ideal: params.options.width } : undefined,
            height: params.options.height ? { ideal: params.options.height } : undefined,
            frameRate: params.options.frameRate ? { ideal: params.options.frameRate } : undefined,
          },
        });
        track = stream.getVideoTracks()[0] ?? stream.getTracks()[0] ?? null;
        if (!track) throw new Error('Camera capture returned no video track.');
      }

      const captureId = `cam-${++this.#captureSeq}`;
      this.#captureRegistry.registerCapture(captureId, [track], {
        sourceKey: 'camera',
        replacePrevious: true,
      });
      this.#onLocalCapture?.({ kind: 'camera', captureId, track, stream });

      await this.#unpublishKindIfActive('camera', params.signal);

      const entry = await this.#publishSingleLocalTrack({
        kind: 'camera',
        track,
        captureId,
        rids: [],
        signal: params.signal,
      });
      return { trackId: entry.trackId, mid: entry.mid };
    });
  }

  async stopCamera(): Promise<void> {
    return this.#enqueuePublisherMutation(async () => {
      const entry = this.#published.get('camera');
      await this.#unpublishKindIfActive('camera');
      if (entry?.captureId) {
        this.#captureRegistry.stopCapture(entry.captureId);
      }
    });
  }

  async startScreenShare(params: {
    captureId: string;
    options: ScreenShareOptions;
    signal?: AbortSignal;
    videoTrack?: MediaStreamTrackLike;
    audioTrack?: MediaStreamTrackLike | null;
  }): Promise<PublishedTrackResult> {
    return this.#enqueuePublisherMutation(async () => {
      const pc = this.#assertPublisherReady(params.signal);
      const { captureId, options, signal } = params;

      let videoTrack: MediaStreamTrackLike;
      let audioTrack: MediaStreamTrackLike | null = params.audioTrack ?? null;
      let stream: DisplayMediaStreamLike | undefined;

      if (params.videoTrack) {
        videoTrack = params.videoTrack;
      } else {
        const captured = await createDisplayScreenShareTracks(this.#mediaDevices, {
          captureId,
          width: options.width,
          height: options.height,
          frameRate: options.frameRate,
          captureAudio: options.captureAudio ?? true,
          contentHint: options.contentHint,
          signal,
        });
        videoTrack = captured.videoTrack;
        audioTrack = captured.audioTrack;
        stream = captured.stream;
      }

      this.#captureRegistry.registerCapture(captureId, [videoTrack], {
        sourceKey: 'screen',
        replacePrevious: true,
      });
      if (audioTrack) {
        this.#captureRegistry.registerCapture(`${captureId}:audio`, [audioTrack], {
          sourceKey: 'screenAudio',
          replacePrevious: true,
        });
      }

      applyScreenContentHint(videoTrack, options.contentHint);
      ensureKeepAliveSink(videoTrack, this.#keepAliveDoc);
      this.#onLocalCapture?.({ kind: 'screen', captureId, track: videoTrack, stream });
      if (audioTrack) {
        this.#onLocalCapture?.({
          kind: 'screen-audio',
          captureId,
          track: audioTrack,
          stream,
        });
      }

      // Close previous screen/screen-audio publications if replacing an active share.
      const oldMids: string[] = [];
      const prevScreen = this.#published.get('screen');
      if (prevScreen) oldMids.push(prevScreen.mid);
      const prevAudio = this.#published.get('screen-audio');
      if (prevAudio) oldMids.push(prevAudio.mid);
      if (oldMids.length > 0) {
        await this.#unpublishMids(oldMids, signal);
      }
      this.#screenAudioExplicitlyStarted = false;

      const rids = options.simulcast ? SIMULCAST_RIDS : [];
      const screenTransceiver = this.#addSendTransceiver(
        pc,
        videoTrack,
        options.simulcast ? SIMULCAST_ENCODINGS : undefined,
      );
      const capabilities = this.#getCodecCapabilities?.('video') ?? null;
      prioritizeScreenCodec(screenTransceiver, options.codec ?? 'auto', capabilities);

      const audioTransceiver = audioTrack ? this.#addSendTransceiver(pc, audioTrack) : null;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      assertNotAborted(signal);

      const sdpOffer: SdpDescription = pc.localDescription ?? offer;
      const screenMid = screenTransceiver.mid ?? '0';
      const batchTracks: PublishTrackItem[] = [{ kind: 'screen', mid: screenMid, rids }];
      let audioMid: string | null = null;
      if (audioTrack && audioTransceiver) {
        audioMid = audioTransceiver.mid ?? '1';
        batchTracks.push({ kind: 'screen-audio', mid: audioMid, rids: [] });
      }

      const response = await this.#signaling.request<PublishTracksResponse>(
        'publish-tracks',
        {
          sessionId: this.#publisherSessionId,
          quality: options.quality ?? this.#quality,
          screenBitrate: options.maxBitrateBps,
          sessionDescription: sdpOffer,
          tracks: batchTracks,
        },
        signal,
      );
      this.#publisherSessionId = response.sessionId;
      await pc.setRemoteDescription(response.sessionDescription);

      await enforceScreenShareSenderParameters(screenTransceiver.sender, toSenderTarget(options), {
        track: videoTrack,
      });

      const videoTrackId = trackIdOf(videoTrack, `screen-${captureId}`);
      this.#published.set('screen', {
        kind: 'screen',
        mid: screenMid,
        trackId: videoTrackId,
        captureId,
        track: videoTrack,
        transceiver: screenTransceiver,
        rids,
      });

      if (audioTrack && audioTransceiver && audioMid) {
        this.#published.set('screen-audio', {
          kind: 'screen-audio',
          mid: audioMid,
          trackId: trackIdOf(audioTrack, `screen-audio-${captureId}`),
          captureId,
          track: audioTrack,
          transceiver: audioTransceiver,
          rids: [],
        });
      }

      return { trackId: videoTrackId, mid: screenMid };
    });
  }

  async updateScreenEncoding(params: {
    captureId: string;
    options: ScreenShareOptions;
    signal?: AbortSignal;
  }): Promise<void> {
    return this.#enqueuePublisherMutation(async () => {
      assertNotAborted(params.signal);
      const entry = this.#published.get('screen');
      if (!entry || entry.captureId !== params.captureId) {
        throw new Error('No active screen share publication matches captureId.');
      }
      applyScreenContentHint(entry.track, params.options.contentHint);
      await enforceScreenShareSenderParameters(
        entry.transceiver.sender,
        toSenderTarget(params.options),
        { track: entry.track },
      );
    });
  }

  async republishScreenShare(params: {
    captureId: string;
    options: ScreenShareOptions;
    previousOptions: ScreenShareOptions;
    signal?: AbortSignal;
  }): Promise<PublishedTrackResult> {
    return this.#enqueuePublisherMutation(async () => {
      const pc = this.#assertPublisherReady(params.signal);
      const { captureId, options, signal } = params;

      const existing = this.#published.get('screen');
      let videoTrack: MediaStreamTrackLike | null =
        existing && existing.captureId === captureId && existing.track.readyState !== 'ended'
          ? existing.track
          : (this.#captureRegistry.getTracks(captureId)[0] ?? null);

      if (!videoTrack || videoTrack.readyState === 'ended') {
        const captured = await createDisplayScreenShareTracks(this.#mediaDevices, {
          captureId,
          width: options.width,
          height: options.height,
          frameRate: options.frameRate,
          captureAudio: false,
          contentHint: options.contentHint,
          signal,
        });
        videoTrack = captured.videoTrack;
        this.#captureRegistry.registerCapture(captureId, [videoTrack], {
          sourceKey: 'screen',
          replacePrevious: true,
        });
      }

      if (existing) {
        await this.#unpublishMids([existing.mid], signal);
      }

      applyScreenContentHint(videoTrack, options.contentHint);
      ensureKeepAliveSink(videoTrack, this.#keepAliveDoc);

      const rids = options.simulcast ? SIMULCAST_RIDS : [];
      const transceiver = this.#addSendTransceiver(
        pc,
        videoTrack,
        options.simulcast ? SIMULCAST_ENCODINGS : undefined,
      );
      const capabilities = this.#getCodecCapabilities?.('video') ?? null;
      prioritizeScreenCodec(transceiver, options.codec ?? 'auto', capabilities);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      assertNotAborted(signal);

      const mid = transceiver.mid ?? '0';
      const response = await this.#signaling.request<PublishTracksResponse>(
        'publish-tracks',
        {
          sessionId: this.#publisherSessionId,
          quality: options.quality ?? this.#quality,
          screenBitrate: options.maxBitrateBps,
          sessionDescription: pc.localDescription ?? offer,
          tracks: [{ kind: 'screen', mid, rids }],
        },
        signal,
      );
      this.#publisherSessionId = response.sessionId;
      await pc.setRemoteDescription(response.sessionDescription);

      await enforceScreenShareSenderParameters(transceiver.sender, toSenderTarget(options), {
        track: videoTrack,
      });

      const trackId = trackIdOf(videoTrack, `screen-${captureId}`);
      this.#published.set('screen', {
        kind: 'screen',
        mid,
        trackId,
        captureId,
        track: videoTrack,
        transceiver,
        rids,
      });

      return { trackId, mid };
    });
  }

  async stopScreenShare(params: { captureId: string | null; reason?: string }): Promise<void> {
    return this.#enqueuePublisherMutation(async () => {
      clearKeepAliveSink(this.#keepAliveDoc);

      const screenEntry = this.#published.get('screen');
      const screenAudioEntry = this.#published.get('screen-audio');
      const midsToClose: string[] = [];

      if (screenEntry) {
        midsToClose.push(screenEntry.mid);
      }
      const shouldAlsoCloseAudio =
        Boolean(screenAudioEntry) &&
        !this.#screenAudioExplicitlyStarted &&
        (!params.captureId || screenAudioEntry?.captureId === params.captureId);

      if (shouldAlsoCloseAudio && screenAudioEntry) {
        midsToClose.push(screenAudioEntry.mid);
      }

      if (midsToClose.length > 0) {
        await this.#unpublishMids(midsToClose);
      }

      const captureId = params.captureId ?? screenEntry?.captureId ?? null;
      if (captureId) {
        this.#captureRegistry.stopCapture(captureId);
        if (shouldAlsoCloseAudio) {
          this.#captureRegistry.stopCapture(`${captureId}:audio`);
        }
      }
    });
  }

  async startScreenAudio(params: {
    captureId: string;
    options: ScreenAudioOptions & { track?: MediaStreamTrackLike };
    signal?: AbortSignal;
  }): Promise<PublishedTrackResult> {
    return this.#enqueuePublisherMutation(async () => {
      this.#assertPublisherReady(params.signal);
      this.#screenAudioExplicitlyStarted = true;

      const existing = this.#published.get('screen-audio');
      if (
        existing &&
        existing.captureId === params.captureId &&
        existing.track.readyState !== 'ended'
      ) {
        if (params.options.muted !== undefined) {
          existing.track.enabled = !params.options.muted;
        }
        return { trackId: existing.trackId, mid: existing.mid };
      }

      const track: MediaStreamTrackLike | null =
        params.options.track ??
        (this.#captureRegistry.getTracks(`${params.captureId}:audio`)[0] as
          MediaStreamTrackLike | undefined) ??
        null;
      if (!track || track.readyState === 'ended') {
        throw new Error('No live screen audio track available for captureId.');
      }

      if (params.options.muted !== undefined) {
        track.enabled = !params.options.muted;
      }

      this.#captureRegistry.registerCapture(`${params.captureId}:audio`, [track], {
        sourceKey: 'screenAudio',
        replacePrevious: true,
      });

      const entry = await this.#publishSingleLocalTrack({
        kind: 'screen-audio',
        track,
        captureId: params.captureId,
        rids: [],
        signal: params.signal,
      });
      return { trackId: entry.trackId, mid: entry.mid };
    });
  }

  async stopScreenAudio(params: { captureId: string | null }): Promise<void> {
    return this.#enqueuePublisherMutation(async () => {
      this.#screenAudioExplicitlyStarted = false;
      const entry = this.#published.get('screen-audio');
      await this.#unpublishKindIfActive('screen-audio');
      const captureId = params.captureId ?? entry?.captureId ?? null;
      if (captureId) {
        this.#captureRegistry.stopCapture(`${captureId}:audio`);
      }
    });
  }

  async subscribeTrack(params: {
    participantId: string;
    kind: RemoteTrackKind;
    preferredRid: SfuSimulcastRid | null;
    signal?: AbortSignal;
  }): Promise<void> {
    return this.#enqueueSubscriberMutation(async () => {
      const pc = this.#assertSubscriberReady(params.signal);
      const key = `${params.participantId}:${params.kind}`;
      const existing = this.#subscriptions.get(key);

      if (existing) {
        if (existing.preferredRid === params.preferredRid) {
          return;
        }
        if (params.kind === 'camera' || params.kind === 'screen') {
          await this.#signaling.request(
            'update-subscription',
            {
              sessionId: this.#subscriberSessionId,
              mid: existing.mid,
              preferredRid: params.preferredRid,
            },
            params.signal,
          );
          existing.preferredRid = params.preferredRid;
          return;
        }
      }

      const response = await this.#signaling.request<SubscribeTracksResponse>(
        'subscribe-tracks',
        {
          sessionId: this.#subscriberSessionId,
          quality: this.#quality,
          tracks: [
            {
              publisherId: params.participantId,
              kind: params.kind,
              preferredRid: params.preferredRid,
            },
          ],
        },
        params.signal,
      );

      this.#subscriberSessionId = response.sessionId;
      for (const tr of response.tracks) {
        const entry: RemoteSubscriptionEntry = {
          key: `${tr.publisherId}:${tr.kind}`,
          participantId: tr.publisherId,
          kind: tr.kind,
          mid: tr.mid,
          preferredRid: tr.preferredRid,
        };
        this.#subscriptions.set(entry.key, entry);
        this.#subscriptionsByMid.set(tr.mid, entry);
      }

      await pc.setRemoteDescription(response.sessionDescription);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      assertNotAborted(params.signal);

      await this.#signaling.request(
        'renegotiate',
        {
          sessionId: this.#subscriberSessionId,
          sessionDescription: pc.localDescription ?? answer,
        },
        params.signal,
      );
    });
  }

  async unsubscribeTrack(params: {
    participantId: string;
    kind: RemoteTrackKind;
    signal?: AbortSignal;
  }): Promise<void> {
    return this.#enqueueSubscriberMutation(async () => {
      assertNotAborted(params.signal);
      const key = `${params.participantId}:${params.kind}`;
      const existing = this.#subscriptions.get(key);
      if (!existing) return;

      this.#subscriptions.delete(key);
      this.#subscriptionsByMid.delete(existing.mid);

      if (existing.transceiver) {
        existing.transceiver.direction = 'inactive';
      }

      this.#onRemoteTrackEnded?.({
        participantId: existing.participantId,
        kind: existing.kind,
        mid: existing.mid,
      });

      if (this.#connected && this.#subscriberSessionId) {
        await this.#signaling.request(
          'close-subscription',
          {
            sessionId: this.#subscriberSessionId,
            mid: existing.mid,
            publisherId: existing.participantId,
            kind: existing.kind,
          },
          params.signal,
        );
      }
    });
  }

  #assertPublisherReady(signal?: AbortSignal): PeerConnectionLike {
    assertNotAborted(signal);
    if (!this.#connected || !this.#publisherPc || !this.#publisherSessionId) {
      throw new Error('Publisher SFU session is not connected.');
    }
    return this.#publisherPc;
  }

  #assertSubscriberReady(signal?: AbortSignal): PeerConnectionLike {
    assertNotAborted(signal);
    if (!this.#connected || !this.#subscriberPc || !this.#subscriberSessionId) {
      throw new Error('Subscriber SFU session is not connected.');
    }
    return this.#subscriberPc;
  }

  #enqueuePublisherMutation<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.#publisherQueue.then(fn, fn);
    this.#publisherQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  #enqueueSubscriberMutation<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.#subscriberQueue.then(fn, fn);
    this.#subscriberQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  #addSendTransceiver(
    pc: PeerConnectionLike,
    track: MediaStreamTrackLike,
    sendEncodings?: Array<Record<string, unknown>>,
  ): RtpTransceiverLike {
    if (typeof pc.addTransceiver === 'function') {
      return pc.addTransceiver(track, {
        direction: 'sendonly',
        sendEncodings,
      });
    }
    if (typeof pc.addTrack === 'function') {
      const sender = pc.addTrack(track);
      const matched = pc.getTransceivers?.().find((tr) => tr.sender === sender);
      if (matched) return matched;
      return {
        mid: null,
        direction: 'sendonly',
        sender,
      };
    }
    throw new Error('PeerConnection supports neither addTransceiver nor addTrack.');
  }

  async #publishSingleLocalTrack(params: {
    kind: SfuMediaKind;
    track: MediaStreamTrackLike;
    captureId: string | null;
    rids: SfuSimulcastRid[];
    signal?: AbortSignal;
  }): Promise<PublishedLocalEntry> {
    const pc = this.#assertPublisherReady(params.signal);
    const transceiver = this.#addSendTransceiver(pc, params.track);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    assertNotAborted(params.signal);

    const mid = transceiver.mid ?? '0';
    const response = await this.#signaling.request<PublishTracksResponse>(
      'publish-tracks',
      {
        sessionId: this.#publisherSessionId,
        quality: this.#quality,
        sessionDescription: pc.localDescription ?? offer,
        tracks: [{ kind: params.kind, mid, rids: params.rids }],
      },
      params.signal,
    );

    this.#publisherSessionId = response.sessionId;
    await pc.setRemoteDescription(response.sessionDescription);

    const trackId = trackIdOf(params.track, `${params.kind}-${mid}`);
    const entry: PublishedLocalEntry = {
      kind: params.kind,
      mid,
      trackId,
      captureId: params.captureId,
      track: params.track,
      transceiver,
      rids: params.rids,
    };
    this.#published.set(params.kind, entry);
    return entry;
  }

  async #unpublishKindIfActive(kind: SfuMediaKind, signal?: AbortSignal): Promise<void> {
    const entry = this.#published.get(kind);
    if (!entry) return;
    await this.#unpublishMids([entry.mid], signal);
  }

  async #unpublishMids(mids: string[], signal?: AbortSignal): Promise<void> {
    if (mids.length === 0) return;
    const midSet = new Set(mids);

    for (const [kind, entry] of this.#published) {
      if (!midSet.has(entry.mid)) continue;
      this.#published.delete(kind);
      entry.transceiver.direction = 'inactive';
      try {
        await entry.transceiver.sender.replaceTrack(null);
      } catch {
        // Ignore replaceTrack failures on closing transceivers.
      }
    }

    if (this.#connected && this.#publisherSessionId) {
      await this.#signaling.request(
        'unpublish-tracks',
        {
          sessionId: this.#publisherSessionId,
          mids,
        },
        signal,
      );
    }
  }

  async #teardownConnections(notifyServer: boolean): Promise<void> {
    const wasConnected = this.#connected;
    this.#connected = false;
    this.#screenAudioExplicitlyStarted = false;

    clearKeepAliveSink(this.#keepAliveDoc);
    this.#captureRegistry.stopAll();

    for (const entry of this.#published.values()) {
      try {
        await entry.transceiver.sender.replaceTrack(null);
      } catch {
        // Ignore teardown replaceTrack errors.
      }
    }
    this.#published.clear();

    for (const sub of this.#subscriptions.values()) {
      this.#onRemoteTrackEnded?.({
        participantId: sub.participantId,
        kind: sub.kind,
        mid: sub.mid,
      });
    }
    this.#subscriptions.clear();
    this.#subscriptionsByMid.clear();

    try {
      this.#publisherPc?.close();
    } catch {
      // Ignore peer connection close errors.
    }
    try {
      this.#subscriberPc?.close();
    } catch {
      // Ignore peer connection close errors.
    }

    const hadSession = Boolean(this.#publisherSessionId || this.#subscriberSessionId);
    this.#publisherPc = null;
    this.#subscriberPc = null;
    this.#publisherSessionId = null;
    this.#subscriberSessionId = null;

    if (notifyServer && wasConnected && hadSession) {
      await this.#signaling.request('close-session', {}).catch(() => undefined);
    }
  }
}
