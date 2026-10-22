// Lightweight downward expander: no model, FFT, allocations or messages per block.
// It attenuates the background BETWEEN phrases, not noise mixed with speech.
import type {
  AudioWorkletProcessorConstructor,
  AudioWorkletRegistration,
} from '../../../types/audio-worklet';

declare const AudioWorkletProcessor: AudioWorkletProcessorConstructor;
declare const sampleRate: number;
declare const registerProcessor: AudioWorkletRegistration;

class TronoLightNoiseProcessor extends AudioWorkletProcessor {
  private stopped: boolean;
  private gain: number;
  private floor: number;
  private minimum: number;
  private frames: number;
  private hold: number;
  constructor() {
    super();
    this.stopped = false;
    this.gain = 1;
    this.floor = 0.0012;
    this.minimum = 1;
    this.frames = 0;
    this.hold = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'destroy') this.stopped = true;
    };
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.stopped) return false;
    const input = inputs[0]?.[0],
      output = outputs[0]?.[0];
    if (!input || !output) return true;
    let energy = 0;
    for (let i = 0; i < input.length; i++) energy += input[i] * input[i];
    const rms = Math.sqrt(energy / input.length);
    this.minimum = Math.min(this.minimum, rms);
    this.frames += input.length;
    // Short-window minima avoid following every syllable. Cap the threshold so
    // learning never turns into an increasingly aggressive silence detector.
    if (this.frames >= sampleRate * 0.3) {
      const estimate = Math.min(0.006, Math.max(0.00035, this.minimum));
      this.floor += 0.35 * (estimate - this.floor);
      this.minimum = 1;
      this.frames = 0;
    }
    const threshold = Math.min(0.012, Math.max(0.001, this.floor * 2.2));
    if (rms >= threshold) this.hold = sampleRate * 0.18;
    else this.hold = Math.max(0, this.hold - input.length);
    const target = this.hold > 0 ? 1 : 0.18 + 0.82 * Math.min(1, Math.pow(rms / threshold, 3));
    const speed = 1 - Math.exp(-1 / (sampleRate * (target > this.gain ? 0.006 : 0.12)));
    for (let i = 0; i < output.length; i++) {
      this.gain += (target - this.gain) * speed;
      output[i] = (input[i] || 0) * this.gain;
    }
    return true;
  }
}
registerProcessor('trono-light-noise', TronoLightNoiseProcessor);
