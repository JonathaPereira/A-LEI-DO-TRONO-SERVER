import type { ChannelNotice } from '../../types/channels';
import type { NetworkRuntime } from '../socket/browser.ts';
import { initializeNetwork } from '../socket/browser.ts';
import { createChannels } from './catalog.ts';
import type { ChannelsController } from './catalog.ts';

interface ChannelsRuntime
  extends NetworkRuntime, Partial<Pick<Window, 'addEventListener' | 'removeEventListener'>> {
  TronoChannels?: ChannelsController;
  TronoNotifications?: { getChannelState(id: string): ChannelNotice };
  TronoChatHub?: { switchChannel(id: string, options: { connectVoice: boolean }): Promise<void> };
}
export function initializeChannels(runtime: ChannelsRuntime): ChannelsController {
  if (runtime.TronoChannels) return runtime.TronoChannels;
  const listen = (events: string[], listener: () => void) => {
    events.forEach((event) => runtime.addEventListener?.(event, listener));
    return () => events.forEach((event) => runtime.removeEventListener?.(event, listener));
  };
  return (runtime.TronoChannels = createChannels({
    network: initializeNetwork(runtime),
    getAccountId: () => runtime.TronoAuth?.user?.id ?? null,
    getNotice: (id) =>
      runtime.TronoNotifications?.getChannelState(id) ?? { unread: 0, muted: false },
    subscribeIdentity: (listener) => listen(['trono-auth-change', 'trono-role-change'], listener),
    subscribeNotices: (listener) => listen(['trono-channel-notifications-change'], listener),
  }));
}
export function selectChannel(id: string, connectVoice: boolean): void {
  void (window as ChannelsRuntime).TronoChatHub?.switchChannel(id, { connectVoice });
}
