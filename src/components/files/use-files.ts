'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { initializeFiles } from '../../lib/files/browser';
import { EMPTY_FILES } from '../../lib/files/client';
import type { FilesClient } from '../../lib/files/client';

const emptySubscribe = () => () => {};
const emptySnapshot = () => EMPTY_FILES;
export function useFiles(provided?: FilesClient) {
  const [installed, setInstalled] = useState<FilesClient | null>(null);
  useEffect(() => {
    if (!provided) setInstalled(initializeFiles(window));
  }, [provided]);
  const client = provided ?? installed;
  const state = useSyncExternalStore(
    client?.subscribe ?? emptySubscribe,
    client?.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  return { client, state };
}

/** URL results belong to an account epoch and file, never to a reused row or host. */
export function useFileUrl(id: string | null | undefined, enabled = true) {
  const { client, state } = useFiles();
  const [result, setResult] = useState<{ key: string; url?: string; error?: string } | null>(null);
  const deleted = !!id && Object.hasOwn(state.deleted, id);
  const key = `${state.epoch}:${id}`;
  useEffect(() => {
    if (!client || !state.accountId || !id || !enabled || deleted) return;
    let active = true;
    void client.url(id).then(
      (url) => {
        if (active) setResult({ key, url });
      },
      (error) => {
        if (active)
          setResult({
            key,
            error: error instanceof Error ? error.message : 'Arquivo indisponível.',
          });
      },
    );
    return () => {
      active = false;
    };
  }, [client, state.accountId, id, enabled, deleted, key]);
  return state.accountId && enabled && !deleted && result?.key === key ? result : null;
}
