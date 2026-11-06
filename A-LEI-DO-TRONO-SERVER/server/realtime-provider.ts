import { object } from './http-api.ts';
import { withAbort } from './abortable.ts';
import type {
  RealtimeProviderResponse,
  ProviderTrack,
  ProviderIssue,
  RealtimeDescription,
} from './realtime-contract';

export const realtimeFailure = (code: string, message: string, status = 503) =>
  Object.assign(Error(message), { code, status });
export const providerUnavailable = () =>
  realtimeFailure('SFU_REQUEST_FAILED', 'Falha ao comunicar com Cloudflare Realtime.');
const invalid = () =>
  realtimeFailure('SFU_RESPONSE_INVALID', 'O provedor de mídia retornou uma resposta inválida.');
const text = (value: unknown, max = 512): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;
export function sdpOk(value: unknown, type: 'offer' | 'answer'): value is RealtimeDescription {
  return (
    object(value) &&
    value.type === type &&
    typeof value.sdp === 'string' &&
    value.sdp.length > 20 &&
    value.sdp.length < 400000
  );
}
function issues(value: unknown, token: string): ProviderIssue[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 128) throw invalid();
  return value.map((item: unknown) => {
    if (!object(item)) throw invalid();
    const raw = item.errorCode ?? item.code;
    const errorCode =
      typeof raw === 'string' &&
      /^[a-zA-Z0-9_-]{1,128}$/.test(raw) &&
      (!token || !raw.includes(token))
        ? raw
        : 'cloudflare_error';
    const message =
      typeof item.errorDescription === 'string'
        ? item.errorDescription
        : typeof item.message === 'string'
          ? item.message
          : 'Erro Cloudflare';
    return {
      errorCode,
      errorDescription: (token ? message.replaceAll(token, '[redacted]') : message).slice(0, 240),
    };
  });
}
export function readRealtimeResponse(value: unknown, token = ''): RealtimeProviderResponse {
  if (!object(value)) throw invalid();
  const out: RealtimeProviderResponse = {};
  if (value.sessionId !== undefined) {
    if (!text(value.sessionId)) throw invalid();
    out.sessionId = value.sessionId;
  }
  if (value.sessionDescription != null) {
    if (!sdpOk(value.sessionDescription, 'offer') && !sdpOk(value.sessionDescription, 'answer'))
      throw invalid();
    out.sessionDescription = {
      type: value.sessionDescription.type,
      sdp: value.sessionDescription.sdp,
    };
  }
  if (value.requiresImmediateRenegotiation !== undefined) {
    if (typeof value.requiresImmediateRenegotiation !== 'boolean') throw invalid();
    out.requiresImmediateRenegotiation = value.requiresImmediateRenegotiation;
  }
  if (value.tracks !== undefined) {
    if (!Array.isArray(value.tracks) || value.tracks.length > 1024) throw invalid();
    const mids = new Set<string>();
    out.tracks = value.tracks.map((item: unknown): ProviderTrack => {
      if (!object(item)) throw invalid();
      const track: ProviderTrack = {};
      for (const key of ['mid', 'trackName', 'sessionId'] as const)
        if (item[key] !== undefined) {
          if (!text(item[key])) throw invalid();
          track[key] = item[key];
        }
      if (track.mid) {
        if (mids.has(track.mid)) throw invalid();
        mids.add(track.mid);
      }
      if (item.location !== undefined) {
        if (item.location !== 'local' && item.location !== 'remote') throw invalid();
        track.location = item.location;
      }
      if (item.status !== undefined) {
        if (item.status !== 'active' && item.status !== 'inactive') throw invalid();
        track.status = item.status;
      }
      if (item.errorCode != null) {
        const issue = issues([item], token)[0];
        track.errorCode = issue.errorCode;
        track.errorDescription = issue.errorDescription;
      }
      return track;
    });
  }
  return out;
}
/** Authenticated transport only. The manager owns operation and shutdown cancellation scopes. */
export function createRealtimeProvider({
  appId,
  token,
  fetchImpl = fetch,
}: {
  appId: string;
  token: string;
  fetchImpl?: typeof fetch;
}) {
  return {
    async request(
      method: 'GET' | 'POST' | 'PUT',
      suffix: string,
      body?: unknown,
      signal?: AbortSignal,
    ): Promise<RealtimeProviderResponse> {
      const timeout = new AbortController(),
        timer = setTimeout(() => timeout.abort(), 12000);
      const current = AbortSignal.any([timeout.signal, ...(signal ? [signal] : [])]);
      try {
        if (current.aborted) throw providerUnavailable();
        let response: Response, raw: string;
        try {
          response = await withAbort(
            fetchImpl(
              'https://rtc.live.cloudflare.com/v1/apps/' + encodeURIComponent(appId) + suffix,
              {
                method,
                headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: current,
              },
            ),
            current,
          );
          raw = await withAbort(response.text(), current);
        } catch {
          throw providerUnavailable();
        }
        if (current.aborted) throw providerUnavailable();
        let value: unknown;
        try {
          value = raw ? JSON.parse(raw) : {};
        } catch {
          throw invalid();
        }
        const errors = issues(
          object(value) && value.errorCode != null
            ? [value]
            : object(value)
              ? value.errors
              : undefined,
          token,
        );
        if (!response.ok || errors.length) {
          const error = providerUnavailable();
          Object.assign(error, { status: response.status, publicErrors: errors });
          throw error;
        }
        return readRealtimeResponse(value, token);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
