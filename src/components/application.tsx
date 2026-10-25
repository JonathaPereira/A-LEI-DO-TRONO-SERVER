'use client';
import { ApplicationShell } from './application/shell';
import { GameSurface } from './application/game-surface';
import { ApplicationRuntime } from '../app/application-runtime';
import { AttachmentImageViewer } from './files/image-viewer';

export function Application() {
  return (
    <>
      <ApplicationShell>
        {(active, screen) => <GameSurface active={active} screen={screen} />}
      </ApplicationShell>
      <AttachmentImageViewer />
      <ApplicationRuntime />
    </>
  );
}
