import type { ProfileGif, ProfileGifPage } from '../../types/profile-gifs';
import { record } from './protocol.ts';

const fields = (value: unknown): Record<string, unknown> => (record(value) ? value : {});
const LIMIT = 10_000_000;
const text = (value: unknown) =>
  String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
export function safeGifUrl(value: unknown, media = false): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (media
        ? /^(media[0-4]?|i)\.giphy\.com$/.test(url.hostname)
        : url.hostname === 'giphy.com' && /^\/(gifs|stickers)\/[\w-]+\/?$/.test(url.pathname))
      ? media
        ? url.href
        : url.origin + url.pathname
      : null;
  } catch {
    return null;
  }
}
export function query(term: string, offset = 0, apiKey?: string): string {
  if (!apiKey) throw Error('Abra o GIPHY e cole o link do GIF abaixo.');
  const q = term.trim().slice(0, 80);
  const url = new URL('https://api.giphy.com/v1/gifs/' + (q ? 'search' : 'trending'));
  url.search = new URLSearchParams({
    api_key: apiKey,
    limit: '12',
    offset: String(Math.min(4999, Math.max(0, Math.floor(Number(offset) || 0)))),
    rating: 'pg-13',
    lang: 'pt',
    ...(q ? { q } : {}),
  }).toString();
  return url.href;
}
/** External catalogue records are projected before they reach React or the editor. */
export function parse(value: unknown): ProfileGifPage {
  const data = fields(value),
    items: ProfileGif[] = [],
    seen = new Set<string>();
  for (const raw of Array.isArray(data.data) ? data.data : []) {
    const gif = fields(raw);
    if (
      gif.type !== 'gif' ||
      typeof gif.id !== 'string' ||
      !/^[a-zA-Z0-9]{2,80}$/.test(gif.id) ||
      seen.has(gif.id) ||
      (gif.rating && !['g', 'pg', 'pg-13'].includes(String(gif.rating)))
    )
      continue;
    const source = safeGifUrl(gif.url);
    if (!source) continue;
    const images = fields(gif.images);
    const image = ['original', 'downsized_medium', 'downsized', 'fixed_height', 'fixed_width']
      .map((key) => fields(images[key]))
      .find((item) => {
        const url = safeGifUrl(item.url, true),
          width = Number(item.width),
          height = Number(item.height);
        return (
          url &&
          /\.gif$/i.test(new URL(url).pathname) &&
          Number(item.size) > 0 &&
          Number(item.size) <= LIMIT &&
          width > 0 &&
          height > 0 &&
          Number.isFinite(width * height) &&
          width * height <= 40_000_000
        );
      });
    if (!image) continue;
    seen.add(gif.id);
    const url = safeGifUrl(image.url, true)!;
    items.push(
      Object.freeze({
        id: gif.id,
        url,
        preview:
          safeGifUrl(fields(images.fixed_width_small).url, true) ||
          safeGifUrl(fields(images.preview_gif).url, true) ||
          url,
        bytes: Number(image.size),
        credit: Object.freeze({
          title: text(gif.title || 'GIF do GIPHY').slice(0, 200),
          author: text(fields(gif.user).display_name || gif.username || 'GIPHY').slice(0, 200),
          license: 'Ver no GIPHY',
          source,
          license_url: '',
        }),
      }),
    );
  }
  const pagination = fields(data.pagination),
    offset = Number(pagination.offset),
    count = Number(pagination.count),
    total = Number(pagination.total_count),
    next = offset + count;
  return Object.freeze({
    items: Object.freeze(items),
    next:
      Number.isInteger(offset) &&
      offset >= 0 &&
      Number.isInteger(count) &&
      count > 0 &&
      Number.isFinite(total) &&
      next < total &&
      next <= 4999
        ? next
        : null,
  });
}
export function fromURL(value: string): ProfileGif {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw Error('Cole o link de um GIF do GIPHY.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    throw Error('Use um link HTTPS do GIPHY.');
  let id: string | undefined;
  if (
    ['giphy.com', 'www.giphy.com'].includes(url.hostname) &&
    /^\/(gifs|stickers|embed)\/[\w-]+\/?$/.test(url.pathname)
  )
    id = url.pathname.split('/').filter(Boolean).at(-1)?.split('-').at(-1);
  else if (safeGifUrl(url.href, true)) {
    const parts = url.pathname.split('/').filter(Boolean);
    id = parts.length === 1 ? parts[0].replace(/\.gif$/i, '') : parts.at(-2);
  }
  if (!id || !/^[a-zA-Z0-9]{2,80}$/.test(id))
    throw Error('Esse link não identifica um GIF do GIPHY.');
  return Object.freeze({
    id,
    url: 'https://media.giphy.com/media/' + id + '/giphy.gif',
    credit: Object.freeze({
      title: 'GIF do GIPHY',
      author: 'GIPHY',
      license: 'Ver no GIPHY',
      source: 'https://giphy.com/gifs/' + id,
      license_url: '',
    }),
  });
}
interface RequestOptions {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}
export async function search(
  term: string,
  {
    offset = 0,
    apiKey,
    signal,
    fetcher = fetch,
  }: RequestOptions & { offset?: number; apiKey?: string } = {},
): Promise<ProfileGifPage> {
  const response = await fetcher(query(term, offset, apiKey), {
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok)
    throw Error(
      response.status === 429
        ? 'Muitas buscas. Aguarde um pouco ou use um link do GIPHY.'
        : 'A busca de GIFs está indisponível. Tente novamente.',
    );
  const data = fields(await response.json());
  if (fields(data.meta).status && fields(data.meta).status !== 200)
    throw Error('Não foi possível buscar GIFs no GIPHY.');
  return parse(data);
}
/** No application credentials are sent to GIPHY; enforce byte and redirect limits again on download. */
export async function download(
  item: ProfileGif,
  { signal, fetcher = fetch }: RequestOptions = {},
): Promise<File> {
  if (!safeGifUrl(item.url, true)) throw Error('Endereço do GIF inválido.');
  const response = await fetcher(item.url, {
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok || (response.url && !safeGifUrl(response.url, true)))
    throw Error('Não foi possível baixar esse GIF. Escolha outro.');
  if (Number(response.headers.get('content-length')) > LIMIT) {
    await response.body?.cancel();
    throw Error('Escolha um GIF de até 10 MB.');
  }
  if (!response.body) throw Error('O link não retornou um GIF válido.');
  const reader = response.body.getReader(),
    chunks: Uint8Array<ArrayBuffer>[] = [];
  const abort = () => {
    void reader.cancel(signal?.reason).catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  let size = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.length;
      if (size > LIMIT) {
        await reader.cancel();
        throw Error('Escolha um GIF de até 10 MB.');
      }
      chunks.push(new Uint8Array(value));
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
  const blob = new Blob(chunks, { type: 'image/gif' });
  const signature = new TextDecoder().decode(await blob.slice(0, 6).arrayBuffer());
  if (!/^GIF8[79]a$/.test(signature)) throw Error('O link não retornou um GIF válido.');
  return new File([blob], 'perfil.gif', { type: 'image/gif' });
}
