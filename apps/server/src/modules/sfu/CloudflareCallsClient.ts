import { isValidSdpDescription, type SdpDescription } from '@trono/protocol';

export interface CloudflareProviderIssue {
  errorCode: string;
  errorDescription: string;
}

export interface CloudflareProviderTrack {
  location?: 'local' | 'remote';
  mid?: string;
  trackName?: string;
  sessionId?: string;
  status?: 'active' | 'inactive';
  errorCode?: string;
  errorDescription?: string;
}

export interface CloudflareProviderResponse {
  sessionId?: string;
  sessionDescription?: SdpDescription;
  tracks?: CloudflareProviderTrack[];
  requiresImmediateRenegotiation?: boolean;
}

export interface CloudflareCallsProvider {
  request(
    method: 'GET' | 'POST' | 'PUT',
    suffix: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<CloudflareProviderResponse>;
}

export interface CloudflareCallsClientOptions {
  appId: string;
  token: string;
  fetchImpl?: typeof fetch;
  provider?: CloudflareCallsProvider;
  timeoutMs?: number;
}

export type SfuError = Error & {
  code: string;
  status: number;
  publicErrors?: CloudflareProviderIssue[];
};

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function sfuFailure(code: string, message: string, status = 503): SfuError {
  return Object.assign(new Error(message), { code, status });
}

export function providerUnavailable(): SfuError {
  return sfuFailure('SFU_REQUEST_FAILED', 'Falha ao comunicar com Cloudflare Realtime.');
}

function invalidProviderResponse(): SfuError {
  return sfuFailure('SFU_RESPONSE_INVALID', 'O provedor de mídia retornou uma resposta inválida.');
}

function isBoundedText(value: unknown, max = 512): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

/** Bound awaiting even when an injected adapter ignores its cancellation signal. */
export function withAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(signal.reason ?? new Error('Aborted'));
    };
    if (signal.aborted) {
      abort();
    } else {
      signal.addEventListener('abort', abort, { once: true });
    }
    work.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) reject(signal.reason ?? new Error('Aborted'));
        else resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

function parseIssues(value: unknown, token: string): CloudflareProviderIssue[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 128) throw invalidProviderResponse();
  return value.map((item: unknown) => {
    if (!isPlainObject(item)) throw invalidProviderResponse();
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

export function readCloudflareResponse(value: unknown, token = ''): CloudflareProviderResponse {
  if (!isPlainObject(value)) throw invalidProviderResponse();
  const out: CloudflareProviderResponse = {};
  if (value.sessionId !== undefined) {
    if (!isBoundedText(value.sessionId)) throw invalidProviderResponse();
    out.sessionId = value.sessionId;
  }
  if (value.sessionDescription != null) {
    if (!isValidSdpDescription(value.sessionDescription)) {
      throw invalidProviderResponse();
    }
    out.sessionDescription = {
      type: value.sessionDescription.type,
      sdp: value.sessionDescription.sdp,
    };
  }
  if (value.requiresImmediateRenegotiation !== undefined) {
    if (typeof value.requiresImmediateRenegotiation !== 'boolean') {
      throw invalidProviderResponse();
    }
    out.requiresImmediateRenegotiation = value.requiresImmediateRenegotiation;
  }
  if (value.tracks !== undefined) {
    if (!Array.isArray(value.tracks) || value.tracks.length > 1024) {
      throw invalidProviderResponse();
    }
    const mids = new Set<string>();
    out.tracks = value.tracks.map((item: unknown): CloudflareProviderTrack => {
      if (!isPlainObject(item)) throw invalidProviderResponse();
      const track: CloudflareProviderTrack = {};
      for (const key of ['mid', 'trackName', 'sessionId'] as const) {
        if (item[key] !== undefined) {
          if (!isBoundedText(item[key])) throw invalidProviderResponse();
          track[key] = item[key];
        }
      }
      if (track.mid) {
        if (mids.has(track.mid)) throw invalidProviderResponse();
        mids.add(track.mid);
      }
      if (item.location !== undefined) {
        if (item.location !== 'local' && item.location !== 'remote') {
          throw invalidProviderResponse();
        }
        track.location = item.location;
      }
      if (item.status !== undefined) {
        if (item.status !== 'active' && item.status !== 'inactive') {
          throw invalidProviderResponse();
        }
        track.status = item.status;
      }
      if (item.errorCode != null) {
        const issue = parseIssues([item], token)[0];
        track.errorCode = issue.errorCode;
        track.errorDescription = issue.errorDescription;
      }
      return track;
    });
  }
  return out;
}

/** HTTP transport and typed session/track operations for Cloudflare Realtime Calls API. */
export class CloudflareCallsClient implements CloudflareCallsProvider {
  private readonly appId: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly provider?: CloudflareCallsProvider;
  private readonly timeoutMs: number;

  constructor({
    appId,
    token,
    fetchImpl = fetch,
    provider,
    timeoutMs = 12_000,
  }: CloudflareCallsClientOptions) {
    this.appId = appId;
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.provider = provider;
    this.timeoutMs = timeoutMs;
  }

  async request(
    method: 'GET' | 'POST' | 'PUT',
    suffix: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<CloudflareProviderResponse> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), this.timeoutMs);
    const current = AbortSignal.any([timeout.signal, ...(signal ? [signal] : [])]);
    try {
      if (current.aborted) throw providerUnavailable();
      if (this.provider) {
        const result = await withAbort(
          this.provider.request(method, suffix, body, current),
          current,
        );
        return readCloudflareResponse(result, this.token);
      }

      let response: Response;
      let raw: string;
      try {
        response = await withAbort(
          this.fetchImpl(
            `https://rtc.live.cloudflare.com/v1/apps/${encodeURIComponent(this.appId)}${suffix}`,
            {
              method,
              headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/json',
              },
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
        throw invalidProviderResponse();
      }

      const errors = parseIssues(
        isPlainObject(value) && value.errorCode != null
          ? [value]
          : isPlainObject(value)
            ? value.errors
            : undefined,
        this.token,
      );
      if (!response.ok || errors.length > 0) {
        const error = providerUnavailable();
        error.status = response.status;
        error.publicErrors = errors;
        throw error;
      }

      return readCloudflareResponse(value, this.token);
    } finally {
      clearTimeout(timer);
    }
  }

  async createSession(signal?: AbortSignal): Promise<string> {
    const response = await this.request('POST', '/sessions/new', undefined, signal);
    if (!response.sessionId) {
      throw sfuFailure('SFU_RESPONSE_INVALID', 'O provedor não retornou uma nova sessão de mídia.');
    }
    return response.sessionId;
  }

  getSession(sessionId: string, signal?: AbortSignal): Promise<CloudflareProviderResponse> {
    return this.request('GET', `/sessions/${encodeURIComponent(sessionId)}`, undefined, signal);
  }

  addTracks(
    sessionId: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<CloudflareProviderResponse> {
    return this.request(
      'POST',
      `/sessions/${encodeURIComponent(sessionId)}/tracks/new`,
      body,
      signal,
    );
  }

  renegotiate(
    sessionId: string,
    sessionDescription: SdpDescription,
    signal?: AbortSignal,
  ): Promise<CloudflareProviderResponse> {
    return this.request(
      'PUT',
      `/sessions/${encodeURIComponent(sessionId)}/renegotiate`,
      { sessionDescription },
      signal,
    );
  }

  updateTracks(
    sessionId: string,
    tracks: unknown[],
    signal?: AbortSignal,
  ): Promise<CloudflareProviderResponse> {
    return this.request(
      'PUT',
      `/sessions/${encodeURIComponent(sessionId)}/tracks/update`,
      { tracks },
      signal,
    );
  }

  closeTracks(
    sessionId: string,
    mids: string[],
    force = true,
    signal?: AbortSignal,
  ): Promise<CloudflareProviderResponse> {
    return this.request(
      'PUT',
      `/sessions/${encodeURIComponent(sessionId)}/tracks/close`,
      { tracks: mids.map((mid) => ({ mid })), force },
      signal,
    );
  }
}
