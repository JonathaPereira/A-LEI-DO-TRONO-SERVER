import type { SocketMessage } from '../../types/socket';
import type { ThroneMatchSnapshot } from '../../types/throne-match';
import type { ThroneLaw } from '../../types/throne-choices';
import type { ThroneEffects } from './throne-effects';
import { record } from '../files/protocol.ts';
import { readThroneEvent } from './throne-event-protocol.ts';

export interface ThroneEventScope {
  key: string;
  room: string;
  seat: number;
}
interface Options {
  scope(): ThroneEventScope | null;
  match(): Pick<ThroneMatchSnapshot, 'mode' | 'match'>;
  connected(): boolean;
  subscribeSource(fn: () => void): () => void;
  subscribeMessages(fn: (message: SocketMessage) => void): () => void;
  effects: Pick<
    ThroneEffects,
    | 'clear'
    | 'toast'
    | 'turn'
    | 'influence'
    | 'played'
    | 'exchange'
    | 'result'
    | 'challenge'
    | 'connection'
  >;
  holdExchange(): () => void;
  lawName(law: ThroneLaw): string;
  requestState(): void;
  warn(error: unknown): void;
}

/** Dispatches public online events through existing owners, without a second match or transport. */
export function createThroneEvents(options: Options) {
  let started = false,
    disposed = false,
    blocked = false,
    epoch = 0;
  let scopeKey: string | null = null,
    activeKey: string | null = null,
    turnKey: string | null = null;
  const cleanup: (() => void)[] = [],
    holds = new Set<() => void>();
  function invalidate() {
    epoch++;
    turnKey = null;
    if (activeKey) options.effects.clear();
    [...holds].forEach((release) => release());
  }
  function sync() {
    if (!started || disposed) return;
    const scope = options.scope(),
      view = options.match(),
      m = view.match;
    const nextScope = scope ? `${scope.key}:${scope.seat}` : null;
    const nextActive =
      scope && options.connected() && view.mode === 'online' && m && m.localPlayerId === scope.seat
        ? `${nextScope}:${m.round}:${m.trick}`
        : null;
    if (scopeKey !== nextScope) {
      scopeKey = nextScope;
      blocked = false;
    }
    if (activeKey !== nextActive) {
      invalidate();
      activeKey = nextActive;
    }
    if (
      !blocked &&
      activeKey &&
      m?.phase === 'await-play' &&
      m.turn === scope?.seat &&
      turnKey !== activeKey
    ) {
      turnKey = activeKey;
      options.effects.turn(options.lawName(m.currentLaw));
    }
  }
  function hold() {
    const release = options.holdExchange();
    let released = false;
    const done = () => {
      if (released) return;
      released = true;
      holds.delete(done);
      release();
    };
    holds.add(done);
    return done;
  }
  async function dispatch(event: NonNullable<ReturnType<typeof readThroneEvent>>) {
    switch (event.kind) {
      case 'influence-used':
        options.effects.influence(event.data);
        break;
      case 'card-played':
        options.effects.played(event.data.seat);
        break;
      case 'exchange': {
        const release = hold();
        try {
          await options.effects.exchange(event.data);
        } finally {
          release();
        }
        break;
      }
      case 'trick-result':
        await options.effects.result(event.data);
        break;
      case 'challenge-reveal':
        options.effects.challenge(event.data);
        break;
      case 'turn-timeout':
        options.effects.toast(`⌛ ${event.data.name} excedeu 1 minuto — carta aleatória.`, 2000);
        break;
      case 'player-replaced-by-bot':
        options.effects.connection(event.data.name, event.data.botName, event.data.reason);
        break;
      case 'server-error':
        options.effects.toast(`Erro do servidor: ${event.data.message}`, 3000);
        break;
    }
  }
  function receive(message: SocketMessage) {
    if (!started || disposed) return;
    sync();
    const scope = options.scope();
    if (!scope || !options.connected()) return;
    if (message.type === 'game-started') {
      if (message.seat !== scope.seat || !record(message.room) || message.room.id !== scope.room)
        return;
      invalidate();
      blocked = false;
      options.effects.toast('♛ Partida online iniciada — o servidor controla a mesa.', 2200);
      options.requestState();
      return;
    }
    const view = options.match(),
      captured = epoch;
    if (blocked || !activeKey || view.mode !== 'online' || !view.match) return;
    try {
      const event = readThroneEvent(message, view.match);
      if (event)
        void dispatch(event).catch((error) => {
          if (!disposed && epoch === captured) options.warn(error);
        });
    } catch (error) {
      options.warn(error);
    }
  }
  return {
    clear() {
      blocked = true;
      invalidate();
    },
    start() {
      if (started || disposed) return;
      started = true;
      cleanup.push(options.subscribeSource(sync), options.subscribeMessages(receive));
      sync();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidate();
      cleanup.splice(0).forEach((release) => release());
      activeKey = null;
      scopeKey = null;
    },
  };
}
export type ThroneEvents = ReturnType<typeof createThroneEvents>;
