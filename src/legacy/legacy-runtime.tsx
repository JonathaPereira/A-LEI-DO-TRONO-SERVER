'use client';

import { initializeCallWorkspace } from '../components/navigation/workspace-runtime';
import { initializeMediaLayout } from '../lib/voice/media-layout';
import { initializeHandLayout } from '../lib/games/hand-layout';

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
import { installLegacyAvatars } from '../lib/profiles/avatar';
import { initializeConnectionDiagnostics } from '../components/voice/diagnostics-runtime';
import { createConnectionDiagnostics } from '../lib/voice/connection-diagnostics';
import { createAudioPreferences } from '../lib/voice/audio-preferences';
import { createVoiceSettings } from '../lib/voice/settings';
import { createCallQuality } from '../lib/voice/quality';
import { QUALITY_ORDER, SCREEN_FORMATS, SCREEN_BITRATES } from '../lib/voice/quality-policy';
import { diagnosticReport } from '../lib/voice/diagnostic-report';
import { createMicrophone } from '../lib/voice/microphone';
import { createMicrophoneProcessor } from '../lib/voice/microphone-processor';
import { createScreenSharing } from '../lib/voice/screen-sharing';
import { createScreenOptions } from '../lib/voice/screen-options';
import { getMosaicSources } from '../lib/voice/mosaic';
import { initializeMediaDialogs } from '../components/modals/media-dialogs-runtime';
import { createScreenCapture } from '../lib/voice/screen-capture';
import { createScreenPublication } from '../lib/voice/screen-publication';
import { createCamera } from '../lib/voice/camera';
import { createDevicePublication } from '../lib/voice/device-publication';
import { createP2pPeers } from '../lib/voice/p2p-peers';
import { createRemoteMedia } from '../lib/voice/remote-media';
import { createSpeakingIndicators } from '../lib/voice/speaking-indicators';
import { createVoiceTelemetry } from '../lib/voice/telemetry';
import { createCallToolbar } from '../lib/voice/toolbar';
import { initializeCallToolbar } from '../components/voice/call-toolbar-runtime';
import { createMediaInterest } from '../lib/voice/media-interest';
import { createMediaVisibility } from '../lib/voice/media-visibility';
import { createMediaFocus } from '../lib/voice/media-focus';
import { createFloatingPanel } from '../lib/voice/floating-panel';
import { createCallNavigation } from '../lib/voice/navigation';
import { createCallNavigationView } from '../lib/voice/navigation-view';
import { initializeCallNavigation } from '../components/navigation/call-navigation-runtime';
import { createCallStage } from '../lib/voice/stage';
import { initializeCallStage } from '../components/voice/call-stage-runtime';
import { createCallControls } from '../lib/voice/controls';
import { createCallAudio } from '../lib/voice/call-audio';
import { createCallAlerts } from '../lib/voice/call-alerts';
import { createAudioPlayback, clampAudioGain } from '../lib/voice/audio-playback';
import { createRealtimeConfiguration } from '../lib/voice/realtime';
import { createVoiceCall } from '../lib/voice/call-lifecycle';
import { createVoiceRoster } from '../lib/voice/roster';
import { createVoiceTransport } from '../lib/voice/transport';
import { createSfuSession } from '../lib/voice/sfu-session';

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
      Object.assign(window, {
        TronoVoiceCapture: {
          createCallQuality,
          createVoiceSettings,
          createAudioPreferences,
          createConnectionDiagnostics,
          QUALITY_ORDER,
          SCREEN_FORMATS,
          SCREEN_BITRATES,
          diagnosticReport,
          createMicrophone,
          createMicrophoneProcessor,
          createScreenCapture,
          createScreenPublication,
          createScreenSharing,
          createScreenOptions,
          getMosaicSources,
          createCamera,
          createDevicePublication,
          createP2pPeers,
          createRemoteMedia,
          createSfuSession,
          createVoiceTransport,
          createVoiceRoster,
          createVoiceCall,
          createRealtimeConfiguration,
          createAudioPlayback,
          clampAudioGain,
          createCallAudio,
          createCallControls,
          createMediaInterest,
          createMediaVisibility,
          createMediaFocus,
          createFloatingPanel,
          createCallNavigation,
          createCallNavigationView,
          createCallStage,
          createCallToolbar,
          createCallAlerts,
          createVoiceTelemetry,
          createSpeakingIndicators,
        },
      });
      initializeFiles(window);
      installLegacyAttachments(window);
      installLegacyAvatars(window);
      initializeChatComposer(window);
      initializeChatMessages(window);
      initializeChannels(window);
      for (const filename of manifest.scripts) {
        if (filename !== 'auth-boot.js') await loadScript(filename);
        // Profile/game controllers prepare borrowed bodies before the React shell mounts;
        // activity/notifications then bind to the mounted slots, matching their boot order.
        if (filename === 'desktop-shell.js')
          window.addEventListener(
            'trono:ready',
            () => {
              initializeCallSettings(window);
              initializeConnectionDiagnostics(window);
            },
            { once: true },
          );
      }
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
