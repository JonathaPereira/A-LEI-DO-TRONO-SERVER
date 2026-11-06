import { randomUUID } from 'node:crypto';
import { CREATOR_EMAIL } from './roles.ts';
import { object } from './http-api.ts';
import {
  readChatInput,
  readHistoryInput,
  readModerationInput,
  messageId,
} from './chat-protocol.ts';
import { withAbort } from './abortable.ts';
import type { createChatHistory } from './chat-history';
import type { createFiles } from './files';
import type { BackendAccount } from './auth-contract';
import type { ChannelConnection, ChannelMember, ChannelRoom } from './channel-contract';
import type { ChatMessage } from '../src/types/domain';

type Event = { type: string; [key: string]: unknown };
interface Options {
  rooms: ReadonlyMap<string, ChannelRoom>;
  wss: { clients: Iterable<ChannelConnection> };
  send(ws: ChannelConnection, message: Event): void;
  selectedChatId(ws: ChannelConnection): string | null;
  history: ReturnType<typeof createChatHistory>;
  files: Pick<ReturnType<typeof createFiles>, 'attachment'>;
}
interface Buffer {
  messages: ChatMessage[];
  revision: number;
}
const creator = (account: BackendAccount | null): account is BackendAccount =>
  !!account &&
  account.expiresAt > Date.now() &&
  account.role === 'creator' &&
  account.email?.trim().toLowerCase() === CREATOR_EMAIL;
function publicError(error: unknown) {
  return object(error) &&
    typeof error.code === 'string' &&
    /^[A-Z][A-Z0-9_]{0,80}$/.test(error.code) &&
    typeof error.message === 'string'
    ? { code: error.code, message: error.message.slice(0, 500) }
    : {
        code: 'CHAT_HISTORY_UNAVAILABLE',
        message: 'Não foi possível salvar ou carregar as mensagens. Tente novamente em instantes.',
      };
}
/** Owns chat buffers, revision, rates and notifications; persistence owns the shared room queue. */
export function createChatService({ rooms, wss, send, selectedChatId, history, files }: Options) {
  let closed = false,
    buffers = new WeakMap<ChannelRoom, Buffer>(),
    messageRates = new WeakMap<ChannelMember, number>(),
    historyRates = new WeakMap<ChannelConnection, number>();
  const scope = new AbortController();
  const buffer = (room: ChannelRoom) => {
    let state = buffers.get(room);
    if (!state) {
      state = { messages: [], revision: 0 };
      buffers.set(room, state);
    }
    return state;
  };
  const roomFor = (id: string | null) => (id ? rooms.get(id) : undefined);
  const owns = (ws: ChannelConnection, room: ChannelRoom) =>
    rooms.get(room.id) === room &&
    selectedChatId(ws) === room.id &&
    room.players.get(ws.clientId)?.ws === ws;
  const identity = (ws: ChannelConnection) => ws.account?.id || ws.guest?.id || null;
  const currentIdentity = (ws: ChannelConnection, actor: string | null) =>
    identity(ws) === actor &&
    (!ws.account || ws.account.expiresAt > Date.now()) &&
    (!ws.guest || ws.guest.expiresAt > Date.now());
  const reply = (ws: ChannelConnection, event: Event, actor: string | null) => {
    if (!closed && currentIdentity(ws, actor)) send(ws, event);
  };
  async function message(ws: ChannelConnection, input: unknown) {
    if (closed) return;
    const value = readChatInput(input);
    if (!value) {
      send(ws, { type: 'error', code: 'INVALID_MESSAGE', message: 'Mensagem inválida.' });
      return;
    }
    const room = roomFor(selectedChatId(ws)),
      player = room?.players.get(ws.clientId),
      actor = identity(ws),
      accountId = ws.account?.id || null;
    if (
      !room ||
      !player ||
      !owns(ws, room) ||
      (value.roomId !== undefined && value.roomId !== room.id)
    ) {
      send(ws, {
        type: 'error',
        code: 'NOT_IN_ROOM',
        message: 'Selecione novamente o canal para enviar a mensagem.',
      });
      return;
    }
    if (room.channelType === 'voice') {
      send(ws, {
        type: 'error',
        code: 'VOICE_CHANNEL',
        message: 'Use um canal de texto para enviar mensagens.',
      });
      return;
    }
    if (value.attachmentId && !accountId) {
      send(ws, {
        type: 'error',
        code: 'LOGIN_REQUIRED_FILES',
        message: 'Entre em uma conta para enviar anexos.',
      });
      return;
    }
    const now = Date.now(),
      state = buffer(room);
    if (now - (messageRates.get(player) || 0) < 450) {
      send(ws, {
        type: 'error',
        code: 'CHAT_RATE',
        message: 'Aguarde um instante antes de enviar outra mensagem.',
      });
      return;
    }
    if (!value.text && !value.attachmentId) return;
    messageRates.set(player, now);
    try {
      await withAbort(
        history.serial(room.id, async () => {
          if (
            closed ||
            !owns(ws, room) ||
            !currentIdentity(ws, actor) ||
            buffers.get(room) !== state
          )
            return;
          const attachment =
            value.attachmentId && accountId
              ? await withAbort(
                  files.attachment(value.attachmentId, accountId, room.id, scope.signal),
                  scope.signal,
                )
              : null;
          if (
            closed ||
            !owns(ws, room) ||
            room.players.get(player.id) !== player ||
            !currentIdentity(ws, actor) ||
            buffers.get(room) !== state
          )
            return;
          const entry: ChatMessage = {
            id: randomUUID(),
            roomId: room.id,
            senderId: player.id,
            seat: player.seat,
            name: player.name,
            accountId,
            avatar_preset: player.avatar_preset || 'crown',
            avatar_file_id: player.avatar_file_id || null,
            text: value.text,
            attachment,
            ts: now,
          };
          await withAbort(history.append(room, entry, accountId), scope.signal);
          // An accepted persistent append survives a sender leaving. Never revive a deleted/reset room.
          if (closed || rooms.get(room.id) !== room || buffers.get(room) !== state) return;
          state.messages.push(entry);
          if (state.messages.length > 100) state.messages.splice(0, state.messages.length - 100);
          state.revision++;
          for (const member of room.players.values())
            send(member.ws, { type: 'chat-message', message: entry, revision: state.revision });
          if (room.kind === 'chat')
            for (const receiver of wss.clients) {
              if (
                !receiver.account ||
                receiver.account.expiresAt <= Date.now() ||
                receiver.account.id === accountId
              )
                continue;
              const nickname = receiver.account.nickname.toLocaleLowerCase('pt-BR'),
                lower = value.text.toLocaleLowerCase('pt-BR'),
                start = lower.indexOf('@' + nickname),
                tail = start < 0 ? '' : lower.slice(start + nickname.length + 1);
              send(receiver, {
                type: 'chat-notice',
                id: entry.id,
                roomId: room.id,
                roomName: room.name,
                name: entry.name,
                text: value.text || 'Enviou um anexo',
                mentioned: start >= 0 && (!tail || !/^\p{L}|^\p{N}|^_/u.test(tail)),
              });
            }
        }),
        scope.signal,
      );
    } catch (error) {
      if (!closed && owns(ws, room))
        reply(
          ws,
          {
            type: 'error',
            ...publicError(error),
            failedMessage: { roomId: room.id, text: value.text },
          },
          actor,
        );
    }
  }
  async function sendHistory(
    ws: ChannelConnection,
    room: ChannelRoom,
    before: string | null = null,
  ) {
    if (closed || !owns(ws, room)) return;
    const actor = identity(ws),
      state = buffer(room);
    try {
      await withAbort(
        history.serial(room.id, async () => {
          if (
            closed ||
            !owns(ws, room) ||
            !currentIdentity(ws, actor) ||
            buffers.get(room) !== state
          )
            return;
          const page = await withAbort(
            history.read({ ...room, chatHistory: state.messages }, before),
            scope.signal,
          );
          if (
            closed ||
            !owns(ws, room) ||
            !currentIdentity(ws, actor) ||
            buffers.get(room) !== state
          )
            return;
          reply(
            ws,
            {
              type: 'chat-history',
              roomId: room.id,
              ...page,
              revision: state.revision,
              older: !!before,
            },
            actor,
          );
        }),
        scope.signal,
      );
    } catch (error) {
      if (!closed && owns(ws, room))
        reply(ws, { type: 'error', ...publicError(error), roomId: room.id }, actor);
    }
  }
  function requestHistory(ws: ChannelConnection, input: unknown) {
    if (closed) return;
    const value = readHistoryInput(input);
    if (!value) return;
    const room = roomFor(selectedChatId(ws));
    if (!room || room.id !== value.roomId || !owns(ws, room)) return;
    const now = Date.now();
    if (now - (historyRates.get(ws) || 0) < 800) {
      send(ws, {
        type: 'error',
        code: 'CHAT_HISTORY_RATE',
        message: 'Aguarde um instante antes de carregar outra página.',
      });
      return;
    }
    historyRates.set(ws, now);
    void sendHistory(ws, room, value.before);
  }
  async function moderate(ws: ChannelConnection, input: unknown) {
    if (closed) return;
    const value = readModerationInput(input);
    if (!value) {
      send(ws, { type: 'error', code: 'INVALID_MESSAGE', message: 'Mensagem inválida.' });
      return;
    }
    const { action, roomId, id, requestId } = value,
      actor = identity(ws),
      account = ws.account,
      room = rooms.get(roomId),
      result = { type: 'chat-moderation-result', requestId, action, roomId, id };
    const reject = (code: string, text: string) =>
      reply(ws, { ...result, ok: false, error: { code, message: text } }, actor);
    if (!creator(account)) {
      reject('FORBIDDEN', 'Somente o criador pode apagar mensagens do canal.');
      return;
    }
    if (!room || room.kind !== 'chat' || room.channelType === 'voice' || !owns(ws, room)) {
      reject('NOT_IN_ROOM', 'Selecione um canal de texto para moderar suas mensagens.');
      return;
    }
    if (action === 'delete' && !messageId(id)) {
      reject('INVALID_MESSAGE', 'Mensagem inválida.');
      return;
    }
    const state = buffer(room);
    try {
      await withAbort(
        history.serial(room.id, async () => {
          if (closed) return;
          if (!owns(ws, room) || buffers.get(room) !== state) {
            reject('NOT_IN_ROOM', 'O canal mudou. Selecione novamente antes de apagar.');
            return;
          }
          if (!currentIdentity(ws, actor) || !creator(ws.account)) {
            reject('FORBIDDEN', 'Somente o criador pode apagar mensagens do canal.');
            return;
          }
          if (action === 'clear') await withAbort(history.clear(room, account.id), scope.signal);
          else await withAbort(history.remove(room, id!, account.id), scope.signal);
          if (closed || rooms.get(room.id) !== room || buffers.get(room) !== state) return;
          if (action === 'clear') state.messages = [];
          else state.messages = state.messages.filter((entry) => entry.id !== id);
          state.revision++;
          for (const member of room.players.values())
            send(member.ws, {
              type: action === 'clear' ? 'chat-history-cleared' : 'chat-message-deleted',
              roomId: room.id,
              revision: state.revision,
              ...(action === 'delete' ? { id } : {}),
            });
          reply(ws, { ...result, ok: true }, actor);
        }),
        scope.signal,
      );
    } catch (error) {
      reject(
        publicError(error).code,
        'Não foi possível apagar as mensagens. Confira a atualização SQL e tente novamente.',
      );
    }
  }
  return {
    message,
    sendHistory,
    requestHistory,
    moderate,
    reset(room: ChannelRoom) {
      if (closed) return;
      const previous = buffers.get(room);
      buffers.set(room, { messages: [], revision: previous?.revision || 0 });
    },
    attachmentDeleted(id: string, roomId: string | null) {
      if (closed) return;
      const room = roomFor(roomId);
      if (!room) return;
      for (const entry of buffers.get(room)?.messages || [])
        if (entry.attachment?.id === id) entry.attachment.deleted = true;
    },
    stop() {
      if (closed) return;
      closed = true;
      scope.abort();
      buffers = new WeakMap();
      messageRates = new WeakMap();
      historyRates = new WeakMap();
    },
  };
}
