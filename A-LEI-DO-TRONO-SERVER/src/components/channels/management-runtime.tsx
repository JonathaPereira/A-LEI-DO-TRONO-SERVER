import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { NetworkAccount } from '../../types/network';
import type { NetworkClient } from '../../lib/socket/client';
import type { ChannelsController } from '../../lib/channels/catalog';
import type { FilesClient } from '../../lib/files/client';
import { createChannelManagement } from '../../lib/channels/management';
import { createChannelFiles } from '../../lib/channels/files';
import {
  ChannelManagerContents,
  RoleEditorContents,
  ChannelFilesContents,
} from '../modals/community-management-contents';

interface ManagementRuntime extends Window {
  TronoAuth: { readonly user: NetworkAccount | null; getAccessToken(): Promise<string | null> };
  TronoNetwork: NetworkClient;
  TronoChannels: ChannelsController;
  TronoFiles: FilesClient;
  TronoChannelManagement?: ReturnType<typeof createChannelManagement>;
  TronoChannelFiles?: ReturnType<typeof createChannelFiles>;
  TronoCommunityAdmin?: {
    api: ReturnType<typeof createChannelManagement>['api'];
    refresh: ReturnType<typeof createChannelManagement>['refresh'];
    editRole: ReturnType<typeof createChannelManagement>['editRole'];
    openChannelFiles: ReturnType<typeof createChannelFiles>['open'];
  };
}
const installed = new WeakMap<Window, () => void>();
export function initializeChannelManagement(target: Window, { mount = true } = {}): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as ManagementRuntime,
    doc = target.document;
  const controller = createChannelManagement({
    channels: runtime.TronoChannels,
    network: runtime.TronoNetwork,
    getAccount: () => runtime.TronoAuth.user,
    getAccessToken: () => runtime.TronoAuth.getAccessToken(),
    fetch: (input, options) => target.fetch(input, options),
    subscribeIdentity(listener) {
      target.addEventListener('trono-auth-change', listener);
      target.addEventListener('trono-role-change', listener);
      return () => {
        target.removeEventListener('trono-auth-change', listener);
        target.removeEventListener('trono-role-change', listener);
      };
    },
  });
  const files = createChannelFiles({ files: runtime.TronoFiles, network: runtime.TronoNetwork });
  runtime.TronoChannelManagement = controller;
  runtime.TronoChannelFiles = files;
  const facade = {
    api: controller.api,
    refresh: controller.refresh,
    editRole: controller.editRole,
    openChannelFiles: files.open,
  };
  runtime.TronoCommunityAdmin = facade;
  const roots: Root[] = [],
    cleanup: (() => void)[] = [];
  let bound = false;
  function sync() {
    const state = controller.getSnapshot();
    for (const id of ['createChannelBtn', 'communityManageBtn'])
      doc.getElementById(id)?.classList.toggle('hidden', !state.canManageChannels);
    const badge = doc.getElementById('myRoleBadge');
    if (badge) {
      badge.textContent =
        state.role === 'creator'
          ? 'Criador'
          : state.role === 'admin'
            ? 'Admin'
            : state.role
              ? 'Membro'
              : '';
      badge.className = 'role-badge role-' + (state.role ?? 'member');
    }
  }
  function bind() {
    if (bound) return;
    bound = true;
    flushSync(() => {
      const manager = createRoot(doc.getElementById('channelManagerDialog')!);
      const roles = createRoot(doc.getElementById('roleDialog')!);
      const attachments = createRoot(doc.getElementById('channelFilesDialog')!);
      roots.push(manager, roles, attachments);
      manager.render(<ChannelManagerContents controller={controller} />);
      roles.render(<RoleEditorContents controller={controller} />);
      attachments.render(<ChannelFilesContents controller={files} />);
    });
    for (const id of ['createChannelBtn', 'communityManageBtn', 'channelFilesBtn']) {
      const button = doc.getElementById(id);
      const click = () => void (id === 'channelFilesBtn' ? files.open() : controller.openManager());
      button?.addEventListener('click', click);
      cleanup.push(() => button?.removeEventListener('click', click));
    }
    cleanup.push(controller.subscribe(sync));
    sync();
  }
  if (mount) target.addEventListener('trono:ready', bind, { once: true });
  const dispose = () => {
    target.removeEventListener('trono:ready', bind);
    cleanup.forEach((remove) => remove());
    controller.dispose();
    files.dispose();
    flushSync(() => roots.forEach((root) => root.unmount()));
    for (const id of ['channelManagerDialog', 'roleDialog', 'channelFilesDialog'])
      (doc.getElementById(id) as HTMLDialogElement)?.close();
    if (runtime.TronoCommunityAdmin === facade) delete runtime.TronoCommunityAdmin;
    if (runtime.TronoChannelManagement === controller) delete runtime.TronoChannelManagement;
    if (runtime.TronoChannelFiles === files) delete runtime.TronoChannelFiles;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
