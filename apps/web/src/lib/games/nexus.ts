import { nexusConfig, type NexusConfig } from './nexus-config';

interface NexusWindow extends Window {
  TronoDesktop?: {
    openNexus?: () => Promise<unknown>;
  };
  TronoPortal?: {
    showOnly(id: string): void;
  };
  TronoSocial?: {
    showForRoom(show: boolean): void;
  };
  TronoGames?: {
    openLibrary(): unknown;
  };
  TronoNexus?: {
    open(): void;
  };
}

const installed = new WeakMap<Window, () => void>();

export function initializeNexus(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;

  const runtime = target as NexusWindow;
  const doc = target.document;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => doc.getElementById(id) as T | null;

  const hadInitialConfig = Boolean(runtime.TronoNexusConfig);
  runtime.TronoNexusConfig = { ...nexusConfig, ...runtime.TronoNexusConfig };
  const getConfig = (): NexusConfig => ({
    ...nexusConfig,
    ...runtime.TronoNexusConfig,
  });
  let frame: HTMLIFrameElement | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let observer: MutationObserver | null = null;
  let disposed = false;

  const status = (text: string) => {
    const el = $('nexusStatus');
    if (el) el.textContent = text;
  };

  function stop() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    frame?.remove();
    frame = null;
    const fsBtn = $('nexusFullscreen');
    const closeBtn = $('nexusClose');
    const launchBtn = $('nexusLaunch');
    if (fsBtn) fsBtn.hidden = true;
    if (closeBtn) closeBtn.hidden = true;
    if (launchBtn) launchBtn.hidden = false;
    status('Pronto para jogar. O jogo só é carregado quando você clicar em Jogar.');
  }

  function open() {
    runtime.TronoPortal?.showOnly('nexusScreen');
    runtime.TronoSocial?.showForRoom(false);
    doc.body.dataset.gamesView = 'nexus';
    $('nexusLaunch')?.focus();
  }

  async function launch() {
    const cfg = getConfig();
    if (typeof runtime.TronoDesktop?.openNexus === 'function') {
      const launchBtn = $<HTMLButtonElement>('nexusLaunch');
      if (launchBtn) launchBtn.disabled = true;
      status('Abrindo a janela do Nexus… Aguarde o carregamento do jogo.');
      try {
        await runtime.TronoDesktop.openNexus();
        status(
          'Nexus aberto na janela do jogo. Sua chamada continua no Trono. Clique em Jogar para voltar à janela.',
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        status(
          `Não foi possível abrir o Nexus: ${detail}. Tente novamente ou use “Abrir no itch.io”.`,
        );
      } finally {
        if (launchBtn) launchBtn.disabled = false;
      }
      return;
    }
    if (runtime.TronoDesktop) {
      status(
        'Atualize o MN Trono para abrir a janela do Nexus. Enquanto isso, use “Abrir no itch.io”.',
      );
      return;
    }
    if (!cfg.embedUrl) {
      target.open(cfg.pageUrl, '_blank', 'noopener,noreferrer');
      status(
        'O Nexus abre em outra aba. Se ela não apareceu, use “Abrir no itch.io”. Sua chamada continua nesta aba.',
      );
      return;
    }
    if (frame) {
      frame.focus();
      return;
    }
    frame = doc.createElement('iframe');
    frame.id = 'nexusFrame';
    frame.title = 'Nexus · Ecos do Crepúsculo';
    frame.allow = 'autoplay; fullscreen; gamepad';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock');
    frame.onload = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      status(
        'Página do jogo aberta. Aguarde o carregamento do Nexus; se a tela ficar vazia, use “Abrir no itch.io”.',
      );
      frame?.focus();
    };
    frame.src = cfg.embedUrl;
    $('nexusViewport')?.append(frame);
    const launchBtn = $('nexusLaunch');
    const fsBtn = $('nexusFullscreen');
    const closeBtn = $('nexusClose');
    if (launchBtn) launchBtn.hidden = true;
    if (fsBtn) fsBtn.hidden = false;
    if (closeBtn) closeBtn.hidden = false;
    status('Carregando pelo itch.io… O primeiro acesso pode demorar conforme sua conexão.');
    timer = setTimeout(
      () => status('O carregamento está demorando. Confira a conexão ou use “Abrir no itch.io”.'),
      45000,
    );
  }

  async function fullscreen() {
    const screen = $('nexusScreen');
    if (!screen) return;
    try {
      if (doc.fullscreenElement === screen) await doc.exitFullscreen();
      else await screen.requestFullscreen();
    } catch {
      status('Tela cheia indisponível neste navegador. Você pode abrir o jogo no itch.io.');
    }
  }

  const onFullscreenChange = () => {
    const screen = $('nexusScreen');
    const fsBtn = $('nexusFullscreen');
    if (!screen || !fsBtn) return;
    const full = doc.fullscreenElement === screen;
    fsBtn.textContent = full ? 'Sair da tela cheia' : 'Tela cheia';
    fsBtn.setAttribute('aria-pressed', String(full));
  };

  function bind() {
    if (disposed) return;
    const cfg = getConfig();
    const playBtn = $('playNexus');
    if (playBtn) playBtn.onclick = open;
    const launchBtn = $('nexusLaunch');
    if (launchBtn) launchBtn.onclick = () => void launch();
    const backBtn = $('nexusBack');
    if (backBtn) backBtn.onclick = () => void runtime.TronoGames?.openLibrary();
    const fsBtn = $('nexusFullscreen');
    if (fsBtn) fsBtn.onclick = () => void fullscreen();
    const closeBtn = $('nexusClose');
    if (closeBtn) {
      closeBtn.onclick = () => {
        if (
          target.confirm('Fechar o Nexus? Em uma partida PvP, a desconexão pode causar derrota.')
        ) {
          stop();
        }
      };
    }
    const externalLink = $<HTMLAnchorElement>('nexusExternal');
    if (externalLink) externalLink.href = cfg.pageUrl;
    const leaveNote = $('nexusLeaveNote');
    if (leaveNote) leaveNote.hidden = !cfg.embedUrl || !!runtime.TronoDesktop;
    const screen = $('nexusScreen');
    if (screen && !observer) {
      observer = new MutationObserver(() => {
        if (screen.classList.contains('hidden') && doc.fullscreenElement === screen) {
          void doc.exitFullscreen().catch(() => {});
        }
      });
      observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
    }
  }

  doc.addEventListener('fullscreenchange', onFullscreenChange);
  bind();
  target.addEventListener('trono:ready', bind, { once: true });

  const facade = { open };
  runtime.TronoNexus = facade;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    target.removeEventListener('trono:ready', bind);
    doc.removeEventListener('fullscreenchange', onFullscreenChange);
    observer?.disconnect();
    observer = null;
    stop();
    if (runtime.TronoNexus === facade) delete runtime.TronoNexus;
    if (!hadInitialConfig) delete runtime.TronoNexusConfig;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
