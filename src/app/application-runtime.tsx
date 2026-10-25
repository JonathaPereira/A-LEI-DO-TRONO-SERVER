'use client';
import { useEffect, useState } from 'react';
import { publishServices } from '../components/application/services';
import { throneRules } from '../lib/games/throne-rules';
import { initializeAudio } from '../components/audio/runtime';
import { initializePersonalPreferences } from '../lib/preferences/browser';
import { initializeNetwork } from '../lib/socket/browser';
import { initializeFiles } from '../lib/files/browser';
import { initializeChatComposer, initializeChatMessages } from '../lib/chat/browser';
import { initializeChannels } from '../lib/channels/browser';
import { initializeProfileViewer } from '../components/profiles/viewer-runtime';
import { initializeAuth } from '../components/auth/runtime';
import { initializeCommunity } from '../components/channels/community-runtime';
import { initializePortal } from '../components/navigation/portal-runtime';
import { initializeNoiseProcessors } from '../lib/voice/noise-runtime';
import { initializeVoiceRuntime } from '../lib/voice/runtime';
import { initializeApplicationAudio } from '../lib/voice/application-audio-runtime';
import { initializeDesktopCapture } from '../components/desktop/capture-runtime';
import { initializeCommunityNavigation } from '../components/navigation/community-navigation-runtime';
import { initializeNotifications } from '../lib/notifications/browser';
import { initializeMessenger } from '../components/messenger/runtime';
import { initializeThroneLobby } from '../components/games/throne-lobby-runtime';
import { initializeThroneMatch } from '../components/games/throne-match-runtime';
import { initializeThroneControls } from '../components/games/throne-controls-runtime';
import { initializeThroneSeats } from '../components/games/throne-seats-runtime';
import { initializeThroneTable } from '../components/games/throne-table-runtime';
import { initializeThronePrivate } from '../components/games/throne-private-runtime';
import { initializeThroneHistory } from '../components/games/throne-history-runtime';
import { initializeThroneEffects } from '../components/games/throne-effects-runtime';
import { initializeThroneEvents } from '../components/games/throne-events-runtime';
import { initializeThroneChoices } from '../components/games/throne-choices-runtime';
import { initializeThroneHand } from '../components/games/throne-hand-runtime';
import { initializeThroneLocal } from '../components/games/throne-local-runtime';
import { initializeThroneNavigation } from '../components/games/throne-navigation-runtime';
import { initializeCourtFullscreen } from '../components/games/court-fullscreen-runtime';
import { initializeTabletopAudio } from '../components/games/tabletop-audio-runtime';
import { initializeAzul } from '../components/games/azul-runtime';
import { initializeSplendor } from '../components/games/splendor-runtime';
import { initializeLoveLetter } from '../components/games/love-letter-runtime';
import { initializeTicketToRide } from '../lib/games/ticket-to-ride';
import { initializeRoguelite } from '../components/games/roguelite-runtime';
import { initializeNexus } from '../lib/games/nexus';
import { initializeGameLibrary } from '../components/games/library-runtime';
import { initializeCallToolbar } from '../components/voice/call-toolbar-runtime';
import { initializeCallNavigation } from '../components/navigation/call-navigation-runtime';
import { initializeCallStage } from '../components/voice/call-stage-runtime';
import { initializeMediaDialogs } from '../components/modals/media-dialogs-runtime';
import { initializeHandLayout } from '../lib/games/hand-layout';

let startup: Promise<void> | undefined;
/** Page owners are composed once; React presents them without a second session or socket. */
export function ApplicationRuntime() {
  const [error, setError] = useState<string>();
  useEffect(() => {
    startup ??= Promise.resolve().then(() => {
      initializeAudio(window);
      initializePersonalPreferences(window);
      initializeNetwork(window);
      initializeFiles(window);
      initializeChatComposer(window);
      initializeChatMessages(window);
      initializeChannels(window);
      initializeApplicationAudio(window);
      initializeDesktopCapture(window);
      initializeAuth(window);
      initializeProfileViewer(window, { mount: false });
      initializeCommunity(window);
      initializePortal(window);
      initializeNoiseProcessors(window);
      initializeVoiceRuntime(window);
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
      initializeCourtFullscreen(window);
      initializeNotifications(window);
      initializeAzul(window);
      initializeSplendor(window);
      initializeLoveLetter(window);
      initializeTicketToRide(window);
      initializeTabletopAudio(window);
      initializeRoguelite(window);
      initializeNexus(window);
      initializeGameLibrary(window);
      initializeMessenger(window);
      initializeCallToolbar(window);
      initializeCallNavigation(window);
      window.dispatchEvent(new Event('trono:ready'));
      initializeCallStage(window);
      initializeMediaDialogs(window);
      if ((window as Window & { TronoDesktop?: object }).TronoDesktop) {
        document.body.classList.add('desktop-app');
        initializeHandLayout(window);
      }
      publishServices(window);
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
