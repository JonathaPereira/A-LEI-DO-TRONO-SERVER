import crypto from 'node:crypto';
import { object } from './http-api.ts';

export interface RemotePcSocket {
  clientId: string;
  roomId?: string | null;
  readyState?: number;
  account?: {
    id: string;
    nickname: string;
    expiresAt: number;
  } | null;
}

export interface RemotePcPlayer {
  id: string;
  ws: RemotePcSocket;
  voiceJoined?: boolean;
  mediaBlocked?: boolean;
}

export interface RemotePcRoom {
  id: string;
  players: Map<string, RemotePcPlayer>;
}

export interface RemotePcSession {
  id: string;
  host: RemotePcSocket;
  viewer: RemotePcSocket;
  room: string;
  state: 'invited' | 'accepted';
  created: number;
  hostSeen: number;
  viewerSeen: number;
}

interface RemotePcOptions {
  rooms: ReadonlyMap<string, RemotePcRoom>;
  send(ws: RemotePcSocket, message: Record<string, unknown>): void;
  ice(): Promise<unknown>;
  now?: () => number;
}

// Only session negotiation goes through the server. Input and video use the
// separately consented WebRTC connection; room voice mode is never modified.
export class RemotePc {
  readonly rooms: ReadonlyMap<string, RemotePcRoom>;
  readonly send: RemotePcOptions['send'];
  ice: RemotePcOptions['ice'];
  readonly now: () => number;
  readonly sessions = new Map<string, RemotePcSession>();
  readonly byClient = new Map<string, string>();
  readonly rates = new WeakMap<RemotePcSocket, { count: number; until: number }>();

  constructor({ rooms, send, ice, now = Date.now }: RemotePcOptions) {
    this.rooms = rooms;
    this.send = send;
    this.ice = ice;
    this.now = now;
  }

  player(ws: RemotePcSocket | undefined | null): RemotePcPlayer | null {
    return ws &&
      (ws.readyState === undefined || ws.readyState === 1) &&
      ws.account &&
      ws.account.expiresAt > this.now()
      ? this.rooms.get(ws.roomId || '')?.players.get(ws.clientId) || null
      : null;
  }

  available(ws: RemotePcSocket | undefined | null): ws is RemotePcSocket & {
    account: NonNullable<RemotePcSocket['account']>;
  } {
    const p = this.player(ws);
    return !!p?.voiceJoined && !p.mediaBlocked;
  }

  valid(s: RemotePcSession): boolean {
    return (
      this.available(s.host) &&
      this.available(s.viewer) &&
      s.host.roomId === s.room &&
      s.viewer.roomId === s.room &&
      s.host.account.id !== s.viewer.account.id
    );
  }

  emit(s: RemotePcSession, type: string, extra: Record<string, unknown> = {}): void {
    for (const ws of [s.host, s.viewer]) {
      this.send(ws, { type, sessionId: s.id, ...extra });
    }
  }

  finish(s: RemotePcSession | undefined | null, reason = 'ended'): void {
    if (!s || !this.sessions.has(s.id)) return;
    this.sessions.delete(s.id);
    for (const ws of [s.host, s.viewer]) {
      if (this.byClient.get(ws.clientId) === s.id) {
        this.byClient.delete(ws.clientId);
      }
    }
    this.emit(s, 'remote-ended', { reason });
  }

  disconnect(ws: RemotePcSocket | undefined | null): void {
    if (!ws) return;
    this.finish(this.sessions.get(this.byClient.get(ws.clientId) || ''), 'disconnected');
  }

  sweep(): void {
    for (const s of this.sessions.values()) {
      if (
        !this.valid(s) ||
        this.now() - s.created > 4 * 60 * 60 * 1000 ||
        this.now() - s.hostSeen > 15000 ||
        this.now() - s.viewerSeen > 15000 ||
        (s.state === 'invited' && this.now() - s.created > 60000)
      ) {
        this.finish(s, 'expired');
      }
    }
  }

  async handle(ws: RemotePcSocket, m: Record<string, unknown>): Promise<void> {
    const reply = (data: unknown, error?: string) =>
      this.send(ws, {
        type: 'remote-response',
        requestId: String(m.requestId || '').slice(0, 80),
        ok: !error,
        ...(error ? { error: { code: 'REMOTE_PC', message: error } } : { data }),
      });
    try {
      if (!this.available(ws)) {
        reply(null, 'Entre na voz com sua conta para compartilhar um PC.');
        return;
      }
      let rate = this.rates.get(ws);
      if (!rate || rate.until < this.now()) {
        rate = { count: 0, until: this.now() + 1000 };
        this.rates.set(ws, rate);
      }
      if (++rate.count > 100) {
        reply(null, 'Aguarde antes de tentar novamente.');
        return;
      }
      this.sweep();
      const action = typeof m.action === 'string' ? m.action : '';
      const sessionId = typeof m.sessionId === 'string' ? m.sessionId : '';
      if (['invite', 'accept'].includes(action) && m.protocol !== 2) {
        if (action === 'accept') {
          const old = this.sessions.get(sessionId);
          if (old?.viewer === ws) this.finish(old, 'update-required');
        }
        reply(
          null,
          'Atualize os dois aplicativos para Windows 0.2.12 ou use o site atualizado para receber. Esta versão antiga da beta não suporta o novo controle.',
        );
        return;
      }
      if (action === 'invite') {
        const room = this.rooms.get(ws.roomId || '');
        const targetId = typeof m.targetId === 'string' ? m.targetId : '';
        const viewer = room?.players.get(targetId)?.ws;
        if (
          !room ||
          !this.available(viewer) ||
          viewer === ws ||
          viewer.account.id === ws.account.id
        ) {
          reply(null, 'Escolha outra pessoa conectada à mesma voz.');
          return;
        }
        if (this.byClient.has(ws.clientId) || this.byClient.has(viewer.clientId)) {
          reply(null, 'Um dos participantes já tem uma sessão de PC aberta.');
          return;
        }
        const s: RemotePcSession = {
          id: crypto.randomUUID(),
          host: ws,
          viewer,
          room: room.id,
          state: 'invited',
          created: this.now(),
          hostSeen: this.now(),
          viewerSeen: this.now(),
        };
        this.sessions.set(s.id, s);
        this.byClient.set(ws.clientId, s.id);
        this.byClient.set(viewer.clientId, s.id);
        this.send(viewer, {
          type: 'remote-invite',
          protocol: 2,
          sessionId: s.id,
          hostName: ws.account.nickname,
          hostId: ws.clientId,
        });
        reply({ sessionId: s.id });
        return;
      }
      const s = this.sessions.get(sessionId);
      if (!s || ![s.host, s.viewer].includes(ws) || !this.valid(s)) {
        reply(null, 'A sessão de PC não está mais disponível.');
        return;
      }
      if (ws === s.host) s.hostSeen = this.now();
      else s.viewerSeen = this.now();
      if (action === 'end') {
        this.finish(s, 'ended');
        reply({ ended: true });
        return;
      }
      if (action === 'heartbeat') {
        reply({ active: true });
        return;
      }
      if (action === 'accept') {
        if (ws !== s.viewer || s.state !== 'invited') {
          reply(null, 'Convite indisponível.');
          return;
        }
        s.state = 'accepted';
        this.send(s.host, {
          type: 'remote-ready',
          sessionId: s.id,
          role: 'host',
          peerName: s.viewer.account?.nickname || '',
        });
        this.send(s.viewer, {
          type: 'remote-ready',
          sessionId: s.id,
          role: 'viewer',
          peerName: s.host.account?.nickname || '',
        });
        reply({ accepted: true });
        return;
      }
      if (s.state !== 'accepted') {
        reply(null, 'O convite precisa ser aceito primeiro.');
        return;
      }
      if (action === 'ice') {
        const config = await this.ice();
        if (this.sessions.get(s.id) !== s || !this.valid(s)) {
          reply(null, 'Sessão encerrada.');
          return;
        }
        reply(config);
        return;
      }
      if (action === 'signal') {
        const p = m.signal;
        if (!object(p) || JSON.stringify(p).length > 100000) {
          reply(null, 'Sinal inválido.');
          return;
        }
        const candidateObj = object(p.candidate) ? p.candidate : null;
        if (
          (p.type === 'offer' && ws === s.host && typeof p.sdp === 'string') ||
          (p.type === 'answer' && ws === s.viewer && typeof p.sdp === 'string') ||
          (p.type === 'candidate' &&
            (p.candidate === null ||
              (typeof candidateObj?.candidate === 'string' &&
                candidateObj.candidate.length < 2048)))
        ) {
          this.send(ws === s.host ? s.viewer : s.host, {
            type: 'remote-signal',
            sessionId: s.id,
            signal: p,
          });
          reply({ sent: true });
          return;
        }
        reply(null, 'Sinal não permitido.');
        return;
      }
      reply(null, 'Operação indisponível.');
    } catch {
      reply(null, 'Não foi possível iniciar o compartilhamento de PC.');
    }
  }

  stop(): void {
    for (const s of [...this.sessions.values()]) {
      this.finish(s, 'restart');
    }
  }
}
