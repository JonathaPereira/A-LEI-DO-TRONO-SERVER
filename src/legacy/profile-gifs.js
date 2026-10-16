'use strict';
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TronoProfileGifs = api;
})(typeof window === 'undefined' ? globalThis : window, (root) => {
  const LIMIT = 10_000_000;
  const text = (value) =>
    String(value || '')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  function safeURL(value, media = false) {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' &&
        !u.username &&
        !u.password &&
        !u.port &&
        (media
          ? /^(media[0-4]?|i)\.giphy\.com$/.test(u.hostname)
          : u.hostname === 'giphy.com' && /^\/(gifs|stickers)\/[\w-]+\/?$/.test(u.pathname))
        ? media
          ? u.href
          : u.origin + u.pathname
        : null;
    } catch {
      return null;
    }
  }
  function query(term, offset = 0, apiKey) {
    if (!apiKey) throw Error('Abra o GIPHY e cole o link do GIF abaixo.');
    const q = String(term || '')
        .trim()
        .slice(0, 80),
      url = new URL('https://api.giphy.com/v1/gifs/' + (q ? 'search' : 'trending'));
    url.search = new URLSearchParams({
      api_key: apiKey,
      limit: '12',
      offset: String(Math.min(4999, Math.max(0, Math.floor(Number(offset) || 0)))),
      rating: 'pg-13',
      lang: 'pt',
      ...(q ? { q } : {}),
    });
    return url.href;
  }
  function parse(data) {
    const items = [],
      seen = new Set();
    for (const gif of Array.isArray(data?.data) ? data.data : []) {
      if (
        gif.type !== 'gif' ||
        !String(gif.id || '').match(/^[a-zA-Z0-9]{2,80}$/) ||
        seen.has(gif.id) ||
        (gif.rating && !['g', 'pg', 'pg-13'].includes(gif.rating))
      )
        continue;
      const source = safeURL(gif.url);
      if (!source) continue;
      const images = gif.images || {};
      const image = ['original', 'downsized_medium', 'downsized', 'fixed_height', 'fixed_width']
        .map((k) => images[k])
        .find(
          (i) =>
            safeURL(i?.url, true) &&
            /\.gif$/i.test(new URL(i.url).pathname) &&
            Number(i.size) > 0 &&
            Number(i.size) <= LIMIT &&
            Number(i.width) > 0 &&
            Number(i.height) > 0 &&
            Number(i.width) * Number(i.height) <= 40_000_000,
        );
      if (!image) continue;
      seen.add(gif.id);
      const preview =
        safeURL(images.fixed_width_small?.url, true) ||
        safeURL(images.preview_gif?.url, true) ||
        image.url;
      items.push({
        id: gif.id,
        url: image.url,
        preview,
        bytes: Number(image.size),
        credit: {
          title: text(gif.title || 'GIF do GIPHY').slice(0, 200),
          author: text(gif.user?.display_name || gif.username || 'GIPHY').slice(0, 200),
          license: 'Ver no GIPHY',
          source,
          license_url: '',
        },
      });
    }
    const p = data?.pagination || {},
      offset = Number(p.offset),
      count = Number(p.count),
      total = Number(p.total_count),
      next = offset + count;
    return {
      items,
      next:
        Number.isInteger(offset) &&
        offset >= 0 &&
        Number.isInteger(count) &&
        count > 0 &&
        next < total &&
        next <= 4999
          ? next
          : null,
    };
  }
  function fromURL(value) {
    let u;
    try {
      u = new URL(String(value).trim());
    } catch {
      throw Error('Cole o link de um GIF do GIPHY.');
    }
    if (u.protocol !== 'https:' || u.username || u.password || u.port)
      throw Error('Use um link HTTPS do GIPHY.');
    let id;
    if (
      ['giphy.com', 'www.giphy.com'].includes(u.hostname) &&
      /^\/(gifs|stickers|embed)\/[\w-]+\/?$/.test(u.pathname)
    )
      id = u.pathname.split('/').filter(Boolean).at(-1).split('-').at(-1);
    else if (safeURL(u.href, true)) {
      const parts = u.pathname.split('/').filter(Boolean);
      id = parts.length === 1 ? parts[0].replace(/\.gif$/i, '') : parts.at(-2);
    }
    if (!/^[a-zA-Z0-9]{2,80}$/.test(id || ''))
      throw Error('Esse link não identifica um GIF do GIPHY.');
    return {
      id,
      url: 'https://media.giphy.com/media/' + id + '/giphy.gif',
      credit: {
        title: 'GIF do GIPHY',
        author: 'GIPHY',
        license: 'Ver no GIPHY',
        source: 'https://giphy.com/gifs/' + id,
        license_url: '',
      },
    };
  }
  async function configuration({ signal, fetcher = root.fetch } = {}) {
    const owner = root.TronoAuth?.user?.id,
      token = await root.TronoAuth?.getAccessToken();
    if (!owner || !token || owner !== root.TronoAuth?.user?.id)
      throw Error('Entre na sua conta para buscar GIFs.');
    const res = await fetcher(root.TronoNetwork.BACKEND_HTTP + '/community/gif-provider', {
      signal,
      headers: { Authorization: 'Bearer ' + token },
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    if (owner !== root.TronoAuth?.user?.id) throw Error('A conta mudou. Abra a busca novamente.');
    if (res.status === 404) return null;
    if (!res.ok) throw Error('A busca de GIFs está indisponível. Você pode usar um link do GIPHY.');
    const data = await res.json();
    return data.provider === 'giphy' && data.configured && typeof data.apiKey === 'string'
      ? data.apiKey
      : null;
  }
  async function search(term, { offset = 0, apiKey, signal, fetcher = root.fetch } = {}) {
    const res = await fetcher(query(term, offset, apiKey), {
      signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok)
      throw Error(
        res.status === 429
          ? 'Muitas buscas. Aguarde um pouco ou use um link do GIPHY.'
          : 'A busca de GIFs está indisponível. Tente novamente.',
      );
    const data = await res.json();
    if (data.meta?.status && data.meta.status !== 200)
      throw Error('Não foi possível buscar GIFs no GIPHY.');
    return parse(data);
  }
  async function download(item, { signal, fetcher = root.fetch } = {}) {
    if (!safeURL(item.url, true)) throw Error('Endereço do GIF inválido.');
    const res = await fetcher(item.url, {
      signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok || (res.url && !safeURL(res.url, true)))
      throw Error('Não foi possível baixar esse GIF. Escolha outro.');
    if (Number(res.headers.get('content-length')) > LIMIT)
      throw Error('Escolha um GIF de até 10 MB.');
    const reader = res.body.getReader(),
      chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > LIMIT) {
          await reader.cancel();
          throw Error('Escolha um GIF de até 10 MB.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const blob = new Blob(chunks, { type: 'image/gif' }),
      signature = new TextDecoder().decode(await blob.slice(0, 6).arrayBuffer());
    if (!/^GIF8[79]a$/.test(signature)) throw Error('O link não retornou um GIF válido.');
    return new File([blob], 'perfil.gif', { type: 'image/gif' });
  }
  let dialog,
    controller,
    returnFocus,
    busy = false,
    generation = 0;
  function close() {
    if (busy) return;
    generation++;
    controller?.abort();
    dialog?.close();
    returnFocus?.focus();
  }
  function open({ target, onSelect }) {
    if (!root.document) return;
    generation++;
    controller?.abort();
    if (dialog?.open) dialog.close();
    dialog?.remove();
    returnFocus = document.activeElement;
    dialog = document.createElement('dialog');
    dialog.id = 'profileGifDialog';
    dialog.className = 'profile-gif-dialog';
    dialog.setAttribute('aria-labelledby', 'profileGifTitle');
    dialog.innerHTML =
      '<header><div><h2 id="profileGifTitle">Buscar GIF para ' +
      ({ avatar: 'o avatar', cover: 'a capa', background: 'o fundo' }[target] || 'o perfil') +
      '</h2><p>GIPHY · GIFs de até 10 MB</p></div><button type="button" class="profile-gif-close" aria-label="Fechar busca de GIFs">×</button></header><form class="profile-gif-search"><input type="search" aria-label="Buscar GIFs" placeholder="Reações, memes, personagens…" maxlength="80"><button type="submit">Buscar</button></form><a class="profile-gif-external" href="https://giphy.com/" target="_blank" rel="noopener noreferrer">Abrir busca no GIPHY ↗</a><form class="profile-gif-link"><input type="url" aria-label="Link do GIF no GIPHY" placeholder="Cole o link do GIF no GIPHY" maxlength="2048" required><button type="submit">Pré-visualizar</button></form><p class="profile-gif-message" role="status" aria-live="polite"></p><div class="profile-gif-results"></div><button class="profile-gif-more" type="button" hidden>Carregar mais</button><a class="profile-gif-attribution" href="https://giphy.com/" target="_blank" rel="noopener noreferrer">Powered by GIPHY</a>';
    document.body.append(dialog);
    const form = dialog.querySelector('.profile-gif-search'),
      input = form.querySelector('input'),
      host = dialog.querySelector('.profile-gif-results'),
      message = dialog.querySelector('[role=status]'),
      more = dialog.querySelector('.profile-gif-more'),
      external = dialog.querySelector('.profile-gif-external');
    let next = null,
      term = '',
      seen = new Set();
    dialog.querySelector('.profile-gif-close').onclick = close;
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    dialog.addEventListener('close', () => {
      generation++;
      controller?.abort();
      host.replaceChildren();
    });
    function add(item) {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      const tile = document.createElement('article'),
        button = document.createElement('button'),
        img = document.createElement('img'),
        credit = document.createElement('a');
      button.type = 'button';
      button.setAttribute('aria-label', 'Usar ' + item.credit.title);
      img.src = item.preview || item.url;
      img.alt = 'GIF do GIPHY';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => {
        button.disabled = true;
        message.textContent =
          'Não foi possível carregar esse GIF. Confira o link ou escolha outro.';
      };
      button.append(img);
      credit.href = item.credit.source;
      credit.target = '_blank';
      credit.rel = 'noopener noreferrer';
      credit.textContent = item.credit.author + ' · GIPHY';
      tile.append(button, credit);
      host.append(tile);
      button.onclick = async () => {
        if (busy) return;
        busy = true;
        controller?.abort();
        controller = new AbortController();
        const selected = ++generation;
        dialog.querySelectorAll('button,input').forEach((el) => (el.disabled = true));
        message.textContent = 'Preparando GIF…';
        try {
          const file = await download(item, {
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
          });
          if (selected !== generation || !dialog.open) return;
          await onSelect(file, item.credit);
          busy = false;
          close();
        } catch (e) {
          if (selected === generation)
            message.textContent =
              e.name === 'TimeoutError' ? 'O download demorou demais. Tente outro GIF.' : e.message;
        } finally {
          busy = false;
          dialog.querySelectorAll('button,input').forEach((el) => (el.disabled = false));
        }
      };
    }
    function externalLink() {
      const q = input.value.trim();
      external.href = q
        ? 'https://giphy.com/search/' + encodeURIComponent(q)
        : 'https://giphy.com/';
    }
    async function run(append = false) {
      controller?.abort();
      controller = new AbortController();
      const seq = ++generation,
        signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
      externalLink();
      if (!append) {
        term = input.value.trim();
        host.replaceChildren();
        seen.clear();
      }
      message.textContent = 'Buscando GIFs…';
      more.hidden = true;
      try {
        const apiKey = await configuration({ signal });
        if (seq !== generation || !dialog.open) return;
        if (!apiKey) {
          message.textContent =
            'Abra a busca no GIPHY, escolha um GIF e cole o link acima para usar no perfil.';
          return;
        }
        const result = await search(term, { offset: append ? next : 0, apiKey, signal });
        if (seq !== generation || !dialog.open) return;
        result.items.forEach(add);
        next = result.next;
        more.hidden = next === null;
        message.textContent = host.children.length
          ? 'Escolha um GIF para ver a prévia.'
          : 'Nenhum GIF de até 10 MB encontrado. Tente outro termo ou carregue mais.';
      } catch (e) {
        if (seq === generation && e.name !== 'AbortError')
          message.textContent =
            e.name === 'TimeoutError' ? 'A busca demorou demais. Tente novamente.' : e.message;
      }
    }
    form.onsubmit = (e) => {
      e.preventDefault();
      void run();
    };
    input.oninput = externalLink;
    more.onclick = () => void run(true);
    dialog.querySelector('.profile-gif-link').onsubmit = (e) => {
      e.preventDefault();
      try {
        const item = fromURL(e.target.querySelector('input').value);
        generation++;
        controller?.abort();
        host.replaceChildren();
        seen.clear();
        more.hidden = true;
        add(item);
        message.textContent = 'Confira o GIF e clique nele para usar no perfil.';
      } catch (error) {
        message.textContent = error.message;
      }
    };
    busy = false;
    dialog.showModal();
    input.focus();
    void run();
  }
  root.addEventListener?.('trono-auth-change', () => {
    busy = false;
    close();
  });
  return { open, close, query, parse, fromURL, search, download };
});
