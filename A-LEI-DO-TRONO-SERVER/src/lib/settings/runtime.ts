import type { ConnectionDiagnostics } from '../voice/connection-diagnostics';
import type { AudioPreferences } from '../voice/audio-preferences';
import type { VoiceSettings } from '../voice/settings';
import type { SettingsController, SettingsTopic } from './controller';
import type { NotificationsController } from '../notifications/controller';
import type { DesktopActivityController } from '../desktop/activity';

export interface SettingsRuntime {
  TronoNotifications: NotificationsController;
  TronoDesktopActivity?: DesktopActivityController;
  TronoConnectionDiagnostics: ConnectionDiagnostics;
  TronoVoiceSettings: VoiceSettings;
  TronoAudioPreferences: AudioPreferences;
  TronoStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  TronoDesktop?: {
    getMediaPermissions(): Promise<string[]>;
    resetMediaPermissions(): Promise<unknown>;
  };
  TronoAuth: {
    user: { id: string; nickname: string; email: string } | null;
    guest?: { id: string } | null;
    remembered: boolean;
    rememberError?: string;
    ready: Promise<unknown>;
    setRemember(value: boolean): Promise<unknown>;
    open(mode: string): void;
  };
  TronoProfile: { open(options: { inline: true }): Promise<unknown> };
  TronoSocial: { voiceJoined: boolean; leaveVoice(): Promise<unknown> };
  TronoCallSettings?: SettingsController;
  TronoDesktopSettings?: Pick<SettingsController, 'open' | 'close' | 'toggle'>;
}
export type Contents = Partial<Record<SettingsTopic, DocumentFragment>>;
