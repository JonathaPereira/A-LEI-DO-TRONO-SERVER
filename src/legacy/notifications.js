'use strict';
window.TronoNotifications = (() => {
  const counts = new Map(),
    seen = new Set();
  let channels = [],
    account = null;
  const prefs = () => window.TronoPersonal;
  function muted(id) {
    return prefs().get('mute:' + id, false);
  }
  function mute(id, value) {
    prefs().set('mute:' + id, !!value);
    render();
  }
  function remember(id) {
    if (seen.has(id)) return false;
    seen.add(id);
    if (seen.size > 500) seen.delete(seen.values().next().value);
    return true;
  }
  function channelRead(id) {
    if (!id) return;
    counts.delete(id);
    render();
  }
  function visibleChannel(id) {
    return (
      document.hasFocus() &&
      document.visibilityState === 'visible' &&
      window.TronoNetwork.currentRoom === id &&
      !document.getElementById('courtChatForm')?.closest('[hidden]') &&
      !!document.getElementById('courtChatInput')?.getClientRects().length
    );
  }
  function allowed(target, { mention = false, direct = false, request = false } = {}) {
    if (
      !window.TronoAuth.user ||
      !target?.id ||
      muted(target.id) ||
      prefs().get('notifications', 'mentions') === 'off'
    )
      return false;
    return direct || request || mention || prefs().get('notifications', 'mentions') === 'all';
  }
  async function notify({
    key,
    title,
    body = '',
    target,
    mention = false,
    direct = false,
    request = false,
  }) {
    if (!allowed(target, { mention, direct, request })) return;
    const payload = {
      key: account + ':' + key,
      title,
      body: body.slice(0, 220),
      target: { ...target, accountId: account },
    };
    if (window.TronoDesktop?.notify) {
      try {
        await window.TronoDesktop.notify(payload);
      } catch {}
      return;
    }
    if (document.hasFocus() && document.visibilityState === 'visible') return;
    if (window.Notification?.permission === 'granted') {
      const notice = new Notification(title, {
        body: payload.body,
        tag: payload.key,
        icon: 'assets/throne.png',
      });
      notice.onclick = () => {
        window.focus();
        void navigate(payload.target);
        notice.close();
      };
    }
  }
  async function navigate(target) {
    if (target.accountId !== window.TronoAuth.user?.id) return;
    if (target.type === 'direct') window.TronoMessenger.open(target.id);
    else if (target.type === 'channel')
      await window.TronoMessenger.joinChannel(target.id, { showText: true });
    else window.TronoMessenger.openFriends();
  }
  function render() {
    window.dispatchEvent(new Event('trono-channel-notifications-change'));
    const select = document.getElementById('notificationChannel');
    if (select) {
      const selected = select.value;
      select.replaceChildren(new Option('Escolha um canal', ''));
      for (const row of channels) select.add(new Option(row.name, row.id));
      select.value = selected;
      if (!select.value && channels.length) select.value = channels[0].id;
      document.getElementById('notificationChannelMute').checked = muted(select.value);
    }
  }
  function installSettings() {
    const tabs = document.querySelector('.voice-settings-tabs'),
      host = document.querySelector('.voice-settings-content');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'voice-settings-tab';
    button.dataset.settingsTab = 'notifications';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', 'false');
    button.textContent = 'Notificações';
    button.onclick = () => window.TronoSocial.setSettingsTab('notifications');
    const pane = document.createElement('section');
    pane.className = 'voice-settings-pane';
    pane.dataset.settingsPanel = 'notifications';
    pane.hidden = true;
    pane.id = 'notificationSettings';
    button.setAttribute('aria-controls', pane.id);
    pane.setAttribute('role', 'tabpanel');
    pane.innerHTML =
      '<h2>Notificações</h2><label class="social-setting">Avisos de mensagens<select id="notificationMode"><option value="mentions">Menções, amigos e mensagens privadas</option><option value="all">Todas as mensagens</option><option value="off">Desligados</option></select></label><p class="appearance-help">Mensagens privadas também aparecem em avisos compactos com o ícone de quem enviou. Em segundo plano, você recebe avisos do sistema. Use @apelido para mencionar alguém. Os contadores continuam funcionando com avisos desligados.</p><label class="social-setting">Silenciar um canal<select id="notificationChannel"></select></label><label class="auth-check"><input id="notificationChannelMute" type="checkbox"> Não receber avisos deste canal</label><button id="notificationPermission" class="secondary-button" type="button">Ativar avisos neste navegador</button><p id="notificationPermissionStatus" role="status" class="appearance-help"></p>';
    tabs.append(button);
    host.append(pane);
    document.getElementById('notificationMode').onchange = (e) =>
      prefs().set('notifications', e.target.value);
    document.getElementById('notificationChannel').onchange = (e) =>
      (document.getElementById('notificationChannelMute').checked = muted(e.target.value));
    document.getElementById('notificationChannelMute').onchange = (e) =>
      mute(document.getElementById('notificationChannel').value, e.target.checked);
    document.getElementById('notificationPermission').hidden = !!window.TronoDesktop;
    document.getElementById('notificationPermission').onclick = async () => {
      if (!window.Notification) return;
      const answer = await Notification.requestPermission();
      document.getElementById('notificationPermissionStatus').textContent =
        answer === 'granted'
          ? 'Avisos ativados.'
          : 'Avisos não foram permitidos. Você pode revisar a permissão nas configurações do navegador.';
    };
    sync();
  }
  function sync() {
    const next = window.TronoAuth.user?.id || null;
    if (account !== next) {
      account = next;
      counts.clear();
      seen.clear();
    }
    const mode = document.getElementById('notificationMode');
    if (mode) mode.value = prefs().get('notifications', 'mentions');
    render();
  }
  window.addEventListener('trono:ready', () => {
    installSettings();
    window.TronoDesktop?.onNotificationClick?.((target) => void navigate(target));
    window.TronoNetwork.onMessage((event) => {
      if (event.type === 'chat-channels') {
        channels = event.channels || [];
        render();
      }
      if (event.type === 'chat-notice' && remember(event.id)) {
        if (!visibleChannel(event.roomId))
          counts.set(event.roomId, (counts.get(event.roomId) || 0) + 1);
        render();
        void notify({
          key: event.id,
          title: event.mentioned ? 'Você foi mencionado · ' + event.roomName : event.roomName,
          body: event.name + ': ' + event.text,
          target: { type: 'channel', id: event.roomId },
          mention: event.mentioned,
        });
      }
      if (event.type === 'joined-room' || event.type === 'joined-text-channel')
        requestAnimationFrame(() => {
          if (visibleChannel(event.room.id)) channelRead(event.room.id);
        });
    });
    for (const type of ['focus', 'pointerdown'])
      window.addEventListener(type, () => {
        if (visibleChannel(window.TronoNetwork.currentRoom))
          channelRead(window.TronoNetwork.currentRoom);
      });
    window.addEventListener('trono-auth-change', sync);
    window.addEventListener('trono-personal-change', (event) => {
      if (event.detail.key === 'notifications' || event.detail.key.startsWith('mute:')) sync();
    });
  });
  function getChannelState(id) {
    return { unread: counts.get(id) || 0, muted: muted(id) };
  }
  return { notify, allowed, muted, mute, channelRead, render, getChannelState };
})();
