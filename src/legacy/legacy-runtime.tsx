'use client';

import { initializeVoiceRuntime } from '../lib/voice/runtime';
import { initializeNotifications } from '../lib/notifications/browser';
import { initializeDesktopActivity } from '../lib/desktop/activity-runtime';
import { initializeFileLibrary } from '../components/files/library-runtime';
import { initializeProfileViewer } from '../components/profiles/viewer-runtime';
import { initializeProfileEditor } from '../components/profiles/editor-runtime';
import { initializeDesktopShell } from '../components/desktop/shell-runtime';
import { initializeAppLayout } from '../components/navigation/app-layout-runtime';
import { initializeAppearance } from '../components/profiles/appearance-runtime';
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
      installLegacyAvatars(window);
      initializeChatComposer(window);
      initializeChatMessages(window);
      initializeChannels(window);
      for (const filename of manifest.scripts) {
        if (filename !== 'auth-boot.js') await loadScript(filename);
        if (filename === 'profile-gifs.js') initializeProfileEditor(window);
        if (filename === 'personal-prefs.js') initializeVoiceRuntime(window);
        if (filename === 'soundboard-client.js') initializeAppearance(window);
        // Profile/game controllers prepare borrowed bodies before the React shell mounts;
        // activity/notifications then bind to the mounted slots, matching their boot order.
        if (filename === 'call-controls-layout.js') {
          initializeDesktopShell(window);
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
