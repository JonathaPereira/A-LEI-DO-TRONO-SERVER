'use strict';
if (window.TronoDesktop)
  window.addEventListener('trono:ready', () => {
    const native = window.TronoDesktop,
      $ = (id) => document.getElementById(id);
    let enabled = false,
      preferred = null,
      name = '',
      state = null,
      authenticated = false;
    try {
      enabled = localStorage.getItem('mn-activity-enabled') === '1';
      preferred = localStorage.getItem('mn-activity-app') || null;
      name = localStorage.getItem('mn-activity-name') || '';
    } catch {}
    function currentGame() {
      if (state?.game) return state.game;
      if (
        !preferred &&
        window.__LeiDoTrono?.getState?.() &&
        !$('gameScreen').classList.contains('hidden')
      )
        return { name: 'A Lei do Trono' };
      return null;
    }
    function publish() {
      if (authenticated && window.TronoNetwork.gameActivitySupported)
        window.TronoNetwork.setActivity(
          enabled && currentGame() ? { name: currentGame().name } : null,
        );
    }
    function render() {
      $('desktopActivityEnabled').checked = enabled;
      $('desktopActivityEnabled').disabled = !state?.available || !window.TronoAuth.user;
      const select = $('desktopActivityApp'),
        focus = document.activeElement;
      if (focus !== select) {
        select.replaceChildren(new Option('Detecção automática', ''));
        for (const app of state?.apps || []) select.add(new Option(app.name, app.id));
        if (preferred && !Array.from(select.options).some((row) => row.value === preferred))
          select.add(new Option('Aplicativo selecionado · não está aberto', preferred));
        select.value = preferred || '';
      }
      select.disabled = !enabled || !window.TronoAuth.user;
      $('desktopActivityNameLabel').hidden = !preferred;
      $('desktopActivityName').disabled = !enabled;
      if (focus !== $('desktopActivityName')) $('desktopActivityName').value = name;
      $('desktopActivityStatus').textContent = !window.TronoAuth.user
        ? 'Entre na conta para compartilhar sua atividade.'
        : !state?.available
          ? 'Detecção de aplicativos disponível na versão para Windows.'
          : !enabled
            ? 'Sua atividade está oculta.'
            : state.error ||
              (!window.TronoNetwork.gameActivitySupported
                ? 'Compartilhamento de atividade ainda indisponível nesta conexão.'
                : currentGame()
                  ? 'Jogando ' + currentGame().name
                  : 'Nenhum jogo detectado. Abra um jogo ou selecione um aplicativo.');
    }
    function consume(value) {
      state = value;
      render();
      publish();
    }
    async function configure() {
      try {
        if (native.configureActivity)
          consume(
            await native.configureActivity({
              enabled: enabled && !!window.TronoAuth.user,
              preferredAppId: preferred,
              name,
            }),
          );
      } catch {
        state = { ...state, error: 'Não foi possível atualizar sua atividade.' };
        render();
      }
    }
    function save() {
      try {
        localStorage.setItem('mn-activity-enabled', enabled ? '1' : '0');
        if (preferred) localStorage.setItem('mn-activity-app', preferred);
        else localStorage.removeItem('mn-activity-app');
        localStorage.setItem('mn-activity-name', name);
      } catch {}
      void configure();
    }
    $('desktopActivityEnabled').onchange = () => {
      enabled = $('desktopActivityEnabled').checked;
      save();
    };
    $('desktopActivityApp').onchange = () => {
      preferred = $('desktopActivityApp').value || null;
      name = '';
      save();
    };
    $('desktopActivityName').onchange = () => {
      name = $('desktopActivityName').value.trim().slice(0, 80);
      save();
    };
    native.onActivity?.(consume);
    window.addEventListener('trono-auth-change', () => {
      if (!window.TronoAuth.user) {
        publishClear();
        authenticated = false;
      }
      void configure();
    });
    function publishClear() {
      if (authenticated) window.TronoNetwork.setActivity(null);
    }
    window.TronoNetwork.onMessage((message) => {
      if (message.type === 'auth-result' && message.ok) {
        authenticated = true;
        publish();
        render();
      } else if (message.type === 'connection' && !message.connected) {
        authenticated = false;
        render();
      } else if (message.type === 'welcome') {
        render();
      } else if (message.type === 'game-state') {
        render();
        publish();
      }
    });
    new MutationObserver(() => {
      render();
      publish();
    }).observe($('gameScreen'), { attributes: true, attributeFilter: ['class'] });
    void window.TronoAuth.ready.then(async () => {
      try {
        state = await native.getActivityState?.();
      } catch {}
      render();
      await configure();
    });
  });
