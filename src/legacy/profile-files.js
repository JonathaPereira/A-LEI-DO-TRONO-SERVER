'use strict';
// Temporary owners: profile decorations, creator accounts and the web settings shell.
(() => {
  const $ = (id) => document.getElementById(id);
  const defaults = { darkness: 60, blur: 0, cover_position: 50 };
  let viewEpoch = 0;
  const make = (tag, cls, text) => {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const profileCache = new Map();
  let profileScope = null;
  function clearCallBackground(card) {
    const slot = card.querySelector('[data-profile-background-slot]');
    if (slot) slot.replaceChildren();
    else card.querySelector('.participant-background')?.remove();
  }
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
        entry.promise = window.TronoProfiles.readProfile(id).catch(() => null);
        profileCache.set(id, entry);
      }
      if (card._profileBackground === entry) continue;
      card._profileBackground = entry;
      clearCallBackground(card);
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
          const slot = card.querySelector('[data-profile-background-slot]'),
            background = slot || make('div', 'participant-background'),
            img = make('img');
          img.alt = '';
          img.src = url;
          img.loading = 'lazy';
          img.onerror = () => {
            if (img.parentNode === background) {
              if (slot) background.replaceChildren();
              else background.remove();
            }
          };
          background.replaceChildren(img);
          background.style.setProperty('--participant-darkness', d.darkness / 100);
          background.style.setProperty('--participant-blur', d.blur + 'px');
          if (!slot) card.prepend(background);
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
        entry.promise = window.TronoProfiles.readProfile(id).catch(() => null);
        profileCache.set(id, entry);
      }
      if (row._profileBanner === entry) continue;
      row._profileBanner = entry;
      const slot = row.querySelector('[data-direct-banner-slot]');
      if (slot) slot.replaceChildren();
      else row.querySelector('.direct-profile-banner')?.remove();
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
          const banner = slot || make('span', 'direct-profile-banner'),
            img = make('img');
          banner.setAttribute('aria-hidden', 'true');
          img.alt = '';
          img.src = url;
          img.loading = 'lazy';
          img.onerror = () => {
            if (slot) {
              if (img.parentNode === slot) slot.replaceChildren();
            } else banner.remove();
          };
          img.style.objectPosition = 'center ' + Math.max(0, Math.min(100, d.cover_position)) + '%';
          banner.append(img);
          if (!slot) row.prepend(banner);
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
        clearCallBackground(card);
      }
    }
  });
  window.TronoNetwork.onMessage((m) => {
    if (m.type === 'member-profile-updated' && typeof m.accountId === 'string')
      invalidateProfile(m.accountId);
  });
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
      const data = await window.TronoProfiles.readAccounts(offset);
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
  window.addEventListener(
    'trono:ready',
    () => {
      const profileDialog = $('profileDialog'),
        settingsBody = make('div', 'profile-settings-body'),
        settingsNav = make('nav', 'profile-settings-nav'),
        appearance = profileDialog.querySelector('.profile-appearance'),
        editorHost = $('profileEditorHost'),
        filesPane = make('section', 'profile-settings-files');
      settingsNav.setAttribute('aria-label', 'Configurações do perfil');
      settingsNav.innerHTML =
        '<strong>M&N</strong><small>CONFIGURAÇÕES</small><button type="button" data-profile-section="profile" class="active">Meu perfil</button><button type="button" data-profile-section="appearance">Aparência</button><button type="button" data-profile-section="files">Meus arquivos</button><button type="button" class="profile-back">← Voltar à call</button>';
      filesPane.append($('profileFilesHost'));
      settingsBody.append(editorHost, appearance, filesPane);
      appearance.hidden = filesPane.hidden = true;
      profileDialog.replaceChildren($('profileClose'), settingsNav, settingsBody);
      const sections = { profile: editorHost, appearance, files: filesPane };
      settingsNav.onclick = (event) => {
        const button = event.target.closest('[data-profile-section]');
        if (button) {
          for (const [key, pane] of Object.entries(sections))
            pane.hidden = key !== button.dataset.profileSection;
          for (const item of settingsNav.querySelectorAll('[data-profile-section]'))
            item.classList.toggle('active', item === button);
        } else if (
          event.target.closest('.profile-back') &&
          !window.TronoProfileEditor.getSnapshot().busy
        )
          profileDialog.close();
      };
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
      $('profileCreatorHost').append(adminProfile);
      const adminButton = make('button', 'chat-header-action', 'Contas');
      adminButton.id = 'creatorAccountsBtn';
      adminButton.type = 'button';
      adminButton.hidden = true;
      adminButton.onclick = () => void accounts();
      $('chatProfileBtn').before(adminButton);
      let accountId = window.TronoAuth.user?.id;
      function auth() {
        const user = window.TronoAuth.user;
        adminButton.hidden = adminProfile.hidden = user?.role !== 'creator';
        if (user?.id !== accountId || user?.role !== 'creator') {
          viewEpoch++;
          if (admin.open) admin.close();
          $('creatorAccountsList').replaceChildren();
        }
        accountId = user?.id;
      }
      window.addEventListener('trono-auth-change', auth);
      window.addEventListener('trono-role-change', auth);
      void window.TronoAuth.ready.then(auth);
    },
    { once: true },
  );
  Object.assign(window.TronoProfile, { callBackgrounds, directBanners });
})();
