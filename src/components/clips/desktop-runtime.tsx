import type { ClipShortcut } from '../../types/clips';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  createDesktopClipBridge,
  validDesktopCode,
  type DesktopClipBridge,
} from '../../lib/clips/desktop-bridge';
import { ClipDesktopPanel } from './desktop-panel';
type BridgePort = Pick<
  DesktopClipBridge,
  'configure' | 'saved' | 'disconnect' | 'connected' | 'globalActive'
>;
interface Runtime extends Window {
  TronoDesktop?: {
    configureClips?(value: {
      shortcut?: ClipShortcut;
      active: boolean;
    }): Promise<{ globalActive?: boolean }>;
    onClip?(listener: () => void): () => void;
  };
  TronoDesktopClips?: BridgePort;
  TronoClipDesktop?: BridgePort;
  TronoClips?: { clip(): void };
}
const key = 'mn-clips-desktop-code';
function readCode(target: Window) {
  try {
    const url = new URL(target.location.href),
      hash = new URLSearchParams(url.hash.slice(1)),
      incoming = hash.get('clips-desktop');
    if (incoming && validDesktopCode(incoming)) {
      hash.delete('clips-desktop');
      url.hash = hash.toString();
      target.history.replaceState(null, '', url.pathname + url.search + url.hash);
      try {
        target.sessionStorage.setItem(key, incoming);
      } catch {}
      return incoming;
    }
    const saved = target.sessionStorage.getItem(key) || '';
    return validDesktopCode(saved) ? saved : '';
  } catch {
    return '';
  }
}
export function initializeClipDesktop(target: Window): DesktopClipBridge | null {
  const runtime = target as Runtime;
  if (runtime.TronoDesktop) {
    if (runtime.TronoClipDesktop) return null;
    const desktop = runtime.TronoDesktop;
    let generation = 0,
      globalActive = false,
      last = '';
    const configure = (value: { shortcut?: ClipShortcut; active: boolean }) => {
      if (!desktop.configureClips) return;
      const key = JSON.stringify(value);
      if (key === last) return;
      last = key;
      const request = ++generation;
      globalActive = false;
      void desktop
        .configureClips(value)
        .then((result) => {
          if (request === generation) globalActive = result.globalActive === true;
        })
        .catch(() => {
          if (request === generation) last = '';
        });
    };
    const remove = desktop.onClip?.(() => runtime.TronoClips?.clip()) ?? (() => {});
    const disconnect = () => {
      remove();
      configure({ active: false });
    };
    runtime.TronoClipDesktop = {
      configure,
      saved() {},
      disconnect,
      get connected() {
        return true;
      },
      get globalActive() {
        return globalActive;
      },
    };
    target.addEventListener('pagehide', disconnect, { once: true });
    return null;
  }
  if (runtime.TronoClipDesktop) return null;
  if (runtime.TronoDesktopClips) {
    runtime.TronoClipDesktop = runtime.TronoDesktopClips;
    return null;
  }
  const host = target.document.getElementById('clipDesktopHost');
  if (!host) return null;
  const bridge = createDesktopClipBridge({
    initialCode: readCode(target),
    createSocket: (url) => new WebSocket(url),
    remember: (code) => target.sessionStorage.setItem(key, code),
    clip: () => runtime.TronoClips?.clip(),
  });
  runtime.TronoClipDesktop = bridge;
  target.addEventListener('pagehide', bridge.disconnect);
  const root = createRoot(host),
    dispose = bridge.dispose;
  let disposed = false;
  bridge.dispose = () => {
    if (disposed) return;
    disposed = true;
    dispose();
    target.removeEventListener('pagehide', bridge.disconnect);
    root.unmount();
    if (runtime.TronoClipDesktop === bridge) delete runtime.TronoClipDesktop;
  };
  flushSync(() => root.render(<ClipDesktopPanel bridge={bridge} />));
  return bridge;
}
