interface Settings {
  enabled: boolean;
  hidden: boolean;
  foreground: boolean;
  lightMode: boolean;
}
interface Options {
  getSettings(): Settings;
  getContext(): AudioContext | null | Promise<AudioContext | null>;
  createStream(track: MediaStreamTrack): MediaStream;
  windowEvents: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  documentEvents: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  onChange(): void;
  now?: () => number;
  warn?: (error: unknown) => void;
}
interface Meter {
  readonly context: AudioContext;
  readonly source: MediaStreamAudioSourceNode;
  readonly analyser: AnalyserNode;
  readonly data: Uint8Array<ArrayBuffer>;
  connected: boolean;
  lastVoice: number;
  timer: ReturnType<typeof setTimeout> | undefined;
}
interface Entry {
  readonly id: string;
  readonly track: MediaStreamTrack;
  readonly onEnded: () => void;
  promise: Promise<void> | null;
  meter: Meter | null;
}
interface ContextBinding {
  readonly entries: Set<Entry>;
  readonly onState: () => void;
}

/** Owns visual analysis nodes, speaking state, listeners and timers.
 * The context and original audio track are borrowed. Nothing connects to the
 * speaker destination, resumes/closes the context, or changes capture/playback.
 */
export function createSpeakingIndicators(options: Options) {
  const entries = new Map<string, Entry>();
  const speaking = new Set<string>();
  const contexts = new Map<AudioContext, ContextBinding>();
  const now = options.now ?? (() => performance.now());
  const warn = options.warn ?? ((error: unknown) => console.warn('[SpeakingIndicators]', error));
  let listening = false;
  const current = (entry: Entry) => entries.get(entry.id) === entry;

  function setSpeaking(id: string, value: boolean) {
    if (speaking.has(id) === value) return;
    if (value) speaking.add(id);
    else speaking.delete(id);
    options.onChange();
  }
  function disconnect(node: AudioNode) {
    try {
      node.disconnect();
    } catch (error) {
      warn(error);
    }
  }
  function clearTimer(meter: Meter) {
    clearTimeout(meter.timer);
    meter.timer = undefined;
  }
  function syncListeners() {
    const active = entries.size > 0;
    if (active === listening) return;
    listening = active;
    const method = active ? 'addEventListener' : 'removeEventListener';
    options.windowEvents[method]('focus', refresh);
    options.windowEvents[method]('blur', refresh);
    options.documentEvents[method]('visibilitychange', refresh);
  }
  function bindContext(entry: Entry, context: AudioContext) {
    let binding = contexts.get(context);
    if (!binding) {
      const members = new Set<Entry>();
      const onState = () => {
        if (contexts.get(context)?.entries !== members) return;
        for (const member of [...members]) update(member);
      };
      binding = { entries: members, onState };
      contexts.set(context, binding);
      context.addEventListener('statechange', onState);
    }
    binding.entries.add(entry);
  }
  function release(entry: Entry) {
    entry.track.removeEventListener('ended', entry.onEnded);
    const meter = entry.meter;
    if (!meter) return;
    entry.meter = null;
    clearTimer(meter);
    disconnect(meter.source);
    disconnect(meter.analyser);
    const binding = contexts.get(meter.context);
    binding?.entries.delete(entry);
    if (binding && !binding.entries.size) {
      meter.context.removeEventListener('statechange', binding.onState);
      contexts.delete(meter.context);
    }
  }
  function remove(id: string) {
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    release(entry);
    syncListeners();
    setSpeaking(id, false);
  }
  function pause(entry: Entry, meter: Meter) {
    clearTimer(meter);
    if (meter.connected) {
      disconnect(meter.source);
      meter.connected = false;
    }
    meter.lastVoice = -Infinity;
    setSpeaking(entry.id, false);
  }
  function update(entry: Entry) {
    if (!current(entry) || !entry.meter) return;
    const meter = entry.meter,
      settings = options.getSettings();
    clearTimer(meter);
    if (
      !settings.enabled ||
      entry.track.readyState !== 'live' ||
      meter.context.state === 'closed'
    ) {
      remove(entry.id);
      return;
    }
    if (settings.hidden || meter.context.state !== 'running') {
      pause(entry, meter);
      return;
    }
    try {
      if (!meter.connected) {
        meter.source.connect(meter.analyser);
        meter.connected = true;
      }
      meter.analyser.getByteTimeDomainData(meter.data);
      let sum = 0;
      for (const value of meter.data) {
        const sample = (value - 128) / 128;
        sum += sample * sample;
      }
      const stamp = now(),
        rms = Math.sqrt(sum / meter.data.length);
      if (rms > 0.042) meter.lastVoice = stamp;
      setSpeaking(entry.id, stamp - meter.lastVoice < 300);
      // A consumer may remove/reset an entry while responding to onChange.
      if (current(entry) && entry.meter === meter) {
        const delay = !settings.foreground ? 500 : settings.lightMode ? 200 : 100;
        meter.timer = setTimeout(() => update(entry), delay);
      }
    } catch (error) {
      remove(entry.id);
      warn(error);
    }
  }
  function refresh() {
    if (!options.getSettings().enabled) {
      reset();
      return;
    }
    for (const entry of [...entries.values()]) update(entry);
  }
  function watch(id: string, stream: MediaStream | null | undefined): Promise<void> {
    const track = stream?.getAudioTracks()[0];
    if (!id || !track || track.readyState !== 'live' || !options.getSettings().enabled) {
      remove(id);
      return Promise.resolve();
    }
    const previous = entries.get(id);
    if (previous?.track === track && previous.meter?.context.state !== 'closed')
      return previous.promise ?? Promise.resolve();
    remove(id);
    const entry: Entry = {
      id,
      track,
      meter: null,
      promise: null,
      onEnded: () => {
        if (current(entry)) remove(id);
      },
    };
    entries.set(id, entry);
    track.addEventListener('ended', entry.onEnded);
    syncListeners();
    const request = (async () => {
      let source: MediaStreamAudioSourceNode | undefined, analyser: AnalyserNode | undefined;
      try {
        const context = await options.getContext();
        if (!current(entry)) return;
        if (
          !context ||
          context.state === 'closed' ||
          track.readyState !== 'live' ||
          !options.getSettings().enabled
        ) {
          remove(id);
          return;
        }
        source = context.createMediaStreamSource(options.createStream(track));
        analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.72;
        entry.meter = {
          context,
          source,
          analyser,
          data: new Uint8Array(analyser.fftSize),
          connected: false,
          lastVoice: -Infinity,
          timer: undefined,
        };
        bindContext(entry, context);
        update(entry);
      } catch (error) {
        if (entry.meter) {
          if (current(entry)) remove(id);
        } else {
          if (source) disconnect(source);
          if (analyser) disconnect(analyser);
          if (current(entry)) remove(id);
        }
        warn(error);
      } finally {
        entry.promise = null;
      }
    })();
    entry.promise = request;
    return request;
  }
  function reset() {
    const retired = [...entries.values()],
      changed = speaking.size > 0;
    entries.clear();
    speaking.clear();
    for (const entry of retired) release(entry);
    syncListeners();
    if (changed) options.onChange();
  }
  return {
    watch,
    remove,
    refresh,
    reset,
    isSpeaking: (id: string) => speaking.has(id),
    getSnapshot() {
      const settings = options.getSettings();
      return Object.freeze({
        speaking: Object.freeze([...speaking]),
        meters: [...entries.values()].filter((entry) => !!entry.meter).length,
        running: [...entries.values()].filter((entry) => entry.meter?.timer !== undefined).length,
        pending: [...entries.values()].filter((entry) => !!entry.promise).length,
        mode:
          !settings.enabled || settings.hidden
            ? 'paused'
            : settings.foreground
              ? 'active'
              : 'reduced',
      });
    },
  };
}
