import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { CommunityPerson } from '../../types/community';
import type { GuestIdentity, NetworkAccount } from '../../types/network';
import type { NetworkClient } from '../../lib/socket/client';
import { createCommunity } from '../../lib/community/controller';
import { CommunityContents, CommunityNotices, GamePresenceIcons } from './community-contents';

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
  const runtime = target as CommunityRuntime,
    doc = target.document;
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
  const roots: Root[] = [],
    gameRoots = new Map<HTMLElement, Root>();
  let observer: MutationObserver | undefined,
    unsubscribe: (() => void) | undefined,
    toggle: HTMLElement | null = null,
    lastChatMode: boolean | undefined,
    bound = false;
  function renderRoomIcons() {
    for (const [host, root] of gameRoots)
      if (!host.isConnected) {
        root.unmount();
        gameRoots.delete(host);
      }
    const rooms = controller.getSnapshot().rooms;
    for (const card of doc.querySelectorAll<HTMLElement>('article.room-card[data-room]')) {
      const room = rooms.find((room) => room.id === card.dataset.room);
      const existing = card.querySelector<HTMLElement>('.room-presence-icons');
      if (!room && !existing) continue;
      const host = existing ?? doc.createElement('span');
      if (!existing) {
        host.className = 'room-presence-icons';
        card.append(host);
      }
      let root = gameRoots.get(host);
      if (!root) {
        root = createRoot(host);
        gameRoots.set(host, root);
      }
      root.render(room ? <GamePresenceIcons room={room} /> : null);
    }
  }
  function sync() {
    const state = controller.getSnapshot();
    doc.body.classList.toggle('community-open', state.open);
    doc.getElementById('communityPanel')?.classList.toggle('hidden', !state.open);
    if (toggle) {
      toggle.classList.toggle('hidden', !state.identity);
      toggle.setAttribute('aria-expanded', String(state.open));
      const count = state.presence?.members.filter((person) => person.online).length;
      toggle.textContent = count === undefined ? 'Pessoas' : `Pessoas · ${count}`;
    }
    renderRoomIcons();
  }
  const onToggle = () => controller.toggle();
  const resize = () => {
    if (target.innerWidth < 1280) controller.toggle(false);
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') controller.toggle(false);
  };
  function mode() {
    const chat = doc.body.classList.contains('chat-only-active');
    if (chat === lastChatMode) return;
    lastChatMode = chat;
    if (!runtime.TronoDesktop) controller.toggle(false);
  }
  function bind() {
    if (bound) return;
    bound = true;
    toggle = doc.getElementById('communityToggle');
    flushSync(() => {
      const panel = createRoot(doc.getElementById('communityPanel')!);
      const notices = createRoot(doc.getElementById('callNoticeHost')!);
      roots.push(panel, notices);
      panel.render(
        <CommunityContents
          controller={controller}
          actions={{
            openProfile: (id) => runtime.TronoProfile.openMini(id),
            openMessage: (id) => runtime.TronoMessenger?.open(id),
            editRole: (person) => runtime.TronoCommunityAdmin?.editRole(person),
          }}
        />,
      );
      notices.render(<CommunityNotices controller={controller} />);
    });
    unsubscribe = controller.subscribe(sync);
    toggle?.addEventListener('click', onToggle);
    target.addEventListener('resize', resize);
    doc.addEventListener('keydown', keydown);
    observer = new MutationObserver(mode);
    observer.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
    controller.start();
    mode();
    sync();
  }
  target.addEventListener('trono:ready', bind, { once: true });
  const dispose = () => {
    target.removeEventListener('trono:ready', bind);
    toggle?.removeEventListener('click', onToggle);
    target.removeEventListener('resize', resize);
    doc.removeEventListener('keydown', keydown);
    observer?.disconnect();
    unsubscribe?.();
    controller.dispose();
    flushSync(() => {
      roots.forEach((root) => root.unmount());
      for (const root of gameRoots.values()) root.unmount();
    });
    for (const host of gameRoots.keys()) host.remove();
    gameRoots.clear();
    doc.body.classList.remove('community-open');
    doc.getElementById('communityPanel')?.classList.add('hidden');
    toggle?.classList.add('hidden');
    toggle?.setAttribute('aria-expanded', 'false');
    if (runtime.TronoCommunity === controller) delete runtime.TronoCommunity;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
