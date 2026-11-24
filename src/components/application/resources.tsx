'use client';
import { useEffect } from 'react';
import { AppIcon as Icon } from './icons';
import { useServices } from './services';
import { initializeSoundboard } from '../soundboard/runtime';
import { initializeRecorder } from '../recording/runtime';
import { initializeRemotePc } from '../../lib/voice/remote-pc';
import { RemotePcDialog } from '../modals/remote-pc-dialog';
import styles from './resources.module.css';
export function ResourceDock() {
  const runtime = useServices();
  return runtime ? <MountedDock /> : null;
}
function MountedDock() {
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

      <button id="remotePcBtn" type="button" title="Compartilhar PC" aria-label="Compartilhar PC">
        <Icon name="pc" /> Compartilhar PC
      </button>
    </div>
  );
}
export function ResourceSettings() {
  return (
    <>
      <h2>Recursos da Corte</h2>
      <p>Seus efeitos sonoros e ferramentas de compartilhamento.</p>
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
    });
    return () => {
      canceled = true;
    };
  }, [runtime]);
  return (
    <div className={styles.surface}>
      <div id="soundboardRoot" />
      <RemotePcDialog />
      <div id="recordingNoticeHost" className={styles.recording} />
    </div>
  );
}
