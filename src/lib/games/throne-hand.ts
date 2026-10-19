import type { SocketMessage } from '../../types/socket';
import type { ThroneSuit } from '../../types/throne-choices';
import type {
  ThroneHandContext,
  ThroneHandSnapshot,
  ThroneInfluenceAction,
} from '../../types/throne-hand';
import type { ThroneChoiceScope } from './throne-choices';
import { readThroneHandContext } from './throne-hand-protocol.ts';
import { freezeGame } from './freeze.ts';

interface Options {
  scope(): ThroneChoiceScope | null;
  connected(): boolean;
  visible(): boolean;
  subscribeSource(fn: () => void): () => void;
  subscribeMessages(fn: (message: SocketMessage) => void): () => void;
  send(action: string, payload: Record<string, unknown>): boolean;
  warn?(error: unknown): void;
}
const initial: ThroneHandSnapshot = freezeGame({
  active: false,
  context: null,
  action: 'none',
  declaredSuit: null,
  dialog: null,
  pending: false,
  visible: false,
  sorted: false,
  notice: '',
});
export function createThroneHand(options: Options) {
  let state = initial,
    started = false,
    disposed = false;
  let scope: ThroneChoiceScope | null = null;
  const listeners = new Set<() => void>(),
    cleanup: (() => void)[] = [];
  function update(patch: Partial<ThroneHandSnapshot>) {
    if (disposed) return;
    state = freezeGame({ ...state, ...patch });
    listeners.forEach((fn) => fn());
  }
  function clear() {
    update(initial);
  }
  function discard() {
    update({ ...initial, active: state.active });
  }
  function sync() {
    const next = options.scope();
    if (scope?.key !== next?.key || scope?.seat !== next?.seat) {
      scope = next;
      discard();
    } else if (!options.connected()) {
      if (state.context) discard();
    }
    const visible = !!state.context && options.connected() && options.visible();
    if (visible !== state.visible) update({ visible });
  }
  function usable(context: ThroneHandContext | null): context is ThroneHandContext {
    return (
      !!context &&
      !context.automaticReserve &&
      context.phase === 'await-play' &&
      context.turn === context.you
    );
  }
  function current(offered: ThroneHandContext) {
    if (disposed || !started) return false;
    sync();
    return state.context === offered && state.visible && !state.pending && usable(offered);
  }
  function receive(message: SocketMessage) {
    if (disposed || !started) return;
    sync();
    if (!scope || !options.connected()) return;
    try {
      if (message.type === 'game-started') update({ ...initial, active: true });
      else if (message.type === 'game-state') {
        const context = readThroneHandContext(message.state, scope.seat),
          old = state.context;
        if (
          old &&
          (context.round < old.round || (context.round === old.round && context.trick < old.trick))
        )
          return;
        // Presence broadcasts keep the offered turn identity and an in-flight move.
        if (old && JSON.stringify(context) === JSON.stringify(old)) return;
        update({
          ...initial,
          active: true,
          context,
          sorted: state.sorted,
          visible: options.visible(),
        });
      } else if (
        message.type === 'error' &&
        typeof message.code === 'string' &&
        [
          'INVALID_ACTION',
          'ILLEGAL_CARD',
          'NO_INFLUENCE',
          'CORTE_INFLUENCE_BLOCKED',
          'BAD_DECLARATION',
        ].includes(message.code) &&
        state.pending
      ) {
        update({
          pending: false,
          notice:
            typeof message.message === 'string' ? message.message : 'A jogada não foi aceita.',
        });
      }
    } catch (error) {
      if (message.type === 'game-state') discard();
      options.warn?.(error);
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    clear,
    refresh: sync,
    sort() {
      if (!disposed && state.context) update({ sorted: true });
    },
    toggleInfluence(offered: ThroneHandContext, enabled: boolean) {
      if (!current(offered)) return;
      if (!enabled) update({ action: 'none', declaredSuit: null, dialog: null, notice: '' });
      else if (offered.canUseInfluence) update({ dialog: 'influence', notice: '' });
    },
    chooseInfluence(offered: ThroneHandContext, action: ThroneInfluenceAction) {
      if (
        !current(offered) ||
        state.dialog !== 'influence' ||
        !offered.canUseInfluence ||
        !['sigilo', 'plus', 'minus'].includes(action) ||
        (action !== 'sigilo' && !offered.canUseManeuver)
      )
        return false;
      update({ action, declaredSuit: null, dialog: offered.opening ? 'suit' : null });
      return true;
    },
    chooseSuit(offered: ThroneHandContext, suit: ThroneSuit) {
      if (
        !current(offered) ||
        state.dialog !== 'suit' ||
        state.action === 'none' ||
        !offered.opening ||
        !offered.hand.some((c) => c.suit === suit && offered.hiddenLegal.includes(c.id))
      )
        return false;
      update({ declaredSuit: suit, dialog: null });
      return true;
    },
    dismiss() {
      if (!disposed) update({ action: 'none', declaredSuit: null, dialog: null });
    },
    play(offered: ThroneHandContext, id: string) {
      if (!current(offered) || state.dialog || !offered.legal.includes(id)) return false;
      const card = offered.hand.find((c) => c.id === id),
        hidden = state.action !== 'none';
      if (!card || (hidden && (!offered.canUseInfluence || !offered.hiddenLegal.includes(id))))
        return false;
      if (hidden && offered.opening && (!state.declaredSuit || card.suit !== state.declaredSuit))
        return false;
      const payload = {
        cardId: id,
        influenceAction: state.action,
        declaredSuit: hidden && offered.opening ? state.declaredSuit : null,
      };
      update({ pending: true, notice: '' });
      try {
        if (options.send('play-card', payload)) return true;
      } catch (error) {
        options.warn?.(error);
      }
      if (state.context === offered)
        update({ pending: false, notice: 'Não foi possível enviar a jogada. Confira a conexão.' });
      return false;
    },
    start() {
      if (started || disposed) return;
      started = true;
      scope = options.scope();
      cleanup.push(options.subscribeSource(sync), options.subscribeMessages(receive));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scope = null;
      cleanup.splice(0).forEach((fn) => fn());
      listeners.clear();
      state = initial;
    },
  };
}
export type ThroneHand = ReturnType<typeof createThroneHand>;
