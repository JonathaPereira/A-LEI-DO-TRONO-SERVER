import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { captureRecording } from '../../lib/recording/capture';
import { createRecorder, type ManualRecorder } from '../../lib/recording/recorder';
import { saveRecording } from '../../lib/recording/files';
import { createBrowserClipFiles } from '../../lib/clips/export';
import type { ClipDirectory } from '../../types/clips';
import { RecordingControls } from './controls';
interface Runtime extends Window {
  TronoRecorder?: ManualRecorder;
  TronoSocial?: { getLocalAudioTrack(): MediaStreamTrack | null };
  webkitAudioContext?: typeof AudioContext;
  showDirectoryPicker?: (options: {
    id: string;
    mode: 'readwrite';
    startIn: 'desktop';
  }) => Promise<ClipDirectory>;
}
/** Manual capture is available on web and Electron and always begins with an explicit action. */
export function initializeRecorder(target: Window): ManualRecorder {
  const runtime = target as Runtime;
  if (runtime.TronoRecorder) return runtime.TronoRecorder;
  const files = createBrowserClipFiles(target),
    doc = target.document,
    buttonHost = doc.getElementById('recordMatchHost'),
    noticeHost = doc.getElementById('recordingNoticeHost');
  if (!buttonHost || !noticeHost) throw Error('Controles de gravação manual ausentes.');
  const controller = createRecorder({
    supported: () =>
      !!target.navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== 'undefined',
    capture: (current) =>
      captureRecording(
        {
          getDisplayMedia: (options) => target.navigator.mediaDevices.getDisplayMedia(options),
          createStream: (tracks) => new MediaStream(tracks ?? []),
          getMicrophone: () => runtime.TronoSocial?.getLocalAudioTrack() ?? null,
          createAudioContext: () => {
            const Context =
              typeof AudioContext !== 'undefined' ? AudioContext : runtime.webkitAudioContext;
            return Context ? new Context({ latencyHint: 'playback' }) : null;
          },
          warn: (error) => console.warn('[TronoRecorder] áudio', error),
        },
        current,
      ),
    createRecorder(stream) {
      const mimeType = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ].find((mime) => MediaRecorder.isTypeSupported?.(mime));
      return new MediaRecorder(
        stream,
        mimeType ? { mimeType, videoBitsPerSecond: 5_000_000 } : undefined,
      );
    },
    async chooseDirectory() {
      if (!runtime.showDirectoryPicker) return null;
      try {
        return await runtime.showDirectoryPicker({
          id: 'trono-recordings',
          mode: 'readwrite',
          startIn: 'desktop',
        });
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError'))
          console.warn('[TronoRecorder] pasta', error);
        return null;
      }
    },
    save: (blob, directory, filename) => saveRecording(blob, directory, filename, files.download),
    now: Date.now,
  });
  runtime.TronoRecorder = controller;
  const host = doc.createElement('div');
  host.id = 'recordingRuntimeHost';
  host.style.display = 'contents';
  doc.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <RecordingControls controller={controller} buttonHost={buttonHost} noticeHost={noticeHost} />,
    ),
  );
  const unload = () => {
      void controller.stop(false);
    },
    hide = () => {
      void controller.stop(false);
      files.dispose();
    };
  target.addEventListener('beforeunload', unload);
  target.addEventListener('pagehide', hide);
  const dispose = controller.dispose;
  let disposed = false;
  controller.dispose = () => {
    if (disposed) return;
    disposed = true;
    target.removeEventListener('beforeunload', unload);
    target.removeEventListener('pagehide', hide);
    dispose();
    files.dispose();
    root.unmount();
    host.remove();
    if (runtime.TronoRecorder === controller) delete runtime.TronoRecorder;
  };
  return controller;
}
