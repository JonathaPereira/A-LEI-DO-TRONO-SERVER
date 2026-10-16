'use strict';
window.TronoMessenger = (() => {
  const $ = (id) => document.getElementById(id);
  let state = { friends: [], threads: [] },
    members = [],
    peer = null,
    owner = null,
    opened = false,
    refreshTimer = null,
    refreshing = false,
    refreshAgain = false,
    generation = 0,
    messages = [],
    hasMore = false,
    before = null,
    operation = null;
  const seen = new Set(),
    drafts = new Map(),
    toasts = new Map();
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const person = (id) =>
    members.find((row) => row.id === id) ||
    state.friends.find((row) => row.id === id) ||
    state.threads.find((row) => row.peerId === id);
  const friend = (id) => state.friends.find((row) => row.id === id);
  const currentOperation = (op) =>
    operation === op && op.owner === owner && op.peer === peer && op.generation === generation;
  const sending = () => operation && currentOperation(operation);
  const activeThread = (id) =>
    opened && peer === id && document.hasFocus() && document.visibilityState === 'visible';
  function draft(id = peer) {
    if (!drafts.has(id)) drafts.set(id, { text: '', file: null, uploaded: null, pending: null });
    return drafts.get(id);
  }
  function keepDraft() {
    if (peer) draft().text = $('messengerInput').value;
  }
  function stopUpload() {
    if (operation?.stage === 'upload') operation.controller.abort();
    operation = null;
  }
  function status(text) {
    $('messengerStatus').textContent = text;
  }
  async function request(action, body = {}) {
    const account = window.TronoAuth.user?.id,
      token = await window.TronoAuth.getAccessToken();
    if (!token) throw new Error('Entre na sua conta para usar amigos e conversas.');
    if (account !== window.TronoAuth.user?.id)
      throw new Error('A conta mudou. Abra a conversa novamente.');
    const response = await fetch(window.TronoNetwork.BACKEND_HTTP + '/social/' + action, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (account !== window.TronoAuth.user?.id)
      throw new Error('A conta mudou. Abra a conversa novamente.');
    if (!response.ok)
      throw new Error(data.error?.message || 'Não foi possível completar a operação.');
    return data;
  }
  async function refresh() {
    if (!owner) return;
    if (refreshing) {
      refreshAgain = true;
      return;
    }
    refreshing = true;
    const id = owner;
    try {
      const data = await request('snapshot');
      if (id !== owner) return;
      state = data;
      render();
      if (opened) {
        const last = state.threads.find((row) => row.peerId === peer)?.last;
        if (last && last.id !== messages.at(-1)?.id) void read();
      }
    } catch (error) {
      if (id === owner) status(error.message);
    } finally {
      refreshing = false;
      if (refreshAgain) {
        refreshAgain = false;
        schedule();
      }
    }
  }
  function schedule() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void refresh(), 250);
  }
  async function action(id, value) {
    try {
      await request('friend', { peerId: id, action: value });
      await refresh();
      status(value === 'request' ? 'Pedido de amizade enviado.' : '');
    } catch (error) {
      status(error.message);
    }
  }
  function actionButton(label, fn) {
    const button = make('button', 'social-small-button', label);
    button.type = 'button';
    button.onclick = fn;
    return button;
  }
  function row(member) {
    const id = member.id || member.peerId,
      entry = friend(id),
      thread = state.threads.find((row) => row.peerId === id),
      line = make('div', 'messenger-person' + (id === peer ? ' selected' : ''));
    const view = actionButton('', () => void open(id));
    view.className = 'messenger-person-main';
    const icon = make('span', 'community-avatar');
    icon.innerHTML = window.TronoProfile.avatarHtml(member);
    const copy = make('span', 'messenger-person-copy');
    copy.append(
      make('strong', '', person(id)?.name || member.name),
      make(
        'small',
        '',
        entry?.state === 'pending'
          ? entry.incoming
            ? 'Pedido recebido'
            : 'Pedido enviado'
          : thread?.last?.text ||
              (thread?.last?.attachment
                ? 'Enviou um anexo'
                : person(id)?.online
                  ? 'Online'
                  : 'Offline'),
      ),
    );
    view.append(icon, copy);
    if (thread?.unread) view.append(make('b', 'social-badge', String(thread.unread)));
    line.append(view);
    if (entry?.state === 'pending') {
      if (entry.incoming) line.append(actionButton('Aceitar', () => void action(id, 'accept')));
      line.append(
        actionButton(entry.incoming ? 'Recusar' : 'Cancelar', () => void action(id, 'decline')),
      );
    }
    return line;
  }
  function render() {
    if (!$('messengerList')) return;
    const total =
      state.threads.reduce((sum, row) => sum + Number(row.unread || 0), 0) +
      state.friends.filter((row) => row.state === 'pending' && row.incoming).length;
    const toggle = $('messengerToggle'),
      badge = $('messengerUnread');
    badge.textContent = total ? String(Math.min(total, 99)) : '';
    badge.hidden = !total;
    toggle.classList.toggle('has-unread', total > 0);
    toggle.setAttribute(
      'aria-label',
      'Amigos' + (total ? ' · ' + total + ' avisos não lidos' : ''),
    );
    const peers = new Map();
    for (const entry of [
      ...state.threads,
      ...state.friends.filter((x) => x.state === 'accepted'),
    ]) {
      const id = entry.id || entry.peerId;
      if (!peers.has(id))
        peers.set(id, {
          ...entry,
          id,
          name: person(id)?.name || entry.name,
          unread: state.threads.find((x) => x.peerId === id)?.unread || 0,
        });
    }
    window.dispatchEvent(
      new CustomEvent('trono-direct-change', {
        detail: { people: [...peers.values()], unread: total },
      }),
    );
    const list = $('messengerList'),
      scroll = list.scrollTop;
    list.replaceChildren();
    const ids = new Set();
    for (const group of [
      ['Pedidos', state.friends.filter((row) => row.state === 'pending')],
      ['Conversas', state.threads],
      ['Amigos', state.friends.filter((row) => row.state === 'accepted')],
    ]) {
      const entries = group[1].filter((row) => !ids.has(row.id || row.peerId));
      if (!entries.length) continue;
      list.append(make('h3', '', group[0]));
      for (const entry of entries) {
        ids.add(entry.id || entry.peerId);
        list.append(row(entry));
      }
    }
    if (!ids.size)
      list.append(
        make('p', 'appearance-help', 'Adicione alguém da comunidade para conversar em particular.'),
      );
    list.scrollTop = scroll;
    window.TronoProfile.hydrate(list);
    renderHeader();
  }
  let draftPreviewURL = null;
  function renderAttachmentDraft() {
    if (draftPreviewURL) {
      URL.revokeObjectURL(draftPreviewURL);
      draftPreviewURL = null;
    }
    const host = $('messengerAttachmentDraft');
    host.replaceChildren();
    if (!peer || !draft().file) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    const selected = draft().file;
    if (selected.type.startsWith('image/')) {
      const img = make('img', 'messenger-draft-image');
      img.alt = 'Prévia da imagem';
      draftPreviewURL = URL.createObjectURL(selected);
      img.src = draftPreviewURL;
      host.append(img);
    } else
      host.append(make('span', '', selected.name + ' · ' + window.TronoFiles.size(selected.size)));
    const remove = actionButton('Remover anexo', () => {
      if (sending() && operation.stage === 'upload') {
        operation.controller.abort();
        operation = null;
      }
      const item = draft();
      item.file = null;
      item.uploaded = null;
      item.pending = null;
      $('messengerFile').value = '';
      renderAttachmentDraft();
      renderHeader();
      status('Anexo removido.');
    });
    remove.disabled = !!sending() && operation.stage === 'send';
    host.append(remove);
  }
  function renderHeader() {
    const entry = friend(peer),
      p = person(peer);
    $('messengerName').textContent = peer
      ? p?.name || 'Conversa privada'
      : 'Sua comunidade, mais perto';
    $('messengerSubtitle').textContent = peer
      ? entry?.state === 'accepted'
        ? 'Conversa privada · chamada permanece conectada'
        : entry
          ? 'Aceite a amizade para conversar.'
          : 'Histórico preservado · adicione aos amigos para conversar.'
      : 'Amigos, pedidos e mensagens privadas';
    $('messengerComposer').hidden = !peer;
    $('messengerInput').disabled = entry?.state !== 'accepted';
    $('messengerSend').disabled = entry?.state !== 'accepted' || !!sending();
    $('messengerAttach').disabled = entry?.state !== 'accepted' || !!sending();
    $('messengerInvite').hidden = entry?.state !== 'accepted';
    $('messengerRemove').hidden = entry?.state !== 'accepted';
    $('messengerAdd').hidden = !peer || !!entry;
    $('messengerMute').hidden = !peer;
    $('messengerMute').textContent = window.TronoNotifications.muted(peer)
      ? 'Ativar avisos'
      : 'Silenciar avisos';
    $('messengerEarlier').hidden = !hasMore;
    renderAttachmentDraft();
  }
  function paintMessages({ prepend = false } = {}) {
    const host = $('messengerMessages'),
      oldHeight = host.scrollHeight,
      oldScroll = host.scrollTop;
    host.replaceChildren();
    if (!peer)
      host.append(
        make(
          'p',
          'messenger-empty',
          'Escolha um amigo para começar. Você pode conversar enquanto joga ou participa de uma chamada.',
        ),
      );
    for (const msg of messages) {
      const line = make('article', 'direct-message' + (msg.senderId === owner ? ' own' : ''));
      line.dataset.messageId = msg.id;
      line.append(
        make('strong', '', msg.senderId === owner ? 'Você' : person(peer)?.name || 'Amigo'),
      );
      if (msg.text) line.append(make('p', '', msg.text));
      if (msg.attachment) {
        const attachment = make('div', 'chat-attachment direct-attachment');
        line.append(attachment);
        window.TronoFiles.renderAttachment(attachment, msg.attachment, { private: true });
      }
      const date = new Date(msg.ts),
        valid = Number.isFinite(date.getTime()),
        time = make(
          'time',
          '',
          valid
            ? date.toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Data indisponível',
        );
      if (valid) time.dateTime = date.toISOString();
      line.append(time);
      if (msg.roomId)
        line.append(actionButton('Entrar no canal', () => void joinChannel(msg.roomId)));
      host.append(line);
    }
    if (prepend) host.scrollTop = host.scrollHeight - oldHeight + oldScroll;
    else host.scrollTop = host.scrollHeight;
  }
  async function read({ older = false } = {}) {
    if (!peer) return;
    const id = peer,
      epoch = generation,
      cursor = older ? before : null;
    try {
      const data = await request('read', { peerId: id, before: cursor });
      if (id !== peer || epoch !== generation) return;
      // A history response is a snapshot, while live messages may already have
      // arrived through the socket. Merge by ID instead of replacing that state;
      // keep earlier pages too, and carry forward attachment tombstones.
      const previousFirst = messages[0]?.id,
        byId = new Map(messages.map((message) => [message.id, message]));
      for (const message of data.messages) {
        const previous = byId.get(message.id);
        if (previous?.attachment?.deleted && message.attachment) message.attachment.deleted = true;
        byId.set(message.id, message);
      }
      const order = older ? [...data.messages, ...messages] : [...messages, ...data.messages],
        unique = new Set();
      messages = order
        .filter((message) => {
          if (unique.has(message.id)) return false;
          unique.add(message.id);
          return true;
        })
        .map((message) => byId.get(message.id))
        .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
      const first = messages[0]?.id || null;
      // A refresh of the latest page cannot advance an already expanded cursor.
      if (data.messages[0]?.id === first || !first || (older && cursor === previousFirst))
        hasMore = data.hasMore;
      before = first;
      paintMessages({ prepend: older });
      renderHeader();
      if (!older) void markRead();
    } catch (error) {
      if (epoch === generation) status(error.message);
    }
  }
  async function markRead() {
    if (!activeThread(peer) || !messages.length) return;
    const id = peer,
      account = owner,
      last = messages.at(-1).id;
    try {
      await request('mark-read', { peerId: id, messageId: last });
      if (account !== owner) return;
      const thread = state.threads.find((row) => row.peerId === id);
      if (thread) thread.unread = 0;
      render();
    } catch {}
  }
  async function open(id) {
    if (!window.TronoAuth.user) {
      window.TronoAuth.open('login');
      return;
    }
    window.TronoSocial.toggleTelemetry(false);
    if (document.body.classList.contains('chat-only-active'))
      window.TronoSocial.toggleTextChat(false);
    opened = true;
    $('messengerPanel').hidden = false;
    $('messengerToggle').setAttribute('aria-expanded', 'true');
    if (id && id !== peer) {
      keepDraft();
      stopUpload();
      peer = id;
      generation++;
      messages = [];
      hasMore = false;
      before = null;
      $('messengerInput').value = draft().text;
      $('messengerFile').value = '';
      status('');
      paintMessages();
    }
    removeToast(id);
    $('messengerPanel').classList.toggle('has-peer', !!peer);
    render();
    schedule();
    if (peer) void read();
  }
  function close() {
    keepDraft();
    opened = false;
    $('messengerPanel').hidden = true;
    $('messengerToggle').setAttribute('aria-expanded', 'false');
  }
  function openFriends() {
    keepDraft();
    stopUpload();
    peer = null;
    generation++;
    messages = [];
    hasMore = false;
    before = null;
    $('messengerPanel').classList.remove('has-peer');
    paintMessages();
    void open();
    renderHeader();
  }
  async function submit(roomId = null) {
    const text = $('messengerInput').value.trim();
    if (!peer || sending()) return;
    const item = draft(),
      file = roomId ? null : item.file;
    if (!text && !roomId && !file) return;
    item.text = $('messengerInput').value;
    const op = {
      owner,
      peer,
      generation,
      controller: new AbortController(),
      stage: file && !item.uploaded ? 'upload' : 'send',
    };
    operation = op;
    renderHeader();
    status(file ? 'Preparando anexo…' : 'Enviando…');
    try {
      let attachment = item.uploaded;
      if (file && !attachment) {
        attachment = await window.TronoFiles.upload(file, {
          kind: 'direct',
          peerId: op.peer,
          signal: op.controller.signal,
          onProgress: (percent) => {
            if (currentOperation(op))
              status(
                'Enviando ' +
                  (file.type.startsWith('image/') ? 'imagem' : file.name) +
                  ': ' +
                  percent +
                  '%',
              );
          },
        });
        if (op.owner !== owner) return;
        if (item.file === file) item.uploaded = attachment;
      }
      if (!currentOperation(op)) return;
      op.stage = 'send';
      renderHeader();
      const attachmentId = file ? attachment.id : null,
        prior = item.pending,
        payload =
          prior &&
          prior.peerId === op.peer &&
          prior.text === text &&
          prior.roomId === roomId &&
          prior.attachmentId === attachmentId
            ? prior
            : { id: crypto.randomUUID(), peerId: op.peer, text, roomId, attachmentId };
      item.pending = payload;
      const message = await request('send', payload);
      if (owner !== op.owner) return;
      if (item.pending === payload) item.pending = null;
      if (!roomId && item.text.trim() === text) {
        item.text = '';
        if (currentOperation(op) && $('messengerInput').value.trim() === text)
          $('messengerInput').value = '';
      }
      if (file && item.file === file) {
        item.file = null;
        item.uploaded = null;
        if (currentOperation(op)) $('messengerFile').value = '';
      }
      if (!currentOperation(op)) return;
      if (!messages.some((row) => row.id === message.id)) {
        messages.push(message);
        paintMessages();
      }
      status('');
      schedule();
      void markRead();
    } catch (error) {
      if (currentOperation(op))
        status(error.message + ' Seu texto e anexo foram mantidos para tentar novamente.');
    } finally {
      if (operation === op) {
        operation = null;
        renderHeader();
      }
    }
  }
  async function joinChannel(id, { showText = false } = {}) {
    const channel = window.TronoChatHub.channels.find((row) => row.id === id);
    if (!channel) {
      status('Esse canal não está disponível.');
      return;
    }
    let unsubscribe, timer;
    if (showText) {
      const show = () => {
        clearTimeout(timer);
        unsubscribe?.();
        requestAnimationFrame(() => window.TronoSocial.toggleTextChat(true));
      };
      unsubscribe = window.TronoNetwork.onMessage((event) => {
        if (
          (event.type === 'joined-room' || event.type === 'joined-text-channel') &&
          event.room?.id === id
        )
          show();
      });
      timer = setTimeout(() => unsubscribe(), 18000);
      if (window.TronoNetwork.currentRoom === id) show();
    }
    if (document.body.classList.contains('chat-only-active')) {
      if (showText && channel.type !== 'voice')
        await window.TronoNetwork.joinTextChannel(id, window.TronoAuth.user.nickname);
      else await window.TronoChatHub.switchChannel(id);
      window.TronoPortal.showOnly('chatOnlyScreen');
    } else {
      if (
        !window.TronoNetwork.independentGameVoice &&
        window.TronoNetwork.primaryRoom?.startsWith('sala-') &&
        !confirm('Entrar neste canal sairá da sala do jogo. Continuar?')
      )
        return;
      await window.TronoChatHub.enter({ channelId: id });
    }
    close();
    window.TronoNotifications.channelRead(id);
  }
  function search() {
    const text = $('messengerSearch').value.trim().toLocaleLowerCase('pt-BR'),
      host = $('messengerSearchResults');
    host.replaceChildren();
    if (text.length < 2) return;
    for (const member of members
      .filter(
        (row) =>
          !row.guest && row.id !== owner && row.name.toLocaleLowerCase('pt-BR').includes(text),
      )
      .slice(0, 12)) {
      const line = make('div', 'messenger-search-row');
      line.append(
        make('span', '', member.name),
        actionButton(friend(member.id) ? 'Ver' : 'Adicionar', () =>
          friend(member.id) ? void open(member.id) : void action(member.id, 'request'),
        ),
      );
      host.append(line);
    }
    if (!host.children.length)
      host.append(make('p', 'appearance-help', 'Nenhuma conta encontrada.'));
  }
  function placeToggle() {
    const visible = (el) =>
        el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden',
      toggle = $('messengerToggle'),
      rail = [$('desktopRail'), $('webLayoutRail')].find(visible);
    if (!toggle) return;
    toggle.classList.remove(
      'messenger-rail-button',
      'messenger-sidebar-button',
      'messenger-inline-button',
      'messenger-home-button',
    );
    if (rail) {
      rail.insertBefore(
        toggle,
        rail.querySelector(
          '[data-desktop-route="community"],[data-web-route="community"],[data-layout-route="community"]',
        ) || rail.querySelector('#soundboardToggle'),
      );
      toggle.classList.add('messenger-rail-button');
    } else {
      const community = !$('chatOnlyScreen')?.classList.contains('hidden'),
        side =
          community &&
          [
            document.querySelector('.mn-sidebar-heading'),
            document.querySelector('.mn-sidebar'),
          ].find(visible),
        strip = community && document.querySelector('.mn-sidebar-scroll');
      if (side) {
        side.append(toggle);
        toggle.classList.add('messenger-sidebar-button');
      } else if (visible(strip)) {
        strip.prepend(toggle);
        toggle.classList.add('messenger-inline-button');
      } else {
        document.body.append(toggle);
        toggle.classList.add('messenger-home-button');
      }
    }
  }
  function removeToast(id) {
    const notice = toasts.get(id);
    if (!notice) return;
    clearTimeout(notice.timer);
    notice.el.remove();
    toasts.delete(id);
  }
  function showToast(id, message, name) {
    if (
      activeThread(id) ||
      !window.TronoNotifications.allowed({ type: 'direct', id }, { direct: true })
    )
      return;
    removeToast(id);
    while (toasts.size >= 3) removeToast(toasts.keys().next().value);
    const el = make('article', 'messenger-toast'),
      button = make('button', 'messenger-toast-open'),
      icon = make('span', 'community-avatar');
    button.type = 'button';
    icon.innerHTML = window.TronoProfile.avatarHtml(person(id) || {});
    const copy = make('span', 'messenger-toast-copy');
    copy.append(
      make('strong', '', name || person(id)?.name || 'Amigo'),
      make('span', '', (message.text || 'Enviou um anexo').slice(0, 100)),
    );
    button.append(icon, copy);
    button.onclick = () => {
      removeToast(id);
      void open(id);
    };
    const dismiss = actionButton('×', () => removeToast(id));
    dismiss.className = 'messenger-toast-dismiss';
    dismiss.setAttribute('aria-label', 'Dispensar aviso');
    el.append(button, dismiss);
    $('messengerNotices').append(el);
    window.TronoProfile.hydrate(el);
    const notice = { el, timer: null };
    const expire = () => {
      clearTimeout(notice.timer);
      notice.timer = setTimeout(() => removeToast(id), 8000);
    };
    el.onpointerenter = () => clearTimeout(notice.timer);
    el.onpointerleave = expire;
    el.onfocusin = () => clearTimeout(notice.timer);
    el.onfocusout = expire;
    toasts.set(id, notice);
    expire();
  }
  function bind() {
    const toggle = make('button', 'messenger-toggle');
    toggle.id = 'messengerToggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-controls', 'messengerPanel');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.title = 'Amigos e mensagens privadas';
    toggle.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5"/></svg><span>Amigos</span><b id="messengerUnread" class="social-badge" hidden></b>';
    document.body.append(toggle);
    placeToggle();
    toggle.onclick = () => (opened ? close() : void open());
    window.addEventListener('trono-layout-change', () => requestAnimationFrame(placeToggle));
    window.addEventListener('resize', () => requestAnimationFrame(placeToggle));
    const screens = new MutationObserver(() => placeToggle());
    for (const id of ['portalScreen', 'setupScreen', 'roomScreen', 'chatOnlyScreen', 'gameScreen'])
      screens.observe($(id), { attributes: true, attributeFilter: ['class'] });
    const notices = make('div', 'messenger-notices');
    notices.id = 'messengerNotices';
    notices.setAttribute('aria-live', 'polite');
    notices.setAttribute('aria-relevant', 'additions');
    document.body.append(notices);
    const panel = make('aside', 'messenger-panel');
    panel.id = 'messengerPanel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Amigos e conversas privadas');
    panel.innerHTML =
      '<header class="messenger-heading"><strong>Amigos & conversas</strong><button id="messengerClose" class="settings-close" type="button" aria-label="Fechar amigos">×</button></header><div class="messenger-layout"><section class="messenger-sidebar"><label class="messenger-search-label">Adicionar amigo<input id="messengerSearch" placeholder="Buscar pelo apelido" maxlength="20" autocomplete="off"></label><div id="messengerSearchResults"></div><div id="messengerList"></div></section><section class="messenger-conversation"><header><button id="messengerBack" type="button" class="social-small-button">‹ Amigos</button><div><strong id="messengerName"></strong><small id="messengerSubtitle"></small></div></header><div class="messenger-tools"><button id="messengerAdd" type="button" class="social-small-button">Adicionar amigo</button><button id="messengerMute" type="button" class="social-small-button">Silenciar avisos</button><button id="messengerInvite" type="button" class="social-small-button">Convidar para canal</button><button id="messengerRemove" type="button" class="social-small-button">Remover amigo</button><button id="messengerEarlier" type="button" class="social-small-button">Mensagens anteriores</button></div><div id="messengerInvitePicker" hidden><label>Canal<select id="messengerInviteChannel"></select></label><button id="messengerInviteSend" type="button" class="social-small-button">Enviar convite</button></div><div id="messengerMessages" class="messenger-messages"></div><form id="messengerComposer" hidden><div id="messengerAttachmentDraft" hidden></div><input id="messengerFile" type="file" hidden><div class="messenger-compose-line"><button id="messengerAttach" type="button" title="Anexar arquivo · até 10 MB; vídeos MP4/WebM até 100 MB" aria-label="Anexar arquivo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m8 13 7-7a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7L13 2m-6 12 8-8"/></svg></button><textarea id="messengerInput" rows="2" maxlength="2000" placeholder="Mensagem privada" aria-label="Mensagem privada"></textarea><button id="messengerSend" type="submit">Enviar</button></div><small class="messenger-upload-help">Imagens, documentos e áudios até 10 MB · vídeos MP4/WebM até 100 MB</small></form></section></div><p id="messengerStatus" role="status"></p>';
    document.body.append(panel);
    $('messengerClose').onclick = close;
    $('messengerSearch').oninput = search;
    $('messengerComposer').onsubmit = (e) => {
      e.preventDefault();
      void submit();
    };
    $('messengerInput').oninput = keepDraft;
    $('messengerInput').onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void submit();
      }
    };
    $('messengerAttach').onclick = () => $('messengerFile').click();
    $('messengerFile').onchange = (e) => {
      const file = e.target.files[0];
      if (!file || !peer) return;
      const max = /\.(mp4|webm)$/i.test(file.name)
        ? window.TronoFiles.limits.video
        : window.TronoFiles.limits.file;
      if (!file.size || file.size > max) {
        e.target.value = '';
        status('Limite: ' + window.TronoFiles.size(max) + ' por arquivo.');
        return;
      }
      Object.assign(draft(), { file, uploaded: null, pending: null });
      renderAttachmentDraft();
      status('Anexo pronto. Clique em Enviar.');
    };
    $('messengerBack').onclick = openFriends;
    $('messengerAdd').onclick = () => void action(peer, 'request');
    $('messengerMute').onclick = () => {
      window.TronoNotifications.mute(peer, !window.TronoNotifications.muted(peer));
      renderHeader();
    };
    $('messengerRemove').onclick = () => {
      if (confirm('Remover esta amizade? O histórico da conversa será preservado.'))
        void action(peer, 'remove');
    };
    $('messengerEarlier').onclick = () => void read({ older: true });
    $('messengerInvite').onclick = () => {
      const picker = $('messengerInvitePicker'),
        select = $('messengerInviteChannel');
      picker.hidden = !picker.hidden;
      select.replaceChildren();
      for (const channel of window.TronoChatHub.channels)
        select.add(new Option(channel.name, channel.id));
      select.value =
        window.TronoNetwork.primaryRoom || window.TronoNetwork.currentRoom || select.value;
    };
    $('messengerInviteSend').onclick = () => {
      const id = $('messengerInviteChannel').value;
      if (id) {
        void submit(id);
        $('messengerInvitePicker').hidden = true;
      }
    };
    window.addEventListener('trono-telemetry-change', (event) => {
      if (event.detail.open) close();
    });
    window.addEventListener('trono-personal-change', (event) => {
      if (event.detail.key === 'notifications' || event.detail.key.startsWith('mute:'))
        for (const id of [...toasts.keys()])
          if (!window.TronoNotifications.allowed({ id }, { direct: true })) removeToast(id);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    window.addEventListener('focus', () => {
      schedule();
      void markRead();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        schedule();
        void markRead();
      }
    });
    window.TronoNetwork.onMessage((event) => {
      if (event.type === 'presence') {
        members = event.members || [];
        render();
        if ($('messengerSearch').value) search();
      }
      if (event.type === 'auth-result' && event.ok) schedule();
      if (event.type === 'social-changed') {
        schedule();
        if (event.kind === 'friend' && event.accountId !== owner && event.action === 'request')
          void window.TronoNotifications.notify({
            key: 'friend:' + event.accountId,
            title: 'Pedido de amizade',
            body: event.name + ' quer adicionar você.',
            target: { type: 'friends', id: event.accountId },
            request: true,
          });
      }
      if (event.type === 'direct-message') {
        const msg = event.message;
        if (seen.has(msg.id)) return;
        seen.add(msg.id);
        if (seen.size > 500) seen.delete(seen.values().next().value);
        const other = msg.senderId === owner ? event.peerId : msg.senderId;
        if (other === peer && !messages.some((row) => row.id === msg.id)) {
          messages.push(msg);
          paintMessages();
          void markRead();
        }
        if (msg.senderId !== owner && !activeThread(other)) {
          showToast(other, msg, event.senderName);
          void window.TronoNotifications.notify({
            key: msg.id,
            title: event.senderName + ' · mensagem privada',
            body: msg.text || 'Enviou um anexo',
            target: { type: 'direct', id: other },
            direct: true,
          });
        }
        schedule();
      }
    });
    function auth() {
      const id = window.TronoAuth.user?.id || null;
      if (owner !== id) {
        stopUpload();
        owner = id;
        generation++;
        state = { friends: [], threads: [] };
        peer = null;
        messages = [];
        drafts.clear();
        seen.clear();
        for (const key of [...toasts.keys()]) removeToast(key);
        $('messengerInput').value = '';
        $('messengerFile').value = '';
        close();
        paintMessages();
        render();
      }
      toggle.hidden = !id;
      if (id) schedule();
    }
    window.addEventListener('trono-auth-change', auth);
    void window.TronoAuth.ready.then(auth);
    auth();
    paintMessages();
  }
  window.addEventListener('trono:ready', bind);
  return { open, openFriends, close, joinChannel, request };
})();
