import type { Express } from 'express';
import type { AuthGateway } from './auth-contract';
import { permissions } from './roles.ts';
import { installAccountApi, apiError as fail, object, type AccountContext } from './http-api.ts';
import {
  readManagedChannels,
  readCreatedChannel,
  readPublicProfile,
  readRegisteredAccounts,
  uuid,
  channelId,
  type ManagedChannel,
} from './management-protocol.ts';
import type { ChannelType } from '../src/types/domain';

export interface ChannelRoom {
  id: string;
  kind: 'chat' | 'game';
  name?: string;
  description?: string;
  channelType?: ChannelType;
}
interface Options<Room extends ChannelRoom> {
  auth: AuthGateway;
  rooms: Map<string, Room>;
  createRoom(channel: ManagedChannel): Room;
  db?:
    | ((path: string, method: 'POST', body: unknown, signal?: AbortSignal) => Promise<unknown>)
    | null;
  resolveProfileMediaUrls?(
    ids: readonly (string | null | undefined)[],
    signal?: AbortSignal,
  ): Promise<Record<string, { url: string; expiresAt: number }>>;
  onChanged?(): void;
  onDeleted?(room: Room): void;
  onRoleChanged?(id: string, role: 'admin' | 'member'): void;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export function createCommunityManagement<Room extends ChannelRoom>({
  auth,
  rooms,
  createRoom,
  db,
  resolveProfileMediaUrls,
  onChanged = () => {},
  onDeleted = () => {},
  onRoleChanged = () => {},
  env = process.env,
  fetchImpl = globalThis.fetch,
}: Options<Room>) {
  let ready = false,
    closed = false,
    queue: Promise<unknown> = Promise.resolve();
  const scope = new AbortController();
  const available = () => {
    if (closed)
      throw fail('COMMUNITY_UNAVAILABLE', 'Não foi possível atualizar a comunidade.', 503);
  };
  // Serialize mutations and refreshes so an older snapshot cannot reintroduce a deleted room.
  function serial<T>(fn: () => Promise<T>, signal = scope.signal): Promise<T> {
    const task = queue
      .catch(() => {})
      .then(() => {
        available();
        signal.throwIfAborted();
        return fn();
      });
    queue = task;
    return task;
  }
  function apply(value: unknown, signal = scope.signal) {
    available();
    signal.throwIfAborted();
    const rows = readManagedChannels(value);
    const prepared = new Map<string, Room>();
    for (const row of rows) {
      const room = rooms.get(row.id) ?? createRoom(row);
      if (room.id !== row.id || room.kind !== 'chat')
        throw fail('COMMUNITY_UNAVAILABLE', 'Lista de canais inválida.', 503);
      prepared.set(row.id, room);
    }
    const ids = new Set(rows.map((r) => r.id));
    for (const room of [...rooms.values()])
      if (room.kind === 'chat' && !ids.has(room.id)) {
        onDeleted(room);
        rooms.delete(room.id);
      }
    for (const row of rows) {
      const room = prepared.get(row.id)!;
      if (!rooms.has(row.id)) rooms.set(row.id, room);
      room.name = row.name;
      room.description = row.description;
      room.channelType = row.channel_type;
    }
    ready = true;
    onChanged();
    return rows;
  }
  async function sync(token: string, signal = scope.signal) {
    try {
      return apply(
        await auth.request(token, '/rest/v1/rpc/community_channels', 'POST', {}, signal),
        signal,
      );
    } catch (error) {
      if (!signal.aborted || closed) ready = false;
      throw error;
    }
  }
  async function refresh() {
    if (closed || !auth.configured || !db) return;
    return serial(async () =>
      apply(await db('rpc/community_channels', 'POST', {}, scope.signal)),
    ).catch(() => {
      ready = false;
    });
  }
  let installed = false;
  function install(app: Express, express: Pick<typeof import('express'), 'json'>) {
    available();
    if (installed) return;
    installed = true;
    const route = installAccountApi({
      app,
      express,
      base: '/community',
      auth,
      signal: scope.signal,
      code: 'COMMUNITY_UNAVAILABLE',
      message: 'Não foi possível atualizar a comunidade.',
      cacheIdentityPaths: (req) =>
        /^\/profiles\/[^/]+$/.test(req.path) || req.path === '/gif-provider',
    });
    function requirePermission(
      identity: AccountContext,
      key: keyof ReturnType<typeof permissions>,
    ) {
      if (!permissions(identity.account.role)[key])
        throw fail('FORBIDDEN', 'Você não tem permissão para realizar essa operação.', 403);
    }
    // GIPHY uses a public client key; never put service credentials in GIPHY_API_KEY.
    route('get', '/gif-provider', async () => {
      const apiKey = String(env.GIPHY_API_KEY || '').trim();
      const configured = /^[a-zA-Z0-9_-]{10,200}$/.test(apiKey);
      return { provider: 'giphy', configured, ...(configured ? { apiKey } : {}) };
    });
    route('get', '/permissions', async (_req, identity) => ({
      role: identity.account.role,
      permissions: permissions(identity.account.role),
    }));
    route('get', '/profiles/:id', async (req, identity) => {
      if (!uuid(req.params.id)) throw fail('MEMBER_NOT_FOUND', 'Perfil não encontrado.', 404);
      const profile = await auth.request(
        identity.token,
        '/rest/v1/rpc/read_member_profile',
        'POST',
        { p_user: req.params.id },
        identity.signal,
      );
      if (!profile) throw fail('MEMBER_NOT_FOUND', 'Perfil não encontrado.', 404);
      const publicProfile = readPublicProfile(profile, req.params.id);
      const mediaIds = [
        publicProfile.avatar_file_id,
        publicProfile.personalization?.cover_file_id,
        publicProfile.personalization?.background_file_id,
      ].filter((value): value is string => typeof value === 'string' && value.length > 0);
      const mediaUrls =
        resolveProfileMediaUrls && mediaIds.length > 0
          ? await resolveProfileMediaUrls(mediaIds, identity.signal).catch(() => ({}))
          : undefined;
      return {
        profile: publicProfile,
        ...(mediaUrls && Object.keys(mediaUrls).length > 0 ? { mediaUrls } : {}),
      };
    });
    async function readRegisteredAccountsFromAdmin(
      offset: number,
      signal: AbortSignal,
    ): Promise<{
      accounts: ReturnType<typeof readRegisteredAccounts>;
      hasMore: boolean;
      nextOffset: number;
    } | null> {
      const base = (env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
      const secret = (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
      if (!base || !secret || typeof fetchImpl !== 'function') return null;
      const page = Math.floor(offset / 50) + 1;
      const skip = offset % 50;
      const headers = {
        apikey: secret,
        Authorization: `Bearer ${secret}`,
      };
      const usersRes = await fetchImpl(`${base}/auth/v1/admin/users?page=${page}&per_page=50`, {
        method: 'GET',
        headers,
        signal,
      });
      if (!usersRes.ok) return null;
      const payload = (await usersRes.json()) as unknown;
      const rawUsers =
        object(payload) && Array.isArray(payload.users)
          ? payload.users
          : Array.isArray(payload)
            ? payload
            : null;
      if (!rawUsers) return null;
      const sliced = rawUsers.slice(skip, skip + 50);
      const ids = sliced
        .map((entry) => (object(entry) && uuid(entry.id) ? entry.id : null))
        .filter((id): id is string => !!id);
      const profilesById = new Map<string, { nickname?: string; created_at?: string | null }>();
      if (ids.length) {
        try {
          const profilesRes = await fetchImpl(
            `${base}/rest/v1/profiles?select=id,nickname,created_at&id=in.(${ids.join(',')})`,
            { method: 'GET', headers, signal },
          );
          if (profilesRes.ok) {
            const profileRows = (await profilesRes.json()) as unknown;
            if (Array.isArray(profileRows)) {
              for (const row of profileRows) {
                if (object(row) && uuid(row.id)) {
                  profilesById.set(row.id, {
                    nickname: typeof row.nickname === 'string' ? row.nickname : undefined,
                    created_at: typeof row.created_at === 'string' ? row.created_at : null,
                  });
                }
              }
            }
          }
        } catch {
          // Best-effort profile join; fall back to user metadata or email prefix.
        }
      }
      const mapped = sliced
        .filter(
          (entry): entry is Record<string, unknown> =>
            object(entry) &&
            uuid(entry.id) &&
            typeof entry.email === 'string' &&
            entry.email.trim().length > 0,
        )
        .map((entry) => {
          const id = entry.id as string;
          const email = (entry.email as string).trim();
          const profile = profilesById.get(id);
          const meta = object(entry.user_metadata) ? entry.user_metadata : null;
          const metaName =
            meta && typeof meta.nickname === 'string' && meta.nickname.trim()
              ? meta.nickname.trim()
              : '';
          const fallbackName = email.split('@')[0] || 'Conta';
          return {
            id,
            nickname: profile?.nickname || metaName || fallbackName,
            email,
            confirmed:
              typeof entry.email_confirmed_at === 'string' && entry.email_confirmed_at.length > 0,
            created_at:
              profile?.created_at ??
              (typeof entry.created_at === 'string' ? entry.created_at : null),
          };
        });
      const accounts = readRegisteredAccounts(mapped);
      return {
        accounts,
        hasMore: rawUsers.length === 50,
        nextOffset: offset + sliced.length,
      };
    }

    route('get', '/registered-accounts', async (req, identity) => {
      requirePermission(identity, 'viewEmails');
      const offset = Math.max(0, Math.min(1000000, Math.floor(Number(req.query.offset) || 0)));
      try {
        const rows = readRegisteredAccounts(
          await auth.request(
            identity.token,
            '/rest/v1/rpc/creator_registered_accounts',
            'POST',
            { p_offset: offset },
            identity.signal,
          ),
        );
        return { accounts: rows, hasMore: rows.length === 50, nextOffset: offset + rows.length };
      } catch (error) {
        const status =
          error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
        const code =
          error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        if (status === 503 && code === 'PROFILE_UNAVAILABLE') {
          const fallback = await readRegisteredAccountsFromAdmin(offset, identity.signal);
          if (fallback) return fallback;
        }
        throw error;
      }
    });
    route('get', '/channels', (_req, identity) =>
      serial(
        async () => ({ channels: await sync(identity.token, identity.signal) }),
        identity.signal,
      ),
    );
    route('post', '/channels', (req, identity) =>
      serial(async () => {
        requirePermission(identity, 'manageChannels');
        const { name, type, description = '' } = object(req.body) ? req.body : {};
        if (
          typeof name !== 'string' ||
          name.trim().length < 2 ||
          name.trim().length > 40 ||
          /[\x00-\x1f\x7f]/.test(name) ||
          (type !== 'text' && type !== 'voice') ||
          typeof description !== 'string' ||
          description.length > 160
        )
          throw fail('INVALID_CHANNEL', 'Use nome de 2 a 40 caracteres e tipo texto ou voz.');
        // Once sent, finish the mutation and synchronize the shared map even
        // when its HTTP client disappears. Server shutdown still cancels both.
        const result = await auth.request(
          identity.token,
          '/rest/v1/rpc/community_create_channel',
          'POST',
          { p_name: name.trim(), p_type: type, p_description: description.trim() },
          scope.signal,
        );
        await sync(identity.token);
        return { channel: readCreatedChannel(result) };
      }, identity.signal),
    );
    route('delete', '/channels/:id', (req, identity) =>
      serial(async () => {
        requirePermission(identity, 'manageChannels');
        if (!channelId(req.params.id))
          throw fail('CHANNEL_NOT_FOUND', 'Canal não encontrado.', 404);
        await auth.request(
          identity.token,
          '/rest/v1/rpc/community_delete_channel',
          'POST',
          {
            p_id: req.params.id,
          },
          scope.signal,
        );
        await sync(identity.token);
        return { ok: true };
      }, identity.signal),
    );
    route('post', '/roles', (req, identity) =>
      serial(async () => {
        requirePermission(identity, 'manageRoles');
        const { userId, role } = object(req.body) ? req.body : {};
        if (!uuid(userId)) throw fail('MEMBER_NOT_FOUND', 'Conta não encontrada.', 404);
        if (role !== 'admin' && role !== 'member')
          throw fail('INVALID_ROLE', 'Escolha Admin ou Membro.');
        await auth.request(
          identity.token,
          '/rest/v1/rpc/community_set_role',
          'POST',
          {
            p_user: userId,
            p_role: role,
          },
          scope.signal,
        );
        available();
        onRoleChanged(userId, role);
        return { ok: true, userId, role };
      }, identity.signal),
    );
  }
  const timer = setInterval(() => void refresh(), 15000);
  timer.unref();
  void refresh();
  return {
    install,
    refresh,
    refreshFor: (token: string) => serial(() => sync(token)),
    health: () => ({ channelsReady: ready }),
    stop() {
      if (closed) return;
      closed = true;
      ready = false;
      clearInterval(timer);
      scope.abort();
    },
  };
}
