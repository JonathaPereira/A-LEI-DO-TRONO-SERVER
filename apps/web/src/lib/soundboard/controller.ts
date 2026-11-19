import type { FilesClient } from '../files/client';
import type { FileRecord } from '../../types/files';
import type { SocketMessage } from '../../types/socket';
import type { PreferenceStorage } from '../storage/preferences';
import { readFile } from '../files/protocol.ts';
import { encodeWav, waveformPeaks, type SoundBuffer } from './wav.ts';

export interface SoundRecord extends FileRecord {
  readonly durationMs: number;
}
type Player = Pick<
  HTMLAudioElement,
  'pause' | 'load' | 'removeAttribute' | 'play' | 'volume' | 'currentTime'
>;
interface Options {
  files: Pick<FilesClient, 'api' | 'url' | 'upload' | 'remove' | 'getSnapshot' | 'subscribe'>;
  storage: PreferenceStorage;
  decode(file: File, signal: AbortSignal): Promise<SoundBuffer>;
  player(url: string): Player;
  createUrl(blob: Blob): string;
  revokeUrl(url: string): void;
  login(): void;
  send(id: string): boolean;
  confirm(message: string): boolean;
  warn?(error: unknown): void;
}
interface Call {
  readonly joined: boolean;
  readonly deafened: boolean;
  readonly roomId: string | null;
}
interface Clip {
  readonly duration: number;
  readonly peaks: readonly number[];
}
export interface SoundboardSnapshot extends Call {
  readonly accountId: string | null;
  readonly moderateFiles: boolean;
  readonly sounds: readonly SoundRecord[];
  readonly deleting: readonly string[];
  readonly open: boolean;
  readonly volume: number;
  readonly name: string;
  readonly message: string;
  readonly loading: boolean;
  readonly uploading: boolean;
  readonly detailsOpen: boolean;
  readonly fileRevision: number;
  readonly clip: Clip | null;
  readonly trimStart: number;
  readonly trimEnd: number;
}
const sound = (value: unknown): SoundRecord => {
  const file = readFile(value);
  if (
    file.kind !== 'soundboard' ||
    file.deleted ||
    typeof file.durationMs !== 'number' ||
    file.durationMs <= 0 ||
    file.durationMs > 15000
  )
    throw Error('Efeito sonoro inválido.');
  return file as SoundRecord;
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível concluir esta ação.';
const empty = Object.freeze([]);
export function createSoundboard(options: Options) {
  const files = options.files,
    listeners = new Set<() => void>();
  let source = files.getSnapshot(),
    disposed = false,
    started = false,
    generation = 0,
    refreshVersion = 0,
    decodeVersion = 0;
  let player: Player | null = null,
    playerId: string | null = null,
    previewUrl: string | null = null,
    local = false;
  let buffer: SoundBuffer | null = null,
    decoding: AbortController | null = null,
    uploading: AbortController | null = null;
  const deleting = new Set<string>();
  const readVolume = () => {
    const value = Number(
      options.storage.getItem('mnSoundVolume:' + (source.accountId || 'guest')) ?? 70,
    );
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 70;
  };
  let state: SoundboardSnapshot = Object.freeze({
    accountId: source.accountId,
    moderateFiles: source.moderateFiles,
    joined: false,
    deafened: false,
    roomId: null,
    sounds: empty,
    deleting: empty,
    open: false,
    volume: readVolume(),
    name: '',
    message: '',
    loading: false,
    uploading: false,
    detailsOpen: false,
    fileRevision: 0,
    clip: null,
    trimStart: 0,
    trimEnd: 0,
  });
  function update(patch: Partial<SoundboardSnapshot>) {
    if (!disposed) {
      state = Object.freeze({ ...state, ...patch });
      listeners.forEach((listener) => listener());
    }
  }
  function notice(text: string) {
    update({ message: text });
  }
  function release(value: Player | null) {
    if (!value) return;
    try {
      value.pause();
      value.removeAttribute('src');
      value.load();
    } catch (error) {
      options.warn?.(error);
    }
  }
  function stop() {
    generation++;
    const previous = player;
    player = null;
    playerId = null;
    local = false;
    release(previous);
    if (previewUrl) {
      options.revokeUrl(previewUrl);
      previewUrl = null;
    }
  }
  function resetClip() {
    decodeVersion++;
    decoding?.abort();
    decoding = null;
    buffer = null;
    update({ clip: null, trimStart: 0, trimEnd: 0, loading: false });
  }
  function changed() {
    const next = files.getSnapshot(),
      identity = next.epoch !== source.epoch || next.accountId !== source.accountId;
    source = next;
    if (identity) {
      stop();
      refreshVersion++;
      uploading?.abort();
      uploading = null;
      deleting.clear();
      resetClip();
      update({
        accountId: source.accountId,
        moderateFiles: source.moderateFiles,
        sounds: empty,
        deleting: empty,
        open: false,
        volume: readVolume(),
        name: '',
        message: '',
        uploading: false,
        detailsOpen: false,
        fileRevision: state.fileRevision + 1,
      });
    } else {
      if (playerId && source.deleted[playerId]) stop();
      update({
        moderateFiles: source.moderateFiles,
        sounds: Object.freeze(state.sounds.filter((file) => !source.deleted[file.id])),
      });
    }
  }
  let unsubscribe: (() => void) | undefined;
  async function refresh() {
    if (disposed || !source.accountId) return;
    const version = ++refreshVersion,
      epoch = source.epoch,
      list: SoundRecord[] = [],
      ids = new Set<string>();
    let offset = 0;
    for (;;) {
      const page = await files.api('/soundboard?offset=' + offset);
      if (disposed || version !== refreshVersion || epoch !== source.epoch) return;
      if (
        !Array.isArray(page.files) ||
        page.files.length > 200 ||
        typeof page.hasMore !== 'boolean'
      )
        throw Error('Lista de efeitos inválida.');
      for (const raw of page.files) {
        const file = sound(raw);
        if (ids.has(file.id)) throw Error('Lista de efeitos inválida.');
        ids.add(file.id);
        list.push(file);
      }
      if (!page.hasMore) break;
      if (
        typeof page.nextOffset !== 'number' ||
        !Number.isSafeInteger(page.nextOffset) ||
        page.nextOffset <= offset ||
        !page.files.length
      )
        throw Error('Paginação de efeitos inválida.');
      offset = page.nextOffset;
    }
    update({ sounds: Object.freeze(list.filter((file) => !source.deleted[file.id])) });
  }
  async function playFile(file: SoundRecord, preview = false) {
    if (disposed || !source.accountId || source.deleted[file.id] || (!preview && !state.joined))
      return;
    const epoch = source.epoch,
      room = state.roomId;
    if (player && playerId === file.id && local === preview) {
      const version = ++generation,
        current = player;
      try {
        current.pause();
        current.currentTime = 0;
        current.volume = state.deafened && !preview ? 0 : state.volume / 100;
        await current.play();
        if ((disposed || version !== generation) && player !== current) current.pause();
      } catch (error) {
        if (version === generation && !disposed) notice(message(error));
      }
      return;
    }
    stop();
    local = preview;
    const version = generation;
    try {
      const url = await files.url(file.id);
      if (
        disposed ||
        version !== generation ||
        epoch !== source.epoch ||
        source.deleted[file.id] ||
        (!preview && (!state.joined || room !== state.roomId))
      )
        return;
      local = preview;
      playerId = file.id;
      const current = (player = options.player(url));
      current.volume = state.deafened && !preview ? 0 : state.volume / 100;
      await current.play();
      if (disposed || version !== generation) {
        if (player !== current) current.pause();
        return;
      }
      if (preview) notice('Prévia tocando somente para você.');
    } catch (error) {
      if (!disposed && version === generation)
        notice(
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'Clique em Ouvir para permitir o áudio neste navegador.'
            : message(error),
        );
    }
  }
  function changeTrim(kind: 'start' | 'end', value: number) {
    if (disposed || !buffer || uploading || !Number.isFinite(value)) return;
    if (local) stop();
    const minimum = Math.min(0.05, buffer.duration);
    let start = state.trimStart,
      end = state.trimEnd;
    if (kind === 'start') {
      start = Math.max(0, Math.min(value, buffer.duration - minimum));
      end = Math.max(start + minimum, Math.min(end, start + 15, buffer.duration));
    } else {
      end = Math.max(minimum, Math.min(value, buffer.duration));
      start = Math.max(0, Math.min(start, end - minimum));
      if (end - start > 15) start = end - 15;
    }
    update({ trimStart: start, trimEnd: end });
  }
  function close() {
    if (!state.open) return;
    if (local) stop();
    update({ open: false });
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (!disposed) listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (started || disposed) return;
      started = true;
      unsubscribe = files.subscribe(changed);
      changed();
    },
    async open() {
      if (disposed) return;
      if (!source.accountId) {
        options.login();
        return;
      }
      if (state.open) {
        close();
        return;
      }
      const epoch = source.epoch;
      update({ open: true, message: 'Carregando efeitos…' });
      const version = refreshVersion + 1;
      try {
        await refresh();
        if (!disposed && epoch === source.epoch && version === refreshVersion) notice('');
      } catch (error) {
        if (!disposed && epoch === source.epoch && version === refreshVersion)
          notice(message(error));
      }
    },
    close,
    stop,
    refresh,
    encodeWav,
    setName(name: string) {
      if (!uploading) update({ name: name.slice(0, 40) });
    },
    setDetails(open: boolean) {
      update({ detailsOpen: open });
    },
    setVolume(value: number) {
      if (disposed || !Number.isFinite(value)) return;
      const next = Math.max(0, Math.min(100, value));
      options.storage.setItem('mnSoundVolume:' + (source.accountId || 'guest'), String(next));
      if (player) player.volume = state.deafened && !local ? 0 : next / 100;
      update({ volume: next });
    },
    callChanged(call: Call) {
      if (!call.joined || state.roomId !== call.roomId) stop();
      update(call);
      if (player) player.volume = call.deafened && !local ? 0 : state.volume / 100;
    },
    play(id: string) {
      if (
        disposed ||
        !source.accountId ||
        !state.joined ||
        !state.sounds.some((file) => file.id === id)
      )
        return;
      if (!options.send(id)) notice('Servidor desconectado.');
    },
    preview(id: string) {
      const file = state.sounds.find((item) => item.id === id);
      return file ? playFile(file, true) : Promise.resolve();
    },
    changeTrim,
    seek(position: number) {
      if (!buffer || uploading || !Number.isFinite(position)) return;
      update({
        trimEnd: Math.min(
          buffer.duration,
          position + Math.min(15, state.trimEnd - state.trimStart),
        ),
      });
      changeTrim('start', position);
    },
    async load(file: File | null) {
      if (disposed || uploading) return;
      resetClip();
      if (local) stop();
      if (!file) return;
      if (file.size > 20_000_000) {
        notice('Escolha um áudio de até 20 MB.');
        return;
      }
      const version = decodeVersion,
        epoch = source.epoch,
        controller = (decoding = new AbortController());
      update({ loading: true, message: 'Lendo áudio para recortar…' });
      try {
        const result = await options.decode(file, controller.signal);
        if (
          disposed ||
          controller.signal.aborted ||
          version !== decodeVersion ||
          epoch !== source.epoch
        )
          return;
        if (!result.length || !Number.isFinite(result.duration) || result.duration <= 0)
          throw Error('O áudio está vazio.');
        buffer = result;
        update({
          clip: Object.freeze({ duration: result.duration, peaks: waveformPeaks(result) }),
          trimStart: 0,
          trimEnd: Math.min(15, result.duration),
          name: state.name.trim() ? state.name : file.name.replace(/\.[^.]+$/, '').slice(0, 40),
          message:
            'Áudio de ' +
            result.duration.toFixed(2) +
            ' s. Ajuste o trecho e ouça antes de enviar.',
        });
      } catch {
        if (
          !disposed &&
          epoch === source.epoch &&
          version === decodeVersion &&
          !controller.signal.aborted
        )
          notice(
            'Não foi possível ler este áudio. Tente um arquivo MP3, WAV, OGG ou M4A compatível.',
          );
      } finally {
        if (decoding === controller) decoding = null;
        if (!disposed && version === decodeVersion) update({ loading: false });
      }
    },
    async previewTrim() {
      if (disposed || !buffer || uploading) return;
      stop();
      local = true;
      const version = generation;
      try {
        previewUrl = options.createUrl(encodeWav(buffer, state.trimStart, state.trimEnd));
        const current = (player = options.player(previewUrl));
        current.volume = state.volume / 100;
        await current.play();
        if (disposed || version !== generation) {
          if (player !== current) current.pause();
          return;
        }
        notice('Ouvindo somente o trecho selecionado.');
      } catch (error) {
        if (!disposed && version === generation) notice(message(error));
      }
    },
    async upload() {
      if (
        disposed ||
        uploading ||
        state.loading ||
        !buffer ||
        !state.name.trim() ||
        !source.accountId
      )
        return;
      const epoch = source.epoch,
        controller = (uploading = new AbortController());
      update({ uploading: true });
      try {
        const blob = encodeWav(buffer, state.trimStart, state.trimEnd),
          file = new File([blob], state.name.trim() + '.wav', { type: 'audio/wav' });
        await files.upload(file, {
          kind: 'soundboard',
          signal: controller.signal,
          onProgress: (percent) => {
            if (!disposed && epoch === source.epoch && uploading === controller)
              notice('Enviando: ' + percent + '%');
          },
        });
        if (disposed || controller.signal.aborted || epoch !== source.epoch) return;
        if (local) stop();
        resetClip();
        update({ name: '', detailsOpen: false, fileRevision: state.fileRevision + 1 });
        const version = refreshVersion + 1;
        await refresh();
        if (!disposed && epoch === source.epoch && version === refreshVersion)
          notice('Efeito adicionado à biblioteca.');
      } catch (error) {
        if (!disposed && epoch === source.epoch && uploading === controller)
          notice(controller.signal.aborted ? 'Envio cancelado.' : message(error));
      } finally {
        if (uploading === controller) {
          uploading = null;
          update({ uploading: false });
        }
      }
    },
    async remove(id: string) {
      const file = state.sounds.find((item) => item.id === id);
      if (
        disposed ||
        !file ||
        deleting.has(id) ||
        !source.accountId ||
        (!source.moderateFiles && file.ownerId !== source.accountId)
      )
        return;
      if (!options.confirm('Excluir o efeito “' + file.name + '”?')) return;
      const epoch = source.epoch;
      deleting.add(id);
      update({ deleting: Object.freeze([...deleting]) });
      try {
        await files.remove(id);
        if (!disposed && epoch === source.epoch) {
          if (playerId === id) stop();
          update({ sounds: Object.freeze(state.sounds.filter((item) => item.id !== id)) });
        }
      } catch (error) {
        if (!disposed && epoch === source.epoch) notice(message(error));
      } finally {
        if (epoch === source.epoch) {
          deleting.delete(id);
          update({ deleting: Object.freeze([...deleting]) });
        }
      }
    },
    handleMessage(event: SocketMessage) {
      if (disposed) return;
      if (event.type === 'soundboard-play' && event.roomId === state.roomId && state.joined) {
        try {
          void playFile(sound(event.file));
        } catch (error) {
          options.warn?.(error);
        }
      } else if (
        event.type === 'error' &&
        typeof event.code === 'string' &&
        ['SOUND_RATE', 'SOUND_UNAVAILABLE', 'STORAGE_UNCONFIGURED'].includes(event.code) &&
        typeof event.message === 'string'
      )
        notice(event.message);
      else if (event.type === 'attachment-deleted' && typeof event.id === 'string') {
        if (playerId === event.id) stop();
        update({ sounds: Object.freeze(state.sounds.filter((file) => file.id !== event.id)) });
      } else if (
        event.type === 'channel-deleted' ||
        (event.type === 'connection' && event.connected === false)
      )
        stop();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      refreshVersion++;
      stop();
      resetClip();
      uploading?.abort();
      uploading = null;
      unsubscribe?.();
      listeners.clear();
      deleting.clear();
    },
  };
}
export type Soundboard = ReturnType<typeof createSoundboard>;
