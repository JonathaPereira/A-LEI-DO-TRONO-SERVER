import type { ThroneRoom, ThroneRoomId, ThroneSeat } from '../../types/throne-lobby';
import { record } from '../files/protocol.ts';
import { normalizePreset } from '../profiles/icons.ts';
import { avatarFile } from '../profiles/avatar.ts';
import { freezeGame } from './freeze.ts';

export function throneRoomId(value: unknown): value is ThroneRoomId {
  return ['sala-cetro', 'sala-chave', 'sala-mascara'].includes(value as string);
}
const invalid = () => new Error('Dados do salão de A Lei do Trono inválidos.');
const text = (value: unknown, max: number) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw invalid();
  return value;
};
const bool = (value: unknown) => {
  if (typeof value !== 'boolean') throw invalid();
  return value;
};
export function readThroneRoom(value: unknown): ThroneRoom {
  if (
    !record(value) ||
    !throneRoomId(value.id) ||
    value.kind !== 'game' ||
    value.max !== 4 ||
    !Array.isArray(value.players) ||
    value.players.length > 4 ||
    value.count !== value.players.length
  )
    throw invalid();
  const players: ThroneSeat[] = value.players.map((raw) => {
    if (
      !record(raw) ||
      !Number.isInteger(raw.seat) ||
      (raw.seat as number) < 0 ||
      (raw.seat as number) > 3
    )
      throw invalid();
    return {
      id: text(raw.id, 100),
      name: text(raw.name, 100),
      seat: raw.seat as number,
      guest: bool(raw.guest),
      ready: bool(raw.ready),
      host: bool(raw.host),
      avatar_preset: normalizePreset(raw.avatar_preset),
      avatar_file_id: avatarFile({
        avatar_file_id: typeof raw.avatar_file_id === 'string' ? raw.avatar_file_id : null,
      }),
    };
  });
  if (
    new Set(players.map((p) => p.id)).size !== players.length ||
    new Set(players.map((p) => p.seat)).size !== players.length ||
    players.filter((p) => p.host).length !== (players.length ? 1 : 0)
  )
    throw invalid();
  return freezeGame({
    id: value.id,
    name: text(value.name, 100),
    kind: 'game',
    max: 4,
    count: players.length,
    voiceActive: bool(value.voiceActive),
    gameActive: bool(value.gameActive),
    players,
  });
}
export function readThroneRooms(value: unknown): readonly ThroneRoom[] {
  if (!Array.isArray(value) || value.length > 3) throw invalid();
  const rooms = value.map(readThroneRoom);
  if (new Set(rooms.map((room) => room.id)).size !== rooms.length) throw invalid();
  return Object.freeze(rooms);
}
