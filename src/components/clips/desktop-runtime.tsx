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
  TronoDesktop?: unknown;
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
  if (runtime.TronoDesktop) return null;
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
