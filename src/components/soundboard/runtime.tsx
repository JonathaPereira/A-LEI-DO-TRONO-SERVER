import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createSoundboard } from '../../lib/soundboard/controller';
import { decodeSound } from '../../lib/soundboard/decode';
import type { FilesClient } from '../../lib/files/client';
import type { NetworkClient } from '../../lib/socket/client';
import type { PreferenceStorage } from '../../lib/storage/preferences';
import { SoundboardView } from './view';

interface Runtime extends Window {
  TronoFiles: FilesClient;
  TronoNetwork: NetworkClient;
  TronoStorage: PreferenceStorage;
  TronoAuth: { open(mode: 'login'): void };
  TronoSocial?: { voiceJoined: boolean; deafened: boolean };
  TronoSoundboard?: object;
}
const installed = new WeakMap<Window, () => void>();
export function initializeSoundboard(target: Window) {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document,
    toggle = doc.getElementById('soundboardToggle')!;
  const host = doc.getElementById('soundboardRoot')!;
  const client = createSoundboard({
    files: runtime.TronoFiles,
    storage: runtime.TronoStorage,
    decode: (file, signal) =>
      decodeSound(file, signal, () => new AudioContext({ sampleRate: 48000 })),
    player: (url) => new Audio(url),
    createUrl: (blob) => URL.createObjectURL(blob),
    revokeUrl: (url) => URL.revokeObjectURL(url),
    login: () => runtime.TronoAuth.open('login'),
    send: (id) => runtime.TronoNetwork.playSound(id),
    confirm: (message) => target.confirm(message),
    warn: (error) => console.warn('[Soundboard]', error),
  });
  let restoreFocus = true,
    wasOpen = false,
    focus: HTMLElement | null = null,
    disposed = false;
  const root = createRoot(host);
  const close = ({ restoreFocus: restore = true } = {}) => {
    restoreFocus = restore;
    client.close();
    restoreFocus = true;
  };
  flushSync(() => root.render(<SoundboardView client={client} close={() => close()} />));
  const releaseView = client.subscribe(() => {
    const open = client.getSnapshot().open;
    if (open && !wasOpen)
      focus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    toggle.setAttribute('aria-expanded', String(open));
    if (!open && wasOpen && restoreFocus && focus?.isConnected)
      focus.focus({ preventScroll: true });
    wasOpen = open;
  });
  const open = () => client.open();
  const clicked = () => {
    void open();
  };
  const call = () =>
    client.callChanged({
      joined: runtime.TronoSocial?.voiceJoined === true,
      deafened: runtime.TronoSocial?.deafened === true,
      roomId: runtime.TronoNetwork.currentRoom,
    });
  const escape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && client.getSnapshot().open) {
      event.preventDefault();
      close();
    }
  };
  const outside = (event: PointerEvent) => {
    if (
      client.getSnapshot().open &&
      event.target instanceof Element &&
      !event.target.closest('#soundboardDialog,#soundboardToggle')
    )
      close({ restoreFocus: false });
  };
  const observer = new MutationObserver(() => {
    if (!doc.body.classList.contains('chat-only-active')) close({ restoreFocus: false });
  });
  const unsubscribeNetwork = runtime.TronoNetwork.onMessage(client.handleMessage);
  const bind = () => {
    if (disposed) return;
    client.start();
    call();
    toggle.addEventListener('click', clicked);
    doc.addEventListener('keydown', escape);
    doc.addEventListener('pointerdown', outside);
    target.addEventListener('trono-call-change', call);
    observer.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
  };
  const facade = { open, close, stop: client.stop, encodeWav: client.encodeWav };
  runtime.TronoSoundboard = facade;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    target.removeEventListener('trono:ready', bind);
    target.removeEventListener('pagehide', dispose);
    target.removeEventListener('trono-call-change', call);
    toggle.removeEventListener('click', clicked);
    doc.removeEventListener('keydown', escape);
    doc.removeEventListener('pointerdown', outside);
    observer.disconnect();
    unsubscribeNetwork();
    releaseView();
    client.dispose();
    flushSync(() => root.unmount());
    toggle.setAttribute('aria-expanded', 'false');
    if (runtime.TronoSoundboard === facade) delete runtime.TronoSoundboard;
    if (installed.get(target) === dispose) installed.delete(target);
  };
  target.addEventListener('trono:ready', bind, { once: true });
  target.addEventListener('pagehide', dispose, { once: true });
  installed.set(target, dispose);
  return dispose;
}
