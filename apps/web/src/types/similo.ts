import type { PublicGame, Relation } from '../lib/games/similo/rules';
import type { ThemeId } from '../lib/games/similo/catalog';
export interface SimiloSettings {
  boardThemes: ThemeId[];
  clueThemes: ThemeId[];
  maxPlayers: number;
  narratorId: string;
}
export interface SimiloMember {
  id: string;
  name: string;
  online: boolean;
  avatar_preset?: string | null;
  avatar_file_id?: string | null;
}
export interface SimiloRoom {
  id: string;
  hostId: string;
  revision: number;
  players: SimiloMember[];
  settings: SimiloSettings;
  state: PublicGame | null;
}
export interface SimiloOpenRoom {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
}
export type SimiloMove =
  | { kind: 'clue'; cardId: string; relation: Relation }
  | { kind: 'vote'; selected: string[]; confirmed: boolean }
  | { kind: 'reopen' }
  | { kind: 'resolve'; selected: string[] };
export type SimiloCommand =
  | { action: 'list' | 'leave' | 'state' }
  | { action: 'create'; settings: Omit<SimiloSettings, 'narratorId'> }
  | { action: 'join' | 'resume'; roomId: string }
  | { action: 'configure'; revision: number; settings: SimiloSettings }
  | { action: 'start' | 'rematch'; revision: number }
  | { action: 'move'; revision: number; move: SimiloMove };
export type SimiloEvent =
  | { type: 'similo-state'; room: SimiloRoom }
  | { type: 'similo-rooms'; rooms: SimiloOpenRoom[]; resumeId: string | null }
  | { type: 'similo-left'; reason?: string }
  | { type: 'similo-error'; code: string; message: string; requestId?: string };
