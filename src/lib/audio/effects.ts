/** Original procedural effects. Owns scheduled sources and disconnects their graphs on completion. */
export function createGameEffects() {
  let disposed = false;
  const resources = new Map<AudioScheduledSourceNode, () => void>();
  function keep(source: AudioScheduledSourceNode, nodes: AudioNode[]) {
    const release = () => {
      source.removeEventListener('ended', release);
      resources.delete(source);
      for (const node of nodes) node.disconnect();
    };
    resources.set(source, release);
    source.addEventListener('ended', release, { once: true });
  }
  function play(audioCtx: AudioContext, destination: AudioNode, kind: string) {
    if (disposed) return;
    function tone(
      freq: number,
      when: number,
      dur = 0.45,
      vol = 0.08,
      type: OscillatorType = 'triangle',
      destination: AudioNode,
      attack = 0.018,
      cutoff = 1800,
    ) {
      if (!audioCtx || !destination) return;
      const osc = audioCtx.createOscillator(),
        gain = audioCtx.createGain(),
        filter = audioCtx.createBiquadFilter();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, when);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(cutoff, when);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(destination);
      keep(osc, [osc, filter, gain]);
      osc.start(when);
      osc.stop(when + dur + 0.06);
    }
    function noiseHit(when: number, dur = 0.1, vol = 0.03, destination: AudioNode, cutoff = 700) {
      if (!audioCtx || !destination) return;
      const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
      const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate),
        data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = audioCtx.createBufferSource(),
        filter = audioCtx.createBiquadFilter(),
        gain = audioCtx.createGain();
      src.buffer = buffer;
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(destination);
      keep(src, [src, filter, gain]);
      src.start(when);
      src.stop(when + dur);
    }

    const t = audioCtx.currentTime + 0.01;
    if (kind === 'splendor-card' || kind === 'love-letter-card') {
      noiseHit(t, 0.16, 0.095, destination, 4200);
      noiseHit(t + 0.11, 0.12, 0.065, destination, 3000);
      noiseHit(t + 0.23, 0.065, 0.035, destination, 1900);
      tone(180, t + 0.22, 0.13, 0.035, 'triangle', destination, 0.004, 1100);
    } else if (kind === 'splendor-chip') {
      tone(1580, t, 0.18, 0.052, 'sine', destination, 0.002, 3600);
      tone(2250, t + 0.065, 0.22, 0.04, 'sine', destination, 0.002, 4200);
      noiseHit(t, 0.035, 0.014, destination, 2700);
    } else if (kind === 'splendor-score' || kind === 'love-letter-score') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(f, t + i * 0.11, 0.45, 0.032, 'sine', destination, 0.006, 3600),
      );
    } else if (kind === 'splendor-noble') {
      [392, 493.88, 587.33, 783.99].forEach((f, i) =>
        tone(f, t + i * 0.13, 0.65, 0.035, 'triangle', destination, 0.015, 2600),
      );
    } else if (kind === 'azul-pick') {
      // Short original ceramic taps, routed through the existing effects bus.
      tone(1840, t, 0.11, 0.045, 'sine', destination, 0.002, 4200);
      tone(2460, t + 0.025, 0.09, 0.018, 'sine', destination, 0.002, 4800);
    } else if (kind === 'azul-place') {
      tone(1230, t, 0.14, 0.045, 'triangle', destination, 0.003, 3000);
      tone(820, t + 0.025, 0.18, 0.025, 'sine', destination, 0.003, 2400);
    } else if (kind === 'azul-score') {
      tone(659.25, t, 0.3, 0.055, 'sine', destination, 0.008, 3300);
      tone(987.77, t + 0.1, 0.4, 0.045, 'sine', destination, 0.008, 3800);
      tone(1318.51, t + 0.2, 0.48, 0.028, 'sine', destination, 0.012, 4200);
    } else if (kind === 'azul-penalty') {
      tone(392, t, 0.22, 0.04, 'triangle', destination, 0.006, 1800);
      tone(293.66, t + 0.1, 0.35, 0.035, 'sine', destination, 0.008, 1600);
    } else if (kind === 'click') {
      tone(720, t, 0.055, 0.025, 'sine', destination, 0.004, 2600);
      tone(520, t + 0.025, 0.045, 0.012, 'triangle', destination, 0.003, 1800);
    } else if (kind === 'card') {
      noiseHit(t, 0.055, 0.055, destination, 1700);
      tone(170, t, 0.1, 0.035, 'triangle', destination, 0.006, 900);
    } else if (kind === 'crown') {
      tone(293.66, t, 0.75, 0.14, 'triangle', destination, 0.02, 2200);
      tone(369.99, t + 0.11, 0.78, 0.12, 'triangle', destination, 0.02, 2400);
      tone(440, t + 0.24, 1.05, 0.13, 'sine', destination, 0.025, 2600);
      tone(587.33, t + 0.42, 0.85, 0.08, 'sine', destination, 0.02, 2800);
    } else if (kind === 'shadow') {
      tone(174.61, t, 1.25, 0.13, 'sawtooth', destination, 0.04, 900);
      tone(146.83, t + 0.18, 1.45, 0.11, 'triangle', destination, 0.04, 700);
      noiseHit(t + 0.05, 0.7, 0.028, destination, 420);
    } else if (kind === 'influence') {
      tone(659.25, t, 0.48, 0.11, 'sine', destination, 0.01, 3000);
      tone(783.99, t + 0.13, 0.58, 0.1, 'sine', destination, 0.01, 3200);
    } else if (kind === 'decree') {
      noiseHit(t, 0.22, 0.035, destination, 850);
      tone(220, t, 0.42, 0.06, 'triangle', destination, 0.02, 1200);
    } else if (kind === 'turn') {
      // Arauto curto, mais audível: três notas ascendentes + sino agudo.
      tone(392.0, t, 0.24, 0.12, 'triangle', destination, 0.006, 2200);
      tone(523.25, t + 0.1, 0.32, 0.13, 'sine', destination, 0.006, 2800);
      tone(659.25, t + 0.22, 0.38, 0.12, 'triangle', destination, 0.006, 3200);
      tone(783.99, t + 0.35, 0.48, 0.075, 'sine', destination, 0.008, 3600);
    }
  }
  return {
    play,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [source, release] of [...resources]) {
        try {
          source.stop();
        } catch {
          /* Already stopped sources still need disconnection. */
        }
        release();
      }
    },
  };
}
