import type { SocketMessage } from '../../types/socket';
import type {
  GuestIdentity,
  NameAvailability,
  NetworkAccount,
  NetworkFeatures,
  NetworkStateEvent,
  PreparedVoice,
  RoomReference,
} from '../../types/network';

export function invalidResponse(message = 'Resposta inválida do servidor.') {
  return Object.assign(new Error(message), { code: 'INVALID_RESPONSE' });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isOptionalId(value: unknown): boolean {
  return value == null || isId(value);
}

function isRoom(value: unknown): value is RoomReference {
  return isRecord(value) && isId(value.id) && (value.kind === 'chat' || value.kind === 'game');
}

export const NO_NETWORK_FEATURES: NetworkFeatures = Object.freeze({
  azul: false,
  splendor: false,
  loveLetter: false,
  independentTextChannels: false,
  independentGameVoice: false,
  gameActivity: false,
});

function readFeatures(value: unknown): NetworkFeatures {
  if (value === undefined) return NO_NETWORK_FEATURES;
  if (!isRecord(value)) throw invalidResponse('Capacidades do servidor inválidas.');
  for (const key of Object.keys(NO_NETWORK_FEATURES))
    if (value[key] !== undefined && typeof value[key] !== 'boolean') throw invalidResponse();
  return Object.freeze({
    azul: value.azul === true,
    splendor: value.splendor === true,
    loveLetter: value.loveLetter === true,
    independentTextChannels: value.independentTextChannels === true,
    independentGameVoice: value.independentGameVoice === true,
    gameActivity: value.gameActivity === true,
  });
}

/** Unknown domains pass through; malformed state events never reach state or old controllers. */
export function parseStateEvent(message: SocketMessage): NetworkStateEvent | null {
  switch (message.type) {
    case 'connection':
      if (typeof message.connected !== 'boolean') throw invalidResponse();
      break;
    case 'welcome':
      if (
        !isId(message.clientId) ||
        (message.serverVersion !== undefined && typeof message.serverVersion !== 'string')
      )
        throw invalidResponse();
      return {
        ...message,
        type: 'welcome',
        clientId: message.clientId,
        serverVersion: message.serverVersion,
        features: readFeatures(message.features),
      };
    case 'joined-room':
    case 'voice-room-attached':
      if (!isRoom(message.room)) throw invalidResponse();
      break;
    case 'joined-game-room':
    case 'joined-text-channel':
      if (
        !isRoom(message.room) ||
        !isOptionalId(message.primaryRoomId) ||
        !isOptionalId(message.chatRoomId)
      )
        throw invalidResponse();
      break;
    case 'left-game-room':
    case 'left-voice-room':
      if (!isOptionalId(message.primaryRoomId) || !isOptionalId(message.chatRoomId))
        throw invalidResponse();
      break;
    case 'channel-deleted':
      if (!isId(message.roomId)) throw invalidResponse();
      break;
    default:
      return null;
  }
  // Each discriminant's fields were validated above; unrelated payload stays opaque.
  return message as NetworkStateEvent;
}

export function responseError(message: SocketMessage, fallback: string, code: string) {
  const detail = isRecord(message.error) ? message.error : undefined;
  return Object.assign(new Error(typeof detail?.message === 'string' ? detail.message : fallback), {
    code: typeof detail?.code === 'string' ? detail.code : code,
    detail,
  });
}

export function readAccount(value: unknown): NetworkAccount {
  if (
    !isRecord(value) ||
    !isId(value.id) ||
    typeof value.nickname !== 'string' ||
    typeof value.role !== 'string' ||
    !['member', 'admin', 'creator'].includes(value.role) ||
    !isRecord(value.permissions) ||
    !Object.values(value.permissions).every((v) => typeof v === 'boolean')
  )
    throw invalidResponse();
  return value as unknown as NetworkAccount;
}

export function readGuest(value: unknown): GuestIdentity {
  if (
    !isRecord(value) ||
    !isId(value.id) ||
    !isId(value.ticket) ||
    typeof value.nickname !== 'string' ||
    typeof value.expiresAt !== 'number' ||
    !Number.isFinite(value.expiresAt)
  )
    throw invalidResponse();
  return value as unknown as GuestIdentity;
}

export function readNameAvailability(message: SocketMessage): NameAvailability {
  if (
    typeof message.available !== 'boolean' ||
    (message.name !== undefined && typeof message.name !== 'string') ||
    (message.code != null && typeof message.code !== 'string') ||
    (message.message !== undefined && typeof message.message !== 'string')
  )
    throw invalidResponse();
  return message as unknown as NameAvailability;
}

export function readPreparedVoice(value: unknown): PreparedVoice {
  if (
    !isRecord(value) ||
    typeof value.mode !== 'string' ||
    !['p2p', 'sfu', 'sfu-pending'].includes(value.mode) ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  )
    throw invalidResponse();
  return value as unknown as PreparedVoice;
}
