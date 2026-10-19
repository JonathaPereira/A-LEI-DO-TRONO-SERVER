import type { SocketMessage } from '../../types/socket';
import type {
  ThroneChoicesSnapshot,
  ThroneChoiceContext,
  ThronePrompt,
} from '../../types/throne-choices';
import { readThroneChoiceContext, readThronePrompt } from './throne-choice-protocol.ts';
import { freezeGame } from './freeze.ts';

export interface ThroneChoiceScope {
  readonly key: string;
  readonly seat: number;
}
interface Options {
  scope(): ThroneChoiceScope | null;
  connected(): boolean;
  visible(): boolean;
  subscribeSource(fn: () => void): () => void;
  subscribeMessages(fn: (message: SocketMessage) => void): () => void;
  send(action: string, payload: Record<string, unknown>): boolean;
  warn?(error: unknown): void;
}
const initial: ThroneChoicesSnapshot = freezeGame({
  context: null,
  prompt: null,
  preview: false,
  pending: false,
  open: false,
  notice: '',
});
/** Server choices only: no local rules, animations, socket or media resources. */
export function createThroneChoices(options: Options) {
  let state = initial,
    started = false,
    disposed = false,
    scope: ThroneChoiceScope | null = null,
    highest = 0;
  let queued: ThronePrompt | null = null;
  const listeners = new Set<() => void>(),
    cleanup: (() => void)[] = [];
  function update(patch: Partial<ThroneChoicesSnapshot>) {
    if (disposed) return;
    const next = { ...state, ...patch };
    state = freezeGame({
      ...next,
      open: !!next.prompt && !!next.context && options.connected() && options.visible(),
    });
    listeners.forEach((fn) => fn());
  }
  function clear() {
    highest = 0;
    queued = null;
    update(initial);
  }
  function sync() {
    const current = options.scope();
    if (current?.key !== scope?.key || current?.seat !== scope?.seat) {
      scope = current;
      clear();
    } else if (!options.connected()) {
      if (state.context || state.prompt || queued || highest) clear();
    } else {
      const open = !!state.prompt && !!state.context && options.visible();
      if (open !== state.open) update({});
    }
  }
  function valid(prompt: ThronePrompt, context: ThroneChoiceContext): boolean {
    if (context.phase !== prompt.kind) return false;
    if (
      ['choose-law', 'choose-trump', 'usurp-target', 'usurp-give', 'usurp-pick'].includes(
        prompt.kind,
      ) &&
      context.lastShadow !== context.you
    )
      return false;
    if (prompt.kind === 'challenge' && context.lastCrown !== context.you) return false;
    switch (prompt.kind) {
      case 'choose-decree':
      case 'choose-trump':
        return true;
      case 'choose-law':
        return prompt.options.every((law) => context.lawUsage[law] < 2);
      case 'usurp-target':
        return prompt.options.every(
          (target) =>
            target.seat !== context.you &&
            context.players.some((p) => p.seat === target.seat && p.name === target.name),
        );
      case 'usurp-pick':
        return true;
      default:
        return prompt.cardIds.every((id) => context.hand.some((card) => card.id === id));
    }
  }
  function activate(prompt: ThronePrompt, context: ThroneChoiceContext) {
    if (!valid(prompt, context)) return;
    update({ prompt, preview: false, pending: false, notice: '' });
  }
  function receive(message: SocketMessage) {
    if (disposed || !started) return;
    sync();
    if (!scope || !options.connected()) return;
    try {
      switch (message.type) {
        case 'game-started':
          clear();
          break;
        case 'game-state': {
          const context = readThroneChoiceContext(message.state, scope.seat),
            old = state.context;
          if (
            old &&
            (context.round < old.round ||
              (context.round === old.round && context.trick < old.trick))
          )
            return;
          const same =
            old?.round === context.round && old.trick === context.trick && old.you === context.you;
          const keep = same && state.prompt && valid(state.prompt, context);
          update({
            context,
            ...(!keep ? { prompt: null, preview: false, pending: false, notice: '' } : {}),
          });
          if (queued) {
            const prompt = queued;
            queued = null;
            activate(prompt, context);
          }
          break;
        }
        case 'game-prompt': {
          const prompt = readThronePrompt(message.prompt);
          if (prompt.number <= highest) return;
          highest = prompt.number;
          // Multi-player card stages and rotation publish prompts before their state packet.
          if (state.context?.phase !== prompt.kind) {
            queued = prompt;
            return;
          }
          queued = null;
          activate(prompt, state.context);
          break;
        }
        case 'error':
          if (state.pending && message.code === 'INVALID_ACTION')
            update({
              pending: false,
              notice:
                typeof message.message === 'string'
                  ? message.message
                  : 'A escolha não foi aceita. Confira a mesa.',
            });
          break;
      }
    } catch (error) {
      options.warn?.(error);
    }
  }
  function choose(offered: ThronePrompt, value: string | number) {
    if (disposed || !started) return false;
    sync();
    const { prompt, context } = state;
    if (
      !scope ||
      !context ||
      !prompt ||
      offered !== prompt ||
      state.pending ||
      !state.open ||
      !valid(prompt, context)
    )
      return false;
    let payload: Record<string, unknown>;
    switch (prompt.kind) {
      case 'choose-decree':
      case 'choose-trump':
      case 'choose-law':
        if (typeof value !== 'string' || !(prompt.options as readonly string[]).includes(value))
          return false;
        payload = { value };
        break;
      case 'usurp-target':
        if (!prompt.options.some((p) => p.seat === value)) return false;
        payload = { targetSeat: value };
        break;
      case 'usurp-pick':
        if (
          typeof value !== 'number' ||
          !Number.isInteger(value) ||
          value < 0 ||
          value >= prompt.count
        )
          return false;
        payload = { index: value };
        break;
      default:
        if (typeof value !== 'string' || !prompt.cardIds.includes(value)) return false;
        payload = { cardId: value };
    }
    update({ pending: true, preview: false, notice: '' });
    try {
      if (options.send(prompt.kind, payload)) return true;
      if (state.prompt === prompt)
        update({ pending: false, notice: 'Não foi possível enviar a escolha. Aguarde a conexão.' });
    } catch (error) {
      if (state.prompt === prompt)
        update({ pending: false, notice: 'Não foi possível enviar a escolha.' });
      options.warn?.(error);
    }
    return false;
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    choose,
    clear,
    preview(show: boolean) {
      if (!disposed && state.prompt?.kind === 'choose-law' && !state.pending)
        update({ preview: show });
    },
    refresh: sync,
    start() {
      if (started || disposed) return;
      started = true;
      scope = options.scope();
      cleanup.push(options.subscribeSource(sync), options.subscribeMessages(receive));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      queued = null;
      scope = null;
      cleanup.splice(0).forEach((fn) => fn());
      listeners.clear();
      state = initial;
    },
  };
}
export type ThroneChoices = ReturnType<typeof createThroneChoices>;
