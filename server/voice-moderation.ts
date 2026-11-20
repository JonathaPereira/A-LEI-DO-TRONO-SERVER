import { permissions } from './roles.ts';

export const KICK_MS = 5 * 60 * 1000;

export type VoiceModerationAction = 'mute' | 'unmute' | 'block-media' | 'allow-media' | 'kick';

export interface VoiceModerationRule {
  muted: boolean;
  mediaBlocked: boolean;
  blockedUntil: number;
}

export interface VoiceModerationSocket {
  clientId: string;
  roomId?: string | null;
  account?: {
    id: string;
    role?: string;
    expiresAt: number;
  } | null;
  guest?: {
    id: string;
  } | null;
}

export interface VoiceModerationPlayer {
  id: string;
  name: string;
  guest?: boolean;
  ws: VoiceModerationSocket;
  voiceJoined?: boolean;
  voiceMuted?: boolean;
  cameraOn?: boolean;
  screenOn?: boolean;
  serverMuted?: boolean;
  mediaBlocked?: boolean;
}

export interface VoiceModerationRoom {
  id: string;
  players: Map<string, VoiceModerationPlayer>;
}

interface VoiceModerationOptions<
  TRoom extends VoiceModerationRoom = VoiceModerationRoom,
  TPlayer extends VoiceModerationPlayer = VoiceModerationPlayer,
> {
  rooms: ReadonlyMap<string, TRoom>;
  send(ws: VoiceModerationSocket, message: Record<string, unknown>): void;
  changed(room: TRoom): void;
  removed(room: TRoom, player: TPlayer): void;
  restricted(room: TRoom, player: TPlayer): unknown;
  now?: () => number;
}

const DESCRIPTIONS: Record<VoiceModerationAction, string> = {
  mute: 'Seu microfone foi silenciado pela moderação.',
  unmute: 'A moderação liberou seu microfone. Ative-o quando quiser.',
  'block-media': 'Câmera e compartilhamentos bloqueados pela moderação.',
  'allow-media': 'A moderação liberou câmera e compartilhamentos.',
  kick: 'Você foi removido desta chamada por 5 minutos.',
};

function isAction(value: unknown): value is VoiceModerationAction {
  return (
    value === 'mute' ||
    value === 'unmute' ||
    value === 'block-media' ||
    value === 'allow-media' ||
    value === 'kick'
  );
}

export class VoiceModeration<
  TRoom extends VoiceModerationRoom = VoiceModerationRoom,
  TPlayer extends VoiceModerationPlayer = VoiceModerationPlayer,
> {
  readonly rooms: ReadonlyMap<string, TRoom>;
  readonly send: VoiceModerationOptions<TRoom, TPlayer>['send'];
  readonly changed: VoiceModerationOptions<TRoom, TPlayer>['changed'];
  readonly removed: VoiceModerationOptions<TRoom, TPlayer>['removed'];
  readonly restricted: VoiceModerationOptions<TRoom, TPlayer>['restricted'];
  readonly now: () => number;
  readonly rules = new WeakMap<TRoom, Map<string, VoiceModerationRule>>();
  readonly rates = new WeakMap<VoiceModerationSocket, { until: number; count: number }>();

  constructor({
    rooms,
    send,
    changed,
    removed,
    restricted,
    now = Date.now,
  }: VoiceModerationOptions<TRoom, TPlayer>) {
    this.rooms = rooms;
    this.send = send;
    this.changed = changed;
    this.removed = removed;
    this.restricted = restricted;
    this.now = now;
  }

  key(ws: VoiceModerationSocket): string {
    return ws.account?.id
      ? 'account:' + ws.account.id
      : ws.guest?.id
        ? 'guest:' + ws.guest.id
        : 'client:' + ws.clientId;
  }

  state(room: TRoom, ws: VoiceModerationSocket): VoiceModerationRule {
    const map = this.rules.get(room);
    const key = this.key(ws);
    const rule = map?.get(key);
    if (!rule) return { muted: false, mediaBlocked: false, blockedUntil: 0 };
    if (rule.blockedUntil <= this.now()) rule.blockedUntil = 0;
    return { ...rule };
  }

  entry(room: TRoom, ws: VoiceModerationSocket): VoiceModerationRule {
    let map = this.rules.get(room);
    if (!map) {
      map = new Map();
      this.rules.set(room, map);
    }
    const key = this.key(ws);
    let rule = map.get(key);
    if (!rule) {
      rule = { muted: false, mediaBlocked: false, blockedUntil: 0 };
      map.set(key, rule);
    }
    return rule;
  }

  enforce(room: TRoom, player: TPlayer): VoiceModerationRule {
    const rule = this.state(room, player.ws);
    player.serverMuted = rule.muted;
    player.mediaBlocked = rule.mediaBlocked;
    if (rule.muted) player.voiceMuted = true;
    if (rule.mediaBlocked) {
      player.cameraOn = false;
      player.screenOn = false;
    }
    return rule;
  }

  mayJoin(room: TRoom, ws: VoiceModerationSocket): boolean {
    const rule = this.state(room, ws);
    if (!rule.blockedUntil) return true;
    this.send(ws, {
      type: 'voice-moderated',
      roomId: room.id,
      action: 'kick',
      blockedUntil: rule.blockedUntil,
      message: 'Você foi removido desta chamada. Aguarde 5 minutos para entrar novamente.',
    });
    return false;
  }

  handle(ws: VoiceModerationSocket, message: Record<string, unknown>): void {
    const requestId = String(message.requestId || '').slice(0, 80);
    const reply = (ok: boolean, error?: string) =>
      this.send(ws, { type: 'voice-moderation-result', requestId, ok, error });
    const room = this.rooms.get(ws.roomId || '');
    const actor = room?.players.get(ws.clientId) as TPlayer | undefined;
    const target = room?.players.get(String(message.targetId || '')) as TPlayer | undefined;
    if (
      !room ||
      !ws.account ||
      ws.account.expiresAt <= this.now() ||
      !permissions(ws.account.role).moderateVoice ||
      !actor?.voiceJoined
    ) {
      reply(false, 'Apenas administradores e criador na chamada podem moderar.');
      return;
    }
    if (!target?.voiceJoined || target === actor) {
      reply(false, 'Escolha outra pessoa desta chamada.');
      return;
    }
    const role = target.guest ? 'guest' : target.ws.account?.role || 'member';
    if (role === 'creator' || (role === 'admin' && ws.account.role !== 'creator')) {
      reply(false, 'Você não pode moderar este perfil.');
      return;
    }
    const action = message.action;
    if (!isAction(action)) {
      reply(false, 'Ação de moderação inválida.');
      return;
    }
    const now = this.now();
    const rate = this.rates.get(ws) || { until: now + 10000, count: 0 };
    if (rate.until <= now) {
      rate.until = now + 10000;
      rate.count = 0;
    }
    this.rates.set(ws, rate);
    if (++rate.count > 15) {
      reply(false, 'Aguarde alguns segundos antes de moderar novamente.');
      return;
    }
    const rule = this.entry(room, target.ws);
    if (action === 'mute') rule.muted = true;
    if (action === 'unmute') rule.muted = false;
    if (action === 'block-media') rule.mediaBlocked = true;
    if (action === 'allow-media') rule.mediaBlocked = false;
    if (action === 'kick') {
      rule.blockedUntil = now + KICK_MS;
      this.removed(room, target);
    }
    this.enforce(room, target);
    this.send(target.ws, {
      type: 'voice-moderated',
      roomId: room.id,
      action,
      moderator: actor.name,
      muted: rule.muted,
      mediaBlocked: rule.mediaBlocked,
      blockedUntil: rule.blockedUntil,
      message: DESCRIPTIONS[action],
    });
    // Capture enforcement before any asynchronous SFU cleanup.
    if (rule.muted || rule.mediaBlocked) void this.restricted(room, target);
    this.changed(room);
    reply(true);
  }
}
