import type { FilesClient } from '../../lib/files/client';
import type { CallStage } from '../../lib/voice/stage';
import {
  createDesktopOverlay,
  type DesktopOverlayController,
  type DesktopOverlayPort,
  type OverlayParticipant,
  type OverlayWatcher,
} from '../../lib/desktop/overlay';

interface OverlayRuntimeWindow extends Window {
  TronoDesktop?: DesktopOverlayPort;
  TronoCallStage?: CallStage;
  TronoFiles?: FilesClient;
  TronoDesktopOverlay?: DesktopOverlayController;
}

const installed = new WeakMap<Window, () => void>();

export function initializeDesktopOverlay(target: Window): () => void {
  const existing = installed.get(target);
  if (existing) return existing;
  const runtime = target as OverlayRuntimeWindow;
  if (!runtime.TronoDesktop?.getOverlayConfig) return () => {};

  const avatarUrls = new Map<string, string>();
  const pendingAvatars = new Set<string>();
  let controller: DesktopOverlayController | null = null;
  let disposed = false;

  function resolveAvatar(fileId?: string | null): string | undefined {
    if (!fileId || !runtime.TronoFiles) return undefined;
    const cached = avatarUrls.get(fileId);
    if (cached) return cached;
    if (!pendingAvatars.has(fileId)) {
      pendingAvatars.add(fileId);
      void runtime.TronoFiles.url(fileId)
        .then((url) => {
          pendingAvatars.delete(fileId);
          if (disposed || !url) return;
          avatarUrls.set(fileId, url);
          if (avatarUrls.size > 64) {
            const oldest = avatarUrls.keys().next().value;
            if (oldest) avatarUrls.delete(oldest);
          }
          controller?.syncNow();
        })
        .catch(() => {
          pendingAvatars.delete(fileId);
        });
    }
    return undefined;
  }

  function readStageState() {
    const stage = runtime.TronoCallStage?.getSnapshot();
    if (!stage || !stage.joined) {
      return {
        inCall: false,
        sharingScreen: false,
        participants: [] as OverlayParticipant[],
        watchers: [] as OverlayWatcher[],
      };
    }
    const participants: OverlayParticipant[] = stage.participants.slice(0, 12).map((p) => {
      const avatarUrl = resolveAvatar(p.avatar_file_id);
      return {
        id: p.id,
        name: p.name,
        speaking: p.speaking === true,
        muted: p.muted === true || p.serverMuted === true,
        deafened: p.deafened === true,
        ...(avatarUrl ? { avatarUrl } : {}),
      };
    });
    const sharingScreen = stage.participants.some((p) => p.self && p.screen);
    const watchers: OverlayWatcher[] = sharingScreen
      ? stage.screenWatchers.slice(0, 12).map((w) => {
          const avatarUrl = resolveAvatar(w.avatar_file_id);
          return {
            id: w.id,
            name: w.name,
            ...(avatarUrl ? { avatarUrl } : {}),
          };
        })
      : [];
    return { inCall: true, sharingScreen, participants, watchers };
  }

  controller = createDesktopOverlay({
    native: runtime.TronoDesktop,
    readStageState,
    subscribeStage(listener) {
      const unsubStage = runtime.TronoCallStage?.subscribe(listener) ?? (() => {});
      const onAuth = () => {
        avatarUrls.clear();
        pendingAvatars.clear();
        listener();
      };
      target.addEventListener('trono-auth-change', onAuth);
      return () => {
        unsubStage();
        target.removeEventListener('trono-auth-change', onAuth);
      };
    },
  });

  runtime.TronoDesktopOverlay = controller;
  controller.start();

  const dispose = () => {
    disposed = true;
    controller?.dispose();
    avatarUrls.clear();
    pendingAvatars.clear();
    if (runtime.TronoDesktopOverlay === controller) delete runtime.TronoDesktopOverlay;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
