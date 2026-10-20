import type {
  AudioWorkletProcessorConstructor,
  AudioWorkletRegistration,
} from '../../../types/audio-worklet';

declare const AudioWorkletProcessor: AudioWorkletProcessorConstructor;
declare const sampleRate: number;
declare const registerProcessor: AudioWorkletRegistration;

class ApplicationAudioProcessor extends AudioWorkletProcessor {
  private queue: Float32Array[];
  private offset: number;
  private frames: number;
  private started: boolean;
  constructor() {
    super();
    this.queue = [];
    this.offset = 0;
    this.frames = 0;
    this.started = false;
    this.port.onmessage = (event) => {
      const audio = event.data;
      if (!(audio instanceof Float32Array) || audio.length % 2) return;
      this.queue.push(audio);
      this.frames += audio.length / 2;
      while (this.frames > sampleRate && this.queue.length > 1) {
        this.frames -= (this.queue[0].length - this.offset) / 2;
        this.queue.shift();
        this.offset = 0;
      }
    };
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channels = outputs[0];
    for (const channel of channels) channel.fill(0);
    if (!this.started) {
      if (this.frames < sampleRate * 0.06) return true;
      this.started = true;
    }
    for (let frame = 0; frame < channels[0].length; frame++) {
      const audio = this.queue[0];
      if (!audio) {
        this.started = false;
        break;
      }
      channels[0][frame] = audio[this.offset++];
      if (channels[1]) channels[1][frame] = audio[this.offset++];
      else this.offset++;
      this.frames--;
      if (this.offset >= audio.length) {
        this.queue.shift();
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('mn-application-audio', ApplicationAudioProcessor);
