'use strict';
window.TronoNexus = (() => {
  const $ = id => document.getElementById(id);
  const config = window.TronoNexusConfig;
  let frame = null, timer = null;
  const status = text => { $('nexusStatus').textContent = text; };
  function stop() {
    clearTimeout(timer); frame?.remove(); frame = null;
    $('nexusFullscreen').hidden = true; $('nexusClose').hidden = true;
    $('nexusLaunch').hidden = false;
    status('Pronto para jogar. O jogo só é carregado quando você clicar em Jogar.');
  }
  function open() {
    window.TronoPortal.showOnly('nexusScreen');
    window.TronoSocial?.showForRoom(false);
    document.body.dataset.gamesView = 'nexus';
    $('nexusLaunch').focus();
  }
  async function launch() {
    if (typeof window.TronoDesktop?.openNexus === 'function') {
      $('nexusLaunch').disabled = true;
      try {
        await window.TronoDesktop.openNexus();
        status('Nexus aberto na janela do jogo. Sua chamada continua no Trono. Clique em Jogar para voltar à janela.');
      } catch { status('Não foi possível abrir a janela. Use “Abrir no itch.io” ou tente novamente.'); }
      finally { $('nexusLaunch').disabled = false; }
      return;
    }
    if (!config.embedUrl) {
      window.open(config.pageUrl, '_blank', 'noopener,noreferrer');
      status('O Nexus abre em outra aba. Se ela não apareceu, use “Abrir no itch.io”. Sua chamada continua nesta aba.');
      return;
    }
    if (frame) { frame.focus(); return; }
    frame = document.createElement('iframe');
    frame.id = 'nexusFrame'; frame.title = 'Nexus · Ecos do Crepúsculo';
    frame.allow = 'fullscreen; gamepad'; frame.allowFullscreen = true;
    frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock');
    frame.onload = () => {
      clearTimeout(timer);
      status('Página do jogo aberta. Aguarde o carregamento do Nexus; se a tela ficar vazia, use “Abrir no itch.io”.');
      frame?.focus();
    };
    frame.src = config.embedUrl;
    $('nexusViewport').append(frame);
    $('nexusLaunch').hidden = true; $('nexusFullscreen').hidden = false; $('nexusClose').hidden = false;
    status('Carregando pelo itch.io… O primeiro acesso pode demorar conforme sua conexão.');
    timer = setTimeout(() => status('O carregamento está demorando. Confira a conexão ou use “Abrir no itch.io”.'), 45000);
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement === $('nexusScreen')) await document.exitFullscreen();
      else await $('nexusScreen').requestFullscreen();
    } catch { status('Tela cheia indisponível neste navegador. Você pode abrir o jogo no itch.io.'); }
  }
  window.addEventListener('DOMContentLoaded', () => {
    $('playNexus').onclick = open;
    $('nexusLaunch').onclick = () => void launch();
    $('nexusBack').onclick = () => window.TronoGames.openLibrary();
    $('nexusFullscreen').onclick = () => void fullscreen();
    $('nexusClose').onclick = () => { if (window.confirm('Fechar o Nexus? Em uma partida PvP, a desconexão pode causar derrota.')) stop(); };
    $('nexusExternal').href = config.pageUrl;
    $('nexusLeaveNote').hidden = !config.embedUrl || !!window.TronoDesktop;
    new MutationObserver(() => {
      if ($('nexusScreen').classList.contains('hidden') && document.fullscreenElement === $('nexusScreen')) void document.exitFullscreen().catch(() => {});
    }).observe($('nexusScreen'), {attributes: true, attributeFilter: ['class']});
    document.addEventListener('fullscreenchange', () => {
      const full = document.fullscreenElement === $('nexusScreen');
      $('nexusFullscreen').textContent = full ? 'Sair da tela cheia' : 'Tela cheia';
      $('nexusFullscreen').setAttribute('aria-pressed', String(full));
    });
  });
  return {open};
})();
