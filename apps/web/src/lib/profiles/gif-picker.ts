import type { GifPickerSelection, GifPickerSnapshot } from '../../types/profile-gifs';
import { download, fromURL, search } from './giphy.ts';
import { record } from './protocol.ts';

export interface GifPickerOptions {
  backendHttp: string;
  getAccountId(): string | null;
  getAccessToken(): Promise<string | null>;
  fetch: typeof fetch;
  subscribeIdentity(listener: () => void): () => void;
  timeout?(milliseconds: number): AbortSignal;
}
export const EMPTY_GIF_PICKER: GifPickerSnapshot = Object.freeze({
  open: false,
  target: 'avatar',
  query: '',
  link: '',
  items: Object.freeze([]),
  next: null,
  loading: false,
  busy: false,
  failed: Object.freeze([]),
  message: '',
});

/** Includes token waits and callbacks that cannot themselves be aborted in the request deadline. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}
function errorText(error: unknown, downloading = false): string {
  if (!(error instanceof Error)) return 'Não foi possível carregar GIFs.';
  if (error.name !== 'TimeoutError') return error.message;
  return downloading
    ? 'O download demorou demais. Tente outro GIF.'
    : 'A busca demorou demais. Tente novamente.';
}

/** One account/opening owns search, pagination and a single selection; the editor owns the resulting file. */
export function createGifPicker(options: GifPickerOptions) {
  let state = EMPTY_GIF_PICKER,
    disposed = false,
    generation = 0;
  let accountId = options.getAccountId(),
    request: AbortController | null = null;
  let selection: GifPickerSelection | null = null,
    term = '';
  const listeners = new Set<() => void>();
  function update(patch: Partial<GifPickerSnapshot>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) listener();
  }
  function invalidate() {
    generation++;
    request?.abort();
    request = null;
  }
  function close() {
    if (disposed) return;
    invalidate();
    selection = null;
    term = '';
    update(EMPTY_GIF_PICKER);
  }
  function syncIdentity() {
    const next = options.getAccountId();
    if (next === accountId) return;
    accountId = next;
    close();
  }
  function current(sequence: number) {
    syncIdentity();
    return !disposed && state.open && sequence === generation && !!accountId;
  }
  function start(milliseconds: number) {
    invalidate();
    request = new AbortController();
    return {
      sequence: generation,
      signal: AbortSignal.any([
        request.signal,
        (options.timeout ?? AbortSignal.timeout)(milliseconds),
      ]),
    };
  }
  async function run(append = false): Promise<void> {
    syncIdentity();
    if (disposed || !state.open || state.busy || (append && (state.loading || state.next === null)))
      return;
    const offset = append ? state.next! : 0;
    const { sequence, signal } = start(20000);
    if (!append) term = state.query.trim();
    update({
      loading: true,
      message: 'Buscando GIFs…',
      ...(append ? {} : { items: Object.freeze([]), failed: Object.freeze([]), next: null }),
    });
    try {
      const token = await abortable(options.getAccessToken(), signal);
      if (!current(sequence)) return;
      signal.throwIfAborted();
      if (!token) throw Error('Entre na sua conta para buscar GIFs.');
      const response = await abortable(
        options.fetch(options.backendHttp + '/community/gif-provider', {
          signal,
          headers: { Authorization: 'Bearer ' + token },
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
        }),
        signal,
      );
      if (!current(sequence)) return;
      if (response.status !== 404 && !response.ok)
        throw Error('A busca de GIFs está indisponível. Você pode usar um link do GIPHY.');
      const raw: unknown =
        response.status === 404 ? null : await abortable(response.json(), signal);
      const data = record(raw) ? raw : {};
      if (!current(sequence)) return;
      const apiKey =
        data.provider === 'giphy' &&
        data.configured === true &&
        typeof data.apiKey === 'string' &&
        data.apiKey
          ? data.apiKey
          : null;
      if (!apiKey) {
        update({
          next: null,
          message: 'Abra a busca no GIPHY, escolha um GIF e cole o link acima para usar no perfil.',
        });
        return;
      }
      const result = await abortable(
        search(term, { offset, apiKey, signal, fetcher: options.fetch }),
        signal,
      );
      if (!current(sequence)) return;
      const seen = new Set(state.items.map((item) => item.id));
      const items = Object.freeze([
        ...state.items,
        ...result.items.filter((item) => !seen.has(item.id)),
      ]);
      // Ignore a malformed provider cursor that would repeat the current page forever.
      update({
        items,
        next: result.next !== null && result.next > offset ? result.next : null,
        message: items.length
          ? 'Escolha um GIF para ver a prévia.'
          : 'Nenhum GIF de até 10 MB encontrado. Tente outro termo ou carregue mais.',
      });
    } catch (error) {
      if (current(sequence) && !(error instanceof Error && error.name === 'AbortError'))
        update({ message: errorText(error) });
    } finally {
      if (current(sequence)) {
        request = null;
        update({ loading: false });
      }
    }
  }
  async function select(id: string): Promise<void> {
    syncIdentity();
    const item = state.items.find((candidate) => candidate.id === id);
    if (disposed || !state.open || state.busy || !selection || !item || state.failed.includes(id))
      return;
    const callback = selection.onSelect;
    const { sequence, signal } = start(30000);
    update({ busy: true, loading: false, message: 'Preparando GIF…' });
    try {
      const file = await abortable(download(item, { signal, fetcher: options.fetch }), signal);
      if (!current(sequence)) return;
      await abortable(callback(file, item.credit), signal);
      if (current(sequence)) close();
    } catch (error) {
      if (current(sequence) && !(error instanceof Error && error.name === 'AbortError'))
        update({ message: errorText(error, true) });
    } finally {
      if (current(sequence)) {
        request = null;
        update({ busy: false });
      }
    }
  }
  const unsubscribe = options.subscribeIdentity(syncIdentity);
  return {
    open(value: GifPickerSelection) {
      if (disposed) return;
      syncIdentity();
      if (!accountId) {
        close();
        return;
      }
      invalidate();
      selection = value;
      term = '';
      update({ ...EMPTY_GIF_PICKER, open: true, target: value.target });
      void run();
    },
    close,
    search: () => run(),
    more: () => run(true),
    select,
    setQuery(query: string) {
      if (state.open && !state.busy) update({ query: query.slice(0, 80) });
    },
    setLink(link: string) {
      if (state.open && !state.busy) update({ link: link.slice(0, 2048) });
    },
    previewLink() {
      if (!state.open || state.busy) return;
      try {
        const item = fromURL(state.link);
        invalidate();
        update({
          items: Object.freeze([item]),
          failed: Object.freeze([]),
          next: null,
          loading: false,
          message: 'Confira o GIF e clique nele para usar no perfil.',
        });
      } catch (error) {
        update({ message: errorText(error) });
      }
    },
    imageFailed(id: string) {
      if (!state.open || !state.items.some((item) => item.id === id) || state.failed.includes(id))
        return;
      update({
        failed: Object.freeze([...state.failed, id]),
        message: 'Não foi possível carregar esse GIF. Confira o link ou escolha outro.',
      });
    },
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidate();
      selection = null;
      state = EMPTY_GIF_PICKER;
      unsubscribe();
      for (const listener of listeners) listener();
      listeners.clear();
    },
  };
}
export type GifPicker = ReturnType<typeof createGifPicker>;
