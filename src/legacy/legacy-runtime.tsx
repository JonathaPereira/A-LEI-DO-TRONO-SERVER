'use client';

import { useEffect, useState } from 'react';
import manifest from './manifest.json';
import { initializeNetwork } from '../lib/socket/browser';
import { initializeChatComposer, initializeChatMessages } from '../lib/chat/browser';
import { initializeChannels } from '../lib/channels/browser';
import { initializeFiles } from '../lib/files/browser';
import { installLegacyAttachments } from '../components/files/legacy-attachments';
import { installLegacyAvatars } from '../lib/profiles/avatar';
import { createCallQuality } from '../lib/voice/quality';
import { QUALITY_ORDER, SCREEN_FORMATS, SCREEN_BITRATES } from '../lib/voice/quality-policy';
import { diagnosticReport } from '../lib/voice/diagnostic-report';
import { createMicrophone } from '../lib/voice/microphone';
import { createMicrophoneProcessor } from '../lib/voice/microphone-processor';
import { createScreenSharing } from '../lib/voice/screen-sharing';
import { createScreenSharingBindings } from '../lib/voice/screen-sharing-bindings';
import { createScreenCapture } from '../lib/voice/screen-capture';
import { createScreenPublication } from '../lib/voice/screen-publication';
import { createCamera } from '../lib/voice/camera';
import { createP2pPeers } from '../lib/voice/p2p-peers';
import { createRemoteMedia } from '../lib/voice/remote-media';
import { createSpeakingIndicators } from '../lib/voice/speaking-indicators';
import { createVoiceTelemetry } from '../lib/voice/telemetry';
import { createCallControlBindings } from '../lib/voice/control-bindings';
import { createMediaInterest } from '../lib/voice/media-interest';
import { createMediaInterestBindings } from '../lib/voice/media-interest-bindings';
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
          QUALITY_ORDER,
          SCREEN_FORMATS,
          SCREEN_BITRATES,
          diagnosticReport,
          createMicrophone,
          createMicrophoneProcessor,
          createScreenCapture,
          createScreenPublication,
          createScreenSharing,
          createScreenSharingBindings,
          createCamera,
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
          createMediaInterestBindings,
          createCallControlBindings,
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
      }
      window.dispatchEvent(new Event('trono:ready'));
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
