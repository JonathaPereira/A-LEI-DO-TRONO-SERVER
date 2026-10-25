'use client';
import { useEffect } from 'react';
import { AppIcon as Icon } from './icons';
import { useServices, type ApplicationServices } from './services';
import { initializeSoundboard } from '../soundboard/runtime';
import { initializeRecorder } from '../recording/runtime';
import { initializeRemotePc } from '../../lib/voice/remote-pc';
import { initializeClipStore } from '../../lib/clips/browser';
import { initializeClips } from '../clips/runtime';
import { initializeClipLibraryView } from '../clips/library-runtime';
import { initializeClipPreferencesView } from '../clips/preferences-runtime';
import { initializeClipDesktop } from '../clips/desktop-runtime';
import { ClipsDialog } from '../modals/clips-dialog';
import { RemotePcDialog } from '../modals/remote-pc-dialog';
import styles from './resources.module.css';
export function ResourceDock() {
  const runtime = useServices();
  return runtime ? <MountedDock runtime={runtime} /> : null;
}
function MountedDock({ runtime }: { runtime: ApplicationServices }) {
  return (
    <div className={styles.dock} aria-label="Recursos da Corte" role="group">
      <span id="recordMatchHost" />
      <button
        id="settingsSoundboardToggle"
        data-soundboard-open
        type="button"
        aria-label="Efeitos sonoros"
      >
        <Icon name="music" /> Efeitos sonoros
      </button>

      <button
        type="button"
        data-open-clips
        title="Seus clipes"
        aria-label="Seus clipes"
        onClick={() => {
          if (runtime?.TronoDesktop)
            (document.getElementById('clipsDialog') as HTMLDialogElement)?.showModal();
        }}
      >
        <Icon name="clips" /> Seus clipes
      </button>
      <button id="remotePcBtn" type="button" title="Compartilhar PC" aria-label="Compartilhar PC">
        <Icon name="pc" /> Compartilhar PC
      </button>
      <button id="clipToolbarNow" type="button" aria-label="Clipar agora" disabled>
        <Icon name="clips" size={15} />
        <span id="clipToolbarLabel">Clipar</span>
        <span id="clipToolbarCount" className={styles.count} />
      </button>
    </div>
  );
}
export function ResourceSettings() {
  return (
    <>
      <h2>Recursos da Corte</h2>
      <p>Seus efeitos, clipes e ferramentas de compartilhamento.</p>
      <ResourceDock />
    </>
  );
}
export function AdvancedResources() {
  const runtime = useServices();
  useEffect(() => {
    if (!runtime) return;
    let canceled = false;
    queueMicrotask(() => {
      if (canceled) return;
      initializeSoundboard(window, { ready: true });
      initializeRecorder(window);
      initializeRemotePc(window, { ready: true });
      if (!runtime.TronoDesktop) {
        initializeClipStore(window);
        initializeClipDesktop(window);
        initializeClipPreferencesView(window);
        initializeClipLibraryView(window);
        initializeClips(window, { ready: true });
      }
    });
    return () => {
      canceled = true;
    };
  }, [runtime]);
  return (
    <div className={styles.surface}>
      <div id="soundboardRoot" />
      {runtime?.TronoDesktop ? (
        <dialog closedby="any" id="clipsDialog" aria-label="Seus clipes">
          <header>
            <h2>Seus clipes</h2>
            <button
              type="button"
              aria-label="Fechar central de clipes"
              onClick={() => (document.getElementById('clipsDialog') as HTMLDialogElement).close()}
            >
              <Icon name="close" />
            </button>
          </header>
          <p>
            O replay automático está suspenso no aplicativo Windows. Seus clipes do navegador
            continuam disponíveis ao abrir a versão web.
          </p>
        </dialog>
      ) : (
        <ClipsDialog />
      )}
      <RemotePcDialog />
      <div id="recordingNoticeHost" className={styles.recording} />
    </div>
  );
}
