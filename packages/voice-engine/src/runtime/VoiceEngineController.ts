import type { SfuQualityPreset, SfuSimulcastRid } from '@trono/protocol';
import type { SnapshotListener, VoiceEngineDriver, VoiceEngineHostPorts } from '../ports/index.ts';
import type { VoiceEngineEvent } from '../protocol/events.ts';
import type {
  CameraOptions,
  MicrophoneOptions,
  RemoteTrackKind,
  ScreenAudioOptions,
  ScreenShareOptions,
  VoiceEngineSnapshot,
} from '../protocol/types.ts';
import { VoiceEngineRuntime } from './VoiceEngineRuntime.ts';

function isVoiceEngineDriver(
  value: VoiceEngineDriver | VoiceEngineHostPorts,
): value is VoiceEngineDriver {
  return (
    typeof (value as VoiceEngineDriver).dispatch === 'function' &&
    typeof (value as VoiceEngineDriver).getSnapshot === 'function'
  );
}

/**
 * Ergonomic facade over VoiceEngineRuntime / VoiceEngineDriver for UI and host layers.
 */
export class VoiceEngineController {
  #driver: VoiceEngineDriver;
  #captureSeq = 0;

  constructor(driverOrPorts: VoiceEngineDriver | VoiceEngineHostPorts) {
    this.#driver = isVoiceEngineDriver(driverOrPorts)
      ? driverOrPorts
      : new VoiceEngineRuntime(driverOrPorts);
  }

  getSnapshot(): VoiceEngineSnapshot {
    return this.#driver.getSnapshot();
  }

  subscribe(listener: SnapshotListener): () => void {
    return this.#driver.subscribe(listener);
  }

  dispatch(event: VoiceEngineEvent): Promise<void> {
    return this.#driver.dispatch(event);
  }

  dispose(): void {
    this.#driver.dispose();
  }

  connect(input: {
    roomId: string;
    participantId: string;
    quality?: SfuQualityPreset;
    token?: string;
    sfuUrl?: string;
  }): Promise<void> {
    return this.#driver.dispatch({
      type: 'connection/connectRequested',
      roomId: input.roomId,
      participantId: input.participantId,
      quality: input.quality,
      token: input.token,
      sfuUrl: input.sfuUrl,
    });
  }

  disconnect(reason?: string): Promise<void> {
    return this.#driver.dispatch({
      type: 'connection/disconnectRequested',
      reason,
    });
  }

  startMicrophone(options?: MicrophoneOptions): Promise<void> {
    return this.#driver.dispatch({
      type: 'microphone/startRequested',
      options,
    });
  }

  setMicrophoneMuted(muted: boolean): Promise<void> {
    return this.#driver.dispatch({
      type: 'microphone/muteChanged',
      muted,
    });
  }

  stopMicrophone(): Promise<void> {
    return this.#driver.dispatch({
      type: 'microphone/stopRequested',
    });
  }

  startCamera(options?: CameraOptions): Promise<void> {
    return this.#driver.dispatch({
      type: 'camera/startRequested',
      options,
    });
  }

  stopCamera(): Promise<void> {
    return this.#driver.dispatch({
      type: 'camera/stopRequested',
    });
  }

  startScreenShare(input: ScreenShareOptions & { captureId?: string } = {}): Promise<void> {
    const { captureId, ...options } = input;
    const resolvedCaptureId = captureId ?? `screen-${++this.#captureSeq}`;
    return this.#driver.dispatch({
      type: 'screen/startRequested',
      captureId: resolvedCaptureId,
      options,
    });
  }

  updateScreenEncoding(
    input:
      { captureId?: string; options: ScreenShareOptions; force?: boolean } | ScreenShareOptions,
  ): Promise<void> {
    const normalized =
      'options' in input && input.options !== undefined
        ? input
        : { options: input as ScreenShareOptions };
    return this.#driver.dispatch({
      type: 'screen/encodingUpdateRequested',
      captureId: normalized.captureId,
      options: normalized.options,
      force: 'force' in normalized ? normalized.force : undefined,
    });
  }

  stopScreenShare(reason?: string): Promise<void> {
    return this.#driver.dispatch({
      type: 'screen/stopRequested',
      reason,
    });
  }

  startScreenAudio(input: ScreenAudioOptions & { captureId?: string } = {}): Promise<void> {
    const { captureId, ...options } = input;
    const resolvedCaptureId =
      captureId ?? this.getSnapshot().screen.captureId ?? `screen-audio-${++this.#captureSeq}`;
    return this.#driver.dispatch({
      type: 'screenAudio/startRequested',
      captureId: resolvedCaptureId,
      options,
    });
  }

  stopScreenAudio(): Promise<void> {
    return this.#driver.dispatch({
      type: 'screenAudio/stopRequested',
    });
  }

  setRemoteTrackSubscription(input: {
    participantId: string;
    kind: RemoteTrackKind;
    subscribed: boolean;
    preferredRid?: SfuSimulcastRid | null;
  }): Promise<void> {
    return this.#driver.dispatch({
      type: 'subscription/setRequested',
      participantId: input.participantId,
      kind: input.kind,
      subscribed: input.subscribed,
      preferredRid: input.preferredRid,
    });
  }
}
