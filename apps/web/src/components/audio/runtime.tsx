import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { createPreferenceStorage, type PreferenceStorage } from '../../lib/storage/preferences';
import { createAudioPlayer, type AudioPlayer } from '../../lib/audio/player';
import { musicTracks } from '../../lib/audio/catalog';
import { MusicControls } from './music-controls';

interface Runtime extends Window {
  TronoStorage?: PreferenceStorage;
  TronoAudio?: AudioPlayer;
  TRONO_MUSIC_TRACKS?: typeof musicTracks;
  AudioContext: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}
const installed = new WeakMap<Window, () => Promise<void>>();
/** One owner for UI music/effects; no capture devices or call contexts belong here. */
export function initializeAudio(target: Window) {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document;
  const storage = runtime.TronoStorage ?? createPreferenceStorage(() => target.localStorage);
  runtime.TronoStorage = storage;
  const player = () => doc.getElementById('bgMusic') as HTMLAudioElement | null;
  const client = createAudioPlayer({
    storage,
    events: target,
    desktop: !!(target as Window & { TronoDesktop?: object }).TronoDesktop,
    href: target.location.href,
    player,
    createContext: () => {
      const Constructor = runtime.AudioContext || runtime.webkitAudioContext;
      return Constructor ? new Constructor() : null;
    },
    warn: (error) => console.info('[Audio]', error),
  });
  runtime.TronoAudio = client;
  runtime.TRONO_MUSIC_TRACKS = musicTracks;
  let root: ReturnType<typeof createRoot> | undefined,
    host: HTMLElement | undefined,
    disposed = false;
  const unlock = () => {
    if (client.musicEnabled || client.sfxEnabled) void client.ensureAudio();
  };
  const click = (event: MouseEvent) => {
    const element =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(
            'button,[role="button"],a[href],select,input[type="checkbox"],input[type="radio"],summary,.hand-card,.room-card',
          )
        : null;
    if (
      !element ||
      element.matches(':disabled') ||
      element.dataset.noClickSfx === '1' ||
      !client.sfxEnabled
    )
      return;
    const screen = element.closest('#gameScreen,#azulScreen,#splendorScreen,#loveLetterScreen');
    const key =
      (
        {
          gameScreen: 'throne',
          azulScreen: 'azul',
          splendorScreen: 'splendor',
          loveLetterScreen: 'love-letter',
        } as Record<string, string>
      )[screen?.id ?? ''] ?? null;
    void client
      .ensureAudio()
      .then(() => {
        if (!disposed) client.playSfx('click', key);
      })
      .catch(() => {});
  };
  const failed = () => client.handleMusicError();
  const bind = () => {
    if (disposed || root) return;
    host = doc.createElement('div');
    host.style.display = 'contents';
    host.dataset.audioControlsRoot = '';
    doc.body.append(host);
    root = createRoot(host);
    const hosts = [...doc.querySelectorAll<HTMLElement>('[data-music-control]')];
    flushSync(() =>
      root!.render(
        <>
          {hosts.map((slot) =>
            createPortal(
              <MusicControls client={client} section={slot.dataset.musicControl!} />,
              slot,
              slot.dataset.musicControl,
            ),
          )}
        </>,
      ),
    );
    client.start();
    player()?.addEventListener('error', failed);
    target.addEventListener('pointerdown', unlock, { once: true });
    doc.addEventListener('click', click, true);
  };
  let disposal: Promise<void> | undefined;
  const dispose = () => {
    if (disposal) return disposal;
    disposed = true;
    target.removeEventListener('trono:ready', bind);
    target.removeEventListener('pagehide', hidden);
    target.removeEventListener('pointerdown', unlock);
    doc.removeEventListener('click', click, true);
    player()?.removeEventListener('error', failed);
    flushSync(() => root?.unmount());
    host?.remove();
    if (runtime.TronoAudio === client) delete runtime.TronoAudio;
    if (runtime.TRONO_MUSIC_TRACKS === musicTracks) delete runtime.TRONO_MUSIC_TRACKS;
    if (installed.get(target) === dispose) installed.delete(target);
    disposal = client.dispose();
    return disposal;
  };
  const hidden = () => {
    void dispose();
  };
  target.addEventListener('trono:ready', bind, { once: true });
  target.addEventListener('pagehide', hidden, { once: true });
  installed.set(target, dispose);
  return dispose;
}
