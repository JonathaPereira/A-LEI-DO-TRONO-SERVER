export const MAX_SECONDS = 15,
  MAX_BYTES = 44 + 48000 * 2 * 2 * MAX_SECONDS;
const invalid = (code: 'INVALID_SOUND' | 'SOUND_TOO_LONG', message: string) =>
  Object.assign(Error(message), { code, status: 400 });
// The browser converts decoded uploads to canonical PCM WAV. Read sample counts,
// not client-provided duration/metadata, so renamed files cannot bypass the limit.
export function validateSound(buffer: unknown) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 46 ||
    buffer.length > MAX_BYTES ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.readUInt32LE(4) !== buffer.length - 8 ||
    buffer.toString('ascii', 8, 12) !== 'WAVE' ||
    buffer.toString('ascii', 12, 16) !== 'fmt ' ||
    buffer.readUInt32LE(16) !== 16 ||
    buffer.readUInt16LE(20) !== 1 ||
    buffer.toString('ascii', 36, 40) !== 'data' ||
    buffer.readUInt32LE(40) !== buffer.length - 44
  )
    throw invalid('INVALID_SOUND', 'Envie áudio WAV PCM de 16 bits, com até 15 segundos.');
  const channels = buffer.readUInt16LE(22),
    rate = buffer.readUInt32LE(24),
    bytesPerSecond = buffer.readUInt32LE(28),
    block = buffer.readUInt16LE(32),
    bits = buffer.readUInt16LE(34),
    dataBytes = buffer.length - 44;
  if (
    ![1, 2].includes(channels) ||
    rate < 8000 ||
    rate > 48000 ||
    bits !== 16 ||
    block !== channels * 2 ||
    bytesPerSecond !== rate * block ||
    dataBytes % block
  )
    throw invalid('INVALID_SOUND', 'Formato de áudio inválido.');
  const frames = dataBytes / block;
  if (frames > rate * MAX_SECONDS)
    throw invalid('SOUND_TOO_LONG', 'O efeito sonoro pode ter no máximo 15 segundos.');
  return { mime: 'audio/wav' as const, durationMs: Math.ceil((frames * 1000) / rate) };
}
