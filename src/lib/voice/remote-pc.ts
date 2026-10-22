import { RemoteGamepad, type StandardGamepadLike } from './remote-gamepad';
import {
  RemotePerformance,
  type RemoteAdaptationState,
  type RemotePerformanceSample,
  type RemoteRtcStatReport,
} from './remote-performance';

interface RemoteDesktopBridge {
  remoteCapability?: () => Promise<{
    host?: boolean;
    beta?: boolean;
    audio?: boolean;
    gamepad?: boolean;
  }>;
  prepareRemoteCapture?: (peerName: string) => Promise<{ allowed?: boolean }>;
  allowRemoteControl?: (
    mode?: string,
  ) => Promise<{ allowed?: boolean; token?: string | null; gamepadIndex?: number | null }>;
  revokeRemoteControl?: () => Promise<unknown>;
  remoteInput?: (token: string, event: Record<string, unknown>) => unknown;
  stopRemote?: () => Promise<unknown>;
  onRemote?: (listener: (event: { type?: string }) => void) => (() => void) | void;
  openRemoteDriver?: () => Promise<unknown> | void;
}

interface RemoteRosterPeer {
  id: string;
  accountId?: string | null;
  name: string;
  joined?: boolean;
  mediaBlocked?: boolean;
}

interface RemoteSignalPayload {
  type?: string;
  sdp?: string;
  candidate?: RTCIceCandidateInit | null;
}

interface RemoteSession {
  role: 'host' | 'viewer' | 'invited';
  peerName: string;
  id: string | null;
  closed: boolean;
  profile?: string;
  adaptation?: RemoteAdaptationState;
  message?: string;
  stream?: MediaStream;
  remoteStream?: MediaStream;
  pc?: RTCPeerConnection;
  candidates?: Array<RTCIceCandidateInit | null>;
  signals?: RemoteSignalPayload[];
  signalChain?: Promise<void>;
  control?: RTCDataChannel;
  pointer?: RTCDataChannel;
  gamepadChannel?: RTCDataChannel;
  controlling?: boolean;
  inputMode?: string;
  grantId?: string | null;
  gamepadIndex?: number | null;
  localGamepadIndex?: number;
  gamepadSequence?: number;
  pointerSequence?: number;
  lastGamepadSequence?: number;
  lastPointerSequence?: number;
  token?: string | null;
  asking?: boolean;
  lastAsk?: number;
  lastInput?: number;
  lastServerPulse?: number;
  timer?: ReturnType<typeof setInterval>;
  gamepadTimer?: ReturnType<typeof setInterval>;
  statsTimer?: ReturnType<typeof setInterval>;
  connectTimer?: ReturnType<typeof setTimeout>;
  controlTimer?: ReturnType<typeof setTimeout>;
  statsBusy?: boolean;
  previousStats?: RemoteRtcStatReport;
  metrics?: RemotePerformanceSample;
}

interface RemotePcWindow extends Window {
  TronoDesktop?: RemoteDesktopBridge;
  TronoSocial?: {
    voiceJoined?: boolean;
    mediaBlocked?: boolean;
  };
  TronoAuth?: {
    user?: { id?: string } | null;
  };
  TronoNetwork?: {
    connected?: boolean;
    clientId?: string | null;
    remotePc(action: string, payload?: Record<string, unknown>): boolean;
    onMessage(listener: (message: Record<string, unknown>) => void): (() => void) | void;
  };
  TronoRemotePc?: {
    open(): void;
    stop(options?: { tell?: boolean }): Promise<void>;
    readonly active: boolean;
    readonly state: {
      role: string;
      sessionId: string | null;
      controlling: boolean;
      inputMode: string | undefined;
      profile: string | undefined;
      metrics: RemotePerformanceSample | undefined;
      connected: RTCPeerConnectionState | undefined;
    } | null;
  };
}

const installed = new WeakMap<Window, () => void>();

export function initializeRemotePc(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;

  const runtime = target as RemotePcWindow;
  const doc = target.document;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => doc.getElementById(id) as T | null;

  const pending = new Map<
    string,
    {
      resolve: (data: Record<string, unknown>) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const gameKeys = new Set<string>();
  let current: RemoteSession | null = null;
  let roster: RemoteRosterPeer[] = [];
  let supported = false;
  let capability: { host?: boolean; beta?: boolean; audio?: boolean; gamepad?: boolean } = {
    host: false,
  };
  let dialog: HTMLDialogElement | null = null;
  let button: HTMLButtonElement | null = null;
  let remoteGeneration = 0;
  let disposed = false;

  function request(
    action: string,
    payload: Record<string, unknown> = {},
    timeout = 12000,
  ): Promise<Record<string, unknown>> {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(Error('O compartilhamento não respondeu. Tente novamente.'));
      }, timeout);
      pending.set(requestId, { resolve, reject, timer });
      if (!runtime.TronoNetwork?.remotePc(action, { ...payload, protocol: 2, requestId })) {
        clearTimeout(timer);
        pending.delete(requestId);
        reject(Error('Servidor desconectado.'));
      }
    });
  }

  function active(s: RemoteSession | null | undefined): boolean {
    return !!s && current === s && !s.closed;
  }

  function status(text: string) {
    const el = $('remotePcStatus');
    if (el) el.textContent = text;
  }

  function notify(s: RemoteSession, text: string) {
    if (active(s)) {
      s.message = text;
      status(text);
    }
  }

  function send(s: RemoteSession, type: string, data: Record<string, unknown> = {}) {
    if (s.control?.readyState === 'open' && s.control.bufferedAmount < 16384) {
      s.control.send(
        JSON.stringify({ type, ...data, ...(s.grantId ? { grantId: s.grantId } : {}) }),
      );
      return true;
    }
    return false;
  }

  function render() {
    button ??= $<HTMLButtonElement>('remotePcBtn');
    dialog ??= $<HTMLDialogElement>('remotePcDialog');
    if (!button || !dialog) return;

    const voice = !!runtime.TronoSocial?.voiceJoined;
    const mediaBlocked = !!runtime.TronoSocial?.mediaBlocked;
    button.disabled = mediaBlocked;
    button.dataset.active = String(!!current);
    button.title = current ? 'Abrir compartilhamento de PC ativo' : 'Compartilhar PC · Beta';
    button.setAttribute('aria-label', button.title);
    button.dataset.workspaceLabel = current ? 'PC ativo · Beta' : 'PC · Beta';

    const setupEl = $('remotePcSetup');
    const sessionEl = $('remotePcSession');
    const acceptEl = $<HTMLButtonElement>('remotePcAccept');
    const startEl = $<HTMLButtonElement>('remotePcStart');
    const endEl = $<HTMLButtonElement>('remotePcEnd');
    const hostNoticeEl = $('remotePcHostNotice');
    const voiceNoticeEl = $('remotePcVoiceNotice');
    const supportEl = $('remotePcSupport');
    const targetEl = $<HTMLSelectElement>('remotePcTarget');
    const requestControlEl = $<HTMLButtonElement>('remotePcRequestControl');
    const revokeEl = $<HTMLButtonElement>('remotePcRevoke');
    const fullscreenEl = $<HTMLButtonElement>('remotePcFullscreen');
    const inputLabelEl = $('remotePcInputLabel');
    const inputModeEl = $<HTMLSelectElement>('remotePcInputMode');
    const driverNoticeEl = $('remotePcDriverNotice');
    const gamepadHintEl = $('remotePcGamepadHint');
    const videoEl = $<HTMLVideoElement>('remotePcVideo');
    const peerEl = $('remotePcPeer');
    const hintEl = $('remotePcHint');

    if (setupEl) setupEl.hidden = !!current;
    if (sessionEl) sessionEl.hidden = !current;
    if (acceptEl) acceptEl.hidden = current?.role !== 'invited';
    if (startEl) {
      startEl.hidden = !!current;
      startEl.disabled =
        !voice ||
        !supported ||
        !capability.host ||
        mediaBlocked ||
        !roster.some(
          (p) => p.id !== runtime.TronoNetwork?.clientId && p.accountId && !p.mediaBlocked,
        );
    }
    if (endEl) endEl.hidden = !current;
    if (hostNoticeEl) hostNoticeEl.hidden = !!capability.host;
    if (voiceNoticeEl) voiceNoticeEl.hidden = voice;
    if (supportEl) supportEl.hidden = supported;

    if (targetEl) {
      const selected = targetEl.value;
      targetEl.replaceChildren();
      for (const p of roster) {
        if (p.id !== runtime.TronoNetwork?.clientId && p.accountId && !p.mediaBlocked) {
          targetEl.append(new Option(p.name, p.id));
        }
      }
      if (!targetEl.options.length) {
        targetEl.append(new Option('Outra pessoa precisa entrar na voz', ''));
      }
      if ([...targetEl.options].some((o) => o.value === selected)) {
        targetEl.value = selected;
      }
    }

    const viewer = current?.role === 'viewer';
    const host = current?.role === 'host';
    if (requestControlEl) {
      requestControlEl.hidden = !viewer;
      requestControlEl.disabled = !!current?.controlling || current?.control?.readyState !== 'open';
    }
    if (revokeEl) revokeEl.hidden = !host || !current?.token;
    if (fullscreenEl) fullscreenEl.hidden = !viewer;
    if (inputLabelEl) inputLabelEl.hidden = !viewer;
    if (inputModeEl) inputModeEl.disabled = !!current?.controlling;
    if (driverNoticeEl) driverNoticeEl.hidden = !capability.host || !!capability.gamepad;
    if (gamepadHintEl && inputModeEl) {
      gamepadHintEl.hidden = !viewer || inputModeEl.value === 'desktop';
      gamepadHintEl.textContent =
        inputModeEl.value === 'keyboard-gamepad'
          ? 'Teclado → controle Xbox: WASD move; J/Espaço=A, K=B, U/X=X, I=Y; Q/E=LB/RB, 1/2=LT/RT, Enter=Start. Mouse não cria outro jogador.'
          : 'Conecte um gamepad, pressione um botão para detectá-lo e clique no vídeo. Use Start para entrar como outro jogador. O anfitrião precisa do driver opcional ViGEmBus.';
    }
    if (videoEl) videoEl.hidden = current?.role === 'invited';
    if (peerEl) {
      peerEl.textContent = current
        ? current.role === 'invited'
          ? current.peerName + ' convidou você'
          : host
            ? 'Compartilhando com ' + current.peerName
            : 'PC de ' + current.peerName
        : '';
    }
    if (hintEl) {
      hintEl.textContent = host
        ? 'Você continua na chamada. Ctrl + Alt + Shift + F12 encerra o compartilhamento.'
        : viewer
          ? current?.controlling
            ? current.inputMode === 'gamepad'
              ? 'Controle Xbox separado autorizado. Clique no vídeo e pressione Start no gamepad. Esc pausa os comandos.'
              : 'Controle autorizado. Clique no vídeo para usar mouse e teclado. Esc libera o teclado; a chamada continua.'
            : 'Você está assistindo. Peça autorização para controlar o PC.'
          : 'Aceite para assistir. O controle depende de autorização separada.';
    }
    if (current?.message) status(current.message);
  }

  function open() {
    dialog ??= $<HTMLDialogElement>('remotePcDialog');
    if (dialog && !dialog.open) dialog.showModal();
    render();
  }

  function close() {
    if (current?.role === 'viewer' || current?.role === 'invited') void stop();
    dialog?.close();
  }

  async function stop({ tell = true } = {}) {
    const s = current;
    if (!s) return;
    current = null;
    s.closed = true;
    remoteGeneration++;
    if (s.timer) clearInterval(s.timer);
    if (s.gamepadTimer) clearInterval(s.gamepadTimer);
    if (s.statsTimer) clearInterval(s.statsTimer);
    gameKeys.clear();
    if (s.connectTimer) clearTimeout(s.connectTimer);
    if (s.controlTimer) clearTimeout(s.controlTimer);
    if (tell && s.id) void request('end', { sessionId: s.id }, 4000).catch(() => {});
    try {
      s.control?.close();
      s.pointer?.close();
      s.gamepadChannel?.close();
      s.pc?.close();
    } catch {}
    s.stream?.getTracks().forEach((t) => t.stop());
    s.remoteStream?.getTracks().forEach((t) => t.stop());
    const videoEl = $<HTMLVideoElement>('remotePcVideo');
    if (videoEl) {
      if (doc.fullscreenElement === videoEl) void doc.exitFullscreen().catch(() => {});
      videoEl.srcObject = null;
    }
    if (s.role === 'host') await runtime.TronoDesktop?.stopRemote?.().catch(() => {});
    render();
    status('Compartilhamento encerrado. Sua chamada continua conectada.');
  }

  function heartbeat(s: RemoteSession) {
    s.timer = setInterval(() => {
      if (!active(s)) return;
      if (!runtime.TronoSocial?.voiceJoined || !runtime.TronoNetwork?.connected) {
        void stop();
        return;
      }
      if (s.id && Date.now() - (s.lastServerPulse || 0) > 3500) {
        s.lastServerPulse = Date.now();
        void request('heartbeat', { sessionId: s.id }, 5000).catch(() => {
          if (active(s)) void stop();
        });
      }
      if (s.role === 'viewer') send(s, 'pulse');
      if (s.role === 'host' && s.token && Date.now() - (s.lastInput || 0) > 3500) {
        void revoke(s);
      }
    }, 1000);
  }

  async function start() {
    if (current || runtime.TronoSocial?.mediaBlocked) return;
    const targetId = $<HTMLSelectElement>('remotePcTarget')?.value;
    const peer = roster.find((p) => p.id === targetId);
    if (!peer) return;
    const profileValue = $<HTMLSelectElement>('remotePcProfile')?.value || 'fast';
    const s: RemoteSession = {
      role: 'host',
      peerName: peer.name,
      id: null,
      closed: false,
      profile: profileValue,
      adaptation: { level: 0, healthy: 0, bad: 0 },
      message: 'Escolha o monitor para compartilhar…',
    };
    current = s;
    render();
    const generation = ++remoteGeneration;
    try {
      const permit = await runtime.TronoDesktop!.prepareRemoteCapture!(peer.name);
      if (!active(s)) return;
      if (!permit?.allowed) {
        await stop();
        return;
      }
      const audio = !!$<HTMLInputElement>('remotePcAudio')?.checked;
      const profile =
        RemotePerformance.profiles[s.profile as keyof typeof RemotePerformance.profiles] ||
        RemotePerformance.profiles.fast;
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: profile.width },
          height: { ideal: profile.height },
          frameRate: { ideal: 60, max: 60 },
        },
        audio: audio
          ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          : false,
        systemAudio: 'exclude',
        selfBrowserSurface: 'exclude',
      } as DisplayMediaStreamOptions);
      if (!active(s) || generation !== remoteGeneration) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      s.stream = stream;
      for (const t of stream.getVideoTracks()) {
        t.contentHint = 'motion';
        t.addEventListener(
          'ended',
          () => {
            if (active(s)) void stop();
          },
          { once: true },
        );
      }
      const videoEl = $<HTMLVideoElement>('remotePcVideo');
      if (videoEl) {
        videoEl.muted = true;
        videoEl.srcObject = stream;
      }
      const data = await request('invite', { targetId: peer.id });
      s.id = String(data.sessionId || '');
      if (!active(s)) {
        void request('end', { sessionId: s.id }).catch(() => {});
        return;
      }
      heartbeat(s);
      notify(s, 'Aguardando ' + peer.name + ' aceitar o convite…');
    } catch (err) {
      if (active(s)) {
        await stop();
        const error = err as Error;
        status(error?.name === 'NotAllowedError' ? 'Captura cancelada.' : error?.message || '');
      }
    }
  }

  async function connect(s: RemoteSession) {
    if (!active(s) || s.pc) return;
    notify(s, 'Conectando PC…');
    const config = await request('ice', { sessionId: s.id });
    if (!active(s)) return;
    const pc = new RTCPeerConnection({
      iceServers: (config.iceServers as RTCIceServer[]) || [],
      bundlePolicy: 'max-bundle',
    });
    s.pc = pc;
    s.candidates = s.candidates || [];
    pc.onicecandidate = (e) => {
      if (active(s)) {
        void request('signal', {
          sessionId: s.id,
          signal: { type: 'candidate', candidate: e.candidate?.toJSON() || null },
        }).catch(() => {
          if (active(s)) void stop();
        });
      }
    };
    pc.onconnectionstatechange = () => {
      if (!active(s)) return;
      if (pc.connectionState === 'connected') {
        if (s.connectTimer) clearTimeout(s.connectTimer);
        startMetrics(s);
        notify(s, 'PC conectado. Sua chamada permanece ativa.');
        render();
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        void stop();
      }
    };
    pc.ontrack = (e) => {
      if (!active(s)) return;
      try {
        const receiver = e.receiver as RTCRtpReceiver & {
          jitterBufferTarget?: number;
          playoutDelayHint?: number;
        };
        if ('jitterBufferTarget' in receiver) receiver.jitterBufferTarget = 0;
        if ('playoutDelayHint' in receiver) receiver.playoutDelayHint = 0;
      } catch {}
      s.remoteStream = s.remoteStream || new MediaStream();
      if (!s.remoteStream.getTracks().some((t) => t.id === e.track.id)) {
        s.remoteStream.addTrack(e.track);
      }
      const video = $<HTMLVideoElement>('remotePcVideo');
      if (video) {
        video.muted = false;
        video.srcObject = s.remoteStream;
        void video.play().catch(() => notify(s, 'Clique no vídeo para liberar o áudio.'));
      }
    };
    pc.ondatachannel = (e) => bindChannel(s, e.channel);
    s.connectTimer = setTimeout(() => {
      if (active(s)) {
        void stop();
        status('Não foi possível conectar os PCs. A rede pode precisar de TURN disponível.');
      }
    }, 25000);
    if (s.role === 'host' && s.stream) {
      bindChannel(s, pc.createDataChannel('remote-control', { ordered: true }));
      bindChannel(s, pc.createDataChannel('remote-pointer', { ordered: false, maxRetransmits: 0 }));
      bindChannel(s, pc.createDataChannel('remote-gamepad', { ordered: false, maxRetransmits: 0 }));
      for (const t of s.stream.getTracks()) {
        const sender = pc.addTrack(t, s.stream);
        if (t.kind === 'video') {
          const transceiver = pc.getTransceivers().find((tr) => tr.sender === sender);
          const codecs = RTCRtpSender.getCapabilities?.('video')?.codecs || [];
          const h264 = codecs.filter((c) => c.mimeType.toLowerCase() === 'video/h264');
          if (h264.length) {
            transceiver?.setCodecPreferences?.([
              ...h264,
              ...codecs.filter((c) => !h264.includes(c)),
            ]);
          }
        }
      }
      await pc.setLocalDescription(await pc.createOffer());
      if (!active(s)) return;
      await applyEncoding(s);
      await request('signal', {
        sessionId: s.id,
        signal: { type: 'offer', sdp: pc.localDescription?.sdp },
      });
    }
    const queued = s.signals || [];
    s.signals = [];
    for (const p of queued) await signal(s, p);
  }

  async function signal(s: RemoteSession, p: RemoteSignalPayload) {
    if (!active(s)) return;
    if (!s.pc) {
      (s.signals || (s.signals = [])).push(p);
      return;
    }
    const pc = s.pc;
    if (p.type === 'candidate') {
      if (pc.remoteDescription) {
        if (p.candidate) await pc.addIceCandidate(p.candidate);
      } else {
        s.candidates = s.candidates || [];
        s.candidates.push(p.candidate ?? null);
      }
      return;
    }
    if (p.type === 'offer' && s.role === 'viewer') {
      await pc.setRemoteDescription({ type: 'offer', sdp: p.sdp });
      if (!active(s)) return;
      await pc.setLocalDescription(await pc.createAnswer());
      await request('signal', {
        sessionId: s.id,
        signal: { type: 'answer', sdp: pc.localDescription?.sdp },
      });
    } else if (p.type === 'answer' && s.role === 'host') {
      await pc.setRemoteDescription({ type: 'answer', sdp: p.sdp });
    } else {
      throw Error('Sinal de PC inesperado.');
    }
    for (const c of (s.candidates || []).splice(0)) {
      if (c) await pc.addIceCandidate(c);
    }
  }

  function bindChannel(s: RemoteSession, channel: RTCDataChannel) {
    if (!['remote-control', 'remote-pointer', 'remote-gamepad'].includes(channel.label)) {
      channel.close();
      return;
    }
    if (channel.label === 'remote-control') {
      if (s.control) {
        channel.close();
        return;
      }
      s.control = channel;
    } else if (channel.label === 'remote-gamepad') {
      if (s.gamepadChannel) {
        channel.close();
        return;
      }
      s.gamepadChannel = channel;
    } else {
      if (s.pointer) {
        channel.close();
        return;
      }
      s.pointer = channel;
    }
    channel.onopen = () => {
      if (active(s)) {
        render();
        if (s.role === 'viewer') send(s, 'pulse');
      }
    };
    channel.onclose = () => {
      if (active(s)) void stop();
    };
    channel.onmessage = async (e) => {
      if (!active(s) || typeof e.data !== 'string' || e.data.length > 1024) return;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(e.data) as Record<string, unknown>;
      } catch {
        return;
      }
      if (s.role === 'viewer') {
        if (channel === s.control && event.type === 'control') {
          s.controlling = event.allowed === true;
          s.inputMode = (event.mode as string) || 'desktop';
          s.grantId = (event.grantId as string) || null;
          s.gamepadIndex = (event.gamepadIndex as number) ?? null;
          gameKeys.clear();
          if (s.controlling && s.inputMode === 'gamepad') startGamepad(s);
          else if (s.gamepadTimer) clearInterval(s.gamepadTimer);
          render();
          notify(
            s,
            (event.error as string) ||
              (event.wait
                ? 'Aguarde alguns segundos antes de pedir controle novamente.'
                : s.controlling
                  ? s.inputMode === 'gamepad'
                    ? 'Controle Xbox separado conectado' +
                      (Number.isInteger(event.gamepadIndex) && (event.gamepadIndex as number) < 4
                        ? ' · posição ' + ((event.gamepadIndex as number) + 1)
                        : '') +
                      '. Clique no vídeo e pressione Start para entrar no jogo.'
                    : 'Controle autorizado. Clique na imagem para controlar.'
                  : 'Somente visualização.'),
          );
        }
        return;
      }
      if (event.type === 'request-control' && channel === s.control && !s.asking && !s.token) {
        if (Date.now() - (s.lastAsk || 0) < 10000) {
          send(s, 'control', { allowed: false, wait: true });
          return;
        }
        s.lastAsk = Date.now();
        s.asking = true;
        try {
          const mode = event.mode === 'gamepad' ? 'gamepad' : 'desktop';
          const result = await runtime.TronoDesktop!.allowRemoteControl!(mode);
          if (!active(s)) {
            await runtime.TronoDesktop?.revokeRemoteControl?.();
            return;
          }
          s.token = result?.allowed ? (result.token ?? null) : null;
          s.inputMode = mode;
          s.grantId = result?.allowed ? crypto.randomUUID() : null;
          s.lastGamepadSequence = 0;
          s.lastInput = Date.now();
          send(s, 'control', {
            allowed: !!s.token,
            mode,
            grantId: s.grantId,
            gamepadIndex: result?.gamepadIndex,
          });
          render();
        } catch (err) {
          send(s, 'control', { allowed: false, error: (err as Error).message });
        } finally {
          s.asking = false;
        }
        return;
      }
      if (event.type !== 'request-control' && s.token && event.grantId !== s.grantId) return;
      if (event.type === 'pulse' && channel === s.control) {
        s.lastInput = Date.now();
        if (s.token) runtime.TronoDesktop?.remoteInput?.(s.token, { type: 'pulse' });
        return;
      }
      if (event.type === 'gamepad') {
        if (
          channel !== s.gamepadChannel ||
          !s.token ||
          s.inputMode !== 'gamepad' ||
          !Number.isSafeInteger(event.seq) ||
          (event.seq as number) <= (s.lastGamepadSequence || 0)
        ) {
          return;
        }
        s.lastGamepadSequence = event.seq as number;
        runtime.TronoDesktop?.remoteInput?.(s.token, event);
        return;
      }
      if (s.inputMode === 'gamepad' && event.type !== 'release') return;
      if (event.type === 'move') {
        if (
          !Number.isSafeInteger(event.seq) ||
          (event.seq as number) <= (s.lastPointerSequence || 0)
        ) {
          return;
        }
        s.lastPointerSequence = event.seq as number;
      }
      if (
        s.token &&
        event.type === 'button' &&
        event.down &&
        Number.isFinite(event.x) &&
        Number.isFinite(event.y)
      ) {
        if (Number.isSafeInteger(event.seq)) {
          s.lastPointerSequence = Math.max(s.lastPointerSequence || 0, event.seq as number);
        }
        runtime.TronoDesktop?.remoteInput?.(s.token, {
          type: 'move',
          x: event.x,
          y: event.y,
        });
      }
      if (
        s.token &&
        ((['key', 'button', 'wheel', 'release'].includes(String(event.type)) &&
          channel === s.control) ||
          (event.type === 'move' && channel === s.pointer))
      ) {
        runtime.TronoDesktop?.remoteInput?.(s.token, event);
      }
    };
  }

  async function revoke(s: RemoteSession) {
    if (!active(s)) return;
    s.token = null;
    send(s, 'control', { allowed: false });
    await runtime.TronoDesktop?.revokeRemoteControl?.();
    render();
  }

  function pointer(e: PointerEvent): { type: 'move'; x: number; y: number; seq?: number } | null {
    const v = $<HTMLVideoElement>('remotePcVideo');
    if (!v) return null;
    const r = v.getBoundingClientRect();
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (!w || !h) return null;
    const scale = Math.min(r.width / w, r.height / h);
    const width = w * scale;
    const height = h * scale;
    const x = (e.clientX - r.x - (r.width - width) / 2) / width;
    const y = (e.clientY - r.y - (r.height - height) / 2) / height;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { type: 'move', x, y } : null;
  }

  function inputReady(): boolean {
    return (
      current?.role === 'viewer' && !!current.controlling && current.control?.readyState === 'open'
    );
  }

  async function applyEncoding(s: RemoteSession) {
    if (!s.pc) return;
    for (const sender of s.pc.getSenders()) {
      try {
        const p = sender.getParameters();
        if (!p.encodings?.length) continue;
        if (sender.track?.kind === 'video') {
          Object.assign(
            p.encodings[0],
            RemotePerformance.encoding(
              s.profile || 'fast',
              s.adaptation?.level,
              sender.track.getSettings(),
            ),
          );
          (p as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference =
            'maintain-framerate';
        } else {
          p.encodings[0].maxBitrate = 128000;
        }
        await sender.setParameters(p);
      } catch (err) {
        console.warn('[PC Beta] encoder', (err as Error)?.name);
      }
    }
  }

  function startMetrics(s: RemoteSession) {
    if (s.statsTimer || !s.pc) return;
    const poll = async () => {
      if (!active(s) || s.statsBusy || !s.pc) return;
      s.statsBusy = true;
      try {
        const rawReports = [...(await s.pc.getStats()).values()] as RemoteRtcStatReport[];
        const stats = RemotePerformance.sample(rawReports, s.previousStats);
        if (!stats || !active(s)) return;
        s.previousStats = stats.raw;
        s.metrics = stats;
        const ms = (v: number | null | undefined) => (v == null ? '—' : v + ' ms');
        const metricsEl = $('remotePcMetrics');
        if (metricsEl) {
          metricsEl.textContent =
            (stats.relay ? 'Via retransmissor TURN' : 'Conexão direta') +
            ' · RTT ' +
            ms(stats.rttMs) +
            ' · ' +
            (stats.width ? stats.width + '×' + stats.height + ' · ' : '') +
            (stats.fps ?? '—') +
            ' FPS · ' +
            (s.role === 'host' ? 'Codificação ' : 'Decodificação ') +
            ms(stats.processingMs) +
            (s.role === 'viewer' ? ' · Buffer ' + ms(stats.bufferMs) : '');
        }
        if (s.role === 'host') {
          const prev = s.adaptation?.level || 0;
          s.adaptation = RemotePerformance.adaptation(
            s.profile || 'fast',
            stats,
            prev,
            s.adaptation?.healthy,
            s.adaptation?.bad,
          );
          if (prev !== s.adaptation.level) await applyEncoding(s);
        }
      } catch {
      } finally {
        s.statsBusy = false;
      }
    };
    s.statsTimer = setInterval(() => void poll(), 1500);
    void poll();
  }

  function startGamepad(s: RemoteSession) {
    if (s.gamepadTimer) clearInterval(s.gamepadTimer);
    s.gamepadTimer = setInterval(() => {
      if (!active(s) || !inputReady() || s.inputMode !== 'gamepad') return;
      const videoEl = $('remotePcVideo');
      const focused = doc.hasFocus() && !doc.hidden && doc.activeElement === videoEl;
      let state = RemoteGamepad.neutral();
      if (focused) {
        const modeValue = $<HTMLSelectElement>('remotePcInputMode')?.value;
        if (modeValue === 'keyboard-gamepad') {
          state = RemoteGamepad.keyboard(gameKeys);
        } else {
          const pads = [...(navigator.getGamepads?.() || [])] as Array<
            (Gamepad & StandardGamepadLike) | null
          >;
          const selected =
            pads.find((p): p is Gamepad & StandardGamepadLike =>
              Boolean(
                p && p.index === s.localGamepadIndex && p.connected && p.mapping === 'standard',
              ),
            ) ||
            pads.find((p): p is Gamepad & StandardGamepadLike =>
              Boolean(p && p.connected && p.mapping === 'standard'),
            );
          if (selected) s.localGamepadIndex = selected.index;
          state = RemoteGamepad.snapshot(selected);
        }
      }
      if (s.gamepadChannel?.readyState === 'open' && s.gamepadChannel.bufferedAmount < 1024) {
        s.gamepadSequence = (s.gamepadSequence || 0) + 1;
        s.gamepadChannel.send(
          JSON.stringify({
            type: 'gamepad',
            grantId: s.grantId,
            state,
            seq: s.gamepadSequence,
          }),
        );
      }
    }, 8);
  }

  const release = () => {
    gameKeys.clear();
    if (inputReady() && current) send(current, 'release');
  };

  const onVisibilityChange = () => {
    if (doc.hidden) release();
  };

  function bindInput() {
    const v = $<HTMLVideoElement>('remotePcVideo');
    if (!v) return;
    let lastMove = 0;
    v.onpointermove = (e) => {
      const s = current;
      if (!s || !inputReady() || s.inputMode === 'gamepad' || performance.now() - lastMove < 8)
        return;
      const p = pointer(e);
      if (p) {
        s.pointerSequence = (s.pointerSequence || 0) + 1;
        p.seq = s.pointerSequence;
      }
      if (p && s.pointer?.readyState === 'open' && s.pointer.bufferedAmount < 4096) {
        s.pointer.send(JSON.stringify({ ...p, grantId: s.grantId }));
        lastMove = performance.now();
      }
    };
    v.onpointerdown = (e) => {
      void v.play().catch(() => {});
      const s = current;
      if (!s || !inputReady() || e.button > 2) return;
      if (s.inputMode === 'gamepad') {
        v.focus();
        return;
      }
      const p = pointer(e);
      if (!p) return;
      s.pointerSequence = (s.pointerSequence || 0) + 1;
      p.seq = s.pointerSequence;
      v.focus();
      s.pointer?.send(JSON.stringify({ ...p, grantId: s.grantId }));
      send(s, 'button', { button: e.button, down: true, x: p.x, y: p.y, seq: p.seq });
      try {
        v.setPointerCapture(e.pointerId);
      } catch {}
      e.preventDefault();
    };
    v.onpointerup = (e) => {
      if (inputReady() && current && current.inputMode !== 'gamepad' && e.button <= 2) {
        send(current, 'button', { button: e.button, down: false });
        e.preventDefault();
      }
    };
    v.onpointercancel = () => {
      if (inputReady() && current) send(current, 'release');
    };
    v.oncontextmenu = (e) => {
      if (inputReady()) e.preventDefault();
    };
    v.onwheel = (e) => {
      if (inputReady() && current && current.inputMode !== 'gamepad') {
        send(current, 'wheel', { delta: -Math.sign(e.deltaY) * 120 });
        e.preventDefault();
      }
    };
    v.onkeydown = (e) => {
      if (!inputReady() || !current) return;
      if (e.code === 'Escape') {
        gameKeys.clear();
        send(current, 'release');
        v.blur();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (current.inputMode === 'gamepad') {
        if (RemoteGamepad.keyboardKeys.has(e.code)) {
          gameKeys.add(e.code);
          e.preventDefault();
        }
        return;
      }
      if (!e.repeat) send(current, 'key', { code: e.code, down: true });
      e.preventDefault();
    };
    v.onkeyup = (e) => {
      if (inputReady() && current) {
        if (current.inputMode === 'gamepad') {
          gameKeys.delete(e.code);
          e.preventDefault();
          return;
        }
        send(current, 'key', { code: e.code, down: false });
        e.preventDefault();
      }
    };
    v.onblur = release;
  }

  function bindDom() {
    if (disposed) return;
    button = $<HTMLButtonElement>('remotePcBtn');
    dialog = $<HTMLDialogElement>('remotePcDialog');
    if (!button || !dialog) return;
    button.onclick = open;
    const closeBtn = $<HTMLButtonElement>('remotePcClose');
    if (closeBtn) closeBtn.onclick = close;
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    const startBtn = $<HTMLButtonElement>('remotePcStart');
    if (startBtn) startBtn.onclick = () => void start();
    const endBtn = $<HTMLButtonElement>('remotePcEnd');
    if (endBtn) endBtn.onclick = () => void stop();
    const acceptBtn = $<HTMLButtonElement>('remotePcAccept');
    if (acceptBtn) {
      acceptBtn.onclick = async () => {
        const s = current;
        if (!s || s.role !== 'invited') return;
        try {
          await request('accept', { sessionId: s.id });
        } catch (err) {
          await stop();
          status((err as Error).message);
        }
      };
    }
    const reqBtn = $<HTMLButtonElement>('remotePcRequestControl');
    if (reqBtn) {
      reqBtn.onclick = () => {
        const modeSelect = $<HTMLSelectElement>('remotePcInputMode');
        if (
          current &&
          send(current, 'request-control', {
            mode: modeSelect?.value === 'desktop' ? 'desktop' : 'gamepad',
          })
        ) {
          reqBtn.disabled = true;
          notify(current, 'Aguardando autorização do dono do PC…');
        }
      };
    }
    const revokeBtn = $<HTMLButtonElement>('remotePcRevoke');
    if (revokeBtn) {
      revokeBtn.onclick = () => {
        if (current) void revoke(current);
      };
    }
    const fsBtn = $<HTMLButtonElement>('remotePcFullscreen');
    if (fsBtn) {
      fsBtn.onclick = () =>
        void $('remotePcVideo')
          ?.requestFullscreen()
          .catch(() => {});
    }
    bindInput();
    const inputModeSelect = $<HTMLSelectElement>('remotePcInputMode');
    if (inputModeSelect) inputModeSelect.onchange = render;
    const driverBtn = $<HTMLButtonElement>('remotePcDriver');
    if (driverBtn) driverBtn.onclick = () => void runtime.TronoDesktop?.openRemoteDriver?.();
    const driverCheckBtn = $<HTMLButtonElement>('remotePcDriverCheck');
    if (driverCheckBtn) {
      driverCheckBtn.onclick = async () => {
        if (runtime.TronoDesktop?.remoteCapability) {
          capability = await runtime.TronoDesktop.remoteCapability();
        }
        render();
        status(
          capability.gamepad
            ? 'Driver de controle pronto.'
            : 'Driver ainda indisponível. Conclua a instalação oficial e verifique novamente.',
        );
      };
    }
    const audioInput = $<HTMLInputElement>('remotePcAudio');
    if (audioInput) audioInput.disabled = !capability.audio;
    render();
    if (runtime.TronoDesktop?.remoteCapability) {
      void runtime.TronoDesktop.remoteCapability()
        .then((cap) => {
          if (disposed) return;
          capability = cap || { host: false };
          const audioEl = $<HTMLInputElement>('remotePcAudio');
          if (audioEl) audioEl.disabled = !capability.audio;
          render();
        })
        .catch(() => {});
    }
  }

  const offMessage = runtime.TronoNetwork?.onMessage((m) => {
    if (m.type === 'welcome') {
      const features = m.features as Record<string, unknown> | undefined;
      supported = !!features?.remotePc && features?.remotePcProtocol === 2;
      render();
    }
    if (m.type === 'remote-response') {
      const p = pending.get(String(m.requestId || ''));
      if (p) {
        pending.delete(String(m.requestId || ''));
        clearTimeout(p.timer);
        if (m.ok) p.resolve((m.data as Record<string, unknown>) || {});
        else {
          const error = m.error as { message?: string } | undefined;
          p.reject(Error(error?.message || 'Não foi possível compartilhar o PC.'));
        }
      }
      return;
    }
    if (m.type === 'voice-roster') {
      const players = Array.isArray(m.players) ? (m.players as RemoteRosterPeer[]) : [];
      roster = players.filter((p) => p.joined !== false);
      render();
    }
    if (m.type === 'connection' && !m.connected) {
      supported = false;
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(Error('Conexão encerrada.'));
      }
      pending.clear();
      void stop({ tell: false });
    }
    if (m.type === 'remote-invite') {
      if (current) {
        void request('end', { sessionId: m.sessionId }).catch(() => {});
        return;
      }
      current = {
        role: 'invited',
        id: String(m.sessionId || ''),
        peerName: String(m.hostName || ''),
        closed: false,
        message: 'Convite para assistir ao PC. Aceite somente se esperava esse convite.',
      };
      heartbeat(current);
      open();
    }
    if (m.type === 'remote-ready') {
      const s = current;
      if (!s || s.id !== m.sessionId) return;
      s.role = m.role === 'host' ? 'host' : 'viewer';
      s.peerName = String(m.peerName || '');
      render();
      s.signalChain = Promise.resolve();
      void connect(s).catch((err) => {
        if (active(s)) {
          void stop();
          status((err as Error).message);
        }
      });
    }
    if (m.type === 'remote-signal') {
      const s = current;
      if (!s || s.id !== m.sessionId) return;
      s.signalChain = (s.signalChain || Promise.resolve())
        .then(() => signal(s, (m.signal as RemoteSignalPayload) || {}))
        .catch((err) => {
          if (active(s)) {
            void stop();
            status((err as Error).message);
          }
        });
    }
    if (m.type === 'remote-ended' && current?.id === m.sessionId) {
      void stop({ tell: false });
    }
  });

  const offRemote = runtime.TronoDesktop?.onRemote?.((event) => {
    if (current?.role !== 'host') return;
    if (event.type === 'ended') void stop();
    else if (event.type === 'stopped') {
      current.token = null;
      send(current, 'control', { allowed: false });
      render();
    }
  });

  const onCallChange = () => {
    render();
    if (current && !runtime.TronoSocial?.voiceJoined) void stop();
  };
  const onAuthChange = () => {
    if (!runtime.TronoAuth?.user) void stop();
  };
  const onPageHide = () => {
    if (current) void stop();
  };

  target.addEventListener('trono-call-change', onCallChange);
  target.addEventListener('trono-auth-change', onAuthChange);
  target.addEventListener('pagehide', onPageHide);
  target.addEventListener('blur', release);
  doc.addEventListener('visibilitychange', onVisibilityChange);

  bindDom();
  target.addEventListener('trono:ready', bindDom, { once: true });

  const facade = {
    open,
    stop,
    get active() {
      return !!current;
    },
    get state() {
      return current
        ? {
            role: current.role,
            sessionId: current.id,
            controlling: !!current.controlling,
            inputMode: current.inputMode,
            profile: current.profile,
            metrics: current.metrics,
            connected: current.pc?.connectionState,
          }
        : null;
    },
  };
  runtime.TronoRemotePc = facade;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    target.removeEventListener('trono:ready', bindDom);
    target.removeEventListener('trono-call-change', onCallChange);
    target.removeEventListener('trono-auth-change', onAuthChange);
    target.removeEventListener('pagehide', onPageHide);
    target.removeEventListener('blur', release);
    doc.removeEventListener('visibilitychange', onVisibilityChange);
    if (typeof offMessage === 'function') offMessage();
    if (typeof offRemote === 'function') offRemote();
    for (const p of pending.values()) clearTimeout(p.timer);
    pending.clear();
    void stop({ tell: false });
    if (runtime.TronoRemotePc === facade) delete runtime.TronoRemotePc;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
