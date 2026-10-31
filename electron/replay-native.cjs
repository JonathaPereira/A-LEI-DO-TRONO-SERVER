'use strict';
const { spawn } = require('node:child_process'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { ReplayBuffer } = require('./replay-buffer.cjs'),
  { replayHeader, replayPacket } = require('./replay-input.cjs');
const MAX = 256 * 1048576;
function run(executable, args, { input, timeout = 15000, maxOutput = MAX, onSpawn } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }),
      parts = [];
    onSpawn?.(child);
    let bytes = 0,
      error = '',
      done = false;
    const timer = setTimeout(() => {
      child.kill();
      finish(Error('Tempo de codificação excedido.'));
    }, timeout);
    const finish = (failure, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      failure ? reject(failure) : resolve(value);
    };
    child.on('error', finish);
    child.stderr.on('data', (b) => {
      error = (error + b.toString()).slice(-4000);
    });
    child.stdout.on('data', (b) => {
      bytes += b.length;
      if (bytes > maxOutput) {
        child.kill();
        finish(Error('Saída do codificador excedeu o limite.'));
      } else parts.push(b);
    });
    child.on('close', (code) =>
      finish(
        code === 0 ? null : Error(error || 'O codificador encerrou inesperadamente.'),
        Buffer.concat(parts),
      ),
    );
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
function readConfig(c) {
  if (
    !c ||
    !Number.isInteger(c.width) ||
    !Number.isInteger(c.height) ||
    c.width < 16 ||
    c.height < 16 ||
    c.width > 2560 ||
    c.height > 1440 ||
    c.width % 2 ||
    c.height % 2 ||
    ![30, 60].includes(c.fps) ||
    ![15, 30, 60, 120].includes(c.seconds) ||
    typeof c.audio !== 'boolean' ||
    !Number.isInteger(c.bitrate) ||
    c.bitrate < 500000 ||
    c.bitrate > 64000000
  )
    throw Error('Configuração de clipes inválida.');
  return {
    width: c.width,
    height: c.height,
    fps: c.fps,
    seconds: c.seconds,
    audio: c.audio,
    bitrate: c.bitrate,
  };
}
function encoderArgs(encoder) {
  return encoder === 'h264_nvenc'
    ? ['-c:v', encoder, '-preset', 'p4', '-tune', 'hq', '-rc', 'vbr', '-cq', '21']
    : encoder === 'h264_mf'
      ? ['-c:v', encoder, '-hw_encoding', '0']
      : ['-c:v', encoder, '-preset', 'ultrafast'];
}
/** Native encoder owns only encoded buffers/processes. The renderer owns selected capture tracks. */
function createNativeReplay({
  executable,
  directory,
  publish,
  encoder = 'h264_nvenc',
  encoderLabel = 'NVIDIA NVENC',
  spawnProcess = spawn,
}) {
  let current = null,
    disposed = false,
    probe = null;
  const exports = new Set();
  const children = new Set();
  const track = (child) => {
    children.add(child);
    child.once('close', () => children.delete(child));
  };
  async function capability() {
    if (disposed) throw Error('Codificador encerrado.');
    if (!probe)
      probe = run(
        executable,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'color=size=256x144:rate=30',
          '-frames:v',
          '3',
          '-an',
          ...encoderArgs(encoder),
          '-pix_fmt',
          'nv12',
          '-f',
          'null',
          '-',
        ],
        { timeout: 8000, maxOutput: 1048576, onSpawn: track },
      ).then(
        () => ({ available: true, encoder: encoderLabel }),
        () => ({
          available: false,
          encoder: encoderLabel,
          reason: 'NVENC indisponível. Confira a placa NVIDIA e o driver ou use Compatível.',
        }),
      );
    return probe;
  }
  function stop(id) {
    const job = current;
    if (!job || id !== job.id) return false;
    current = null;
    job.stopping = true;
    job.process.stdin.end();
    const timer = setTimeout(() => job.process.kill(), 1500);
    timer.unref();
    job.process.once('close', () => clearTimeout(timer));
    job.buffer.clear();
    return true;
  }
  async function start(value) {
    if (disposed) throw Error('Codificador encerrado.');
    const config = readConfig(value);
    const available = await capability();
    if (!available.available) throw Error(available.reason);
    if (disposed) throw Error('Codificador encerrado.');
    if (current) throw Error('Já existe uma captura nativa ativa.');
    const id = crypto.randomUUID(),
      maxBytes = Math.min(
        MAX,
        Math.max(64 * 1048576, Math.ceil((config.bitrate / 8) * (config.seconds + 4) * 1.15)),
      ),
      buffer = new ReplayBuffer({ seconds: config.seconds, maxBytes });
    const args = [
      '-hide_banner',
      '-loglevel',
      'warning',
      '-analyzeduration',
      '0',
      '-probesize',
      '32768',
      '-f',
      'matroska',
      '-i',
      'pipe:0',
      '-map',
      '0:v:0',
      ...(config.audio
        ? ['-map', '0:a:0', '-af', 'aresample=async=1:first_pts=0', '-c:a', 'aac', '-b:a', '160k']
        : ['-an']),
      '-vf',
      'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=nv12',
      ...encoderArgs(encoder),
      '-b:v',
      String(config.bitrate),
      '-maxrate',
      String(Math.round(config.bitrate * 1.5)),
      '-bufsize',
      String(config.bitrate * 2),
      '-r',
      String(config.fps),
      '-fps_mode',
      'cfr',
      '-g',
      String(config.fps * 2),
      '-bf',
      '0',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-colorspace',
      'bt709',
      '-movflags',
      '+frag_keyframe+empty_moov+default_base_moof',
      '-frag_duration',
      '250000',
      '-flush_packets',
      '1',
      '-f',
      'mp4',
      'pipe:1',
    ];
    const process = spawnProcess(executable, args, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
      job = {
        id,
        config,
        process,
        buffer,
        stopping: false,
        error: '',
        queued: 0,
        last: [-1, -1],
        started: performance.now(),
        lastNotice: 0,
        lastReady: false,
      };
    current = job;
    track(process);
    const failed = (error) => {
      if (current !== job || job.stopping) return;
      publish({ id, error: error instanceof Error ? error.message : 'Falha no NVENC.' });
      stop(id);
    };
    process.on('error', failed);
    process.stdin.on('error', failed);
    process.stderr.on('data', (b) => {
      job.error = (job.error + b.toString()).slice(-3000);
    });
    process.stdout.on('data', (data) => {
      if (current !== job) return;
      try {
        const status = buffer.append(data),
          now = performance.now();
        if (status.ready !== job.lastReady || now - job.lastNotice > 200 || !job.lastNotice) {
          job.lastNotice = now;
          job.lastReady = status.ready;
          publish({ id, ...status, encoder: encoderLabel });
        }
      } catch (error) {
        failed(error);
      }
    });
    process.on('close', (code) => {
      if (!job.stopping)
        failed(
          Error(
            code === 0 ? 'O codificador foi interrompido.' : job.error || 'O codificador falhou.',
          ),
        );
    });
    process.stdin.write(replayHeader(config));
    return { id, encoder: encoderLabel, maxBytes };
  }
  async function packet(value) {
    const job = current;
    if (!job || job.id !== value?.id || job.stopping) return false;
    const video = value.kind === 'video',
      audio = value.kind === 'audio';
    if (!video && !audio) throw Error('Pacote de clipe inválido.');
    const data =
      value.data instanceof Uint8Array
        ? Buffer.from(value.data.buffer, value.data.byteOffset, value.data.byteLength)
        : value.data instanceof ArrayBuffer
          ? Buffer.from(value.data)
          : null;
    const expected = job.config.width * job.config.height * 4;
    if (
      !data ||
      (video && data.length !== expected) ||
      (audio && (!job.config.audio || !data.length || data.length > 65536 || data.length % 8)) ||
      !Number.isFinite(value.ms) ||
      value.ms < 0 ||
      value.ms > performance.now() - job.started + 3000
    )
      throw Error('Dados de clipe inválidos.');
    const slot = video ? 0 : 1;
    if (value.ms < job.last[slot]) return false;
    if (job.queued >= 4) return false;
    job.last[slot] = value.ms;
    job.queued++;
    try {
      await new Promise((resolve, reject) =>
        job.process.stdin.write(replayPacket(video ? 1 : 2, value.ms, data), (error) =>
          error ? reject(error) : resolve(),
        ),
      );
      return true;
    } finally {
      job.queued--;
    }
  }
  async function clip(id) {
    const job = current;
    if (!job || job.id !== id || job.stopping) throw Error('Captura nativa desligada.');
    if (exports.size >= 2) throw Error('Aguarde os clipes em preparação.');
    const snapshot = job.buffer.snapshot();
    if (snapshot.data.length > MAX) throw Error('Clipe acima do limite de memória.');
    const token = crypto.randomUUID();
    exports.add(token);
    let folder;
    try {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      folder = await fs.mkdtemp(path.join(directory, 'clip-'));
      await fs.writeFile(path.join(folder, 'input.mp4'), snapshot.data, { mode: 0o600 });
      await run(
        executable,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          path.join(folder, 'input.mp4'),
          '-map',
          '0',
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          '-avoid_negative_ts',
          'make_zero',
          path.join(folder, 'clip.mp4'),
        ],
        { timeout: 20000, maxOutput: 1048576, onSpawn: track },
      );
      const stat = await fs.stat(path.join(folder, 'clip.mp4'));
      if (stat.size > MAX) throw Error('Clipe acima do limite local.');
      const data = await fs.readFile(path.join(folder, 'clip.mp4'));
      return { data, duration: snapshot.duration, bytes: data.length };
    } finally {
      exports.delete(token);
      if (folder) await fs.rm(folder, { recursive: true, force: true }).catch(() => {});
    }
  }
  return {
    capability,
    start,
    packet,
    clip,
    stop,
    stopActive() {
      if (current) stop(current.id);
    },
    async dispose() {
      disposed = true;
      if (current) stop(current.id);
      for (const child of children) child.kill();
    },
    get active() {
      return !!current;
    },
  };
}
module.exports = { createNativeReplay, readConfig, run };
