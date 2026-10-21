'use client';
import { throneRules } from '../lib/games/throne-rules';
import { initializeCourtFullscreen } from '../components/games/court-fullscreen-runtime';
import { initializeTabletopAudio } from '../components/games/tabletop-audio-runtime';
import { initializeThroneNavigation } from '../components/games/throne-navigation-runtime';
import { initializeCommunityNavigation } from '../components/navigation/community-navigation-runtime';

import { initializeVoiceRuntime } from '../lib/voice/runtime';
import { initializeApplicationAudio } from '../lib/voice/application-audio-runtime';
import { initializeDesktopCapture } from '../components/desktop/capture-runtime';
import { initializeNoiseProcessors } from '../lib/voice/noise-runtime';
import { initializeAudio } from '../components/audio/runtime';
import { initializeSoundboard } from '../components/soundboard/runtime';
import { initializeAuth } from '../components/auth/runtime';
import { initializeCallControlLayout } from '../lib/voice/control-layout';
import { initializeClipStore } from '../lib/clips/browser';
import { initializeClipLibraryView } from '../components/clips/library-runtime';
import { initializeClipPreferencesView } from '../components/clips/preferences-runtime';
import { initializeClips } from '../components/clips/runtime';
import { initializeClipDesktop } from '../components/clips/desktop-runtime';
import { initializeRecorder } from '../components/recording/runtime';
import { initializePersonalPreferences } from '../lib/preferences/browser';
import { initializeNotifications } from '../lib/notifications/browser';
import { initializeDesktopActivity } from '../lib/desktop/activity-runtime';
import { initializeFileLibrary } from '../components/files/library-runtime';
import { initializeProfileViewer } from '../components/profiles/viewer-runtime';
import { initializeProfileEditor } from '../components/profiles/editor-runtime';
import { initializeDesktopShell } from '../components/desktop/shell-runtime';
import { initializePortal } from '../components/navigation/portal-runtime';
import { initializeAppLayout } from '../components/navigation/app-layout-runtime';
import { initializeAppearance } from '../components/profiles/appearance-runtime';
import { initializeCallWorkspace } from '../components/navigation/workspace-runtime';
import { initializeMediaLayout } from '../lib/voice/media-layout';
import { initializeHandLayout } from '../lib/games/hand-layout';
import { initializeCommunity } from '../components/channels/community-runtime';
import { initializeChannelManagement } from '../components/channels/management-runtime';
import { initializeMessenger } from '../components/messenger/runtime';
import { initializeGameLibrary } from '../components/games/library-runtime';
import { initializeAzul } from '../components/games/azul-runtime';
import { initializeSplendor } from '../components/games/splendor-runtime';
import { initializeLoveLetter } from '../components/games/love-letter-runtime';
import { initializeRoguelite } from '../components/games/roguelite-runtime';

import { useEffect, useState } from 'react';
import {
  initializeCallSettings,
  prepareCallSettings,
} from '../components/modals/call-settings-runtime';
import { initializeNetwork } from '../lib/socket/browser';
import { initializeChatComposer, initializeChatMessages } from '../lib/chat/browser';
import { initializeChannels } from '../lib/channels/browser';
import { initializeFiles } from '../lib/files/browser';
import { initializeThroneHistory } from '../components/games/throne-history-runtime';
import { initializeThroneEffects } from '../components/games/throne-effects-runtime';
import { initializeThroneEvents } from '../components/games/throne-events-runtime';
import { initializeThronePrivate } from '../components/games/throne-private-runtime';
import { initializeThroneTable } from '../components/games/throne-table-runtime';
import { initializeThroneSeats } from '../components/games/throne-seats-runtime';
import { initializeThroneMatch } from '../components/games/throne-match-runtime';
import { initializeThroneHand } from '../components/games/throne-hand-runtime';
import { initializeThroneChoices } from '../components/games/throne-choices-runtime';
import { initializeThroneLocal } from '../components/games/throne-local-runtime';
import { initializeThroneControls } from '../components/games/throne-controls-runtime';
import { initializeThroneLobby } from '../components/games/throne-lobby-runtime';
import { initializeConnectionDiagnostics } from '../components/voice/diagnostics-runtime';
import { initializeMediaDialogs } from '../components/modals/media-dialogs-runtime';
import { initializeCallToolbar } from '../components/voice/call-toolbar-runtime';
import { initializeCallNavigation } from '../components/navigation/call-navigation-runtime';
import { initializeCallStage } from '../components/voice/call-stage-runtime';

let startup: Promise<void> | undefined;

/**
 * Compose page-scoped owners after hydration, then bind them once in dependency order.
 * Movable hosts preserve their React roots, controls and borrowed media resources.
 */
export function ApplicationRuntime() {
  const [error, setError] = useState<string>();

  useEffect(() => {
    // Leave React's effect commit before any domain root uses flushSync.
    startup ??= Promise.resolve().then(() => {
      initializeAudio(window);
      initializePersonalPreferences(window);
      initializeNetwork(window);
      initializeFiles(window);
      initializeProfileViewer(window);
      initializeFileLibrary(window);
      initializeChatComposer(window);
      initializeChatMessages(window);
      initializeChannels(window);
      initializeClipStore(window);
      initializeClipLibraryView(window);
      initializeClipPreferencesView(window);
      initializeApplicationAudio(window);
      initializeDesktopCapture(window);
      initializeAuth(window);
      initializePortal(window);
      initializeProfileEditor(window);
      initializeNoiseProcessors(window);
      initializeVoiceRuntime(window);
      initializeRecorder(window);
      initializeClips(window);
      initializeClipDesktop(window);
      Object.assign(window, { TronoRules: throneRules });
      initializeThroneLobby(window);
      initializeThroneMatch(window);
      initializeThroneControls(window);
      initializeThroneSeats(window);
      initializeThroneTable(window);
      initializeThronePrivate(window);
      initializeThroneHistory(window);
      initializeThroneEffects(window);
      initializeThroneEvents(window);
      initializeThroneChoices(window);
      initializeThroneHand(window);
      initializeThroneLocal(window);
      initializeThroneNavigation(window);
      initializeCommunityNavigation(window);
      initializeCommunity(window);
      initializeChannelManagement(window);
      initializeSoundboard(window);
      initializeAppearance(window);
      // Capture homes before shell/layout move the same controls. Settings bind
      // after profile/game hosts exist and before activity/notification slots.
      initializeCallControlLayout(window);
      initializeDesktopShell(window);
      initializeCourtFullscreen(window);
      window.addEventListener(
        'trono:ready',
        () => {
          initializeCallSettings(window);
          initializeConnectionDiagnostics(window);
        },
        { once: true },
      );
      initializeAppLayout(window);
      initializeDesktopActivity(window);
      initializeNotifications(window);
      initializeAzul(window);
      initializeSplendor(window);
      initializeLoveLetter(window);
      initializeTabletopAudio(window);
      initializeRoguelite(window);
      initializeGameLibrary(window);
      initializeMessenger(window);
      prepareCallSettings(window);
      initializeCallToolbar(window);
      initializeCallNavigation(window);
      initializeCallWorkspace(window);
      window.dispatchEvent(new Event('trono:ready'));
      initializeCallStage(window);
      initializeMediaDialogs(window);
      initializeMediaLayout(window);
      if ((window as Window & { TronoDesktop?: object }).TronoDesktop) initializeHandLayout(window);
    });
    void startup.catch((cause: unknown) => {
      console.error('[Application startup]', cause);
      setError(cause instanceof Error ? cause.message : 'Falha ao iniciar a interface.');
    });
  }, []);

  return error ? (
    <p className="application-load-error" role="alert">
      {error} Recarregue o aplicativo.
    </p>
  ) : null;
}
