import {
  createGuestSessions,
  type GuestConnection,
  type GuestRequest,
  type GuestIdentity,
} from './sessions.ts';
import type { AccountRole } from '../src/types/domain';
import type { MemberRole } from './roles';
import { readDirectory } from './community-protocol.ts';
import { validNickname } from '../src/lib/auth/nickname.ts';

interface Account {
  id: string;
  nickname: string;
  expiresAt: number;
  guest?: false;
  role?: MemberRole;
  avatar_preset?: string;
  avatar_file_id?: string | null;
}
export interface CommunityConnection extends GuestConnection {
  clientId: string;
  readyState?: number;
  account?: Account | null;
  textRoomId?: string | null;
  activity?: { name: string; startedAt: number; seenAt: number } | null;
}
interface Room {
  id: string;
  name: string;
  kind: 'chat' | 'game';
  players: ReadonlyMap<string, { voiceJoined?: boolean }>;
}
interface Member {
  id: string;
  name: string;
  guest: boolean;
  role: AccountRole;
  avatar_preset: string;
  avatar_file_id: string | null;
  lastSeen: number | null;
}
interface Location {
  online: boolean;
  roomId: string | null;
  roomName: string | null;
  roomKind: Room['kind'] | null;
  inVoice: boolean;
  gameRoomId?: string | null;
  gameRoomName?: string | null;
  activity: { name: string; startedAt: number } | null;
}
interface Options {
  wss: { clients: Iterable<CommunityConnection> };
  rooms: ReadonlyMap<string, Room>;
  send(connection: CommunityConnection, message: PresenceSnapshot): void;
  auth: { configured: boolean };
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => number;
}
export interface PresenceSnapshot {
  type: 'presence';
  scope: 'community' | 'game';
  directoryReady: boolean;
  members: Array<Member & Location>;
}

export function createCommunity({
  wss,
  rooms,
  send,
  auth,
  env = process.env,
  fetchImpl = fetch,
  now = Date.now,
}: Options) {
  const members = new Map<string, Member>(),
    scope = new AbortController();
  const guests = createGuestSessions({ validNickname, nameReserved });
  let directoryReady = false,
    closed = false;
  let loading: Promise<void> | null = null;
  const roomFor = (id?: string | null) => (id ? rooms.get(id) : undefined);
  const validAccount = (
    ws: CommunityConnection,
  ): ws is CommunityConnection & { account: Account } =>
    !!ws.account && ws.account.expiresAt > now();
  const validGuest = (
    ws: CommunityConnection,
  ): ws is CommunityConnection & { guest: GuestIdentity } =>
    !!ws.guest && ws.guest.expiresAt > now();
  function note(ws: CommunityConnection) {
    if (closed) return;
    const identity = validAccount(ws) ? ws.account : validGuest(ws) ? ws.guest : null;
    if (!identity) return;
    const id = identity.id;
    members.set(id, {
      id,
      name: identity.nickname,
      guest: !!identity.guest,
      role: identity.guest ? 'guest' : identity.role || 'member',
      avatar_preset: identity.avatar_preset || 'person',
      avatar_file_id: identity.avatar_file_id || null,
      lastSeen: now(),
    });
  }
  function updateActivity(ws: CommunityConnection, value: unknown) {
    if (closed) return { ok: false, code: 'COMMUNITY_UNAVAILABLE' };
    if (!validAccount(ws)) return { ok: false, code: 'AUTH_REQUIRED' };
    if (
      value !== null &&
      (typeof value !== 'object' ||
        Array.isArray(value) ||
        !('name' in value) ||
        typeof value.name !== 'string' ||
        value.name.length > 80 ||
        /[\x00-\x1f\x7f]/.test(value.name))
    )
      return { ok: false, code: 'INVALID_ACTIVITY' };
    const name =
      value && typeof value === 'object' && 'name' in value && typeof value.name === 'string'
        ? value.name.trim().normalize('NFKC') || null
        : null;
    if (name && name.length > 80) return { ok: false, code: 'INVALID_ACTIVITY' };
    const stamp = now(),
      old = ws.activity;
    // Reports identify only the authenticated socket, never a supplied user ID.
    ws.activity = name
      ? { name, startedAt: old?.name === name ? old.startedAt : stamp, seenAt: stamp }
      : null;
    if (old?.name !== ws.activity?.name) broadcast();
    return { ok: true };
  }
  function snapshot(ws: CommunityConnection): PresenceSnapshot {
    const full = !!validAccount(ws),
      online = new Map<string, Location>();
    for (const client of closed ? [] : wss.clients) {
      if (client.readyState !== 1) continue;
      note(client);
      const id = validAccount(client)
        ? client.account.id
        : validGuest(client)
          ? client.guest.id
          : null;
      if (!id) continue;
      const primary = roomFor(client.roomId),
        room = primary?.players.get(client.clientId)?.voiceJoined
          ? primary
          : roomFor(client.gameRoomId) || roomFor(client.textRoomId) || primary,
        player = room?.players.get(client.clientId);
      if (!full && room?.kind !== 'game') continue;
      const old = online.get(id);
      if (!old || room)
        online.set(id, {
          online: true,
          roomId: room?.id || null,
          roomName: room?.name || null,
          roomKind: room?.kind || null,
          inVoice: !!player?.voiceJoined,
          gameRoomId: client.gameRoomId || null,
          gameRoomName: roomFor(client.gameRoomId)?.name || null,
          activity:
            full &&
            validAccount(client) &&
            client.activity &&
            now() - client.activity.seenAt < 45000
              ? { name: client.activity.name, startedAt: client.activity.startedAt }
              : null,
        });
    }
    const list: Array<Member & Location> = [];
    for (const m of members.values()) {
      if (!full && !online.has(m.id)) continue;
      list.push({
        ...m,
        ...(online.get(m.id) || {
          online: false,
          roomId: null,
          roomName: null,
          roomKind: null,
          inVoice: false,
          activity: null,
        }),
      });
    }
    list.sort(
      (a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'pt-BR'),
    );
    return {
      type: 'presence',
      scope: full ? 'community' : 'game',
      directoryReady: full && directoryReady,
      members: list.slice(0, 1000),
    };
  }
  function broadcast() {
    if (closed) return;
    for (const ws of wss.clients) if (validAccount(ws) || validGuest(ws)) send(ws, snapshot(ws));
  }
  function refreshDirectory(): Promise<void> {
    const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
    if (loading) return loading;
    if (closed || !auth.configured || !secret) return Promise.resolve();
    const pending = (async () => {
      try {
        const response = await fetchImpl(
          `${String(env.SUPABASE_URL).replace(/\/+$/, '')}/rest/v1/rpc/chat_member_directory`,
          {
            method: 'POST',
            headers: {
              apikey: secret,
              ...(!secret.startsWith('sb_secret_') ? { Authorization: `Bearer ${secret}` } : {}),
              'Content-Type': 'application/json',
            },
            body: '{}',
            signal: AbortSignal.any([scope.signal, AbortSignal.timeout(12000)]),
          },
        );
        if (!response.ok) throw new Error('directory unavailable');
        const rows = readDirectory(await response.json());
        if (closed) return;
        const ids = new Set(rows.map((p) => p.id));
        for (const [id, m] of members) if (!m.guest && !ids.has(id)) members.delete(id);
        for (const row of rows)
          members.set(row.id, {
            id: row.id,
            name: row.nickname,
            guest: false,
            role: row.role,
            avatar_preset: row.avatar_preset || 'crown',
            avatar_file_id: row.avatar_file_id || null,
            lastSeen: members.get(row.id)?.lastSeen || null,
          });
        directoryReady = true;
        broadcast();
      } catch {
        if (!closed) directoryReady = false;
      }
    })();
    loading = pending;
    void pending
      .finally(() => {
        if (loading === pending) loading = null;
      })
      .catch(() => {});
    return pending;
  }
  function nameReserved(name: string) {
    return [...members.values()].some(
      (m) =>
        !m.guest &&
        m.name.normalize('NFKC').toLocaleLowerCase('pt-BR') ===
          name.normalize('NFKC').toLocaleLowerCase('pt-BR'),
    );
  }
  function guest(ws: CommunityConnection, message: GuestRequest) {
    if (closed)
      throw Object.assign(Error('Comunidade indisponível.'), { code: 'COMMUNITY_UNAVAILABLE' });
    if (validAccount(ws))
      throw Object.assign(Error('Sua conta já está conectada. Use seu perfil para jogar.'), {
        code: 'ALREADY_AUTHENTICATED',
      });
    return guests.authenticate(ws, message);
  }
  const timer = setInterval(() => {
    for (const id of guests.prune()) members.delete(id);
    void refreshDirectory();
    broadcast();
  }, 30000);
  timer.unref();
  void refreshDirectory();
  return {
    note,
    snapshot,
    broadcast,
    updateActivity,
    guest,
    validGuest,
    nameReserved,
    refreshDirectory,
    health: () => ({ directoryReady, gameActivity: true }),
    stop() {
      if (closed) return;
      closed = true;
      directoryReady = false;
      clearInterval(timer);
      scope.abort();
      members.clear();
      guests.clear();
    },
  };
}
