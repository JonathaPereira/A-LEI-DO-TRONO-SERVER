import { randomBytes, randomUUID } from 'node:crypto';

export interface GuestIdentity {
  id: string;
  nickname: string;
  guest: true;
  avatar_preset: 'person';
  avatar_file_id: null;
  expiresAt: number;
  ticket: string;
}

export interface GuestConnection {
  roomId?: string | null;
  gameRoomId?: string | null;
  guest?: GuestIdentity | null;
}

export interface GuestRequest {
  name?: unknown;
  ticket?: unknown;
}

interface GuestSessionsOptions {
  validNickname(name: string): boolean;
  nameReserved(name: string): boolean;
}

/** Opaque, random tickets stay server-side; client claims never establish an identity. */
export function createGuestSessions({ validNickname, nameReserved }: GuestSessionsOptions) {
  const tickets = new Map<string, GuestIdentity>();

  function authenticate(connection: GuestConnection, message: GuestRequest): GuestIdentity {
    const ticket = typeof message.ticket === 'string' ? message.ticket : '';
    let identity = tickets.get(ticket);
    const nickname = String(message.name || identity?.nickname || '')
      .trim()
      .normalize('NFKC');
    if (!validNickname(nickname))
      throw Object.assign(
        new Error(
          'Escolha um nome de 2 a 20 caracteres: letras, números, espaço, ponto, hífen ou sublinhado.',
        ),
        { code: 'INVALID_NICKNAME' },
      );
    if (nameReserved(nickname))
      throw Object.assign(
        new Error('Esse apelido pertence a uma conta. Escolha outro nome para o convidado.'),
        { code: 'NAME_TAKEN' },
      );
    if (identity && identity.expiresAt <= Date.now()) identity = undefined;
    if (
      identity &&
      (connection.roomId || connection.gameRoomId) &&
      connection.guest?.id === identity.id &&
      nickname !== identity.nickname
    ) {
      throw Object.assign(new Error('Saia da sala para mudar o nome de convidado.'), {
        code: 'GUEST_IN_ROOM',
      });
    }
    if (!identity) {
      if (tickets.size >= 500)
        throw Object.assign(
          new Error('Muitos convidados conectados. Tente novamente mais tarde.'),
          { code: 'GUEST_BUSY' },
        );
      identity = {
        id: `guest:${randomUUID()}`,
        nickname,
        guest: true,
        avatar_preset: 'person',
        avatar_file_id: null,
        expiresAt: Date.now() + 12 * 60 * 60 * 1000,
        ticket: randomBytes(32).toString('hex'),
      };
      tickets.set(identity.ticket, identity);
    } else identity.nickname = nickname;
    return identity;
  }

  function prune(): string[] {
    const expired: string[] = [];
    for (const [ticket, identity] of tickets) {
      if (identity.expiresAt <= Date.now()) {
        tickets.delete(ticket);
        expired.push(identity.id);
      }
    }
    return expired;
  }

  return { authenticate, prune, clear: () => tickets.clear() };
}
