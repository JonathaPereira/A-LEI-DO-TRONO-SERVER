'use strict';
// Temporary owners: creator accounts and the web settings shell.
(() => {
  const $ = (id) => document.getElementById(id);
  let viewEpoch = 0;
  const make = (tag, cls, text) => {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (text !== undefined) element.textContent = text;
    return element;
  };
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
})();
