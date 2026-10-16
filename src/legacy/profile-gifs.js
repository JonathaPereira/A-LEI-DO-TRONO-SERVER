'use strict';
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TronoProfileGifs = api;
})(typeof window === 'undefined' ? globalThis : window, (root) => {
  const LIMIT = 10_000_000;
  const text = (value) => {
    const raw = String(value || '');
    if (!root.document) return raw.replace(/<[^>]*>/g, '').trim();
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  };
  function safeURL(value, host) {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && !u.username && !u.password && u.hostname === host
        ? u.href
        : null;
    } catch {
      return null;
    }
  }
  function query(term, offset = 0) {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      origin: '*',
      generator: 'search',
      gsrnamespace: '6',
      gsrsearch: 'filemime:"image/gif" filesize:<9765 ' + String(term || 'animation').slice(0, 80),
      gsrlimit: '12',
      gsroffset: String(Math.max(0, Number(offset) || 0)),
      prop: 'imageinfo',
      iiprop: 'url|mime|size|extmetadata',
      iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl',
    });
    return url.href;
  }
  function parse(data) {
    const items = [];
    for (const page of data.query?.pages || []) {
      const info = page.imageinfo?.[0],
        url = safeURL(info?.url, 'upload.wikimedia.org'),
        source = safeURL(info?.descriptionurl, 'commons.wikimedia.org');
      if (
        !url ||
        !source ||
        info.mime !== 'image/gif' ||
        !info.size ||
        info.size > LIMIT ||
        info.width * info.height > 40_000_000
      )
        continue;
      const meta = info.extmetadata || {},
        title = String(page.title || 'GIF')
          .replace(/^File:/, '')
          .slice(0, 200);
      items.push({
        id: page.pageid,
        url,
        bytes: info.size,
        credit: {
          title,
          author: text(meta.Artist?.value || 'Autor na fonte').slice(0, 200),
          license: text(meta.LicenseShortName?.value || 'Ver licença na fonte').slice(0, 80),
          source,
          license_url: safeURL(meta.LicenseUrl?.value, 'creativecommons.org') || '',
        },
      });
    }
    return {
      items,
      next: Number.isFinite(data.continue?.gsroffset) ? data.continue.gsroffset : null,
    };
  }
  async function search(term, { offset = 0, signal, fetcher = root.fetch } = {}) {
    const res = await fetcher(query(term, offset), {
      signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) throw Error('A busca de GIFs está indisponível. Tente novamente.');
    const data = await res.json();
    if (data.error) throw Error('Não foi possível buscar GIFs. Tente outro termo.');
    return parse(data);
  }
  async function download(item, { signal, fetcher = root.fetch } = {}) {
    if (!safeURL(item.url, 'upload.wikimedia.org')) throw Error('Endereço do GIF inválido.');
    const res = await fetcher(item.url, {
      signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) throw Error('Não foi possível baixar esse GIF. Escolha outro.');
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
    return new File(chunks, 'perfil.gif', { type: 'image/gif' });
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
      '</h2><p>GIFs públicos do Wikimedia Commons · até 10 MB</p></div><button type="button" class="profile-gif-close" aria-label="Fechar busca de GIFs">×</button></header><form class="profile-gif-search"><input type="search" aria-label="Buscar GIFs" placeholder="Busque um tema, de preferência em inglês" maxlength="80"><button type="submit">Buscar</button></form><p class="profile-gif-message" role="status" aria-live="polite"></p><div class="profile-gif-results"></div><button class="profile-gif-more" type="button" hidden>Carregar mais</button><small class="profile-gif-attribution">A autoria e a licença serão preservadas no perfil.</small>';
    document.body.append(dialog);
    const form = dialog.querySelector('form'),
      input = form.querySelector('input'),
      host = dialog.querySelector('.profile-gif-results'),
      message = dialog.querySelector('[role=status]'),
      more = dialog.querySelector('.profile-gif-more');
    let next = null,
      term = '';
    dialog.querySelector('.profile-gif-close').onclick = close;
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    dialog.addEventListener('close', () => {
      generation++;
      controller?.abort();
      dialog.querySelector('.profile-gif-results').replaceChildren();
    });
    async function run(append = false) {
      controller?.abort();
      controller = new AbortController();
      const seq = ++generation,
        signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
      term = input.value.trim();
      if (!append) host.replaceChildren();
      message.textContent = 'Buscando GIFs…';
      more.hidden = true;
      try {
        const result = await search(term, { offset: append ? next : 0, signal });
        if (seq !== generation || !dialog.open) return;
        for (const item of result.items) {
          const tile = document.createElement('article'),
            button = document.createElement('button'),
            img = document.createElement('img'),
            credit = document.createElement('a');
          button.type = 'button';
          button.title = 'Usar ' + item.credit.title;
          button.setAttribute('aria-label', button.title);
          img.src = item.url;
          img.alt = item.credit.title;
          img.loading = 'lazy';
          img.referrerPolicy = 'no-referrer';
          button.append(img);
          credit.href = item.credit.source;
          credit.target = '_blank';
          credit.rel = 'noopener noreferrer';
          credit.textContent = item.credit.author + ' · ' + item.credit.license;
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
                  e.name === 'TimeoutError'
                    ? 'O download demorou demais. Tente outro GIF.'
                    : e.message;
            } finally {
              busy = false;
              dialog.querySelectorAll('button,input').forEach((el) => (el.disabled = false));
            }
          };
        }
        next = result.next;
        more.hidden = next === null;
        message.textContent = host.children.length
          ? 'Escolha um GIF para ver a prévia.'
          : 'Nenhum GIF encontrado. Tente outro termo, como “stars” ou “animation”.';
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
    more.onclick = () => void run(true);
    busy = false;
    dialog.showModal();
    input.focus();
    void run();
  }
  root.addEventListener?.('trono-auth-change', () => {
    busy = false;
    close();
  });
  return { open, close, query, parse, search, download };
});
