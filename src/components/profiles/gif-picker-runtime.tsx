import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createGifPicker } from '../../lib/profiles/gif-picker';
import type { GifPicker } from '../../lib/profiles/gif-picker';
import { GifPickerDialog } from './gif-picker-dialog';

interface GifRuntime extends Window {
  TronoAuth: { readonly user: { id: string } | null; getAccessToken(): Promise<string | null> };
  TronoNetwork: { readonly BACKEND_HTTP: string };
}
const installed = new WeakMap<Window, GifPicker>();

export function initializeProfileGifs(target: Window): GifPicker {
  const existing = installed.get(target);
  if (existing) return existing;
  const runtime = target as GifRuntime;
  const picker = createGifPicker({
    backendHttp: runtime.TronoNetwork.BACKEND_HTTP,
    getAccountId: () => runtime.TronoAuth.user?.id ?? null,
    getAccessToken: () => runtime.TronoAuth.getAccessToken(),
    fetch: (input, options) => target.fetch(input, options),
    subscribeIdentity(listener) {
      target.addEventListener('trono-auth-change', listener);
      return () => target.removeEventListener('trono-auth-change', listener);
    },
  });
  installed.set(target, picker);
  const host = target.document.createElement('div');
  host.id = 'profileGifHost';
  target.document.body.append(host);
  flushSync(() => createRoot(host).render(<GifPickerDialog picker={picker} />));
  return picker;
}
