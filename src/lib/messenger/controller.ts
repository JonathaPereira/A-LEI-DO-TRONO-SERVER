import type { DirectMessage, DirectPayload, MessengerSnapshot } from '../../types/messenger';
import type { FileRecord } from '../../types/files';
import type { FilesClient } from '../files/client.ts';
import { FILE_LIMITS, formatFileSize } from '../files/client.ts';
import type { NetworkClient } from '../socket/client.ts';
import type { CommunityController } from '../community/controller.ts';
import type { ChannelsController } from '../channels/catalog.ts';
import type { NotificationsController } from '../notifications/controller.ts';
import type { SocialClient } from './client.ts';
import { readDirectMessage, readDirectPage, readSocialSnapshot, socialId } from './protocol.ts';
import { directPerson } from './selectors.ts';
import { record } from '../files/protocol.ts';

interface MessengerOptions {
  client: Pick<SocialClient, 'request'>;
  files: Pick<FilesClient, 'getSnapshot' | 'subscribe' | 'upload'>;
  community: Pick<CommunityController, 'getSnapshot' | 'subscribe'>;
  network: Pick<NetworkClient, 'onMessage'>;
  channels: Pick<ChannelsController, 'getSnapshot'>;
  notifications: Pick<NotificationsController, 'allowed' | 'notify' | 'subscribe'>;
  foreground(): boolean;
  openLogin(): void;
  beforeOpen(): void;
  randomId?: () => string;
  schedule?: (callback: () => void, delay: number) => () => void;
  warn?(error: unknown): void;
}
interface Draft {
  text: string;
  file: File | null;
  uploaded: FileRecord | null;
  pending: DirectPayload | null;
}
interface Sending {
  peer: string;
  epoch: number;
  generation: number;
  stage: 'upload' | 'send';
  controller: AbortController;
}
const empty = Object.freeze([]),
  emptyDraft = Object.freeze({ text: '', file: null });
const initial: MessengerSnapshot = Object.freeze({
  accountId: null,
  peerId: null,
  open: false,
  friends: empty,
  threads: empty,
  members: empty,
  search: '',
  messages: empty,
  hasMore: false,
  reading: false,
  change: 'replace',
  draft: emptyDraft,
  sending: null,
  status: '',
  toasts: empty,
  inviteOpen: false,
  inviteChannel: '',
  actionPending: empty,
});
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível completar a operação.';

/** Owns private conversations and per-peer drafts; media and delivery transports stay with their owners. */
export function createMessenger(options: MessengerOptions) {
  const schedule =
    options.schedule ??
    ((callback, delay) => {
      const timer = setTimeout(callback, delay);
      return () => clearTimeout(timer);
    });
  let state = initial,
    epoch = options.files.getSnapshot().epoch,
    generation = 0,
    disposed = false,
    started = false;
  let active: Sending | null = null,
    readController: AbortController | null = null,
    olderController: AbortController | null = null,
    refreshTimer: (() => void) | null = null;
  let refreshing = false,
    refreshAgain = false,
    revision = 0;
  const drafts = new Map<string, Draft>(),
    seen = new Set<string>(),
    timers = new Map<string, () => void>(),
    actions = new Set<string>(),
    listeners = new Set<() => void>(),
    cleanup: (() => void)[] = [];
  function draft(id = state.peerId): Draft {
    if (!id) return { text: '', file: null, uploaded: null, pending: null };
    if (!drafts.has(id)) drafts.set(id, { text: '', file: null, uploaded: null, pending: null });
    return drafts.get(id)!;
  }
  function update(patch: Partial<MessengerSnapshot>) {
    if (disposed) return;
    const next = { ...state, ...patch },
      selected = draft(next.peerId);
    state = Object.freeze({
      ...next,
      draft: Object.freeze({ text: selected.text, file: selected.file }),
      sending: active && isSending(active) ? active.stage : null,
    });
    for (const listener of listeners) listener();
  }
  const current = (operation: number) =>
    !disposed && operation === options.files.getSnapshot().epoch;
  function isSending(op: Sending) {
    return (
      current(op.epoch) && active === op && op.peer === state.peerId && op.generation === generation
    );
  }
  function stopUpload() {
    const previous = active;
    active = null;
    if (previous?.stage === 'upload') previous.controller.abort();
  }
  const activeThread = (id: string | null) =>
    !!id && state.open && state.peerId === id && options.foreground();
  function removeToast(id: string) {
    timers.get(id)?.();
    timers.delete(id);
    if (state.toasts.some((row) => row.peerId === id))
      update({ toasts: Object.freeze(state.toasts.filter((row) => row.peerId !== id)) });
  }
  function toastTimer(id: string, pause = false) {
    timers.get(id)?.();
    timers.delete(id);
    if (!pause && state.toasts.some((row) => row.peerId === id))
      timers.set(
        id,
        schedule(() => removeToast(id), 8000),
      );
  }
  function showToast(id: string, message: DirectMessage, name: string) {
    if (
      activeThread(id) ||
      !options.notifications.allowed({ type: 'direct', id }, { direct: true })
    )
      return;
    removeToast(id);
    while (state.toasts.length >= 3) removeToast(state.toasts[0].peerId);
    update({
      toasts: Object.freeze([
        ...state.toasts,
        Object.freeze({
          peerId: id,
          name: name || directPerson(state, id)?.name || 'Amigo',
          text: (message.text || 'Enviou um anexo').slice(0, 100),
        }),
      ]),
    });
    toastTimer(id);
  }
  function syncPresence() {
    const source = options.community.getSnapshot();
    update({
      members:
        source.identity?.accountId === state.accountId
          ? Object.freeze(source.presence?.members.filter((row) => !row.guest) ?? [])
          : empty,
    });
  }
  function syncIdentity() {
    const source = options.files.getSnapshot();
    if (source.epoch === epoch && source.accountId === state.accountId) return;
    epoch = source.epoch;
    generation++;
    revision++;
    stopUpload();
    readController?.abort();
    olderController?.abort();
    olderController = null;
    readController = null;
    refreshTimer?.();
    refreshTimer = null;
    for (const cancel of timers.values()) cancel();
    timers.clear();
    drafts.clear();
    seen.clear();
    actions.clear();
    update({ ...initial, accountId: source.accountId });
    syncPresence();
    if (state.accountId) queueRefresh();
  }
  async function refresh() {
    if (!state.accountId || disposed) return;
    if (refreshing) {
      refreshAgain = true;
      return;
    }
    refreshing = true;
    const operation = epoch,
      version = revision;
    try {
      const data = readSocialSnapshot(await options.client.request('snapshot'), state.accountId);
      if (!current(operation)) return;
      if (version !== revision) {
        refreshAgain = true;
        return;
      }
      update(data);
      const last = state.threads.find((row) => row.id === state.peerId)?.last;
      if (state.open && last && last.id !== state.messages.at(-1)?.id) void read();
    } catch (error) {
      if (current(operation)) update({ status: errorText(error) });
    } finally {
      refreshing = false;
      if (refreshAgain && !disposed) {
        refreshAgain = false;
        queueRefresh();
      }
    }
  }
  function queueRefresh() {
    refreshTimer?.();
    if (!disposed)
      refreshTimer = schedule(() => {
        refreshTimer = null;
        void refresh();
      }, 250);
  }
  function merge(messages: readonly DirectMessage[], change: MessengerSnapshot['change']) {
    const byId = new Map(state.messages.map((row) => [row.id, row]));
    for (const row of messages) {
      const previous = byId.get(row.id);
      byId.set(
        row.id,
        previous?.attachment?.deleted && row.attachment
          ? Object.freeze({
              ...row,
              attachment: Object.freeze({ ...row.attachment, deleted: true }),
            })
          : row,
      );
    }
    update({
      messages: Object.freeze(
        [...byId.values()].sort(
          (a, b) => Date.parse(a.ts) - Date.parse(b.ts) || a.id.localeCompare(b.id),
        ),
      ),
      change,
    });
  }
  async function read(older = false) {
    if (!state.peerId || !state.accountId || (older && (olderController || !state.hasMore))) return;
    const peer = state.peerId,
      owner = state.accountId,
      operation = epoch,
      version = generation,
      cursor = older ? state.messages[0]?.id : null;
    const request = new AbortController();
    if (older) olderController = request;
    if (!older) {
      readController?.abort();
      readController = request;
    }
    const valid = () => current(operation) && state.peerId === peer && generation === version;
    update({ reading: true });
    try {
      const page = readDirectPage(
        await options.client.request('read', { peerId: peer, before: cursor }, request.signal),
        owner,
        peer,
      );
      if (!valid() || request.signal.aborted) return;
      const previousFirst = state.messages[0]?.id;
      merge(page.messages, older ? 'prepend' : 'append');
      const first = state.messages[0]?.id;
      if (page.messages[0]?.id === first || !first || (older && cursor === previousFirst))
        update({ hasMore: page.hasMore });
      if (!older) void markRead();
    } catch (error) {
      if (valid() && !request.signal.aborted) update({ status: errorText(error) });
    } finally {
      if (older && olderController === request) olderController = null;
      if (!older && readController === request) readController = null;
      if (valid()) update({ reading: !!readController || !!olderController });
    }
  }
  const marking = new Set<string>();
  async function markRead() {
    const peer = state.peerId,
      last = state.messages.at(-1)?.id;
    if (!peer || !last || !activeThread(peer)) return;
    const operation = epoch,
      key = `${operation}:${peer}:${last}`;
    if (marking.has(key)) return;
    marking.add(key);
    try {
      await options.client.request('mark-read', { peerId: peer, messageId: last });
      if (
        !current(operation) ||
        state.peerId !== peer ||
        state.messages.at(-1)?.id !== last ||
        !activeThread(peer)
      )
        return;
      revision++;
      update({
        threads: Object.freeze(
          state.threads.map((row) =>
            row.id === peer ? Object.freeze({ ...row, unread: 0 }) : row,
          ),
        ),
      });
    } catch {
    } finally {
      marking.delete(key);
    }
  }
  function changePeer(id: string | null) {
    if (id === state.peerId) return;
    stopUpload();
    readController?.abort();
    olderController?.abort();
    olderController = null;
    generation++;
    state = Object.freeze({ ...state, peerId: id });
    update({
      messages: empty,
      hasMore: false,
      reading: false,
      change: 'replace',
      status: '',
      inviteOpen: false,
    });
  }
  async function open(id?: string) {
    syncIdentity();
    if (!state.accountId) {
      options.openLogin();
      return;
    }
    if (id) {
      socialId(id);
      if (id === state.accountId) return;
    }
    options.beforeOpen();
    if (id) changePeer(id);
    removeToast(id ?? '');
    update({ open: true });
    queueRefresh();
    if (state.peerId) void read();
  }
  async function friendAction(id: string, action: 'request' | 'accept' | 'decline' | 'remove') {
    if (actions.has(id) || !state.accountId) return;
    socialId(id);
    const operation = epoch,
      selected = state.peerId;
    actions.add(id);
    update({ actionPending: Object.freeze([...actions]) });
    try {
      const data = await options.client.request('friend', { peerId: id, action });
      if (!record(data) || data.ok !== true) throw new Error('Amizade não confirmada.');
      if (!current(operation)) return;
      await refresh();
      if (current(operation) && selected === state.peerId)
        update({ status: action === 'request' ? 'Pedido de amizade enviado.' : '' });
    } catch (error) {
      if (current(operation) && selected === state.peerId) update({ status: errorText(error) });
    } finally {
      if (current(operation)) {
        actions.delete(id);
        update({ actionPending: Object.freeze([...actions]) });
      }
    }
  }
  async function submit(roomId: string | null = null) {
    const peer = state.peerId,
      owner = state.accountId,
      item = draft(),
      text = item.text.trim(),
      file = roomId ? null : item.file;
    if (
      !peer ||
      !owner ||
      active ||
      state.friends.find((row) => row.id === peer)?.state !== 'accepted' ||
      (!text && !roomId && !file)
    )
      return;
    if ([...text].length > 2000) {
      update({ status: 'Escreva até 2000 caracteres.' });
      return;
    }
    const op: Sending = {
      peer,
      epoch,
      generation,
      controller: new AbortController(),
      stage: file && !item.uploaded ? 'upload' : 'send',
    };
    active = op;
    update({ status: file ? 'Preparando anexo…' : 'Enviando…' });
    try {
      let attachment = item.uploaded;
      if (file && !attachment) {
        attachment = await options.files.upload(file, {
          kind: 'direct',
          peerId: peer,
          signal: op.controller.signal,
          onProgress: (percent) => {
            if (isSending(op))
              update({
                status: `Enviando ${file.type.startsWith('image/') ? 'imagem' : file.name}: ${percent}%`,
              });
          },
        });
        if (!current(op.epoch)) return;
        if (item.file === file) item.uploaded = attachment;
      }
      if (!isSending(op)) return;
      op.stage = 'send';
      update({});
      const attachmentId = file ? attachment!.id : null,
        prior = item.pending;
      const payload =
        prior &&
        prior.text === text &&
        prior.roomId === roomId &&
        prior.attachmentId === attachmentId
          ? prior
          : Object.freeze({
              id: (options.randomId ?? crypto.randomUUID.bind(crypto))(),
              peerId: peer,
              text,
              roomId,
              attachmentId,
            });
      item.pending = payload;
      const sent = readDirectMessage(await options.client.request('send', payload), owner, peer);
      if (
        sent.id !== payload.id ||
        sent.senderId !== owner ||
        sent.roomId !== roomId ||
        (sent.attachment?.id ?? null) !== attachmentId
      )
        throw new Error('Mensagem não confirmada.');
      if (!current(op.epoch)) return;
      if (item.pending === payload) item.pending = null;
      if (!roomId && item.text.trim() === text) item.text = '';
      if (file && item.file === file) {
        item.file = null;
        item.uploaded = null;
      }
      if (!isSending(op)) return;
      merge([sent], 'append');
      update({ status: '' });
      queueRefresh();
      void markRead();
    } catch (error) {
      if (isSending(op))
        update({
          status: errorText(error) + ' Seu texto e anexo foram mantidos para tentar novamente.',
        });
    } finally {
      if (active === op) {
        active = null;
        update({});
      }
    }
  }
  function receive(
    event: Parameters<NetworkClient['onMessage']>[0] extends (value: infer T) => void ? T : never,
  ) {
    if (!state.accountId || disposed) return;
    if (event.type === 'auth-result' && event.ok) queueRefresh();
    if (event.type === 'social-changed') {
      revision++;
      queueRefresh();
      if (
        event.kind === 'friend' &&
        event.accountId !== state.accountId &&
        event.action === 'request' &&
        typeof event.accountId === 'string' &&
        typeof event.name === 'string'
      )
        void options.notifications.notify({
          key: 'friend:' + event.accountId,
          title: 'Pedido de amizade',
          body: event.name + ' quer adicionar você.',
          target: { type: 'friends', id: event.accountId },
          request: true,
        });
    }
    if (event.type !== 'direct-message') return;
    try {
      if (!record(event.message) || typeof event.message.senderId !== 'string')
        throw new Error('Mensagem privada inválida.');
      const other =
        event.message.senderId === state.accountId
          ? socialId(event.peerId)
          : socialId(event.message.senderId);
      const message = readDirectMessage(event.message, state.accountId, other);
      if (seen.has(message.id)) return;
      seen.add(message.id);
      if (seen.size > 500) seen.delete(seen.values().next().value!);
      revision++;
      if (other === state.peerId) {
        merge([message], 'append');
        void markRead();
      }
      if (message.senderId !== state.accountId && !activeThread(other)) {
        const name =
          typeof event.senderName === 'string'
            ? event.senderName
            : (directPerson(state, other)?.name ?? 'Amigo');
        showToast(other, message, name);
        void options.notifications.notify({
          key: message.id,
          title: name + ' · mensagem privada',
          body: message.text || 'Enviou um anexo',
          target: { type: 'direct', id: other },
          direct: true,
        });
      }
      queueRefresh();
    } catch (error) {
      options.warn?.(error);
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (started || disposed) return;
      started = true;
      cleanup.push(
        options.files.subscribe(syncIdentity),
        options.community.subscribe(syncPresence),
        options.network.onMessage(receive),
        options.notifications.subscribe(() => {
          for (const toast of state.toasts)
            if (
              !options.notifications.allowed({ type: 'direct', id: toast.peerId }, { direct: true })
            )
              removeToast(toast.peerId);
        }),
      );
      syncIdentity();
      syncPresence();
      if (state.accountId) queueRefresh();
    },
    open,
    close: () => update({ open: false }),
    async openFriends() {
      changePeer(null);
      await open();
    },
    refresh,
    read,
    submit,
    friendAction,
    removeToast,
    toastTimer,
    attention() {
      queueRefresh();
      void markRead();
    },
    setSearch(search: string) {
      update({ search });
    },
    setText(text: string) {
      if (state.peerId) {
        draft().text = text;
        update({});
      }
    },
    setFile(file: File | null) {
      if (!state.peerId || active) return;
      if (file) {
        const max = /\.(mp4|webm)$/i.test(file.name) ? FILE_LIMITS.video : FILE_LIMITS.file;
        if (!file.size || file.size > max) {
          update({ status: 'Limite: ' + formatFileSize(max) + ' por arquivo.' });
          return;
        }
      }
      Object.assign(draft(), { file, uploaded: null, pending: null });
      update({ status: file ? 'Anexo pronto. Clique em Enviar.' : 'Anexo removido.' });
    },
    removeFile() {
      if (active?.stage === 'send') return;
      stopUpload();
      Object.assign(draft(), { file: null, uploaded: null, pending: null });
      update({ status: 'Anexo removido.' });
    },
    toggleInvite(defaultId: string | null) {
      const channels = options.channels.getSnapshot().channels;
      update({
        inviteOpen: !state.inviteOpen,
        inviteChannel: channels.find((row) => row.id === defaultId)?.id ?? channels[0]?.id ?? '',
      });
    },
    selectInvite(inviteChannel: string) {
      update({ inviteChannel });
    },
    async invite() {
      const id = state.inviteChannel;
      update({ inviteOpen: false });
      if (options.channels.getSnapshot().channels.some((row) => row.id === id)) await submit(id);
    },
    report(status: string) {
      update({ status });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      stopUpload();
      readController?.abort();
      olderController?.abort();
      refreshTimer?.();
      for (const cancel of timers.values()) cancel();
      timers.clear();
      drafts.clear();
      seen.clear();
      cleanup.forEach((remove) => remove());
      state = initial;
      for (const listener of listeners) listener();
      listeners.clear();
    },
  };
}
export type Messenger = ReturnType<typeof createMessenger>;
