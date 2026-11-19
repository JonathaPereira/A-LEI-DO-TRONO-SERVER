import type { FileRecord } from '../../types/files';
import type { FilesClient } from '../files/client.ts';
import type { NetworkClient } from '../socket/client.ts';
import { readChannelFilesPage } from './management-protocol.ts';

export interface ChannelFilesSnapshot {
  readonly open: boolean;
  readonly roomId: string | null;
  readonly files: readonly FileRecord[];
  readonly nextOffset: number;
  readonly hasMore: boolean;
  readonly loading: boolean;
  readonly message: string;
  readonly error: boolean;
}
interface ChannelFilesOptions {
  files: Pick<FilesClient, 'api' | 'subscribe' | 'getSnapshot'>;
  network: Pick<NetworkClient, 'getSnapshot' | 'subscribe' | 'onMessage'>;
}
const empty: ChannelFilesSnapshot = Object.freeze({
  open: false,
  roomId: null,
  files: Object.freeze([]),
  nextOffset: 0,
  hasMore: false,
  loading: false,
  message: '',
  error: false,
});

/** A paged channel view; URLs, tombstones and moderation remain owned by FilesClient. */
export function createChannelFiles({ files, network }: ChannelFilesOptions) {
  let state = empty,
    epoch = files.getSnapshot().epoch,
    generation = 0,
    disposed = false;
  let request: AbortController | null = null;
  const listeners = new Set<() => void>();
  function update(patch: Partial<ChannelFilesSnapshot>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) listener();
  }
  function close() {
    generation++;
    request?.abort();
    request = null;
    update(empty);
  }
  function sync() {
    const source = files.getSnapshot(),
      selected = network.getSnapshot();
    if (
      source.epoch !== epoch ||
      (state.open && (!selected.connected || state.roomId !== selected.currentRoom))
    ) {
      epoch = source.epoch;
      close();
    }
  }
  async function load(append: boolean) {
    sync();
    const { currentRoom: roomId, connected } = network.getSnapshot();
    if (
      disposed ||
      !connected ||
      !roomId ||
      !files.getSnapshot().accountId ||
      (append && (!state.open || state.loading || !state.hasMore))
    )
      return;
    request?.abort();
    request = new AbortController();
    const signal = request.signal,
      operation = ++generation,
      offset = append ? state.nextOffset : 0;
    const current = () => {
      sync();
      return !disposed && operation === generation && state.open;
    };
    update({
      ...(append ? {} : empty),
      open: true,
      roomId,
      loading: true,
      message: 'Carregando anexos…',
      error: false,
    });
    try {
      const data = await files.api('/channel/' + encodeURIComponent(roomId) + '?offset=' + offset, {
        signal,
      });
      if (!current()) return;
      const page = readChannelFilesPage(data, roomId, offset),
        seen = new Set(state.files.map((file) => file.id));
      const rows = Object.freeze([
        ...state.files,
        ...page.files.filter((file) => !seen.has(file.id)),
      ]);
      update({
        files: rows,
        nextOffset: page.nextOffset,
        hasMore: page.hasMore,
        message: rows.length ? '' : 'Nenhum anexo neste canal.',
      });
    } catch (error) {
      if (current())
        update({
          message: error instanceof Error ? error.message : 'Não foi possível carregar os anexos.',
          error: true,
        });
    } finally {
      if (current()) {
        request = null;
        update({ loading: false });
      }
    }
  }
  const cleanup = [
    files.subscribe(sync),
    network.subscribe(sync),
    network.onMessage((message) => {
      if (message.type === 'channel-deleted' && message.roomId === state.roomId) close();
    }),
  ];
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open: () => load(false),
    more: () => load(true),
    close,
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      request?.abort();
      request = null;
      cleanup.forEach((remove) => remove());
      state = empty;
      for (const listener of listeners) listener();
      listeners.clear();
    },
  };
}
export type ChannelFiles = ReturnType<typeof createChannelFiles>;
