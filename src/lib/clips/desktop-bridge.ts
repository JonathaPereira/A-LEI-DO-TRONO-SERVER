import type { ClipShortcut } from '../../types/clips';

export interface ClipDesktopConfiguration {
  readonly shortcut: ClipShortcut;
  readonly active: boolean;
}
export interface ClipDesktopSnapshot {
  readonly code: string;
  readonly connecting: boolean;
  readonly connected: boolean;
  readonly globalActive: boolean;
  readonly message: string;
}
type Connection = Pick<
  WebSocket,
  'readyState' | 'send' | 'close' | 'onopen' | 'onmessage' | 'onerror' | 'onclose'
>;
interface BridgeOptions {
  initialCode: string;
  createSocket(url: string): Connection;
  remember(code: string): void;
  clip(): void;
  setTimer?(callback: () => void, milliseconds: number): ReturnType<typeof setTimeout>;
  clearTimer?(timer: ReturnType<typeof setTimeout>): void;
}
export const validDesktopCode = (code: string) => /^[a-f0-9]{64}$/i.test(code);
function readMessage(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || raw.length > 16384) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
/** One loopback socket. Pairing never starts automatically and remote events never own capture. */
export function createDesktopClipBridge(options: BridgeOptions) {
  let socket: Connection | null = null,
    desired: ClipDesktopConfiguration | null = null,
    last = '',
    disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const events = new Set<string>(),
    listeners = new Set<() => void>(),
    setTimer = options.setTimer ?? setTimeout,
    clearTimer = options.clearTimer ?? clearTimeout;
  let state: ClipDesktopSnapshot = Object.freeze({
    code: options.initialCode,
    connecting: false,
    connected: false,
    globalActive: false,
    message: options.initialCode
      ? 'Código do aplicativo recebido. Clique em Conectar ao Windows e permita o acesso local se solicitado.'
      : 'Abra o componente M&N Clipes para usar o atalho com o jogo em foco.',
  });
  function publish(patch: Partial<ClipDesktopSnapshot>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) listener();
  }
  function cancelTimer() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }
  function release(message: string) {
    const old = socket;
    socket = null;
    last = '';
    cancelTimer();
    if (old) {
      old.onopen = null;
      old.onmessage = null;
      old.onerror = null;
      old.onclose = null;
      try {
        old.close();
      } catch {}
    }
    publish({ connecting: false, connected: false, globalActive: false, message });
  }
  function send(data: object) {
    if (!socket || !state.connected || socket.readyState !== 1) return false;
    try {
      socket.send(JSON.stringify(data));
      return true;
    } catch {
      release('Componente Windows desconectado. Confira se está aberto e conecte novamente.');
      return false;
    }
  }
  function configure(data: ClipDesktopConfiguration) {
    if (disposed) return;
    desired = Object.freeze({ active: data.active, shortcut: Object.freeze({ ...data.shortcut }) });
    const signature = JSON.stringify(desired);
    if (state.connected && signature !== last && send({ type: 'configure', ...desired }))
      last = signature;
  }
  function connect() {
    if (disposed || socket) return;
    const code = state.code.trim();
    if (!validDesktopCode(code)) {
      publish({ message: 'Cole o código de conexão mostrado no aplicativo M&N Clipes.' });
      return;
    }
    try {
      options.remember(code);
    } catch {}
    let ws: Connection;
    try {
      ws = options.createSocket('ws://127.0.0.1:32196/clips');
    } catch {
      publish({ message: 'Não foi possível conectar ao componente Windows.' });
      return;
    }
    socket = ws;
    publish({
      code,
      connecting: true,
      connected: false,
      globalActive: false,
      message:
        'Conectando ao componente neste computador… Permita acesso à rede local se o navegador perguntar.',
    });
    timer = setTimer(() => {
      if (socket === ws && !state.connected)
        release(
          'Sem resposta. Abra o M&N Clipes no Windows e permita acesso à rede local no navegador.',
        );
    }, 30000);
    ws.onopen = () => {
      if (disposed || socket !== ws) return;
      try {
        ws.send(JSON.stringify({ type: 'pair', token: code }));
      } catch {
        release('Não foi possível conectar ao componente Windows.');
      }
    };
    ws.onmessage = (event) => {
      if (disposed || socket !== ws) return;
      const message = readMessage(event.data);
      if (!message) return;
      if (message.type === 'paired' && !state.connected) {
        cancelTimer();
        last = '';
        publish({
          connecting: false,
          connected: true,
          message: 'Windows conectado. O atalho será ativado quando o replay estiver pronto.',
        });
        if (desired) configure(desired);
      } else if (
        message.type === 'registered' &&
        state.connected &&
        typeof message.active === 'boolean'
      ) {
        if (
          message.active &&
          (typeof message.shortcut !== 'string' || message.shortcut.length > 128)
        )
          return;
        publish({
          globalActive: message.active,
          message: message.active
            ? 'Atalho global ativo: ' + message.shortcut + '. Pode continuar com o jogo em foco.'
            : 'Windows conectado · aguardando o replay ficar ativo.',
        });
      } else if (message.type === 'error') {
        publish({
          globalActive: false,
          message:
            typeof message.message === 'string' && message.message.length <= 1000
              ? message.message
              : 'Não foi possível ativar o atalho global.',
        });
      } else if (
        message.type === 'clip' &&
        state.connected &&
        typeof message.id === 'string' &&
        message.id.length > 0 &&
        message.id.length <= 128 &&
        !events.has(message.id)
      ) {
        events.add(message.id);
        if (events.size > 32) events.delete(events.values().next().value!);
        options.clip();
      }
    };
    ws.onerror = () => {
      if (socket === ws)
        release(
          'Não foi possível conectar. Abra o aplicativo Windows, confira o código e permita acesso à rede local.',
        );
    };
    ws.onclose = () => {
      if (socket === ws)
        release('Componente Windows desconectado. Confira se está aberto e conecte novamente.');
    };
  }
  const disconnect = () => {
    if (!disposed)
      release('Windows desconectado. O atalho funciona somente com esta página em foco.');
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setCode(code: string) {
      if (!socket && !disposed) publish({ code: code.slice(0, 512) });
    },
    configure,
    connect,
    disconnect,
    saved(count: number) {
      if (!disposed && Number.isSafeInteger(count) && count >= 0) send({ type: 'saved', count });
    },
    get connected() {
      return state.connected;
    },
    get globalActive() {
      return state.globalActive;
    },
    dispose() {
      if (disposed) return;
      disconnect();
      disposed = true;
      listeners.clear();
      events.clear();
    },
  };
}
export type DesktopClipBridge = ReturnType<typeof createDesktopClipBridge>;
