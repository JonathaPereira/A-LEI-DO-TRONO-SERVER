'use strict';
window.TronoProfile = (() => {
  const $ = (id) => document.getElementById(id),
    presets = window.TronoAvatars.presets,
    { avatarHtml, hydrate } = window.TronoAvatars;
  const defaults = {
    handle: '',
    bio: '',
    status: '',
    emoji: '',
    tags: [],
    links: [],
    cover_file_id: null,
    background_file_id: null,
    accent: '#7865ff',
    darkness: 60,
    blur: 0,
    opacity: 90,
    reduce_motion: false,
    cover_position: 50,
    cover_zoom: 100,
    media_credits: {},
  };
  let chosen = 'crown',
    selectedFile = null,
    busy = false,
    owner = null,
    epoch = 0,
    viewEpoch = 0,
    draft = { ...defaults },
    pending = {},
    urls = {},
    loaded = false;
  const make = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  async function api(path) {
    const id = window.TronoAuth.user?.id,
      token = await window.TronoAuth.getAccessToken();
    if (!id || id !== window.TronoAuth.user?.id || !token) throw Error('Entre na sua conta.');
    const res = await fetch(window.TronoNetwork.BACKEND_HTTP + '/community/' + path, {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      }),
      data = await res.json();
    if (id !== window.TronoAuth.user?.id) throw Error('A conta mudou. Abra novamente.');
    if (!res.ok) throw Error(data.error?.message || 'Não foi possível carregar o perfil.');
    return data;
  }
  const profileCache = new Map();
  let profileScope = null;
  function callBackgrounds(host = $('voiceRoster')) {
    if (!host) return;
    const viewer = window.TronoAuth.user?.id;
    if (!viewer) return;
    for (const card of host.querySelectorAll('.voice-person[data-account-id]')) {
      const id = card.dataset.accountId;
      if (!id) continue;
      let entry = profileCache.get(id);
      if (!entry || entry.expires < Date.now()) {
        entry = { expires: Date.now() + 60000 };
        entry.promise = api('profiles/' + id)
          .then((data) => data.profile)
          .catch(() => null);
        profileCache.set(id, entry);
      }
      if (card._profileBackground === entry) continue;
      card._profileBackground = entry;
      card.querySelector('.participant-background')?.remove();
      entry.promise.then(async (person) => {
        if (
          !person ||
          !card.isConnected ||
          viewer !== window.TronoAuth.user?.id ||
          card.dataset.accountId !== id ||
          card._profileBackground !== entry
        )
          return;
        const d = { ...defaults, ...person.personalization };
        if (!d.background_file_id) return;
        try {
          const url = await window.TronoFiles.url(d.background_file_id);
          if (
            !card.isConnected ||
            viewer !== window.TronoAuth.user?.id ||
            card.dataset.accountId !== id ||
            card._profileBackground !== entry
          )
            return;
          const background = make('div', 'participant-background'),
            img = make('img');
          img.alt = '';
          img.src = url;
          img.loading = 'lazy';
          img.onerror = () => background.remove();
          background.append(img);
          background.style.setProperty('--participant-darkness', d.darkness / 100);
          background.style.setProperty('--participant-blur', d.blur + 'px');
          card.prepend(background);
        } catch {}
      });
    }
  }
  function directBanners(host = document) {
    const viewer = window.TronoAuth.user?.id;
    if (!viewer) return;
    for (const row of host.querySelectorAll('[data-direct-profile]')) {
      const id = row.dataset.directProfile;
      let entry = profileCache.get(id);
      if (!entry || entry.expires < Date.now()) {
        entry = { expires: Date.now() + 60000 };
        entry.promise = api('profiles/' + id)
          .then((data) => data.profile)
          .catch(() => null);
        profileCache.set(id, entry);
      }
      if (row._profileBanner === entry) continue;
      row._profileBanner = entry;
      row.querySelector('.direct-profile-banner')?.remove();
      const current = () =>
        row.isConnected &&
        viewer === window.TronoAuth.user?.id &&
        row.dataset.directProfile === id &&
        row._profileBanner === entry;
      entry.promise.then(async (person) => {
        const d = { ...defaults, ...person?.personalization };
        if (!d.cover_file_id || !current()) return;
        try {
          const url = await window.TronoFiles.url(d.cover_file_id);
          if (!current()) return;
          const banner = make('span', 'direct-profile-banner'),
            img = make('img');
          banner.setAttribute('aria-hidden', 'true');
          img.alt = '';
          img.src = url;
          img.loading = 'lazy';
          img.onerror = () => banner.remove();
          img.style.objectPosition = 'center ' + Math.max(0, Math.min(100, d.cover_position)) + '%';
          banner.append(img);
          row.prepend(banner);
        } catch {}
      });
    }
  }
  function invalidateProfile(id) {
    profileCache.delete(id);
    callBackgrounds();
    directBanners();
  }
  window.addEventListener('trono-profile-change', () =>
    invalidateProfile(window.TronoAuth.user?.id),
  );
  window.addEventListener('trono-auth-change', () => {
    const id = window.TronoAuth.user?.id;
    if (id !== profileScope) {
      profileScope = id;
      profileCache.clear();
      for (const card of document.querySelectorAll('.voice-person')) {
        delete card._profileBackground;
        card.querySelector('.participant-background')?.remove();
      }
    }
  });
  window.TronoNetwork.onMessage((m) => {
    if (m.type === 'member-profile-updated' && typeof m.accountId === 'string')
      invalidateProfile(m.accountId);
  });
  function message(text = '', error = false) {
    $('profileMessage').textContent = text;
    $('profileMessage').classList.toggle('auth-error', error);
  }
  function discard() {
    for (const url of Object.values(urls)) URL.revokeObjectURL(url);
    urls = {};
    pending = {};
  }
  function linkRows() {
    return [...$('profileLinksRows').children].map((row) => ({
      label: row.querySelector('[data-link-name]').value,
      url: row.querySelector('[data-link-url]').value,
    }));
  }
  function addLink(value = {}) {
    if ($('profileLinksRows').children.length >= 8) return;
    const row = make('div', 'profile-link-row');
    row.innerHTML =
      '<input data-link-name aria-label="Nome do link (opcional)" maxlength="32" placeholder="Nome (opcional)"><input data-link-url aria-label="Endereço do link" inputmode="url" maxlength="400" placeholder="youtube.com/@seucanal"><button type="button" aria-label="Remover link">×</button>';
    row.querySelector('[data-link-name]').value = value.label || '';
    row.querySelector('[data-link-url]').value = value.url || '';
    row.querySelector('button').onclick = () => {
      row.remove();
      refreshLinkButton();
      preview();
    };
    $('profileLinksRows').append(row);
    refreshLinkButton();
  }
  function refreshLinkButton() {
    if ($('profileAddLink'))
      $('profileAddLink').disabled = busy || $('profileLinksRows').children.length >= 8;
  }
  function readForm({ strict = false } = {}) {
    const d = { ...draft, media_credits: { ...draft.media_credits } };
    for (const key of ['handle', 'bio', 'status', 'emoji']) d[key] = $('profile-' + key).value;
    for (const key of ['darkness', 'blur', 'opacity', 'cover_position', 'cover_zoom']) {
      d[key] = Number($('profile-' + key).value);
      $('profile-' + key + '-value').value = d[key] + (key === 'blur' ? ' px' : '%');
    }
    d.accent = $('profile-accent').value;
    d.tags = $('profile-tags')
      .value.split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    d.links = window.TronoProfileData.links(linkRows(), { strict });
    if (strict) d.emoji = window.TronoProfileData.emoji(d.emoji);
    return d;
  }
  function appearance(card, d) {
    card.style.setProperty(
      '--member-accent',
      /^#[0-9a-f]{6}$/i.test(d.accent) ? d.accent : defaults.accent,
    );
    card.style.setProperty(
      '--member-darkness',
      String(Math.max(0, Math.min(90, d.darkness)) / 100),
    );
    card.style.setProperty('--member-blur', Math.max(0, Math.min(20, d.blur)) + 'px');
    card.style.setProperty(
      '--member-opacity',
      String(Math.max(40, Math.min(100, d.opacity)) / 100),
    );
    card.style.setProperty(
      '--member-cover-position',
      Math.max(0, Math.min(100, d.cover_position)) + '%',
    );
    card.style.setProperty('--member-cover-zoom', Math.max(100, Math.min(250, d.cover_zoom)) / 100);
  }
  function paint(host, person, data, local = {}) {
    const d = { ...defaults, ...data },
      card = make('article', 'member-card'),
      bg = make('div', 'member-background'),
      shade = make('div', 'member-shade'),
      content = make('div', 'member-content'),
      cover = make('div', 'member-cover'),
      avatar = make('div', 'member-avatar');
    host.replaceChildren(card);
    card.append(bg, shade, content);
    content.append(cover, avatar);
    appearance(card, d);
    const image = (box, key, file) => {
      const img = make('img');
      img.alt = '';
      img.loading = 'lazy';
      const show = (link) => {
        if (box.isConnected && host.contains(card)) {
          img.src = link;
          img.onerror = () => img.remove();
          box.append(img);
        }
      };
      if (local[key]) show(local[key]);
      else if (file)
        window.TronoFiles.url(file)
          .then(show)
          .catch(() => {});
    };
    image(bg, 'background', d.background_file_id);
    image(cover, 'cover', d.cover_file_id);
    avatar.innerHTML = local.avatar ? '<img alt="Avatar">' : avatarHtml(person);
    if (local.avatar) avatar.firstElementChild.src = local.avatar;
    else hydrate(avatar);
    content.append(make('h2', 'member-name', person.nickname || person.name || 'Seu nome'));
    if (d.handle) content.append(make('p', 'member-handle', '@' + d.handle.replace(/^@/, '')));
    if (d.status || d.emoji)
      content.append(make('p', 'member-status', [d.emoji, d.status].filter(Boolean).join(' ')));
    if (d.bio) {
      content.append(make('h3', '', 'Sobre mim'), make('p', 'member-bio', d.bio));
    }
    if (d.tags?.length) {
      content.append(make('h3', '', 'Interesses'));
      const tags = make('div', 'member-tags');
      for (const tag of d.tags.slice(0, 12)) tags.append(make('span', '', tag));
      content.append(tags);
    }
    if (d.links?.length) {
      content.append(make('h3', '', 'Links'));
      const links = make('div', 'member-links');
      for (const link of d.links.slice(0, 8)) {
        let u;
        try {
          u = new URL(link.url);
        } catch {
          continue;
        }
        if (u.protocol !== 'https:' || u.username || u.password) continue;
        const a = make('a', '', link.label);
        a.href = u.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        links.append(a);
      }
      content.append(links);
    }
    const credits = Object.entries(d.media_credits || {});
    if (credits.length) {
      const details = make('details', 'member-media-credits');
      details.append(make('summary', '', 'Créditos das imagens'));
      for (const [key, item] of credits) {
        let source;
        try {
          source = window.TronoProfileData.url(item.source);
          if (!['commons.wikimedia.org', 'giphy.com'].includes(new URL(source).hostname)) continue;
        } catch {
          continue;
        }
        const a = make(
          'a',
          '',
          ({ avatar: 'Avatar', cover: 'Capa', background: 'Fundo' }[key] || 'Imagem') +
            ': ' +
            item.title +
            ' · ' +
            item.author +
            ' · ' +
            item.license,
        );
        a.href = source;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        details.append(a);
      }
      content.append(details);
    }
    if (person.created_at) {
      const date = new Date(person.created_at);
      if (Number.isFinite(date.getTime()))
        content.append(
          make(
            'small',
            'member-since',
            'Membro desde ' + date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
          ),
        );
    }
  }
  function preview(event) {
    if (!loaded) return;
    const data = readForm(),
      onlyAppearance = event?.target?.matches(
        '#profile-cover_position,#profile-cover_zoom,#profile-darkness,#profile-blur,#profile-opacity,#profile-accent',
      );
    if (onlyAppearance && $('profileLivePreview').firstElementChild)
      appearance($('profileLivePreview').firstElementChild, data);
    else
      paint(
        $('profileLivePreview'),
        {
          ...window.TronoAuth.user,
          nickname: $('profileNickname').value,
          avatar_preset: chosen,
          avatar_file_id: selectedFile,
        },
        data,
        urls,
      );
    if (!onlyAppearance) {
      const icon = $('profilePreview');
      icon.innerHTML = urls.avatar
        ? '<img alt="Prévia do avatar">'
        : avatarHtml({ avatar_preset: chosen, avatar_file_id: selectedFile });
      if (urls.avatar) icon.firstElementChild.src = urls.avatar;
      else hydrate(icon);
    }
    for (const btn of $('avatarPresets').children)
      btn.setAttribute(
        'aria-pressed',
        String(!pending.avatar && !selectedFile && btn.dataset.preset === chosen),
      );
    $('profileEmojiBtn').textContent = data.emoji || '☺';
    $('profileEmojiBtn').setAttribute(
      'aria-label',
      data.emoji ? 'Alterar emoji do status: ' + data.emoji : 'Escolher emoji do status',
    );
    $('profile-bio-count').textContent = $('profile-bio').value.length + '/300';
    const scene = $('profilePreviewScene'),
      file = urls.background || data.background_file_id || '';
    if (scene.dataset.file !== file) {
      scene.dataset.file = file;
      scene.replaceChildren();
      const show = (link) => {
        if (scene.isConnected && scene.dataset.file === file) {
          const img = make('img');
          img.alt = '';
          img.src = link;
          scene.replaceChildren(img);
        }
      };
      if (urls.background) show(urls.background);
      else if (data.background_file_id)
        window.TronoFiles.url(data.background_file_id)
          .then(show)
          .catch(() => {});
    }
    scene.style.setProperty('--member-darkness', data.darkness / 100);
    scene.style.setProperty('--member-blur', data.blur + 'px');
  }
  function populate(person) {
    draft = {
      ...defaults,
      ...person.personalization,
      media_credits: { ...person.personalization?.media_credits },
    };
    for (const key of [
      'handle',
      'bio',
      'status',
      'emoji',
      'darkness',
      'blur',
      'opacity',
      'accent',
      'cover_position',
      'cover_zoom',
    ])
      $('profile-' + key).value = draft[key];
    $('profile-tags').value = draft.tags.join(', ');
    $('profileLinksRows').replaceChildren();
    for (const link of draft.links) addLink(link);
    if (!draft.links.length) addLink();
    loaded = true;
    preview();
  }
  async function open({ inline = false } = {}) {
    await window.TronoAuth.ready;
    if (window.TronoDesktopSettings && !inline) {
      window.TronoDesktopSettings.open('account');
      return;
    }
    if (!window.TronoAuth.user) {
      window.TronoAuth.open('login');
      return;
    }
    const seq = ++epoch,
      u = window.TronoAuth.user;
    owner = u.id;
    discard();
    loaded = false;
    for (const el of $('profileForm').querySelectorAll('input,textarea,button')) el.disabled = true;
    $('profileSave').disabled = true;
    $('profileNickname').value = u.nickname;
    chosen = u.avatar_preset || 'crown';
    selectedFile = u.avatar_file_id || null;
    $('profilePhoto').value = '';
    message('Carregando seu perfil…');
    if (!inline) {
      document.querySelector('[data-profile-section=profile]').click();
      $('profileDialog').showModal();
    }
    try {
      const data = await api('profiles/' + u.id);
      if (seq !== epoch) return;
      populate(data.profile);
      message();
    } catch (e) {
      if (seq !== epoch) return;
      message(e.message, true);
    } finally {
      if (seq === epoch) {
        for (const el of $('profileForm').querySelectorAll('input,textarea,button'))
          el.disabled = !loaded;
        $('profileSave').disabled = !loaded;
        refreshLinkButton();
      }
    }
  }
  async function formatPhoto(file, { avatar = true } = {}) {
    if (!file || file.size > 10000000 || !/^image\/(jpeg|png|webp|gif)$/.test(file.type))
      throw Error('Escolha JPG, PNG, WebP ou GIF de até 10 MB.');
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      if (bitmap.width * bitmap.height > 40000000) throw Error('Reduza a resolução da imagem.');
      if (!avatar || file.type === 'image/gif') return file;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const side = Math.min(bitmap.width, bitmap.height);
      canvas
        .getContext('2d')
        .drawImage(
          bitmap,
          (bitmap.width - side) / 2,
          (bitmap.height - side) / 2,
          side,
          side,
          0,
          0,
          256,
          256,
        );
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw Error('Não foi possível preparar a foto.');
      return new File([blob], 'avatar.png', { type: 'image/png' });
    } finally {
      bitmap.close();
    }
  }
  async function pick(file, key, credit) {
    try {
      const seq = epoch,
        formatted = await formatPhoto(file, { avatar: key === 'avatar' });
      if (seq !== epoch) return;
      pending[key] = formatted;
      draft.media_credits = { ...draft.media_credits };
      delete draft.media_credits[key];
      if (credit) draft.media_credits[key] = credit;
      if (urls[key]) URL.revokeObjectURL(urls[key]);
      urls[key] = URL.createObjectURL(formatted);
      if (key === 'avatar') selectedFile = null;
      preview();
      message('Prévia atualizada. Salve para aplicar.');
    } catch (e) {
      message(e.message, true);
      throw e;
    }
  }
  async function save(e) {
    e.preventDefault();
    if (busy || !loaded) return;
    let data;
    try {
      data = readForm({ strict: true });
    } catch (e) {
      message(e.message, true);
      return;
    }
    busy = true;
    const seq = epoch,
      id = owner;
    for (const el of $('profileForm').querySelectorAll('input,textarea,button')) el.disabled = true;
    message('Salvando…');
    try {
      for (const key of ['avatar', 'cover', 'background'])
        if (pending[key]) {
          const uploaded = await window.TronoFiles.upload(pending[key], {
            kind: 'avatar',
            onProgress: (n) =>
              message(
                'Enviando ' +
                  { avatar: 'avatar', cover: 'capa', background: 'fundo' }[key] +
                  ': ' +
                  n +
                  '%',
              ),
          });
          if (seq !== epoch || id !== window.TronoAuth.user?.id) return;
          if (key === 'avatar') selectedFile = uploaded.id;
          else {
            data[key + '_file_id'] = uploaded.id;
            draft[key + '_file_id'] = uploaded.id;
          }
          delete pending[key];
        }
      if (seq !== epoch || id !== window.TronoAuth.user?.id) return;
      draft = data;
      await window.TronoAuth.updateProfile({
        nickname: $('profileNickname').value,
        avatar_preset: chosen,
        avatar_file_id: selectedFile,
        personalization: data,
      });
      message('Perfil atualizado.');
      preview();
      window.dispatchEvent(new CustomEvent('trono-profile-change'));
    } catch (e) {
      if (seq === epoch) message(e.message, true);
    } finally {
      busy = false;
      if (seq === epoch) {
        for (const el of $('profileForm').querySelectorAll('input,textarea,button'))
          el.disabled = false;
        $('profileSave').disabled = !loaded;
        refreshLinkButton();
      }
    }
  }
  async function refreshFiles() {
    const host = $('profileFiles');
    host.replaceChildren();
    $('storageUsage').textContent = 'Consultando…';
    try {
      const status = await window.TronoFiles.api('/status'),
        mine = await window.TronoFiles.api('/mine');
      $('storageUsage').textContent =
        'Uso compartilhado: ' + window.TronoFiles.size(status.used) + ' de 8 GB.';
      for (const file of mine.files) {
        const row = make('div', 'profile-file-row'),
          name = make('button', '', file.name + ' · ' + window.TronoFiles.size(file.bytes)),
          del = make('button', '', 'Excluir');
        name.type = del.type = 'button';
        name.onclick = () =>
          void window.TronoFiles.openFile(
            () => window.TronoFiles.url(file.id, true),
            $('profileMessage'),
          );
        del.disabled = [selectedFile, draft.cover_file_id, draft.background_file_id].includes(
          file.id,
        );
        del.onclick = async () => {
          try {
            await window.TronoFiles.remove(file.id);
            row.remove();
          } catch (e) {
            message(e.message, true);
          }
        };
        row.append(name, del);
        host.append(row);
      }
      if (mine.hasMore)
        host.append(make('p', '', 'A lista mostra seus 200 arquivos mais recentes.'));
    } catch (e) {
      $('storageUsage').textContent = e.message;
    }
  }
  async function openMini(person, { full = false } = {}) {
    const id = typeof person === 'string' ? person : person.accountId || person.id;
    if (!id || !window.TronoAuth.user) return;
    const seq = ++viewEpoch,
      dialog = $('memberProfileDialog');
    dialog.classList.toggle('member-full', full);
    $('memberProfileContent').textContent = 'Carregando perfil…';
    $('memberProfileExpand').hidden = full;
    $('memberProfileMessage').hidden = true;
    $('memberProfileExpand').onclick = () => {
      dialog.classList.add('member-full');
      $('memberProfileExpand').hidden = true;
    };
    if (!dialog.open) dialog.showModal();
    try {
      const data = await api('profiles/' + id);
      if (seq !== viewEpoch || !dialog.open) return;
      paint($('memberProfileContent'), data.profile, data.profile.personalization);
      $('memberProfileMessage').hidden = id === window.TronoAuth.user?.id;
      $('memberProfileMessage').onclick = () => {
        dialog.close();
        void window.TronoMessenger.open(id);
      };
    } catch (e) {
      if (seq === viewEpoch) $('memberProfileContent').textContent = e.message;
    }
  }
  async function accounts(reset = true) {
    if (window.TronoAuth.user?.role !== 'creator') return;
    const dialog = $('creatorAccountsDialog'),
      host = $('creatorAccountsList'),
      seq = ++viewEpoch;
    let offset = reset ? 0 : Number(host.dataset.offset || 0);
    if (reset) {
      host.replaceChildren();
      if (!dialog.open) dialog.showModal();
    }
    $('creatorAccountsStatus').textContent = 'Carregando contas…';
    $('creatorAccountsMore').disabled = true;
    try {
      const data = await api('registered-accounts?offset=' + offset);
      if (seq !== viewEpoch || !dialog.open || window.TronoAuth.user?.role !== 'creator') return;
      for (const account of data.accounts) {
        const row = make('tr');
        for (const text of [
          account.nickname,
          account.email,
          account.confirmed ? 'Confirmado' : 'Aguardando confirmação',
        ])
          row.append(make('td', '', text));
        host.append(row);
      }
      host.dataset.offset = data.nextOffset;
      $('creatorAccountsMore').hidden = !data.hasMore;
      $('creatorAccountsStatus').textContent = host.children.length + ' contas carregadas.';
    } catch (e) {
      if (seq === viewEpoch) $('creatorAccountsStatus').textContent = e.message;
    } finally {
      $('creatorAccountsMore').disabled = false;
    }
  }
  window.addEventListener('trono:ready', () => {
    const form = $('profileForm'),
      old = [...form.children],
      fields = make('div', 'profile-editor-fields'),
      previewHost = make('aside', 'profile-editor-preview');
    previewHost.innerHTML =
      '<div id="profilePreviewScene" class="profile-preview-scene"></div><small>PRÉVIA AO VIVO</small><div id="profileLivePreview"></div>';
    form.classList.add('profile-editor');
    form.replaceChildren(fields, previewHost);
    for (const el of old) fields.append(el);
    const extras = make('section', 'profile-editor-extras');
    extras.innerHTML =
      '<h3>Identidade</h3><label class="auth-field">@usuário<input id="profile-handle" maxlength="24" placeholder="seu_usuario" pattern="[a-zA-Z0-9_]{3,24}"><small>De 3 a 24 letras, números ou sublinhado.</small></label><div class="profile-status-fields"><div class="profile-emoji-field"><span>Emoji</span><input id="profile-emoji" type="hidden"><button id="profileEmojiBtn" type="button" aria-label="Escolher emoji do status" aria-haspopup="dialog" aria-expanded="false">☺</button></div><label class="auth-field">Status<input id="profile-status" maxlength="100" placeholder="Na call com a galera"></label></div><h3>Sobre mim</h3><label class="auth-field">Bio<textarea id="profile-bio" maxlength="300" rows="3" placeholder="Conte um pouco sobre você."></textarea><small id="profile-bio-count">0/300</small></label><label class="auth-field">Interesses<input id="profile-tags" maxlength="310" placeholder="Jogos, Música, Tecnologia"><small>Separe por vírgulas · até 12 interesses.</small></label><div class="profile-links-field"><strong>Links</strong><div id="profileLinksRows"></div><button id="profileAddLink" type="button">+ Adicionar link</button><small>Até 8 links. O endereço pode ser digitado sem https://.</small></div><h3>Personalização</h3><div id="profileMediaFields"></div><fieldset class="profile-cover-framing"><legend>Enquadramento da capa</legend><label class="profile-range">Posição vertical<input id="profile-cover_position" type="range" min="0" max="100" value="50"><output id="profile-cover_position-value"></output></label><label class="profile-range">Zoom<input id="profile-cover_zoom" type="range" min="100" max="250" value="100"><output id="profile-cover_zoom-value"></output></label><small>Arraste a capa na prévia para mover a imagem para cima ou para baixo.</small></fieldset><label class="profile-range">Cor de destaque<input id="profile-accent" type="color" value="#7865ff"></label><label class="profile-range">Escurecer fundo<input id="profile-darkness" type="range" min="0" max="90"><output id="profile-darkness-value"></output></label><label class="profile-range">Desfoque<input id="profile-blur" type="range" min="0" max="20"><output id="profile-blur-value"></output></label><label class="profile-range">Opacidade do cartão<input id="profile-opacity" type="range" min="40" max="100"><output id="profile-opacity-value"></output></label><p class="appearance-help">Seu fundo aparece no perfil, no miniperfil e no seu cartão da chamada.</p>';
    fields.insertBefore(extras, $('profileMessage'));
    for (const [key, label] of [
      ['cover', 'Capa'],
      ['background', 'Fundo do perfil'],
    ]) {
      const row = make('div', 'profile-media-field');
      row.innerHTML =
        '<strong>' +
        label +
        '</strong><button type="button">Imagem ou GIF</button><button type="button" class="profile-remove-media">Remover</button><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>';
      const input = row.querySelector('input');
      row.querySelector('button').onclick = () => input.click();
      input.onchange = () => {
        if (input.files[0]) void pick(input.files[0], key).catch(() => {});
        input.value = '';
      };
      row.querySelector('.profile-remove-media').onclick = () => {
        delete pending[key];
        if (urls[key]) URL.revokeObjectURL(urls[key]);
        delete urls[key];
        draft[key + '_file_id'] = null;
        delete draft.media_credits[key];
        preview();
      };
      $('profileMediaFields').append(row);
    }
    for (const [id, name] of Object.entries(presets)) {
      const btn = make('button');
      btn.type = 'button';
      btn.dataset.preset = id;
      btn.title = name;
      btn.setAttribute('aria-label', name);
      btn.innerHTML = window.TronoAvatarIcons.html(id);
      btn.onclick = () => {
        chosen = id;
        selectedFile = null;
        delete pending.avatar;
        if (urls.avatar) URL.revokeObjectURL(urls.avatar);
        delete urls.avatar;
        delete draft.media_credits.avatar;
        preview();
      };
      $('avatarPresets').append(btn);
    }
    $('profilePhoto').closest('.profile-photo-label').querySelector('small').textContent =
      'Imagem ou GIF até 10 MB. GIFs mantêm a animação.';
    $('profilePhotoChoose').textContent = 'Trocar avatar';
    $('profilePhotoChoose').onclick = () => $('profilePhoto').click();
    $('profilePhoto').onchange = (e) => {
      if (e.target.files[0]) void pick(e.target.files[0], 'avatar').catch(() => {});
    };
    const gifButton = (host, key) => {
      const button = make('button', 'profile-gif-button', 'Buscar GIF');
      button.type = 'button';
      button.dataset.profileGif = key;
      button.onclick = () => {
        const seq = epoch;
        window.TronoProfileGifs.open({
          target: key,
          onSelect: async (file, credit) => {
            if (seq !== epoch || owner !== window.TronoAuth.user?.id)
              throw Error('Abra seu perfil novamente.');
            await pick(file, key, credit);
          },
        });
      };
      host.append(button);
    };
    gifButton($('profilePhotoChoose').parentElement, 'avatar');
    for (const [i, key] of ['cover', 'background'].entries())
      gifButton($('profileMediaFields').children[i], key);
    $('profileAddLink').onclick = () => {
      addLink();
      $('profileLinksRows').lastElementChild?.querySelector('[data-link-url]').focus();
    };
    const emojiPicker = make('div', 'profile-emoji-picker');
    emojiPicker.id = 'profileEmojiPicker';
    emojiPicker.setAttribute('popover', 'auto');
    emojiPicker.setAttribute('role', 'dialog');
    emojiPicker.setAttribute('aria-label', 'Emoji do status');
    emojiPicker.append(make('strong', '', 'Emoji do status'));
    for (const value of [
      '😀',
      '😎',
      '🥳',
      '😴',
      '🤔',
      '❤️',
      '💜',
      '🔥',
      '✨',
      '⭐',
      '🌙',
      '☀️',
      '🌈',
      '🌸',
      '🎮',
      '🎧',
      '🎵',
      '🎸',
      '🎤',
      '💻',
      '📚',
      '☕',
      '🍕',
      '🏆',
      '👑',
      '🐱',
      '🐶',
      '🐉',
      '🚀',
      '🌍',
      '🟢',
      '🔴',
      '🏳️‍🌈',
      '👨‍👩‍👧‍👦',
      '👍',
      '💬',
      '',
    ]) {
      const button = make('button', '', value || 'Limpar');
      button.type = 'button';
      button.setAttribute('aria-label', value ? 'Usar ' + value : 'Remover emoji');
      button.onclick = () => {
        $('profile-emoji').value = value;
        emojiPicker.hidePopover();
        preview();
        $('profileEmojiBtn').focus();
      };
      emojiPicker.append(button);
    }
    fields.append(emojiPicker);
    $('profileEmojiBtn').onclick = () => {
      emojiPicker.togglePopover();
      const rect = $('profileEmojiBtn').getBoundingClientRect();
      emojiPicker.style.left = Math.max(8, Math.min(innerWidth - 288, rect.left)) + 'px';
      emojiPicker.style.top = Math.max(8, Math.min(innerHeight - 340, rect.bottom + 8)) + 'px';
    };
    emojiPicker.addEventListener('toggle', (e) =>
      $('profileEmojiBtn').setAttribute('aria-expanded', String(e.newState === 'open')),
    );
    $('profileLivePreview').addEventListener('pointerdown', (e) => {
      const cover = e.target.closest('.member-cover');
      if (!cover || !loaded || busy) return;
      e.preventDefault();
      const start = e.clientY,
        value = Number($('profile-cover_position').value),
        height = Math.max(100, cover.clientHeight);
      cover.setPointerCapture(e.pointerId);
      const move = (event) => {
        $('profile-cover_position').value = Math.round(
          Math.max(0, Math.min(100, value - ((event.clientY - start) / height) * 100)),
        );
        preview({ target: $('profile-cover_position') });
      };
      const end = () => {
        cover.removeEventListener('pointermove', move);
        cover.removeEventListener('pointerup', end);
        cover.removeEventListener('pointercancel', end);
      };
      cover.addEventListener('pointermove', move);
      cover.addEventListener('pointerup', end);
      cover.addEventListener('pointercancel', end);
    });
    form.addEventListener('input', preview);
    form.addEventListener('submit', save);
    for (const id of ['accountProfileBtn', 'chatProfileBtn'])
      $(id)?.addEventListener('click', () => void open());
    $('profileClose').onclick = () => {
      if (!busy) $('profileDialog').close();
    };
    $('profileDialog').addEventListener('cancel', (e) => {
      if (busy) e.preventDefault();
    });
    const fileButton = make('button', 'profile-files-load', 'Ver meus arquivos');
    fileButton.type = 'button';
    fileButton.onclick = () => void refreshFiles();
    $('profileFiles').before(fileButton);
    // Share the same editor between the website and the installed app's account page.
    const identity = make('section', 'profile-identity'),
      avatarBox = make('div', 'profile-identity-avatar'),
      nameBox = make('div', 'profile-identity-name'),
      presetChoice = make('details', 'profile-preset-choice');
    presetChoice.innerHTML = '<summary>Escolher um ícone</summary>';
    presetChoice.append($('avatarPresets'));
    avatarBox.append(
      $('profilePreview'),
      $('profilePhoto').closest('.profile-photo-label'),
      presetChoice,
    );
    nameBox.append(
      $('profileNickname').closest('label'),
      $('profile-handle').closest('label'),
      fields.querySelector('.profile-status-fields'),
    );
    identity.append(make('h3', '', 'Identidade'), avatarBox, nameBox);
    fields.prepend(identity);
    extras.querySelector('h3').remove();
    const title = make('header', 'profile-editor-heading');
    const heading = make('h2', '', 'Meu perfil');
    heading.id = 'profileTitle';
    title.append(heading, make('p', '', 'Seu espaço dentro do M&N.'));
    fields.prepend(title);
    const actions = make('div', 'profile-editor-actions');
    actions.append($('profileMessage'), $('profileSave'));
    form.append(actions);
    const profileDialog = $('profileDialog'),
      settingsBody = make('div', 'profile-settings-body'),
      settingsNav = make('nav', 'profile-settings-nav'),
      appearance = profileDialog.querySelector('.profile-appearance'),
      filesPane = make('section', 'profile-settings-files');
    settingsNav.setAttribute('aria-label', 'Configurações do perfil');
    settingsNav.innerHTML =
      '<strong>M&N</strong><small>CONFIGURAÇÕES</small><button type="button" data-profile-section="profile" class="active">Meu perfil</button><button type="button" data-profile-section="appearance">Aparência</button><button type="button" data-profile-section="files">Meus arquivos</button><button type="button" class="profile-back">← Voltar à call</button>';
    const filesTitle = profileDialog.querySelector(':scope > h3');
    filesPane.append(filesTitle, fileButton, $('storageUsage'), $('profileFiles'));
    settingsBody.append(form, appearance, filesPane);
    appearance.hidden = filesPane.hidden = true;
    profileDialog.replaceChildren($('profileClose'), settingsNav, settingsBody);
    const sections = { profile: form, appearance, files: filesPane };
    settingsNav.onclick = (e) => {
      const button = e.target.closest('[data-profile-section]');
      if (button) {
        for (const [key, pane] of Object.entries(sections))
          pane.hidden = key !== button.dataset.profileSection;
        for (const item of settingsNav.querySelectorAll('[data-profile-section]'))
          item.classList.toggle('active', item === button);
      } else if (e.target.closest('.profile-back') && !busy) profileDialog.close();
    };
    const view = make('dialog', 'member-profile-dialog');
    view.id = 'memberProfileDialog';
    view.setAttribute('aria-label', 'Perfil do participante');
    view.innerHTML =
      '<button class="member-close" type="button" aria-label="Fechar perfil">×</button><div id="memberProfileContent"></div><footer><button id="memberProfileMessage" type="button">Mensagem direta</button><button id="memberProfileExpand" type="button">Ver perfil completo</button></footer>';
    document.body.append(view);
    view.querySelector('.member-close').onclick = () => view.close();
    view.addEventListener('close', () => {
      viewEpoch++;
      $('memberProfileContent').replaceChildren();
    });
    const admin = make('dialog', 'creator-accounts-dialog');
    admin.id = 'creatorAccountsDialog';
    admin.setAttribute('aria-labelledby', 'creatorAccountsTitle');
    admin.innerHTML =
      '<button class="member-close" type="button" aria-label="Fechar contas">×</button><small>ÁREA DO CRIADOR</small><h2 id="creatorAccountsTitle">Contas cadastradas</h2><p>E-mails de cadastro. Senhas e dados de autenticação não são exibidos.</p><div class="creator-table-scroll"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Cadastro</th></tr></thead><tbody id="creatorAccountsList"></tbody></table></div><p id="creatorAccountsStatus" role="status"></p><button id="creatorAccountsMore" type="button">Carregar mais</button>';
    document.body.append(admin);
    admin.querySelector('.member-close').onclick = () => admin.close();
    admin.addEventListener('close', () => {
      viewEpoch++;
      $('creatorAccountsList').replaceChildren();
    });
    $('creatorAccountsMore').onclick = () => void accounts(false);
    const adminProfile = make(
      'button',
      'profile-files-load',
      'Área do criador · Contas cadastradas',
    );
    adminProfile.type = 'button';
    adminProfile.hidden = true;
    adminProfile.onclick = () => void accounts();
    fields.append(adminProfile);
    const adminButton = make('button', 'chat-header-action', 'Contas');
    adminButton.id = 'creatorAccountsBtn';
    adminButton.type = 'button';
    adminButton.hidden = true;
    adminButton.onclick = () => void accounts();
    $('chatProfileBtn').before(adminButton);
    function auth() {
      const u = window.TronoAuth.user;
      adminButton.hidden = u?.role !== 'creator';
      adminProfile.hidden = u?.role !== 'creator';
      if (u?.role !== 'creator' && admin.open) admin.close();
      if (owner && owner !== u?.id) {
        epoch++;
        owner = null;
        loaded = false;
        discard();
        $('profileDialog').close();
        view.close();
        admin.close();
        emojiPicker.hidePopover();
        window.TronoProfileGifs.close();
        $('profileForm').reset();
        $('profileLivePreview').replaceChildren();
        $('profileFiles').replaceChildren();
      }
    }
    window.addEventListener('trono-auth-change', auth);
    window.addEventListener('trono-role-change', auth);
    void window.TronoAuth.ready.then(auth);
  });
  return { open, avatarHtml, hydrate, formatPhoto, openMini, callBackgrounds, directBanners };
})();
