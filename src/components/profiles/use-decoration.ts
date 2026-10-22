'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createProfileDecorations } from '../../lib/profiles/decorations';
import type { ProfileDecorations } from '../../lib/profiles/decorations';
import type { ProfilesClient } from '../../lib/profiles/client';

const installed = new WeakMap<ProfilesClient, ProfileDecorations>();
const emptySubscribe = () => () => {};
const emptySnapshot = () => null;

function sharedDecorations(): ProfileDecorations {
  const profiles = (window as Window & { TronoProfiles?: ProfilesClient }).TronoProfiles;
  if (!profiles) throw new Error('O cliente de perfis ainda não foi inicializado.');
  let decorations = installed.get(profiles);
  if (!decorations) {
    decorations = createProfileDecorations({ profiles });
    installed.set(profiles, decorations);
  }
  return decorations;
}
export function useProfileDecoration(accountId: string | null | undefined) {
  const [client, setClient] = useState<ProfileDecorations | null>(null);
  useEffect(() => {
    setClient(sharedDecorations());
  }, []);
  const subscribe = useCallback(
    (listener: () => void) =>
      accountId && client ? client.subscribe(accountId, listener) : emptySubscribe(),
    [accountId, client],
  );
  const snapshot = useCallback(
    () => (accountId && client ? client.getSnapshot(accountId) : null),
    [accountId, client],
  );
  const profile = useSyncExternalStore(subscribe, snapshot, emptySnapshot);
  // Refresh expired data lazily when its surface renders, as the former presentation cache did.
  useEffect(() => {
    if (accountId && client) void client.load(accountId);
  });
  return profile;
}
