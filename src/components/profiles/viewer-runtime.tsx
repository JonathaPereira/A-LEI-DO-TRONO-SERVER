import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createProfiles } from '../../lib/profiles/client';
import type { ProfilesClient } from '../../lib/profiles/client';
import { createProfileViewer } from '../../lib/profiles/viewer';
import type { ProfileViewer } from '../../lib/profiles/viewer';
import type { NetworkClient } from '../../lib/socket/client';
import type { NetworkAccount } from '../../types/network';
import { MemberProfileDialog } from './member-profile-dialog';

interface ProfileRuntime extends Window {
  TronoProfiles?: ProfilesClient;
  TronoProfileViewer?: ProfileViewer;
  TronoAuth?: {
    readonly user: NetworkAccount | null;
    getAccessToken(): Promise<string | null>;
  };
  TronoNetwork: NetworkClient;
  TronoMessenger?: { open(id: string): Promise<unknown> };
}

/** Queries and the reader share the account-scoped client with the editor. */
export function initializeProfileViewer(target: Window, { mount = true } = {}): ProfileViewer {
  const runtime = target as ProfileRuntime;
  if (runtime.TronoProfileViewer) return runtime.TronoProfileViewer;
  const listen = (events: string[], listener: () => void) => {
    for (const event of events) target.addEventListener(event, listener);
    return () => {
      for (const event of events) target.removeEventListener(event, listener);
    };
  };
  const client = (runtime.TronoProfiles ??= createProfiles({
    backendHttp: runtime.TronoNetwork.BACKEND_HTTP,
    getAccount: () => runtime.TronoAuth?.user ?? null,
    getAccessToken: () => runtime.TronoAuth?.getAccessToken() ?? Promise.resolve(null),
    fetch: (input, options) => target.fetch(input, options),
    subscribeIdentity: (listener) => listen(['trono-auth-change', 'trono-role-change'], listener),
    subscribeMessages: runtime.TronoNetwork.onMessage,
    subscribeProfileChange: (listener) => listen(['trono-profile-change'], listener),
  }));
  const viewer = createProfileViewer({
    client,
    openMessage: (id) => runtime.TronoMessenger?.open(id),
  });
  runtime.TronoProfileViewer = viewer;
  if (!mount) return viewer;
  const host = target.document.createElement('div');
  host.id = 'profileViewerHost';
  target.document.body.append(host);
  flushSync(() => createRoot(host).render(<MemberProfileDialog viewer={viewer} />));
  return viewer;
}
