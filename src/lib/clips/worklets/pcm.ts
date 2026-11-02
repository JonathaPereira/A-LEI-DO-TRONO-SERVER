import type {
  AudioWorkletProcessorConstructor,
  AudioWorkletRegistration,
} from '../../../types/audio-worklet';
declare const AudioWorkletProcessor: AudioWorkletProcessorConstructor;
declare const registerProcessor: AudioWorkletRegistration;
declare const currentTime: number;
declare const sampleRate: number;
class ClipPCM extends AudioWorkletProcessor {
  private samples = new Float32Array(4096);
  private frames = 0;
  private credit = true;
  private time = 0;
  // Keep at most one second of PCM while the encoder acknowledges startup/transport.
  private pending: { time: number; data: ArrayBuffer }[] = [];
  private failed = false;
  constructor() {
    super();
    this.port.onmessage = () => {
      this.credit = true;
      this.flush();
    };
  }
  private flush() {
    if (!this.credit || this.failed) return;
    const packet = this.pending.shift();
    if (!packet) return;
    this.credit = false;
    this.port.postMessage(packet, [packet.data]);
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    outputs[0]?.forEach((channel) => channel.fill(0));
    const channels = inputs[0];
    if (!channels?.[0] || this.failed) return true;
    for (let i = 0; i < channels[0].length; i++) {
      if (!this.frames) this.time = currentTime + i / sampleRate;
      this.samples[this.frames * 2] = channels[0][i];
      this.samples[this.frames * 2 + 1] = (channels[1] || channels[0])[i];
      this.frames++;
      if (this.frames === 2048) {
        if (this.pending.length >= Math.ceil(sampleRate / 2048)) {
          this.failed = true;
          this.pending.length = 0;
          this.port.postMessage({
            error: 'O envio do áudio atrasou demais. Reduza a qualidade ou reinicie a captura.',
          });
          return true;
        }
        this.pending.push({ time: this.time, data: this.samples.buffer });
        this.samples = new Float32Array(4096);
        this.frames = 0;
        this.flush();
      }
    }
    return true;
  }
}
registerProcessor('mn-clip-pcm', ClipPCM);
