import type { SettingsController, SettingsTopic } from './controller';

export interface SettingsRuntime {
  TronoStorage?: Storage;
  TronoDesktop?: {
    getMediaPermissions(): Promise<string[]>;
    resetMediaPermissions(): Promise<unknown>;
  };
  TronoAuth: {
    user: { nickname: string; email: string } | null;
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
