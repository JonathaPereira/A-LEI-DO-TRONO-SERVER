'use client';
import { throneRules } from '../lib/games/throne-rules';
import { initializeCourtFullscreen } from '../components/games/court-fullscreen-runtime';
import { initializeTabletopAudio } from '../components/games/tabletop-audio-runtime';
import { initializeThroneNavigation } from '../components/games/throne-navigation-runtime';
import { initializeCommunityNavigation } from '../components/navigation/community-navigation-runtime';

import { initializeVoiceRuntime } from '../lib/voice/runtime';
import { initializeClipStore } from '../lib/clips/browser';
import { initializeClipLibraryView } from '../components/clips/library-runtime';
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
import manifest from './manifest.json';
import {
  initializeCallSettings,
  prepareCallSettings,
} from '../components/modals/call-settings-runtime';
import { initializeNetwork } from '../lib/socket/browser';
import { initializeChatComposer, initializeChatMessages } from '../lib/chat/browser';
import { initializeChannels } from '../lib/channels/browser';
import { initializeFiles } from '../lib/files/browser';
import { installLegacyAttachments } from '../components/files/legacy-attachments';
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

function loadScript(filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/' + filename;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Não foi possível carregar ${filename}.`));
    document.head.append(script);
  });
}

/**
 * Temporary adapter for the DOM controllers. React hydrates the screens first;
 * controllers then own their existing nodes until the next full navigation.
 * Do not put React state inside a subtree that a controller moves or rewrites.
 */
export function LegacyRuntime() {
  const [error, setError] = useState<string>();

  useEffect(() => {
    startup ??= (async () => {
      initializeNetwork(window);
      initializeFiles(window);
      initializeProfileViewer(window);
      initializeFileLibrary(window);
      installLegacyAttachments(window);
      initializeChatComposer(window);
      initializeChatMessages(window);
      initializeChannels(window);
      initializeClipStore(window);
      initializeClipLibraryView(window);
      for (const filename of manifest.scripts) {
        if (filename === 'soundboard-client.js') {
          initializeCommunity(window);
          initializeChannelManagement(window);
        }
        if (filename !== 'auth-boot.js') await loadScript(filename);
        if (filename === 'bot-names.js') {
          Object.assign(window, {
            TronoRules: throneRules,
          });
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
        }
        if (filename === 'auth.js') {
          initializePortal(window);
          initializeProfileEditor(window);
        }
        if (filename === 'personal-prefs.js') initializeVoiceRuntime(window);
        if (filename === 'soundboard-client.js') initializeAppearance(window);
        // Profile hosts and remaining game bodies exist before settings mount;
        // activity/notifications then bind to the mounted slots, matching their boot order.
        if (filename === 'call-controls-layout.js') {
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
        }
      }
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
    })();
    void startup.catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Falha ao iniciar a interface.');
    });
  }, []);

  return error ? (
    <p className="application-load-error" role="alert">
      {error} Recarregue o aplicativo.
    </p>
  ) : null;
}
