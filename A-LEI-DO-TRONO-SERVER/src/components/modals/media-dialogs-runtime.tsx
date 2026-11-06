import { useLayoutEffect, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createMosaic, type MosaicPerson } from '../../lib/voice/mosaic';
import type { CallStage } from '../../lib/voice/stage';
import type { ScreenOptionsClient } from '../../lib/voice/screen-options';
import { MediaFocusContent } from './media-focus-dialog';
import { ScreenOptionsContent } from './screen-options-dialog';

interface MediaRuntime {
  TronoDesktop?: object;
  TronoCallStage: CallStage;
  TronoScreenOptions: ScreenOptionsClient;
  TronoSocial: {
    getMediaSources(): readonly MosaicPerson[];
    fullscreenMedia(id: string, kind: 'camera' | 'screen'): unknown;
    toggleWatchStream(id: string): unknown;
    toggleWatchCamera(id: string): unknown;
  };
}
function MosaicLauncher({
  client,
  floating,
}: {
  client: ReturnType<typeof createMosaic>;
  floating: HTMLButtonElement | null;
}) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  // Compatibility with the floating panel, whose navigation has not been converted yet.
  useLayoutEffect(() => {
    if (floating) floating.disabled = !state.people.length;
  }, [floating, state.people]);
  return (
    <button
      id="expandMosaicBtn"
      className="small-btn"
      type="button"
      disabled={!state.people.length}
      onClick={() => client.open()}
    >
      ▦ Grade · até 6
    </button>
  );
}
const installed = new WeakSet<Window>();
export function initializeMediaDialogs(target: Window) {
  if (installed.has(target)) return;
  installed.add(target);
  const runtime = target as unknown as MediaRuntime,
    stage = runtime.TronoCallStage;
  const mosaicDialog = target.document.getElementById('mediaFocusDialog') as HTMLDialogElement;
  const screenDialog = target.document.getElementById('screenOptionsDialog') as HTMLDialogElement;
  const social = runtime.TronoSocial;
  const mosaic = createMosaic({
    read: () => ({ ...stage.getSnapshot(), people: social.getMediaSources() }),
    subscribe: stage.subscribe,
    closeDialog: () => {
      if (mosaicDialog.open) mosaicDialog.close();
    },
    fullscreen: social.fullscreenMedia,
    toggleScreen: social.toggleWatchStream,
    toggleCamera: social.toggleWatchCamera,
  });
  Object.assign(target, { TronoMosaic: mosaic });
  mosaic.start();
  flushSync(() => {
    createRoot(mosaicDialog).render(<MediaFocusContent client={mosaic} dialog={mosaicDialog} />);
    createRoot(screenDialog).render(
      <ScreenOptionsContent
        client={runtime.TronoScreenOptions}
        dialog={screenDialog}
        desktop={!!runtime.TronoDesktop}
      />,
    );
    createRoot(target.document.getElementById('expandMosaicHost')!).render(
      <MosaicLauncher
        client={mosaic}
        floating={target.document.getElementById('socialModeBtn') as HTMLButtonElement | null}
      />,
    );
  });
}
