import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { CallStageView } from './call-stage';
import type { StageRuntime } from './media-tile';
const installed = new WeakSet<Window>();
export function initializeCallStage(target: Window) {
  if (installed.has(target)) return;
  installed.add(target);
  const runtime = target as unknown as StageRuntime,
    doc = target.document;
  const get = (id: string) => doc.getElementById(id)!;
  const title = doc.querySelector<HTMLElement>('.mosaic-toolbar strong')!;
  for (const element of [title, get('mnStageRoomName'), get('textVoiceRoomName')])
    element.replaceChildren();
  const host = doc.createElement('div');
  host.style.display = 'contents';
  doc.body.append(host);
  runtime.TronoCallStage.start();
  flushSync(() =>
    createRoot(host).render(
      <CallStageView
        runtime={runtime}
        hosts={{
          roster: get('voiceRoster'),
          cameras: get('cameraGrid'),
          screens: get('screenShareGrid'),
          stage: doc.querySelector<HTMLElement>('.mn-media-stage')!,
          title,
          room: get('mnStageRoomName'),
          connectedRoom: get('textVoiceRoomName'),
        }}
      />,
    ),
  );
}
