import type { NetworkIdentity, VoiceContext } from '../../types/network';
import { backendWebSocketUrl, createNetworkClient } from './client.ts';
import type { NetworkClient } from './client.ts';
import { createSocketTransport } from './transport.ts';

export interface NetworkRuntime {
  location: { hostname: string };
  TRONO_BACKEND_URL?: string;
  TronoAuth?: NetworkIdentity;
  TronoSocial?: VoiceContext;
  TronoNetwork?: NetworkClient;
}

export function resolveBackendHttp(hostname: string, override?: string): string {
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname);
  const host = hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
  const address =
    override || (local ? `http://${host}:10000` : 'https://a-lei-do-trono-server.onrender.com');
  const url = new URL(address);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      'URL do backend inválida. Use um endereço HTTP(S) sem credenciais, consulta ou fragmento.',
    );
  return url.href.replace(/\/+$/, '');
}

/** Installs one client per page; old controllers only retain its existing public name. */
export function initializeNetwork(runtime: NetworkRuntime): NetworkClient {
  if (runtime.TronoNetwork) return runtime.TronoNetwork;
  const backendHttp = resolveBackendHttp(runtime.location.hostname, runtime.TRONO_BACKEND_URL);
  const transport = createSocketTransport({ url: backendWebSocketUrl(backendHttp) });
  const client = createNetworkClient({
    backendHttp,
    transport,
    getIdentity: () => runtime.TronoAuth ?? null,
    getVoiceContext: () => runtime.TronoSocial ?? {},
  });
  runtime.TronoNetwork = client;
  return client;
}
