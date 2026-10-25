'use client';
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
import type { GameLibrary } from '../../lib/games/library';
import type { CallToolbar } from '../../lib/voice/toolbar';
import type { CallNavigation } from '../../lib/voice/navigation';
import type { SettingsController } from '../../lib/settings/controller';
import type { VoiceSettings } from '../../lib/voice/settings';
import type { AudioPreferences } from '../../lib/voice/audio-preferences';
import type { ConnectionDiagnostics } from '../../lib/voice/connection-diagnostics';
import type { CallStage } from '../../lib/voice/stage';
import type { VoiceRuntime } from '../../lib/voice/runtime';

export type ApplicationServices = Window & {
  TronoAuth: Pick<AccountSession, 'getSnapshot' | 'subscribe' | 'ready' | 'logout' | 'endGuest'> & {
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
  TronoCallSettings: SettingsController;
  TronoVoiceSettings: VoiceSettings;
  TronoAudioPreferences: AudioPreferences;
  TronoConnectionDiagnostics: ConnectionDiagnostics;
  TronoCallStage: CallStage;
  TronoCallToolbar: CallToolbar;
  TronoCallNavigation: CallNavigation;
  TronoSocial: VoiceRuntime;
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
