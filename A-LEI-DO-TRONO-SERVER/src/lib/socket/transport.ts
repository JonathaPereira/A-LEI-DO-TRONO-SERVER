import type {
  SocketMessage,
  SocketRequestOptions,
  SocketTransport,
  SocketIdentityConnection,
} from '../../types/socket';

type Connection = Pick<
  WebSocket,
  'readyState' | 'send' | 'close' | 'onopen' | 'onmessage' | 'onclose' | 'onerror'
>;

interface TransportOptions {
  url: string;
  createSocket?: (url: string) => Connection;
  connectTimeoutMs?: number;
  warn?: (message: string, error?: unknown) => void;
}

interface PendingRequest {
  responseType: string;
  timer: ReturnType<typeof setTimeout>;
  resolve(message: SocketMessage): void;
  reject(error: Error): void;
}

interface ActiveConnection {
  socket: Connection;
  opened: Promise<boolean>;
  finish(connected: boolean): void;
  timer: ReturnType<typeof setTimeout>;
}

function networkError(message: string, code = 'NETWORK_CLOSED'): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseMessage(data: unknown): SocketMessage | null {
  if (typeof data !== 'string') return null;
  const value: unknown = JSON.parse(data);
  if (!isRecord(value) || typeof value.type !== 'string' || !value.type) return null;
  if (value.requestId !== undefined && typeof value.requestId !== 'string') return null;
  return value as SocketMessage;
}

/** Owns one connection, all correlated requests, and the identity queue. No DOM or media. */
export function createSocketTransport({
  url,
  createSocket = (address) => new WebSocket(address),
  connectTimeoutMs = 15000,
  warn = (message, error) => console.warn('[TronoNetwork]', message, error ?? ''),
}: TransportOptions): SocketTransport {
  let active: ActiveConnection | null = null;
  let connected = false;
  let generation = 0;
  let sequence = 0;
  let identityQueue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<(message: SocketMessage) => void>();
  const pending = new Map<string, PendingRequest>();

  function emit(message: SocketMessage): void {
    for (const listener of listeners) {
      try {
        listener(message);
      } catch (error) {
        warn('Falha em um listener.', error);
      }
    }
  }

  function closeConnection(connection: ActiveConnection | null, code?: number): void {
    if (connection !== active) return;
    active = null;
    connected = false;
    generation++;
    identityQueue = Promise.resolve();
    if (connection) {
      clearTimeout(connection.timer);
      connection.socket.onopen = null;
      connection.socket.onmessage = null;
      connection.socket.onclose = null;
      connection.socket.onerror = null;
      connection.finish(false);
    }
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(networkError('Conexão encerrada.'));
    }
    pending.clear();
    emit({ type: 'connection', connected: false, ...(code === undefined ? {} : { code }) });
  }

  function closeSocket(socket: Connection): void {
    try {
      socket.close(1000, 'Conexão encerrada');
    } catch (error) {
      warn('Não foi possível fechar o socket.', error);
    }
  }

  function connect(): Promise<boolean> {
    if (active) return active.opened;
    let socket: Connection;
    try {
      socket = createSocket(url);
    } catch (error) {
      warn('Não foi possível conectar.', error);
      return Promise.resolve(false);
    }
    let finish!: (value: boolean) => void;
    const opened = new Promise<boolean>((resolve) => {
      finish = resolve;
    });
    const connection: ActiveConnection = {
      socket,
      opened,
      finish,
      timer: setTimeout(() => {
        if (active !== connection) return;
        closeConnection(connection);
        closeSocket(socket);
      }, connectTimeoutMs),
    };
    active = connection;
    socket.onopen = () => {
      if (active !== connection) return;
      clearTimeout(connection.timer);
      connected = true;
      emit({ type: 'connection', connected: true });
      finish(true);
    };
    socket.onclose = (event) => closeConnection(connection, event.code);
    // Browsers deliver close after error; the opening deadline also covers failures to close.
    socket.onerror = () => {};
    socket.onmessage = (event) => {
      if (active !== connection) return;
      let message: SocketMessage | null;
      try {
        message = parseMessage(event.data);
      } catch {
        warn('Mensagem JSON inválida.');
        return;
      }
      if (!message) {
        warn('Envelope de mensagem inválido.');
        return;
      }
      const requestId = message.requestId;
      const request = requestId ? pending.get(requestId) : undefined;
      if (requestId && request && request.responseType === message.type) {
        pending.delete(requestId);
        clearTimeout(request.timer);
        request.resolve(message);
      }
      emit(message);
    };
    return opened;
  }

  function send(type: string, payload: Record<string, unknown> = {}): boolean {
    if (!connected || active?.socket.readyState !== 1) return false;
    try {
      active.socket.send(JSON.stringify({ ...payload, type }));
      return true;
    } catch (error) {
      warn('Não foi possível enviar a mensagem.', error);
      const connection = active;
      closeConnection(connection);
      closeSocket(connection.socket);
      return false;
    }
  }

  function request(
    type: string,
    payload: Record<string, unknown>,
    options: SocketRequestOptions,
  ): Promise<SocketMessage> {
    if (!connected || active?.socket.readyState !== 1)
      return Promise.reject(
        networkError(options.offlineMessage || 'Servidor offline.', 'NETWORK_OFFLINE'),
      );
    const requestId = `${generation}:${++sequence}`;
    return new Promise((resolve, reject) => {
      const entry: PendingRequest = {
        responseType: options.responseType,
        resolve,
        reject,
        timer: setTimeout(() => {
          pending.delete(requestId);
          reject(networkError(options.timeoutMessage, options.timeoutCode || 'REQUEST_TIMEOUT'));
        }, options.timeoutMs),
      };
      pending.set(requestId, entry);
      if (!send(type, { ...payload, requestId })) {
        clearTimeout(entry.timer);
        pending.delete(requestId);
        reject(networkError(options.offlineMessage || 'Servidor offline.', 'NETWORK_OFFLINE'));
      }
    });
  }

  return {
    get connected() {
      return connected;
    },
    connect,
    send,
    request,
    disconnect() {
      const previous = active;
      closeConnection(previous);
      if (previous) closeSocket(previous.socket);
    },
    serializeIdentity<T>(
      operation: (connection: SocketIdentityConnection) => Promise<T>,
    ): Promise<T> {
      const session = generation;
      const assertCurrent = () => {
        if (session !== generation) throw networkError('Conexão encerrada.');
      };
      const connection: SocketIdentityConnection = {
        get connected() {
          return session === generation && connected;
        },
        async connect() {
          assertCurrent();
          const result = await connect();
          assertCurrent();
          return result;
        },
        async request(type, payload, options) {
          assertCurrent();
          const message = await request(type, payload, options);
          assertCurrent();
          return message;
        },
      };
      const task = identityQueue
        .catch(() => {})
        .then(async () => {
          assertCurrent();
          const result = await operation(connection);
          assertCurrent();
          return result;
        });
      identityQueue = task;
      return task;
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
