import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createDesktopUpdates, type DesktopUpdatePort } from '../../lib/desktop/updates';
import { DesktopUpdateBanner, DesktopUpdateCheck } from './update-controls';

const installed = new WeakMap<Window, () => void>();
/** Call after the shell creates its stable rail host, before workspace placement starts. */
export function initializeDesktopUpdates(target: Window) {
  if (installed.has(target)) return installed.get(target)!;
  const native = (target as unknown as { TronoDesktop?: DesktopUpdatePort }).TronoDesktop;
  const checkHost = target.document.getElementById('desktopUpdateCheckHost');
  if (!native || !checkHost) return () => {};
  const bannerHost = target.document.createElement('span');
  bannerHost.id = 'desktopUpdateBannerHost';
  bannerHost.style.display = 'contents';
  target.document.body.append(bannerHost);
  const client = createDesktopUpdates(native);
  const checkRoot = createRoot(checkHost),
    bannerRoot = createRoot(bannerHost);
  flushSync(() => {
    checkRoot.render(<DesktopUpdateCheck client={client} />);
    bannerRoot.render(<DesktopUpdateBanner client={client} />);
  });
  client.start();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    client.dispose();
    flushSync(() => {
      checkRoot.unmount();
      bannerRoot.unmount();
    });
    bannerHost.remove();
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
