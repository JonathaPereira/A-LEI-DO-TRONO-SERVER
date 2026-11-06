import fs from 'node:fs';
import path from 'node:path';
import type { RealtimeUsage } from './realtime-policy';
import { object } from './http-api.ts';

export function monthKeyUTC(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
/** The single owner of estimated bytes and the local monthly checkpoint. */
export function createRealtimeUsage({
  file,
  now = Date.now,
}: {
  file: string;
  now?: () => number;
}) {
  let state: RealtimeUsage = {
    month: monthKeyUTC(now()),
    bytes: 0,
    lastTick: now(),
    loadedFromDisk: false,
  };
  function load() {
    try {
      const data: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (
        object(data) &&
        data.month === state.month &&
        (typeof data.bytes === 'number' || typeof data.bytes === 'string') &&
        Number.isFinite(Number(data.bytes))
      ) {
        state.bytes = Math.max(0, Number(data.bytes));
        state.loadedFromDisk = true;
      }
    } catch {}
  }
  function save(timestamp = now()) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        JSON.stringify({
          month: state.month,
          bytes: state.bytes,
          updatedAt: new Date(timestamp).toISOString(),
        }),
      );
    } catch {}
  }
  function advance(egressBps: number, timestamp = now()) {
    const month = monthKeyUTC(timestamp);
    if (month !== state.month)
      state = { month, bytes: 0, lastTick: timestamp, loadedFromDisk: false };
    const dt = Math.max(0, Math.min(15000, timestamp - state.lastTick));
    state.lastTick = timestamp;
    if (dt > 0) state.bytes += (egressBps / 8) * (dt / 1000);
  }
  load();
  return {
    get state() {
      return state;
    },
    save,
    advance,
  };
}
