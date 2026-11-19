/** Only the envelope is shared; each domain must validate its own payload. */
export interface SocketMessage {
  type: string;
  requestId?: string;
  [key: string]: unknown;
}

export type SocketResponseType =
  'sfu-response' | 'auth-result' | 'guest-result' | 'name-check-result';

export interface SocketRequestOptions {
  responseType: SocketResponseType;
  timeoutMs: number;
  timeoutMessage: string;
  timeoutCode?: string;
  offlineMessage?: string;
}

export interface SocketTransport {
  readonly connected: boolean;
  connect(): Promise<boolean>;
  disconnect(): void;
  send(type: string, payload?: Record<string, unknown>): boolean;
  request(
    type: string,
    payload: Record<string, unknown>,
    options: SocketRequestOptions,
  ): Promise<SocketMessage>;
  /** Account and guest identity changes share a queue, cancelled on disconnect. */
  serializeIdentity<T>(operation: (connection: SocketIdentityConnection) => Promise<T>): Promise<T>;
  onMessage(listener: (message: SocketMessage) => void): () => void;
}

/** Bound to the identity operation's session; stale operations cannot use a new socket. */
export type SocketIdentityConnection = Pick<SocketTransport, 'connected' | 'connect' | 'request'>;
