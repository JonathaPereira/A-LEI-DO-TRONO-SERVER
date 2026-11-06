import { randomUUID } from 'node:crypto';
import { object } from './http-api.ts';
import { uuid } from './files-protocol.ts';
import { withAbort } from './abortable.ts';
import type { createFiles } from './files';
import type { createChannelService } from './channel-service';
import type { ChannelConnection, ChannelRoom } from './channel-contract';

interface Options {
  files: Pick<ReturnType<typeof createFiles>, 'sound'>;
  participation: ReturnType<typeof createChannelService>['voiceParticipation'];
  send(ws: ChannelConnection, event: { type: string; [key: string]: unknown }): void;
}
interface Rate {
  token: object;
  lastAt: number;
  pending: boolean;
  controller: AbortController;
}
/** Owns playback requests and room overlap locks; capture and actual audio stay in their existing owners. */
export function createVoiceSoundboard({ files, participation, send }: Options) {
  let closed = false,
    rates = new WeakMap<ChannelConnection, Rate>(),
    locks = new WeakMap<ChannelRoom, { until: number; fileId: string }>();
  const scope = new AbortController();
  const reject = (ws: ChannelConnection, code: string, message: string) => {
    if (!closed) send(ws, { type: 'error', code, message });
  };
  async function play(ws: ChannelConnection, input: unknown) {
    if (closed) return;
    if (!ws.account || ws.account.expiresAt <= Date.now()) {
      reject(ws, 'AUTH_REQUIRED', 'Entre em uma conta para usar os efeitos sonoros.');
      return;
    }
    const call = participation(ws);
    if (!call) {
      reject(ws, 'VOICE_REQUIRED', 'Entre na chamada para tocar um efeito.');
      return;
    }
    if (!object(input) || !uuid(input.fileId)) {
      reject(ws, 'FILE_NOT_FOUND', 'Efeito sonoro não encontrado.');
      return;
    }
    const fileId = input.fileId,
      actor = ws.account.id,
      { room, player, token } = call,
      now = Date.now();
    const blocked = () => {
      const lock = locks.get(room);
      return !!lock && Date.now() < lock.until && lock.fileId !== fileId;
    };
    let rate = rates.get(ws);
    if (rate && rate.token !== token) {
      rate.controller.abort();
      rate = undefined;
    }
    if (rate?.pending || now - (rate?.lastAt || 0) < 150) {
      reject(ws, 'SOUND_RATE', 'Aguarde um instante antes de tocar novamente.');
      return;
    }
    if (blocked()) {
      reject(ws, 'SOUND_RATE', 'Aguarde o efeito atual terminar para trocar de áudio.');
      return;
    }
    const current: Rate = { token, lastAt: now, pending: true, controller: new AbortController() };
    rates.set(ws, current);
    const signal = AbortSignal.any([scope.signal, current.controller.signal]);
    const owns = () =>
      !closed &&
      participation(ws)?.token === token &&
      ws.account?.id === actor &&
      ws.account.expiresAt > Date.now();
    try {
      const file = await withAbort(files.sound(fileId, signal), signal);
      if (!owns()) return;
      if (blocked()) {
        reject(ws, 'SOUND_RATE', 'Aguarde o efeito atual terminar para trocar de áudio.');
        return;
      }
      if (file.id !== fileId) throw new Error('Invalid sound response');
      locks.set(room, { until: Date.now() + Math.max(3000, file.durationMs || 0), fileId });
      const event = {
        type: 'soundboard-play',
        id: randomUUID(),
        roomId: room.id,
        file,
        playerId: player.id,
        name: player.name,
        at: Date.now(),
      };
      for (const member of room.players.values()) if (member.voiceJoined) send(member.ws, event);
    } catch (error) {
      if (!owns() || signal.aborted) return;
      const known =
        object(error) &&
        typeof error.code === 'string' &&
        /^[A-Z][A-Z0-9_]{0,80}$/.test(error.code);
      reject(
        ws,
        known ? (error.code as string) : 'SOUND_UNAVAILABLE',
        known && error.status && typeof error.message === 'string'
          ? error.message.slice(0, 500)
          : 'Efeito sonoro indisponível.',
      );
    } finally {
      current.pending = false;
    }
  }
  return {
    play,
    stop() {
      if (closed) return;
      closed = true;
      scope.abort();
      rates = new WeakMap();
      locks = new WeakMap();
    },
  };
}
