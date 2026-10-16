import type { SfuPublication, SfuRid } from '../../types/sfu';
import type { VoiceMediaKind } from '../../types/voice';

export const sfuKey = (id: string, kind: VoiceMediaKind) => `${id}:${kind}`;
export const sfuCancelled = () =>
  Object.assign(new Error('Operação SFU cancelada.'), { code: 'SFU_CANCELLED' });
export const sfuError = (code: string) =>
  Object.assign(new Error(`Resposta SFU inválida (${code}).`), { code });
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
export const mediaKind = (value: unknown): value is VoiceMediaKind =>
  typeof value === 'string' && ['audio', 'camera', 'screen', 'screen-audio'].includes(value);
export const screenKind = (kind: VoiceMediaKind) => kind === 'screen' || kind === 'screen-audio';
export const errorCode = (error: unknown) =>
  String((error as { code?: unknown } | null)?.code || 'SFU_REQUEST_FAILED');
export function sessionIdOf(value: unknown): string | null {
  return record(value) && text(value.sessionId) ? value.sessionId : null;
}
function rids(value: unknown): readonly SfuRid[] {
  if (value === undefined) return Object.freeze([]);
  if (
    !Array.isArray(value) ||
    !value.every((v) => ['f', 'h', 'q'].includes(v)) ||
    new Set(value).size !== value.length
  )
    throw sfuError('BAD_SFU_RIDS');
  return Object.freeze([...value]);
}
function rid(value: unknown): SfuRid | null {
  if (value == null) return null;
  if (typeof value !== 'string' || !['f', 'h', 'q'].includes(value)) throw sfuError('BAD_SFU_RIDS');
  return value as SfuRid;
}
export function description(value: unknown, type: 'offer' | 'answer'): RTCSessionDescriptionInit {
  if (!record(value) || value.type !== type || !text(value.sdp))
    throw sfuError(type === 'offer' ? 'BAD_SFU_OFFER' : 'BAD_SFU_ANSWER');
  return { type, sdp: value.sdp };
}
export function readPublish(value: unknown) {
  if (
    !record(value) ||
    !sessionIdOf(value) ||
    !record(value.publication) ||
    !text(value.publication.trackName)
  )
    throw sfuError('BAD_SFU_PUBLISH');
  return {
    sessionId: value.sessionId as string,
    trackName: value.publication.trackName,
    rids: value.publication.rids === undefined ? undefined : rids(value.publication.rids),
    description:
      value.sessionDescription == null ? null : description(value.sessionDescription, 'answer'),
  };
}
export function readSubscribe(value: unknown) {
  if (!record(value) || !sessionIdOf(value) || typeof value.mid !== 'string')
    throw sfuError('BAD_SFU_OFFER');
  return {
    sessionId: value.sessionId as string,
    mid: value.mid,
    preferredRid: rid(value.preferredRid),
    description: description(value.sessionDescription, 'offer'),
  };
}
export function readReady(value: unknown): readonly SfuRid[] | undefined {
  if (!record(value) || value.ready !== true) throw sfuError('BAD_SFU_READY');
  return value.rids === undefined ? undefined : rids(value.rids);
}
export function readAccepted(value: unknown) {
  if (!record(value) || value.accepted !== true) throw sfuError('BAD_SFU_RENEGOTIATE');
}
export function readLayer(value: unknown): SfuRid | null {
  if (!record(value) || !('preferredRid' in value)) throw sfuError('BAD_SFU_UPDATE');
  return rid(value.preferredRid);
}
export function readPublications(value: unknown): readonly SfuPublication[] {
  if (!Array.isArray(value)) throw sfuError('BAD_SFU_PUBLICATIONS');
  const keys = new Set<string>();
  return Object.freeze(
    value.map((row) => {
      if (
        !record(row) ||
        !text(row.ownerId) ||
        !mediaKind(row.kind) ||
        !text(row.sessionId) ||
        !text(row.trackName)
      )
        throw sfuError('BAD_SFU_PUBLICATIONS');
      const key = sfuKey(row.ownerId, row.kind);
      if (keys.has(key)) throw sfuError('BAD_SFU_PUBLICATIONS');
      keys.add(key);
      if (
        (row.ownerName !== undefined && typeof row.ownerName !== 'string') ||
        (row.quality !== undefined && typeof row.quality !== 'string') ||
        (row.screenBitrate != null &&
          (typeof row.screenBitrate !== 'number' || !Number.isFinite(row.screenBitrate))) ||
        (row.createdAt !== undefined &&
          (typeof row.createdAt !== 'number' || !Number.isFinite(row.createdAt)))
      )
        throw sfuError('BAD_SFU_PUBLICATIONS');
      return Object.freeze({
        ownerId: row.ownerId,
        kind: row.kind,
        sessionId: row.sessionId,
        trackName: row.trackName,
        ownerName: row.ownerName as string | undefined,
        quality: row.quality as string | undefined,
        screenBitrate: row.screenBitrate as number | null | undefined,
        createdAt: row.createdAt as number | undefined,
        rids: rids(row.rids),
      });
    }),
  );
}
export function readCatalogResponse(value: unknown) {
  if (!record(value)) throw sfuError('BAD_SFU_PUBLICATIONS');
  return readPublications(value.publications);
}
export function stalePublication(error: unknown) {
  return [
    'PUBLICATION_STALE',
    'PUBLICATION_NOT_FOUND',
    'PUBLICATION_NOT_READY',
    'SFU_SESSION_STALE',
    'not_found_track_error',
  ].includes(errorCode(error));
}
export function retrySingleLayer(error: unknown) {
  const code = errorCode(error),
    name = String((error as { name?: unknown } | null)?.name || '');
  if (
    [
      'SCREEN_BUDGET_BLOCKED',
      'REALTIME_DISABLED',
      'REALTIME_HARD_LIMIT',
      'SFU_ROOM_SAFETY_LIMIT',
      'NETWORK_OFFLINE',
      'SFU_CANCELLED',
    ].includes(code)
  )
    return false;
  return (
    ['TypeError', 'InvalidAccessError', 'OperationError', 'NotSupportedError'].includes(name) ||
    [
      'PUBLICATION_NOT_ACTIVE',
      'BAD_SFU_PUBLISH',
      'SFU_CONNECT_TIMEOUT',
      'SFU_REQUEST_FAILED',
    ].includes(code) ||
    code.includes('simulcast')
  );
}
