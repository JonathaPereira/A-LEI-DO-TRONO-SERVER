export interface AzulPlacement {
  row: number;
  col: number;
  color: number;
  points: number;
}
export interface AzulRoundScore {
  before: number;
  points: number;
  penalty: number;
  delta: number;
  placements: AzulPlacement[];
}
export interface AzulPlayer {
  id: string;
  name: string;
  bot: boolean;
  forfeited?: boolean;
  score: number;
  lines: { color: number | null; count: number }[];
  wall: boolean[][];
  floor: number[];
  last: AzulRoundScore | null;
  bonus?: { rows: number; columns: number; sets: number; total: number };
}
export interface AzulMove {
  source: number;
  color: number;
  row: number;
}
export interface AzulLastMove extends AzulMove {
  playerId: string;
  count: number;
  accepted: number;
}
export interface AzulState {
  version: number;
  phase: 'draft' | 'scoring' | 'finished';
  round: number;
  revision: number;
  players: AzulPlayer[];
  factories: number[][];
  center: number[];
  marker: boolean;
  starter: number;
  nextStarter: number | null;
  turn: number;
  last: AzulLastMove | null;
  winners: string[];
  bagCount: number;
  discardCount: number;
}
export interface AzulRoom {
  id: string;
  hostId: string;
  maxPlayers: number;
  players: { id: string; name: string; bot: boolean; online: boolean; forfeited: boolean }[];
  state: AzulState | null;
  recordStatus: 'saving' | 'saved' | 'pending' | 'unranked' | null;
}
export interface AzulOpenRoom {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
}
export interface AzulRecord {
  playerId: string;
  name: string;
  score: number;
  mode: 'bots' | 'online';
  date: string;
}
export type AzulStep =
  | ({
      kind: 'placement';
      playerId: string;
      horizontal: number;
      vertical: number;
      cells: number[][];
    } & AzulPlacement)
  | { kind: 'floor'; playerId: string; penalty: number; applied: number }
  | { kind: 'recap'; playerId: string; last: AzulRoundScore }
  | {
      kind: 'bonus';
      playerId: string;
      type: 'rows' | 'columns' | 'sets';
      count: number;
      points: number;
      cells: number[][];
    };
export type AzulDetail = Exclude<AzulStep, { kind: 'recap' }> & {
  landed: boolean;
};
export interface AzulReplay {
  key: number;
  round: number;
  state: AzulState;
  steps: AzulStep[];
}
export interface AzulReplayView {
  state: AzulState;
  round: number;
  progress: number;
  total: number;
  detail: AzulDetail | null;
}
export interface AzulSnapshot {
  accountId: string | null;
  room: AzulRoom | null;
  rooms: readonly AzulOpenRoom[];
  resumeId: string | null;
  ranking: readonly AzulRecord[];
  rankingError: string;
  notice: string;
  selection: Pick<AzulMove, 'source' | 'color'> | null;
  pending: boolean;
  replay: AzulReplayView | null;
}
export interface AzulRules {
  colors: string[];
  penalties: number[];
  canPlace(player: AzulPlayer, row: number, color: number): boolean;
}
export interface AzulPresentation {
  round(before: AzulState | null, after: AzulState | null): AzulReplay | null;
  apply(state: AzulState, step: AzulStep): AzulState;
}
