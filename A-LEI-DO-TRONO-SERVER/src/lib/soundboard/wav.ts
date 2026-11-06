export type SoundBuffer = Pick<
  AudioBuffer,
  'duration' | 'length' | 'sampleRate' | 'numberOfChannels' | 'getChannelData'
>;

/** Encodes selected PCM frames; the server independently checks the 15 second limit. */
export function encodeWav(buffer: SoundBuffer, start = 0, end = buffer.duration): Blob {
  const channels = Math.min(2, buffer.numberOfChannels),
    rate = buffer.sampleRate;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end > buffer.duration + 0.000001 ||
    end <= start ||
    end - start > 15.000001
  )
    throw Error('Selecione um trecho de até 15 segundos.');
  const first = Math.round(start * rate),
    last = Math.min(buffer.length, Math.round(end * rate)),
    frames = last - first;
  if (
    !Number.isInteger(rate) ||
    rate < 8000 ||
    rate > 48000 ||
    !frames ||
    frames > rate * 15 ||
    channels < 1
  )
    throw Error('Selecione um trecho de até 15 segundos.');
  const out = new ArrayBuffer(44 + frames * channels * 2),
    view = new DataView(out);
  const write = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, out.byteLength - 8, true);
  write(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, out.byteLength - 44, true);
  const samples = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let at = 44;
  for (let frame = first; frame < last; frame++)
    for (let channel = 0; channel < channels; channel++) {
      const value = Math.max(-1, Math.min(1, samples[channel][frame]));
      view.setInt16(at, value < 0 ? value * 32768 : value * 32767, true);
      at += 2;
    }
  return new Blob([out], { type: 'audio/wav' });
}

/** Precomputes the same 3px peak bins as the original 640px waveform, without exposing mutable PCM to React. */
export function waveformPeaks(buffer: SoundBuffer): readonly number[] {
  const data = buffer.getChannelData(0),
    peaks = [];
  for (let x = 0; x < 640; x += 3) {
    const first = Math.floor((x / 640) * data.length),
      last = Math.min(data.length, Math.ceil(((x + 3) / 640) * data.length));
    const step = Math.max(1, Math.floor((last - first) / 80));
    let peak = 0;
    for (let i = first; i < last; i += step) peak = Math.max(peak, Math.abs(data[i]));
    peaks.push(peak);
  }
  return Object.freeze(peaks);
}
