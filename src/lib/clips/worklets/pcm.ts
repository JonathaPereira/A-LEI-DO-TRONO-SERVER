import type {
  AudioWorkletProcessorConstructor,
  AudioWorkletRegistration,
} from '../../../types/audio-worklet';
declare const AudioWorkletProcessor: AudioWorkletProcessorConstructor;
declare const registerProcessor: AudioWorkletRegistration;
declare const currentTime: number;
class ClipPCM extends AudioWorkletProcessor {
  private samples = new Float32Array(4096);
  private frames = 0;
  private credit = true;
  private time = 0;
  constructor() {
    super();
    this.port.onmessage = () => {
      this.credit = true;
    };
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    outputs[0]?.forEach((channel) => channel.fill(0));
    const channels = inputs[0];
    if (!channels?.[0]) return true;
    if (!this.frames) this.time = currentTime;
    for (let i = 0; i < channels[0].length; i++) {
      this.samples[this.frames * 2] = channels[0][i];
      this.samples[this.frames * 2 + 1] = (channels[1] || channels[0])[i];
      this.frames++;
      if (this.frames === 2048) {
        if (this.credit) {
          const data = this.samples.buffer;
          this.port.postMessage({ time: this.time, data }, [data]);
          this.samples = new Float32Array(4096);
          this.credit = false;
        }
        this.frames = 0;
      }
    }
    return true;
  }
}
registerProcessor('mn-clip-pcm', ClipPCM);
