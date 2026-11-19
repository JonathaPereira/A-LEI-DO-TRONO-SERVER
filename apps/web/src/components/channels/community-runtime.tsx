import type { CommunityPerson } from '../../types/community';
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
  TronoNetwork: NetworkClient;
  TronoDesktop?: object;
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
