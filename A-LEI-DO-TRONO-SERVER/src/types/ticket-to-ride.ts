export type TicketToRideColor =
  'purple' | 'white' | 'blue' | 'yellow' | 'orange' | 'black' | 'red' | 'green';

export type TicketToRideRouteColor = TicketToRideColor | 'gray';

export type TicketToRideCardColor = TicketToRideColor | 'loco';

export type TicketToRidePhase = 'setup' | 'playing' | 'finished';

export interface TicketToRideRoute {
  readonly id: string;
  readonly group: number;
  readonly a: string;
  readonly b: string;
  readonly length: number;
  readonly color: TicketToRideRouteColor;
  readonly lane: number;
  readonly double: boolean;
}

export interface TicketToRideTicket {
  readonly id: string;
  readonly a: string;
  readonly b: string;
  readonly points: number;
}

export interface TicketToRideCompletedTicket extends TicketToRideTicket {
  readonly complete: boolean;
}

export interface TicketToRidePlayerResult {
  id: string;
  routeScore: number;
  tickets: TicketToRideCompletedTicket[];
  completed: number;
  ticketScore: number;
  longest: number;
  bonus?: number;
  total?: number;
}

export interface TicketToRideLogEntry {
  readonly kind: 'draw' | 'claim' | 'final';
  readonly playerId: string;
  readonly card?: TicketToRideCardColor | null;
  readonly routeId?: string;
  readonly points?: number;
}

export interface TicketToRidePlayerInput {
  readonly id: string;
  readonly name: string;
  readonly bot?: boolean;
  readonly forfeited?: boolean;
}

export interface TicketToRideStatePlayer {
  id: string;
  name: string;
  bot: boolean;
  forfeited: boolean;
  trains: number;
  score: number;
  hand: TicketToRideCardColor[];
  tickets: string[];
  pending: string[];
  initial: boolean;
}

export interface TicketToRideState {
  revision: number;
  phase: TicketToRidePhase;
  turn: number;
  players: TicketToRideStatePlayer[];
  deck: TicketToRideCardColor[];
  discard: TicketToRideCardColor[];
  ticketDeck: string[];
  market: TicketToRideCardColor[];
  claimed: Record<string, string>;
  drawn: number;
  finalTurns: number | null;
  log: TicketToRideLogEntry[];
  random: () => number;
  results?: TicketToRidePlayerResult[];
  winners?: string[];
}

export interface TicketToRidePublicPlayer {
  id: string;
  name: string;
  bot: boolean;
  forfeited: boolean;
  trains: number;
  score: number;
  handCount: number;
  ticketCount: number;
  initial: boolean;
  hand: TicketToRideCardColor[] | null;
  tickets: string[] | null;
  pending: string[];
  completed: string[];
}

export interface TicketToRidePublicState {
  revision: number;
  phase: TicketToRidePhase;
  turn: number;
  market: TicketToRideCardColor[];
  deckCount: number;
  discardCount: number;
  ticketCount: number;
  claimed: Record<string, string>;
  drawn: number;
  finalTurns: number | null;
  log: TicketToRideLogEntry[];
  players: TicketToRidePublicPlayer[];
  results: TicketToRidePlayerResult[] | null;
  winners: string[];
}

export type TicketToRideMove =
  | {
      readonly kind: 'tickets';
      readonly keep: readonly string[];
    }
  | {
      readonly kind: 'draw';
      readonly source: 'market' | 'deck';
      readonly index?: number;
    }
  | {
      readonly kind: 'claim';
      readonly routeId: string;
      readonly color: TicketToRideColor;
      readonly locos: number;
    }
  | {
      readonly kind: 'draw-tickets';
    }
  | {
      readonly kind: 'pass';
    };

export interface TicketToRidePaymentOption {
  readonly color: TicketToRideColor;
  readonly locos: number;
}

export interface TicketToRideMember {
  id: string;
  name: string;
  bot: boolean;
  online: boolean;
  forfeited: boolean;
  avatar_preset?: string | null;
  avatar_file_id?: string | null;
}

export interface TicketToRideRoom {
  id: string;
  hostId: string;
  maxPlayers: number;
  players: TicketToRideMember[];
  state: TicketToRidePublicState | null;
}

export interface TicketToRideOpenRoom {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
}
