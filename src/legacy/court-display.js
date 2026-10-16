'use strict';
window.addEventListener('trono:ready', () => {
  const game = document.getElementById('gameScreen'),
    button = document.getElementById('courtFullscreen');
  let native = false,
    pending = false,
    ownsDocumentFullscreen = false;
  function sync() {
    const playing = !game.classList.contains('hidden'),
      full = native || document.fullscreenElement === document.documentElement;
    document.body.classList.toggle('court-fullscreen', playing && full);
    button.setAttribute('aria-pressed', String(full));
    button.textContent = full ? '⛶ Sair da tela cheia' : '⛶ Tela cheia';
    if (!playing && ownsDocumentFullscreen) {
      ownsDocumentFullscreen = false;
      if (document.fullscreenElement === document.documentElement)
        void document.exitFullscreen().catch(() => {});
    }
  }
  button.onclick = async () => {
    if (pending) return;
    pending = true;
    button.disabled = true;
    try {
      if (window.TronoDesktop?.toggleFullscreen) {
        native = (await window.TronoDesktop.toggleFullscreen()).fullscreen === true;
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
        ownsDocumentFullscreen = false;
      } else {
        await document.documentElement.requestFullscreen();
        ownsDocumentFullscreen = true;
      }
      button.title = 'Tela cheia nativa';
    } catch {
      button.title = 'Não foi possível entrar em tela cheia. No navegador, tente F11.';
    } finally {
      pending = false;
      button.disabled = false;
      sync();
    }
  };
  window.TronoDesktop?.onWindowState?.((state) => {
    native = state.fullscreen === true;
    sync();
  });
  window.TronoDesktop?.getWindowState?.()
    .then((state) => {
      native = state.fullscreen === true;
      sync();
    })
    .catch(() => {});
  document.addEventListener('fullscreenchange', sync);
  new MutationObserver(sync).observe(game, { attributes: true, attributeFilter: ['class'] });
  sync();
});
