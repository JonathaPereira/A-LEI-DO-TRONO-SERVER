import type { ChatActivity } from '../../types/chat';
import type { CallNavigationSnapshot } from '../../types/call-navigation';
import type { NoiseEngine, VoiceNoiseState } from '../../types/voice-controls';
import type { ScreenFormat } from '../../types/voice';
import type { VoiceNotice } from '../../types/voice-roster';
import type { NetworkClient } from '../socket/client';
import type { ChatMessagesController } from '../chat/messages';
import type { SettingsController } from '../settings/controller';
import type { createMicrophoneProcessor } from './microphone-processor';
import type { createScreenCapture } from './screen-capture';
import type { createRealtimeConfiguration } from './realtime';
import type { createVoiceTelemetry } from './telemetry';
import type { createSpeakingIndicators } from './speaking-indicators';
import type { createAudioPlayback } from './audio-playback';
import type { createCallAudio } from './call-audio';
import type { createVoiceCall } from './call-lifecycle';
import type { createScreenSharing } from './screen-sharing';
import type { createVoiceTransport } from './transport';
import type { createCallQuality } from './quality';
import type { AudioPreferences, createAudioPreferences } from './audio-preferences';
import type { VoiceSettings } from './settings';
import type { ConnectionDiagnostics, createConnectionDiagnostics } from './connection-diagnostics';
import type { CallNavigation } from './navigation';
import type { CallStage } from './stage';
import type { CallToolbar } from './toolbar';
import type { Mosaic, MosaicPerson } from './mosaic';
import type { ScreenOptionsClient } from './screen-options';

type ProcessorDependencies = Parameters<typeof createMicrophoneProcessor>[2];
type CaptureOptions = Parameters<typeof createScreenCapture>[0];
type TelemetryOptions = Parameters<typeof createVoiceTelemetry>[0];
type AudioOptions = Parameters<typeof createAudioPreferences>[0];
type TelemetrySnapshot = ReturnType<ReturnType<typeof createVoiceTelemetry>['getSnapshot']>;
type MeterSnapshot = ReturnType<ReturnType<typeof createSpeakingIndicators>['getSnapshot']>;
type Sharing = ReturnType<typeof createScreenSharing>;
type Call = ReturnType<typeof createVoiceCall>;

/** Inputs consumed by the call composition, not a declaration of the entire Window. */
export interface VoiceRuntimePorts {
  TronoNetwork: NetworkClient;
  TronoStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  TronoAuth: { readonly user: { readonly id: string } | null };
  TronoPersonal?: {
    get(key: string, fallback: unknown): unknown;
    set(key: string, value: unknown): void;
  };
  TronoNoise: {
    supported(context: AudioContext | null): boolean;
    create(
      context: Parameters<ProcessorDependencies['createNoise']>[0],
      options: { onFailure: Parameters<ProcessorDependencies['createNoise']>[1] },
    ): ReturnType<ProcessorDependencies['createNoise']>;
  };
  TronoClips?: {
    captureProfile(): ReturnType<CaptureOptions['getSettings']>['replay'];
    sharedStarted(source: Parameters<CaptureOptions['onSourceStarted']>[0]): Promise<void>;
    sharedStopped(source: Parameters<CaptureOptions['onSourceStopped']>[0]): void;
  };
  TronoAudio: ReturnType<AudioOptions['audio']>;
  TRONO_MUSIC_TRACKS: ReturnType<AudioOptions['tracks']>;
  TRONO_RTC_CONFIG?: Parameters<typeof createRealtimeConfiguration>[0]['baseIce'];
  TronoDesktop?: {
    readonly version?: string;
    getResources?: TelemetryOptions['getResources'];
    setVoiceProtection?: TelemetryOptions['setVoiceProtection'];
    copyDiagnostics?: Parameters<typeof createConnectionDiagnostics>[0]['copy'];
  };
  TronoCommunity?: {
    voiceNotice(
      event: Pick<VoiceNotice, 'id' | 'kind' | 'name'> & { readonly text?: string },
    ): void;
  };
  TronoChatMessages: Pick<ChatMessagesController, 'clear'>;
  TronoCallSettings: SettingsController;
  TronoMosaic?: Pick<Mosaic, 'open' | 'close'>;
  TronoScreenOptions: ScreenOptionsClient;
  TronoVoiceSettings: VoiceSettings;
  TronoAudioPreferences: AudioPreferences;
  TronoConnectionDiagnostics: ConnectionDiagnostics;
  TronoCallToolbar: CallToolbar;
  TronoCallStage: CallStage;
  TronoCallNavigation: CallNavigation;
  TronoSocial: SocialFacade;
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}
export type VoiceRuntimeWindow = Window & VoiceRuntimePorts;

/** Compatibility surface for controllers still awaiting conversion. State stays with typed owners. */
export interface SocialFacade {
  onChatActivity(activity: ChatActivity): void;
  diagnostics(): string;
  showPanel(show?: boolean): void;
  showForRoom(show?: boolean): void;
  consumeRoom(room: unknown): void;
  consumeChatRoom(room: unknown): void;
  readonly chatRoomState: CallNavigationSnapshot['textRoom'];
  joinVoice: Call['toggle'];
  leaveVoice: Call['leave'];
  renderVideoGrid(): void;
  renderScreenGrid(): void;
  renderSeatMedia(): void;
  setChatHubMode(active: boolean): void;
  clearChannelChat(): void;
  toggleTextChat(force?: boolean): void;
  toggleTelemetry(force?: boolean): void;
  toggleVoiceSettings(force?: boolean): void;
  setSettingsTab(tab?: string): void;
  startScreenShare: Sharing['start'];
  stopScreenShare: Sharing['stop'];
  switchScreenShare: Sharing['switchSource'];
  openScreenOptions(): void;
  readonly voiceJoined: boolean;
  readonly voiceJoining: boolean;
  readonly voiceRoom: CallNavigationSnapshot['voiceRoom'];
  readonly cameraOn: boolean;
  readonly screenSharing: boolean;
  readonly voiceLightMode: boolean;
  readonly noiseSuppression: boolean;
  readonly noiseMode: NoiseEngine;
  readonly noiseState: VoiceNoiseState;
  readonly transmissionQuality: ReturnType<
    ReturnType<typeof createCallQuality>['getSnapshot']
  >['preferences']['transmissionQuality'];
  readonly panelMode: 'floating';
  readonly mediaTransport: ReturnType<
    ReturnType<typeof createVoiceTransport>['getSnapshot']
  >['mode'];
  readonly realtimeStatus: ReturnType<
    ReturnType<typeof createRealtimeConfiguration>['getSnapshot']
  >['status'];
  readonly telemetry: TelemetrySnapshot['telemetry'];
  readonly voiceReception: {
    readonly enabled: boolean;
    readonly rows: TelemetrySnapshot['rows'];
    readonly background: boolean;
    readonly meterMode: MeterSnapshot['mode'];
    readonly metersRunning: MeterSnapshot['running'];
    readonly playbackContext: ReturnType<
      ReturnType<typeof createAudioPlayback>['getSnapshot']
    >['context'];
    readonly microphoneContext: ReturnType<
      ReturnType<typeof createCallAudio>['getSnapshot']
    >['context'];
    readonly priority: NonNullable<TelemetrySnapshot['priority']>['status'] | undefined;
  };
  getLocalDisplayStream(): MediaStream | null | undefined;
  getLocalAudioTrack(): MediaStreamTrack | null;
  readonly screenSettings: ScreenFormat & { readonly bitrate: number; readonly audio: boolean };
  readonly deafened: boolean;
  toggleWatchStream(id: string): Promise<void>;
  toggleWatchCamera(id: string): Promise<void>;
  fullscreenMedia(peerId: string, kind?: 'screen' | 'camera'): Promise<void> | undefined;
  getMediaSources(): readonly MosaicPerson[];
}
