import type { CommunityPerson } from '../../types/community';
import type { PresenceStatus } from '../../types/domain';
import type { GuestIdentity, NetworkAccount } from '../../types/network';
import type { NetworkClient } from '../../lib/socket/client';
import { createCommunity } from '../../lib/community/controller';

interface CommunityRuntime extends Window {
  TronoAuth: {
    readonly ready: Promise<unknown>;
    readonly user: NetworkAccount | null;
    readonly guest: GuestIdentity | null;
    getAccessToken(): Promise<string | null>;
    ensureGuest(): Promise<boolean>;
  };
  TronoPersonal?: {
    get(key: string, fallback: unknown): unknown;
    set(key: string, value: unknown): void;
  };
  TronoNetwork: NetworkClient;
  TronoDesktop?: {
    getPresenceStatus?(accountId: string): Promise<unknown>;
    setPresenceStatus?(accountId: string, status: PresenceStatus): Promise<unknown>;
  };
  TronoSocial?: {
    readonly voiceJoined?: boolean;
    readonly micMuted?: boolean;
  };
  TronoProfile: { openMini(id: string): void };
  TronoMessenger?: { open(id: string): void };
  TronoCommunityAdmin?: { editRole(person: CommunityPerson): void };
  TronoCommunity?: ReturnType<typeof createCommunity>;
}
const installed = new WeakMap<Window, () => void>();

/** Mount into stable hosts: desktop layouts may move the whole panel and button. */
export function initializeCommunity(target: Window): () => void {
  const existing = installed.get(target);
  if (existing) return existing;
  const runtime = target as CommunityRuntime;
  const identity = () => {
    const user = runtime.TronoAuth.user,
      guest = runtime.TronoAuth.guest;
    return user
      ? {
          key: `account:${user.id}`,
          accountId: user.id,
          manageRoles: !!user.permissions.manageRoles,
        }
      : guest
        ? { key: `guest:${guest.id}`, accountId: null, manageRoles: false }
        : null;
  };
  const controller = createCommunity({
    network: runtime.TronoNetwork,
    getIdentity: identity,
    preferences: runtime.TronoPersonal,
    subscribePreferences(listener) {
      const handle = (event: Event) => {
        if (!(event instanceof CustomEvent)) return;
        const detail: unknown = event.detail;
        if (
          detail &&
          typeof detail === 'object' &&
          'key' in detail &&
          typeof detail.key === 'string'
        )
          listener(detail.key);
      };
      target.addEventListener('trono-personal-change', handle);
      return () => target.removeEventListener('trono-personal-change', handle);
    },
    readDesktopStatus: runtime.TronoDesktop?.getPresenceStatus
      ? (accountId) => runtime.TronoDesktop!.getPresenceStatus!(accountId)
      : undefined,
    syncDesktopStatus: runtime.TronoDesktop?.setPresenceStatus
      ? (accountId, status) => runtime.TronoDesktop!.setPresenceStatus!(accountId, status)
      : undefined,
    isVoiceActiveUnmuted: () =>
      !!(runtime.TronoSocial?.voiceJoined && !runtime.TronoSocial.micMuted),
    subscribeVoiceState(listener) {
      target.addEventListener('trono-call-change', listener);
      return () => target.removeEventListener('trono-call-change', listener);
    },
    subscribeInteraction(listener) {
      const opts = { capture: true, passive: true } as const;
      target.addEventListener('pointerdown', listener, opts);
      target.addEventListener('keydown', listener, opts);
      return () => {
        target.removeEventListener('pointerdown', listener, opts);
        target.removeEventListener('keydown', listener, opts);
      };
    },
    subscribeIdentity(listener) {
      target.addEventListener('trono-auth-change', listener);
      target.addEventListener('trono-role-change', listener);
      return () => {
        target.removeEventListener('trono-auth-change', listener);
        target.removeEventListener('trono-role-change', listener);
      };
    },
    async authenticate(owner, current) {
      await runtime.TronoAuth.ready;
      const valid = () => current() && identity()?.key === owner.key;
      if (!valid()) return false;
      if (!owner.accountId) return runtime.TronoAuth.ensureGuest();
      const token = await runtime.TronoAuth.getAccessToken();
      if (!valid() || !token) return false;
      await runtime.TronoNetwork.authenticate(token);
      return valid();
    },
  });
  runtime.TronoCommunity = controller;
  const bind = () => controller.start();
  target.addEventListener('trono:ready', bind, { once: true });
  const dispose = () => {
    target.removeEventListener('trono:ready', bind);
    controller.dispose();
    if (runtime.TronoCommunity === controller) delete runtime.TronoCommunity;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
