'use client';

import { useEffect, useState } from 'react';
import manifest from './manifest.json';
import { initializeNetwork } from '../lib/socket/browser';

let startup: Promise<void> | undefined;

function loadScript(filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/' + filename;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Não foi possível carregar ${filename}.`));
    document.head.append(script);
  });
}

/**
 * Temporary adapter for the DOM controllers. React hydrates the screens first;
 * controllers then own their existing nodes until the next full navigation.
 * Do not put React state inside a subtree that a controller moves or rewrites.
 */
export function LegacyRuntime() {
  const [error, setError] = useState<string>();

  useEffect(() => {
    startup ??= (async () => {
      initializeNetwork(window);
      for (const filename of manifest.scripts) {
        if (filename !== 'auth-boot.js') await loadScript(filename);
      }
      window.dispatchEvent(new Event('trono:ready'));
    })();
    void startup.catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Falha ao iniciar a interface.');
    });
  }, []);

  return error ? (
    <p className="application-load-error" role="alert">
      {error} Recarregue o aplicativo.
    </p>
  ) : null;
}
