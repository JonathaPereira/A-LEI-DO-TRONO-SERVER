import {
  createAndroidPermissionsGuard,
  type AndroidBackgroundPort,
  type AndroidPermissionsGuard,
} from '../../lib/mobile/background-permissions';
import type { CallStage } from '../../lib/voice/stage';
import type { CallToolbar } from '../../lib/voice/toolbar';
import type { VoiceRuntime } from '../../lib/voice/runtime';

interface Runtime extends Window {
  TronoAndroidBackground?: AndroidPermissionsGuard;
  TronoCallStage?: CallStage;
  TronoCallToolbar?: CallToolbar;
  TronoSocial?: VoiceRuntime;
}

/**
 * Single-owner Android background permissions & call notification bridge.
 * Checks permissions immediately on app launch and wires lock-screen Mute/Leave actions.
 */
export function initializeAndroidBackground(target: Window): () => void {
  const runtime = target as Runtime;
  if (runtime.TronoAndroidBackground) return () => {};
  const native = runtime.TronoAndroid;
  const hasPort =
    !!native &&
    typeof native.getBackgroundStatus === 'function' &&
    typeof native.requestBackgroundPermissions === 'function' &&
    typeof native.requestBatteryExemption === 'function' &&
    typeof native.setAudioRoute === 'function';

  const guard = createAndroidPermissionsGuard({
    host: hasPort ? (native as unknown as AndroidBackgroundPort) : null,
  });
  runtime.TronoAndroidBackground = guard;

  if (!hasPort || !native) return () => {};

  const onResume = () => {
    if (!target.document.hidden) void guard.refresh();
  };
  target.addEventListener('focus', onResume);
  target.document.addEventListener('visibilitychange', onResume);

  const offAction = native.onCallAction?.((action) => {
    if (action === 'toggleMute') {
      void runtime.TronoCallToolbar?.activate('muteMicBtn');
    } else if (action === 'leave') {
      void runtime.TronoSocial?.leaveVoice();
    }
  });

  let lastRoom = '';
  let lastMuted: boolean | null = null;
  const syncNotification = () => {
    const stage = runtime.TronoCallStage?.getSnapshot();
    const toolbar = runtime.TronoCallToolbar?.getSnapshot();
    if (!stage?.joined) {
      lastRoom = '';
      lastMuted = null;
      return;
    }
    const room = stage.roomName || 'Voz';
    const muted = Boolean(toolbar?.buttons.muteMicBtn.active);
    if (room === lastRoom && muted === lastMuted) return;
    lastRoom = room;
    lastMuted = muted;
    void native.updateCallNotification?.(room, muted).catch(() => {});
  };
  const offStage = runtime.TronoCallStage?.subscribe(syncNotification);
  const offToolbar = runtime.TronoCallToolbar?.subscribe(syncNotification);

  void guard.refresh();

  return () => {
    target.removeEventListener('focus', onResume);
    target.document.removeEventListener('visibilitychange', onResume);
    offAction?.();
    offStage?.();
    offToolbar?.();
    if (runtime.TronoAndroidBackground === guard) delete runtime.TronoAndroidBackground;
  };
}
