import type { ScreenCaptureChange } from '../../types/voice';
import type { SfuSession } from './sfu-session';
import type { createP2pPeers } from './p2p-peers';
import type { createScreenSharing } from './screen-sharing';

interface PublicationOptions {
  isSfu(): boolean;
  sfu: Pick<
    SfuSession,
    'publications' | 'publishScreen' | 'closePublication' | 'recoverPublication'
  >;
  p2p: Pick<ReturnType<typeof createP2pPeers>, 'connections' | 'syncTracks'>;
  sharing: Pick<ReturnType<typeof createScreenSharing>, 'resetPreview' | 'getSnapshot'>;
  announce(): void;
  onAudioDetached(): void;
  onStatus(text: string, kind: 'ok' | 'warn'): void;
}

/** Publishes borrowed screen tracks through the existing transport/resource owners. */
export function createScreenPublication(options: PublicationOptions) {
  async function publish({ capture, isCurrent }: ScreenCaptureChange) {
    if (!isCurrent()) return;
    const stream = capture.outgoing;
    options.sharing.resetPreview();
    // Announce before any transport wait so the remote invitation appears immediately.
    options.announce();
    if (options.isSfu()) {
      const video = stream.getVideoTracks()[0];
      const audio = stream.getAudioTracks()[0] ?? null;
      if (video) {
        try {
          await options.sfu.publishScreen(video, audio);
        } catch (error) {
          if (isCurrent()) void options.sfu.recoverPublication('screen', error);
        }
      }
    }
    if (!isCurrent()) return;
    // The SFU may have fallen back while publication was pending.
    if (!options.isSfu())
      await Promise.all(
        [...options.p2p.connections.values()].map(async (peer) => {
          if (isCurrent()) await options.p2p.syncTracks(peer);
        }),
      );
    if (!isCurrent()) return;
    options.announce();
    const sound = stream.getAudioTracks()[0];
    options.onStatus(
      sound
        ? 'Compartilhando tela e áudio.'
        : options.sharing.getSnapshot().audio
          ? 'Tela compartilhada sem áudio. Marque Compartilhar áudio no seletor do navegador quando disponível.'
          : 'Compartilhando tela sem áudio.',
      sound ? 'ok' : 'warn',
    );
  }
  async function detachAudio({ isCurrent }: ScreenCaptureChange) {
    if (!isCurrent()) return;
    if (options.isSfu()) await options.sfu.closePublication('screen-audio');
    else
      for (const peer of options.p2p.connections.values()) {
        if (!isCurrent()) return;
        await peer._tronoScreenAudioSender?.replaceTrack(null);
      }
    if (isCurrent()) options.onAudioDetached();
  }
  return { publish, detachAudio };
}
