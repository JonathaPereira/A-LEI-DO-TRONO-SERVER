import { createAudioGain } from './audio-gain.ts';

interface PlaybackOptions {
  volume: unknown;
  output: string;
  moderated?(key: string): boolean;
  createAudio(key: string): HTMLAudioElement;
  createStream(track: MediaStreamTrack): MediaStream;
  createContext(): PlaybackContext | null;
  onChange(): void;
  onBlocked(): void;
  onOutputFallback(failed: boolean): void;
  warn?(error: unknown): void;
}
type Graph = ReturnType<typeof createAudioGain>;
interface Entry {
  readonly key: string;
  readonly track: MediaStreamTrack;
  readonly stream: MediaStream;
  readonly audio: HTMLAudioElement;
  graph: Graph | null;
  route: 'direct' | 'gain';
  error: string;
  blocked: boolean;
  play: Promise<void> | null;
}
interface Sink {
  readonly sinkId?: string;
  setSinkId?(id: string): Promise<void>;
}
type PlaybackContext = AudioContext & Sink;
const errorName = (error: unknown) => (error instanceof Error ? error.name : 'OUTPUT_FAILED');
export const clampAudioGain = (value: unknown) =>
  Math.min(300, Math.max(0, Math.round((Number(value) || 0) / 5) * 5));

/** Owns players, amplification, output routing and pending play requests.
 * Received tracks are borrowed: removing a player never stops or clones them.
 * Normal volume uses native playback without creating a Web Audio context.
 */
export function createAudioPlayback(options: PlaybackOptions) {
  const entries = new Map<string, Entry>();
  const gains = new Map<string, number>();
  const sinks = new WeakMap<Sink, Promise<void>>();
  const warn = options.warn ?? ((error: unknown) => console.warn('[AudioPlayback]', error));
  let volume = clampAudioGain(options.volume),
    output = options.output,
    outputError = '',
    outputRevision = 0,
    generation = 0,
    deafened = false,
    context: PlaybackContext | null = null;
  const current = (entry: Entry) => entries.get(entry.key) === entry;
  const gainFor = (key: string) => gains.get(key) ?? 100;
  const effectiveGain = (key: string) => (volume / 100) * (gainFor(key) / 100);
  const outputMatches = (ctx: PlaybackContext) =>
    typeof ctx.setSinkId === 'function' ? ctx.sinkId === output : !output;

  function closeGraph(entry: Entry) {
    entry.graph?.close();
    entry.graph = null;
  }
  function route(sink: Sink, active: () => boolean): Promise<void> {
    const setSink = sink.setSinkId?.bind(sink);
    if (!setSink) return Promise.resolve();
    const previous = sinks.get(sink);
    // Serialize physical sink changes. A slow old success must not leave the
    // device on the old route after a newer selection has already completed.
    const run = async () => {
      if (!active()) return;
      const target = output,
        revision = outputRevision;
      if (sink.sinkId === target) return;
      try {
        await setSink(target);
      } catch (error) {
        if (!active() || revision !== outputRevision) return;
        warn(error);
        if (!target) {
          outputError = `${errorName(error)} — saída padrão indisponível`;
          options.onOutputFallback(true);
          options.onChange();
          return;
        }
        outputError = `${errorName(error)} — saída escolhida indisponível`;
        output = '';
        const fallbackRevision = ++outputRevision;
        // Other players and the gain context must follow the same fallback.
        refresh();
        void routeAll();
        try {
          await setSink('');
          if (active() && fallbackRevision === outputRevision) options.onOutputFallback(false);
        } catch (fallback) {
          if (!active() || fallbackRevision !== outputRevision) return;
          outputError = `${errorName(fallback)} — saída padrão indisponível`;
          options.onOutputFallback(true);
        }
        if (active() && fallbackRevision === outputRevision) options.onChange();
      }
    };
    const request = previous ? previous.then(run) : run();
    sinks.set(sink, request);
    void request.finally(() => {
      if (sinks.get(sink) === request) sinks.delete(sink);
    });
    return request;
  }
  function play(entry: Entry): Promise<void> {
    if (entry.play) return entry.play;
    // Call play synchronously in the user gesture, before awaiting sink routing.
    const playing = (async () => {
      try {
        const routed = route(entry.audio, () => current(entry));
        const started = entry.audio.play();
        await Promise.all([routed, started]);
        if (!current(entry) || entry.route !== 'direct') return;
        entry.blocked = false;
        entry.error = '';
      } catch (error) {
        if (!current(entry) || entry.route !== 'direct' || errorName(error) === 'AbortError')
          return;
        entry.blocked = true;
        entry.error = errorName(error);
        options.onBlocked();
      }
    })();
    entry.play = playing;
    void playing.then(() => {
      if (entry.play === playing) entry.play = null;
      if (current(entry)) options.onChange();
    });
    return playing;
  }
  function ensureContext() {
    if (context && context.state !== 'closed') return context;
    try {
      const ctx = options.createContext();
      if (!ctx) return null;
      context = ctx;
      const active = () => context === ctx;
      ctx.onstatechange = () => {
        if (!active()) return;
        refresh();
        options.onChange();
      };
      void route(ctx, active).then(() => {
        if (active()) refresh();
      });
      return ctx;
    } catch (error) {
      warn(error);
      return null;
    }
  }
  function resume(ctx: AudioContext) {
    if (ctx.state !== 'suspended') return;
    void ctx
      .resume()
      .then(() => {
        if (context === ctx) refresh();
      })
      .catch(warn);
  }
  function update(entry: Entry) {
    const gain = effectiveGain(entry.key);
    const blocked = deafened || !!options.moderated?.(entry.key);
    if (
      entry.graph &&
      (gain <= 1 || entry.graph.ctx.state !== 'running' || !outputMatches(entry.graph.ctx))
    )
      closeGraph(entry);
    if (!entry.graph && gain > 1) {
      const ctx = ensureContext();
      if (ctx) resume(ctx);
      if (ctx?.state === 'running' && outputMatches(ctx)) {
        try {
          entry.graph = createAudioGain(ctx, entry.stream, blocked ? 0 : gain);
        } catch (error) {
          warn(error);
        }
      }
    }
    entry.route = entry.graph ? 'gain' : 'direct';
    if (entry.graph) {
      entry.blocked = false;
      entry.graph.gain.gain.setTargetAtTime(blocked ? 0 : gain, entry.graph.ctx.currentTime, 0.012);
    }
    entry.audio.muted = blocked || entry.route === 'gain';
    entry.audio.volume = blocked ? 0 : Math.min(1, gain);
    if (entry.route === 'direct') void play(entry);
  }
  function refresh() {
    for (const entry of entries.values()) update(entry);
  }
  function routeAll() {
    const requests = [...entries.values()].map((entry) => route(entry.audio, () => current(entry)));
    const ctx = context;
    if (ctx)
      requests.push(
        route(ctx, () => context === ctx).then(() => {
          if (context === ctx) refresh();
        }),
      );
    return Promise.all(requests);
  }
  function remove(key: string) {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    closeGraph(entry);
    entry.audio.pause();
    entry.audio.srcObject = null;
    entry.audio.remove();
    options.onChange();
  }
  function attach(key: string, track: MediaStreamTrack): MediaStream | null {
    if (track.readyState !== 'live') {
      remove(key);
      return null;
    }
    let entry = entries.get(key);
    if (entry?.track !== track) {
      remove(key);
      const stream = options.createStream(track),
        audio = options.createAudio(key);
      audio.srcObject = stream;
      entry = {
        key,
        track,
        stream,
        audio,
        graph: null,
        route: 'direct',
        error: '',
        blocked: false,
        play: null,
      };
      entries.set(key, entry);
    }
    update(entry);
    return entry.stream;
  }
  async function setOutput(device: string) {
    output = device;
    outputError = '';
    const revision = ++outputRevision,
      call = generation;
    refresh();
    await routeAll();
    if (call !== generation || revision !== outputRevision) return false;
    refresh();
    options.onChange();
    return !outputError;
  }
  function reset() {
    generation++;
    for (const key of [...entries.keys()]) remove(key);
    const ctx = context;
    context = null;
    if (ctx) {
      ctx.onstatechange = null;
      void ctx.close().catch(warn);
    }
    deafened = false;
    options.onChange();
  }
  return {
    attach,
    remove,
    reset,
    refresh,
    setOutput,
    unlock() {
      if (context) resume(context);
      for (const entry of entries.values()) if (entry.route === 'direct') void play(entry);
    },
    setVolume(value: unknown) {
      volume = clampAudioGain(value);
      refresh();
    },
    setGain(key: string, value: unknown) {
      gains.set(key, clampAudioGain(value));
      const entry = entries.get(key);
      if (entry) update(entry);
    },
    getGain: gainFor,
    hasGain: (key: string) => gains.has(key),
    clearVoiceGains() {
      for (const key of gains.keys()) if (!key.startsWith('stream:')) gains.delete(key);
      refresh();
    },
    setDeafened(value: boolean) {
      deafened = value;
      refresh();
    },
    getSnapshot() {
      return Object.freeze({
        volume,
        output,
        outputError,
        context: context?.state ?? null,
        entries: Object.freeze(
          [...entries.values()].map((entry) =>
            Object.freeze({
              key: entry.key,
              route: entry.route,
              blocked: entry.blocked,
              error: entry.error,
              paused: entry.audio.paused,
              gain: gainFor(entry.key),
            }),
          ),
        ),
      });
    },
  };
}
