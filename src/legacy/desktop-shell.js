'use strict';
// Navigation changes only the visible area. Existing controllers keep owning
// the game, room, call and clip library; there is no second network connection.
if (window.TronoDesktop)
  window.addEventListener('trono:ready', () => {
    const $ = (id) => document.getElementById(id),
      body = document.body;
    body.classList.add('desktop-app');
    const help = {
      '.appearance-help':
        'Aplica na hora, só para você neste aplicativo. Não muda o tema dos outros na chamada.',
      '#voiceLightModeHelp':
        'Usa a redução nativa com filtro leve de graves e de fundo entre falas, e reduz animações e medições. Pode ajudar em jogos pesados; não reserva recursos nem garante áudio sem cortes. Vale apenas neste aparelho.',
      '[data-settings-panel="video"] .settings-context-help':
        'Escolha áudio isolado do aplicativo/jogo para transmitir seu som. Computador inteiro pode incluir as vozes da chamada e causar eco.',
    };
    for (const [selector, text] of Object.entries(help))
      document.querySelector(selector).textContent = text;
    const icons = {
      home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
      game: '<path d="m3 6 4 4 5-6 5 6 4-4-2 13H5z"/>',
      community:
        '<path d="M21 11a8 8 0 0 1-8 8H8l-5 3V11a9 9 0 0 1 18 0Z"/><path d="M8 10h8M8 14h5"/>',
      clips: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m10 8 6 4-6 4zM3 7h18"/>',
      profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    };
    const rail = document.createElement('nav');
    rail.id = 'desktopRail';
    rail.setAttribute('aria-label', 'Áreas do aplicativo');
    rail.innerHTML =
      '<button id="desktopHome" type="button" class="desktop-brand" data-desktop-route="home" aria-label="M&N · Ir para o início" title="M&N · Início">M<span>&</span>N</button>';
    rail.firstElementChild.onclick = () => void navigate('home');
    for (const [view, label] of [
      ['game', 'Jogos'],
      ['community', 'Comunidade'],
      ['clips', 'Clipes'],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.desktopRoute = view;
      button.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' +
        icons[view] +
        '</svg><span>' +
        label +
        '</span>';
      if (view === 'clips') {
        button.disabled = true;
        button.title = 'Opção em desenvolvimento';
        button.setAttribute('aria-label', 'Clipes · opção em desenvolvimento');
        button.querySelector('span').innerHTML =
          'Clipes <span aria-hidden="true">🔒</span><small>Em desenvolvimento</small>';
      } else button.onclick = () => void navigate(view);
      rail.append(button);
    }
    const version = document.createElement('button');
    version.id = 'desktopUpdateCheck';
    version.type = 'button';
    version.className = 'desktop-version';
    version.title = 'Verificar atualização';
    version.textContent = 'Windows ' + window.TronoDesktop.version;
    rail.append(version);
    body.append(rail);
    // Appearance belongs to the shell; call-controls-layout owns placement.
    const effects = $('soundboardToggle'),
      effectsMenu = $('soundboardDialog');
    effects.classList.remove('soundboard-toggle');
    effects.classList.add('desktop-effects-button');
    effects.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 9v6m4-9v12m5-16v20m5-16v12m4-9v6"/></svg><span>Efeitos</span>';
    function positionEffects() {
      if (effectsMenu.hidden) return;
      const boundsTop = $('desktopTopBar').getBoundingClientRect().bottom + 12,
        boundsBottom =
          (body.dataset.appLayout === 'discord'
            ? $('layoutVoicePanel').getBoundingClientRect().top
            : $('desktopCallDock').getBoundingClientRect().top) - 12;
      effectsMenu.style.setProperty(
        '--desktop-effects-height',
        Math.max(120, boundsBottom - boundsTop) + 'px',
      );
      const top = Math.max(
        boundsTop,
        Math.min(effects.getBoundingClientRect().top, boundsBottom - effectsMenu.offsetHeight),
      );
      effectsMenu.style.setProperty('--desktop-effects-top', top + 'px');
    }
    new MutationObserver(positionEffects).observe(effectsMenu, {
      attributes: true,
      attributeFilter: ['hidden'],
    });
    new ResizeObserver(positionEffects).observe(effectsMenu);
    window.addEventListener('resize', positionEffects);
    const fullscreenButton = document.createElement('button');
    fullscreenButton.id = 'desktopFullscreen';
    fullscreenButton.type = 'button';
    fullscreenButton.title = 'Tela cheia · F11';
    fullscreenButton.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg><span>Tela cheia</span>';
    rail.insertBefore(fullscreenButton, version);
    const topbar = document.createElement('header');
    topbar.id = 'desktopTopBar';
    topbar.setAttribute('aria-label', 'Ferramentas da comunidade');
    const heading = document.createElement('span');
    heading.className = 'desktop-top-label';
    heading.textContent = 'Jogue. Converse. Compartilhe.';
    const channelToggle = document.createElement('button');
    channelToggle.id = 'desktopChannelsToggle';
    channelToggle.type = 'button';
    channelToggle.textContent = '☰ Canais';
    channelToggle.setAttribute('aria-expanded', 'false');
    channelToggle.setAttribute('aria-controls', 'chatChannelList');
    const shade = document.createElement('button');
    shade.id = 'desktopSidebarShade';
    shade.type = 'button';
    shade.setAttribute('aria-label', 'Fechar lista de canais');
    shade.hidden = true;
    body.append(shade);
    function channels(value) {
      const on =
        typeof value === 'boolean' ? value : !body.classList.contains('desktop-channels-open');
      body.classList.toggle('desktop-channels-open', on);
      shade.hidden = !on;
      channelToggle.setAttribute('aria-expanded', String(on));
    }
    channelToggle.onclick = () => channels();
    shade.onclick = () => channels(false);
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-chat-channel]')) channels(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') channels(false);
    });
    const people = $('communityToggle'),
      telemetry = $('telemetryOpenBtn'),
      diagnostics = $('telemetryPanel');
    people.title = 'Ver pessoas online ou minimizar a lista';
    people.setAttribute('aria-controls', 'communityPanel');
    telemetry.textContent = 'Telemetria';
    telemetry.setAttribute('aria-controls', 'telemetryPanel');
    telemetry.setAttribute('aria-expanded', 'false');
    topbar.append(heading, channelToggle, telemetry);
    body.append(topbar, diagnostics);
    window.addEventListener('trono-telemetry-change', (event) =>
      telemetry.setAttribute('aria-expanded', String(event.detail.open)),
    );
    function updateWindowState(state) {
      const on = state.fullscreen === true;
      fullscreenButton.setAttribute('aria-pressed', String(on));
      fullscreenButton.setAttribute(
        'aria-label',
        on ? 'Sair da tela cheia' : 'Entrar em tela cheia',
      );
      fullscreenButton.querySelector('span').textContent = on ? 'Sair da tela cheia' : 'Tela cheia';
    }
    fullscreenButton.onclick = async () => {
      fullscreenButton.disabled = true;
      try {
        updateWindowState(await window.TronoDesktop.toggleFullscreen());
      } catch {
        fullscreenButton.title = 'Não foi possível alterar a tela cheia. Tente F11.';
      } finally {
        fullscreenButton.disabled = false;
      }
    };
    window.TronoDesktop.onWindowState(updateWindowState);
    void window.TronoDesktop.getWindowState()
      .then(updateWindowState)
      .catch(() => {});
    const dock = document.createElement('footer');
    dock.id = 'desktopCallDock';
    dock.setAttribute('aria-label', 'Controles da chamada');
    const info = document.createElement('div');
    info.className = 'desktop-call-info';
    info.innerHTML =
      '<small>SEU ESPAÇO, SEM INTERRUPÇÕES</small><strong id="desktopCallName">M&N · pronto para conectar</strong><span id="desktopCallStatus"></span>';
    dock.append(info);
    body.append(dock);
    window.TronoCallControlsLayout.refresh();
    $('socialBtn').addEventListener('click', () => {
      body.classList.add('game-communication-open');
      window.TronoSocial.showPanel(true);
    });
    $('socialCloseBtn').addEventListener('click', () =>
      body.classList.remove('game-communication-open'),
    );
    const primary = [
      'portalScreen',
      'setupScreen',
      'roomScreen',
      'chatOnlyScreen',
      'gameScreen',
      'gamesScreen',
      'azulScreen',
      'rogueliteScreen',
      'splendorScreen',
      'loveLetterScreen',
    ];
    let lastGame = 'setupScreen',
      previous = 'home',
      clipsOpen = false;
    function setView(view) {
      body.dataset.desktopView = view;
      for (const b of rail.querySelectorAll('button[data-desktop-route]')) {
        const selected = b.dataset.desktopRoute === view;
        b.classList.toggle('active', selected);
        if (selected) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
      }
    }
    function synchronize() {
      const visible = primary.find((id) => !$(id).classList.contains('hidden'));
      if (['setupScreen', 'roomScreen', 'gameScreen'].includes(visible)) lastGame = visible;
      if (!clipsOpen)
        setView(
          visible === 'portalScreen' ? 'home' : visible === 'chatOnlyScreen' ? 'community' : 'game',
        );
    }
    const observer = new MutationObserver(synchronize);
    for (const id of primary)
      observer.observe($(id), { attributes: true, attributeFilter: ['class'] });
    const statusObserver = new MutationObserver(() => {
      $('desktopCallStatus').textContent = $('voiceStatus').textContent;
      $('desktopCallName').textContent = window.TronoSocial?.voiceJoined
        ? 'Chamada conectada'
        : 'M&N · pronto para conectar';
    });
    statusObserver.observe($('voiceStatus'), {
      childList: true,
      subtree: true,
      characterData: true,
    });
    function closeClips() {
      if (clipsOpen) {
        clipsOpen = false;
        $('clipsDialog').classList.remove('desktop-clips-page');
        $('clipsDialog').close();
      }
    }
    async function navigate(view) {
      if (view === 'profile' || view === 'settings') {
        window.TronoDesktopSettings.open(view === 'profile' ? 'account' : undefined);
        return;
      }
      if (view === 'clips') return;
      channels(false);
      closeClips();
      if (view === 'home') {
        window.TronoPortal.showOnly('portalScreen');
        setView(view);
        return;
      }
      if (view === 'game') return window.TronoGames.openLibrary();
      if (view === 'throne') {
        if (!window.TronoAuth?.user && !window.TronoAuth?.guest) {
          window.TronoPortal.openGame(true);
          return;
        }
        // A community entry may have left a previous game. Do not restore its
        // stale waiting-room UI merely because it was the last game screen.
        if (!window.TronoNetwork.gameRoom) lastGame = 'setupScreen';
        window.TronoPortal.showOnly(lastGame);
        window.TronoNetwork.requestRooms();
        setView('game');
        return;
      }
      if (view === 'community') {
        const room = window.TronoNetwork.currentRoom;
        if (room && window.TronoChatHub.channels.some((channel) => channel.id === room)) {
          window.TronoPortal.showOnly('chatOnlyScreen');
          body.classList.add('chat-only-active');
          window.TronoSocial.showForRoom(true);
          setView(view);
          return;
        }
        if (
          room &&
          !window.TronoNetwork.independentGameVoice &&
          !window.confirm(
            'O servidor precisa ser atualizado para manter jogo e voz juntos. Sair da mesa?',
          )
        )
          return;
        await window.TronoPortal.openVoice();
        synchronize();
      }
    }
    // Reuse portal entries while protecting an existing room/call from a second
    // enterChatOnly. Going home is navigation, whereas leaving voice stays explicit.
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target.closest(
          '#openVoicePortalBtn,#voicePortalCard,#openGamePortalBtn,#gamePortalCard,#backFromChatOnlyBtn,#portalBrandBtn,.portal-nav-btn,[data-open-clips]',
        );
        if (!target) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const view = target.matches('[data-open-clips]')
          ? 'clips'
          : target.matches('#openVoicePortalBtn,#voicePortalCard') ||
              target.dataset.portalTarget === 'voice'
            ? 'community'
            : target.matches('#openGamePortalBtn,#gamePortalCard') ||
                target.dataset.portalTarget === 'game'
              ? 'game'
              : 'home';
        void navigate(view);
      },
      true,
    );
    $('shareReplayHelp').hidden = true;
    $('clipsDialog').hidden = true;
    document.querySelector('.call-control-clips').hidden = true;
    $('clipClose').onclick = () => {
      closeClips();
      setView(previous);
      synchronize();
    };
    $('clipsDialog').addEventListener('close', () => {
      if (clipsOpen) {
        clipsOpen = false;
        $('clipsDialog').classList.remove('desktop-clips-page');
        synchronize();
      }
    });
    window.TronoDesktopShell = { navigate };
    synchronize();
    $('desktopCallStatus').textContent = $('voiceStatus').textContent;
  });
