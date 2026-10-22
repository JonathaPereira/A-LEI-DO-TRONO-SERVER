import type { ScreenCaptureChange } from '../../types/voice';
import type { SfuSession } from './sfu-session';
import type { createP2pPeers } from './p2p-peers';
import type { createCallQuality } from './quality';
import type { createScreenSharing } from './screen-sharing';

interface PublicationOptions {
  isSfu(): boolean;
  sfu: Pick<SfuSession, 'publications' | 'publish' | 'closePublication' | 'recoverPublication'>;
  p2p: Pick<ReturnType<typeof createP2pPeers>, 'connections' | 'syncTracks'>;
  quality: Pick<ReturnType<typeof createCallQuality>, 'applySender'>;
  sharing: Pick<ReturnType<typeof createScreenSharing>, 'resetPreview' | 'getSnapshot'>;
  announce(): void;
  onAudioDetached(): void;
  onStatus(text: string, kind: 'ok' | 'warn'): void;
}

/** Publishes borrowed screen tracks through the existing transport/resource owners. */
export function createScreenPublication(options: PublicationOptions) {
  async function publish({ capture, replace, isCurrent }: ScreenCaptureChange) {
    if (!isCurrent()) return;
    const stream = capture.outgoing;
    options.sharing.resetPreview();
    // Announce before any transport wait so the remote invitation appears immediately.
    options.announce();
    if (options.isSfu()) {
      const tracks = [
        ['screen', stream.getVideoTracks()[0]],
        ['screen-audio', stream.getAudioTracks()[0]],
      ] as const;
      await Promise.all(
        tracks.map(async ([kind, track]) => {
          try {
            if (!isCurrent()) return;
            const publication = replace ? options.sfu.publications.get(kind) : null;
            if (track && publication?.sender) {
              await publication.sender.replaceTrack(track);
              if (!isCurrent()) return;
              await options.quality.applySender(publication.sender, kind);
            } else if (track) await options.sfu.publish(kind, track);
            else if (publication) await options.sfu.closePublication(kind);
          } catch (error) {
            if (isCurrent()) void options.sfu.recoverPublication(kind, error);
          }
        }),
      );
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
