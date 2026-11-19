export type SfuMediaKind = 'audio' | 'camera' | 'screen' | 'screen-audio';
export type SfuSimulcastRid = 'f' | 'h' | 'q';
export type SfuQualityPreset = 'economy' | 'balanced' | 'high';
export type SfuScreenCodec = 'auto' | 'h264' | 'vp9' | 'vp8' | 'av1';
export type SfuSessionPurpose = 'publish' | 'subscribe';

export interface SdpDescription {
  type: 'offer' | 'answer';
  sdp: string;
}

export interface SfuPublicationDescriptor {
  ownerId: string;
  ownerName: string;
  roomId: string;
  kind: SfuMediaKind;
  sessionId: string;
  trackName: string;
  mid: string;
  quality: SfuQualityPreset;
  screenBitrate: number | null;
  rids: SfuSimulcastRid[];
  createdAt: number;
}

export const SFU_CLIENT_ACTIONS = [
  'status',
  'ice-config',
  'list-publications',
  'ensure-session',
  'publish-tracks',
  'unpublish-tracks',
  'subscribe-tracks',
  'renegotiate',
  'update-subscription',
  'close-session',
  'set-screen-bitrate',
  // Ações legadas mantidas para compatibilidade gradual durante a migração
  'publish-track',
  'publication-ready',
  'subscribe-track',
  'close-publication',
  'close-subscription',
] as const;

export type SfuClientAction = (typeof SFU_CLIENT_ACTIONS)[number];

const ACTION_SET: ReadonlySet<string> = new Set(SFU_CLIENT_ACTIONS);
const KIND_SET: ReadonlySet<string> = new Set(['audio', 'camera', 'screen', 'screen-audio']);
const RID_SET: ReadonlySet<string> = new Set(['f', 'h', 'q']);
const QUALITY_SET: ReadonlySet<string> = new Set(['economy', 'balanced', 'high']);

export interface SfuRequestMessage {
  requestId: string;
  action: SfuClientAction;
  payload: Record<string, unknown>;
}

export interface PublishTrackItem {
  kind: SfuMediaKind;
  mid: string;
  rids: SfuSimulcastRid[];
}

export interface PublishTracksPayload {
  sessionId?: string;
  quality: SfuQualityPreset;
  screenBitrate?: number;
  sessionDescription: SdpDescription;
  tracks: PublishTrackItem[];
}

export interface SubscribeTrackItem {
  publisherId: string;
  kind: SfuMediaKind;
  preferredRid: SfuSimulcastRid | null;
}

export interface SubscribeTracksPayload {
  sessionId?: string;
  quality: SfuQualityPreset;
  tracks: SubscribeTrackItem[];
}

export interface UnpublishTracksPayload {
  sessionId: string;
  mids: string[];
}

export interface RenegotiatePayload {
  sessionId: string;
  sessionDescription: SdpDescription;
}

export interface UpdateSubscriptionPayload {
  sessionId: string;
  mid?: string;
  preferredRid: SfuSimulcastRid | null;
}

export type ValidationResult<T> =
  { ok: true; value: T } | { ok: false; code: string; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maxLength = 128): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

export function isSfuMediaKind(value: unknown): value is SfuMediaKind {
  return typeof value === 'string' && KIND_SET.has(value);
}

export function isSfuSimulcastRid(value: unknown): value is SfuSimulcastRid {
  return typeof value === 'string' && RID_SET.has(value);
}

export function isSfuQualityPreset(value: unknown): value is SfuQualityPreset {
  return typeof value === 'string' && QUALITY_SET.has(value);
}

export function isValidSdpDescription(
  value: unknown,
  expectedType?: 'offer' | 'answer',
): value is SdpDescription {
  if (!isRecord(value)) return false;
  const typeOk =
    expectedType !== undefined
      ? value.type === expectedType
      : value.type === 'offer' || value.type === 'answer';
  return (
    typeOk && typeof value.sdp === 'string' && value.sdp.length > 20 && value.sdp.length < 400_000
  );
}

export function parseSfuRequestMessage(raw: unknown): SfuRequestMessage | null {
  if (!isRecord(raw)) return null;
  if (!isNonEmptyString(raw.requestId, 80)) return null;
  if (typeof raw.action !== 'string' || !ACTION_SET.has(raw.action)) return null;
  return {
    requestId: raw.requestId,
    action: raw.action as SfuClientAction,
    payload: isRecord(raw.payload) ? raw.payload : {},
  };
}

export function validatePublishTracksPayload(raw: unknown): ValidationResult<PublishTracksPayload> {
  if (!isRecord(raw)) {
    return { ok: false, code: 'BAD_SFU_PUBLISH', message: 'Payload de publicação inválido.' };
  }
  if (!isValidSdpDescription(raw.sessionDescription, 'offer')) {
    return { ok: false, code: 'BAD_SFU_OFFER', message: 'Oferta SDP de publicação inválida.' };
  }
  if (!Array.isArray(raw.tracks) || raw.tracks.length === 0 || raw.tracks.length > 8) {
    return {
      ok: false,
      code: 'BAD_SFU_PUBLISH',
      message: 'Lista de tracks de publicação inválida.',
    };
  }

  const seenMids = new Set<string>();
  const tracks: PublishTrackItem[] = [];
  for (const item of raw.tracks) {
    if (!isRecord(item) || !isSfuMediaKind(item.kind) || !isNonEmptyString(item.mid, 128)) {
      return { ok: false, code: 'BAD_SFU_PUBLISH', message: 'Track de publicação inválida.' };
    }
    if (seenMids.has(item.mid)) {
      return { ok: false, code: 'BAD_SFU_PUBLISH', message: 'MID duplicado na publicação.' };
    }
    seenMids.add(item.mid);
    const rids = Array.isArray(item.rids) ? [...new Set(item.rids.filter(isSfuSimulcastRid))] : [];
    tracks.push({ kind: item.kind, mid: item.mid, rids });
  }

  const sessionId = isNonEmptyString(raw.sessionId, 512) ? raw.sessionId : undefined;
  const quality = isSfuQualityPreset(raw.quality) ? raw.quality : 'balanced';
  const screenBitrate =
    typeof raw.screenBitrate === 'number' && Number.isFinite(raw.screenBitrate)
      ? raw.screenBitrate
      : undefined;

  return {
    ok: true,
    value: {
      sessionId,
      quality,
      screenBitrate,
      sessionDescription: { type: 'offer', sdp: raw.sessionDescription.sdp },
      tracks,
    },
  };
}

export function validateSubscribeTracksPayload(
  raw: unknown,
): ValidationResult<SubscribeTracksPayload> {
  if (!isRecord(raw)) {
    return { ok: false, code: 'BAD_SFU_SUBSCRIBE', message: 'Payload de assinatura inválido.' };
  }
  if (!Array.isArray(raw.tracks) || raw.tracks.length === 0 || raw.tracks.length > 32) {
    return {
      ok: false,
      code: 'BAD_SFU_SUBSCRIBE',
      message: 'Lista de tracks para assinatura vazia.',
    };
  }

  const tracks: SubscribeTrackItem[] = [];
  for (const item of raw.tracks) {
    if (!isRecord(item) || !isNonEmptyString(item.publisherId, 128) || !isSfuMediaKind(item.kind)) {
      return {
        ok: false,
        code: 'BAD_SFU_SUBSCRIBE',
        message: 'Track remota inválida para assinatura.',
      };
    }
    const preferredRid = isSfuSimulcastRid(item.preferredRid) ? item.preferredRid : null;
    tracks.push({ publisherId: item.publisherId, kind: item.kind, preferredRid });
  }

  const sessionId = isNonEmptyString(raw.sessionId, 512) ? raw.sessionId : undefined;
  const quality = isSfuQualityPreset(raw.quality) ? raw.quality : 'balanced';

  return { ok: true, value: { sessionId, quality, tracks } };
}

export function validateUnpublishTracksPayload(
  raw: unknown,
): ValidationResult<UnpublishTracksPayload> {
  if (!isRecord(raw) || !isNonEmptyString(raw.sessionId, 512)) {
    return { ok: false, code: 'BAD_SFU_CLOSE', message: 'Sessão de publicação inválida.' };
  }
  if (!Array.isArray(raw.mids) || raw.mids.length === 0 || raw.mids.length > 32) {
    return {
      ok: false,
      code: 'BAD_SFU_CLOSE',
      message: 'Lista de MIDs para encerramento inválida.',
    };
  }
  const mids = [...new Set(raw.mids.filter((mid): mid is string => isNonEmptyString(mid, 128)))];
  if (mids.length !== raw.mids.length) {
    return { ok: false, code: 'BAD_SFU_CLOSE', message: 'MID inválido na lista de encerramento.' };
  }
  return { ok: true, value: { sessionId: raw.sessionId, mids } };
}

export function validateRenegotiatePayload(raw: unknown): ValidationResult<RenegotiatePayload> {
  if (!isRecord(raw) || !isNonEmptyString(raw.sessionId, 512)) {
    return { ok: false, code: 'SFU_SESSION_STALE', message: 'Sessão de renegociação ausente.' };
  }
  if (!isValidSdpDescription(raw.sessionDescription, 'answer')) {
    return { ok: false, code: 'BAD_SFU_ANSWER', message: 'Resposta SDP inválida na renegociação.' };
  }
  return {
    ok: true,
    value: {
      sessionId: raw.sessionId,
      sessionDescription: { type: 'answer', sdp: raw.sessionDescription.sdp },
    },
  };
}

export function validateUpdateSubscriptionPayload(
  raw: unknown,
): ValidationResult<UpdateSubscriptionPayload> {
  if (!isRecord(raw) || !isNonEmptyString(raw.sessionId, 512)) {
    return { ok: false, code: 'BAD_SFU_UPDATE', message: 'Sessão de assinatura inválida.' };
  }
  const mid = isNonEmptyString(raw.mid, 128) ? raw.mid : undefined;
  const preferredRid = isSfuSimulcastRid(raw.preferredRid) ? raw.preferredRid : null;
  return { ok: true, value: { sessionId: raw.sessionId, mid, preferredRid } };
}
