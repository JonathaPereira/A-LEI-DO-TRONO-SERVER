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
  onChanged?(): void;
  onDeleted?(room: Room): void;
  onRoleChanged?(id: string, role: 'admin' | 'member'): void;
  env?: NodeJS.ProcessEnv;
}

export function createCommunityManagement<Room extends ChannelRoom>({
  auth,
  rooms,
  createRoom,
  db,
  onChanged = () => {},
  onDeleted = () => {},
  onRoleChanged = () => {},
  env = process.env,
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
      return { profile: readPublicProfile(profile, req.params.id) };
    });
    route('get', '/registered-accounts', async (req, identity) => {
      requirePermission(identity, 'viewEmails');
      const offset = Math.max(0, Math.min(1000000, Math.floor(Number(req.query.offset) || 0)));
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
