'use client';
import type { DesktopUpdates } from '../../lib/desktop/updates';
import { useSyncExternalStore } from 'react';
import type { AccountSession, SessionSnapshot } from '../../lib/auth/session';
import type { AuthForms } from '../../lib/auth/forms';
import type { NetworkClient } from '../../lib/socket/client';
import type { Portal } from '../../lib/navigation/portal';
import type { ChannelsController } from '../../lib/channels/catalog';
import type { CommunityController } from '../../lib/community/controller';
import type { CommunityNavigation } from '../../lib/navigation/community-navigation';
import type { ChatComposerController } from '../../lib/chat/composer';
import type { ChatMessagesController } from '../../lib/chat/messages';
import type { Messenger } from '../../lib/messenger/controller';
import type { Atalaia } from '../../lib/games/atalaia';
import type { GameLibrary } from '../../lib/games/library';
import type { CallToolbar } from '../../lib/voice/toolbar';
import type { CallNavigation } from '../../lib/voice/navigation';
import type { SettingsController } from '../../lib/settings/controller';
import type { VoiceSettings } from '../../lib/voice/settings';
import type { AudioPreferences } from '../../lib/voice/audio-preferences';
import type { ConnectionDiagnostics } from '../../lib/voice/connection-diagnostics';
import type { CallStage } from '../../lib/voice/stage';
import type { DesktopActivityController } from '../../lib/desktop/activity';
import type { NotificationsController } from '../../lib/notifications/controller';
import type { ProfileEditor } from '../../lib/profiles/editor';
import type { ProfileViewer } from '../../lib/profiles/viewer';
import type { GifPicker } from '../../lib/profiles/gif-picker';
import type { RegisteredAccounts } from '../../lib/profiles/registered-accounts';
import type { AppearancePreferences } from '../../lib/profiles/appearance';
import type { FileLibrary } from '../../lib/files/library';
import type { AudioPlayer } from '../../lib/audio/player';
import type { ChannelManagement } from '../../lib/channels/management';
import type { ChannelFiles } from '../../lib/channels/files';
import type { VoiceRuntime } from '../../lib/voice/runtime';

export type ApplicationServices = Window & {
  TronoAuth: Pick<
    AccountSession,
    'getSnapshot' | 'subscribe' | 'ready' | 'logout' | 'endGuest' | 'setRemember'
  > & {
    forms: AuthForms;
    readonly user: SessionSnapshot['user'];
    readonly guest: SessionSnapshot['guest'];
    open(mode: 'login'): void;
    openGuest(): void;
  };
  TronoNetwork: NetworkClient;
  TronoPortal: Portal;
  TronoChannels: ChannelsController;
  TronoCommunity: CommunityController;
  TronoCommunityNavigation: CommunityNavigation;
  TronoChatComposer: ChatComposerController;
  TronoChatMessages: ChatMessagesController;
  TronoDirectMessages: Messenger;
  TronoGameLibrary: GameLibrary;
  TronoAtalaia: Atalaia;
  TronoCallSettings: SettingsController;
  TronoVoiceSettings: VoiceSettings;
  TronoAudioPreferences: AudioPreferences;
  TronoConnectionDiagnostics: ConnectionDiagnostics;
  TronoCallStage: CallStage;
  TronoCallToolbar: CallToolbar;
  TronoCallNavigation: CallNavigation;
  TronoSocial: VoiceRuntime;
  TronoProfileEditor: ProfileEditor;
  TronoProfileViewer: ProfileViewer;
  TronoProfileGifs: GifPicker;
  TronoRegisteredAccounts: RegisteredAccounts;
  TronoAppearance: AppearancePreferences;
  TronoFileLibrary: FileLibrary;
  TronoAudio: AudioPlayer;
  TronoChannelManagement: ChannelManagement;
  TronoChannelFiles: ChannelFiles;
  TronoDesktopActivity?: DesktopActivityController;
  TronoDesktopUpdates?: DesktopUpdates;
  TronoNotifications: NotificationsController;
  TronoChatHub: { switchChannel(id: string, options?: { connectVoice?: boolean }): Promise<void> };
  TronoMessenger: { joinChannel(id: string, options?: { showText?: boolean }): Promise<void> };
  TronoDesktop?: {
    readonly version?: string;
    getMediaPermissions?(): Promise<string[]>;
    resetMediaPermissions?(): Promise<unknown>;
  };
};
let current: ApplicationServices | null = null;
const listeners = new Set<() => void>();
export function publishServices(target: Window) {
  current = target as ApplicationServices;
  for (const listener of listeners) listener();
}
export function useServices() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => current,
    () => null,
  );
}
export function useModel<T>(model: { subscribe(fn: () => void): () => void; getSnapshot(): T }) {
  return useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
}
