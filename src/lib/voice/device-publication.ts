import type { CameraCaptureChange, VoicePeerConnection } from '../../types/voice';
import type { TrackChange } from './microphone';
import type { SfuSession } from './sfu-session';
import type { createP2pPeers } from './p2p-peers';
import type { createCallQuality } from './quality';
import type { createCamera } from './camera';
import type { createCallControls } from './controls';

interface DevicePublicationOptions {
  call(): { joined: boolean };
  isSfu(): boolean;
  sfu: Pick<SfuSession, 'publications' | 'publish' | 'closePublication' | 'recoverPublication'>;
  p2p: Pick<ReturnType<typeof createP2pPeers>, 'connections' | 'syncTracks' | 'ensure'>;
  quality: Pick<ReturnType<typeof createCallQuality>, 'applySender'>;
  camera: Pick<ReturnType<typeof createCamera>, 'getSnapshot'>;
  controls: Pick<ReturnType<typeof createCallControls>, 'cancelPending'>;
  closePeer(id: string): void;
  announceCamera(): void;
  onMicrophoneResumed(stream: MediaStream): void;
  onDevicesChanged(): Promise<void>;
  warn?(error: unknown): void;
}

/** Coordinates publication only; capture, tracks, peers and retries retain their owners. */
export function createDevicePublication(options: DevicePublicationOptions) {
  const warn = options.warn ?? ((error: unknown) => console.warn('[DevicePublication]', error));
  async function publishMicrophone({ stream, track, reason, isCurrent }: TrackChange) {
    if (!isCurrent()) return;
    if (reason === 'resume') {
      for (const peer of options.p2p.connections.values()) {
        if (!isCurrent()) return;
        await options.p2p.syncTracks(peer);
      }
      if (!isCurrent()) return;
      const publication = options.sfu.publications.get('audio');
      if (publication?.sender) await publication.sender.replaceTrack(track);
      if (isCurrent()) options.onMicrophoneResumed(stream);
      return;
    }
    for (const [id, peer] of [...options.p2p.connections])
      if (peer._tronoAudioSender && isCurrent()) {
        try {
          await options.p2p.syncTracks(peer);
        } catch (error) {
          if (!isCurrent()) return;
          warn(error);
          options.closePeer(id);
          options.p2p.ensure(id);
        }
      }
    if (!isCurrent()) return;
    const publication = options.sfu.publications.get('audio');
    if (publication?.sender) {
      try {
        await publication.sender.replaceTrack(track);
        if (!isCurrent()) return;
        await options.quality.applySender(publication.sender, 'audio');
      } catch (error) {
        if (!isCurrent()) return;
        try {
          await options.sfu.publish('audio', track);
        } catch (failure) {
          if (!isCurrent()) return;
          void options.sfu.recoverPublication('audio', failure);
        }
      }
    }
    if (isCurrent()) await options.onDevicesChanged();
  }

  async function syncCameraSender(peer: VoicePeerConnection) {
    const sender = peer._tronoVideoSender;
    if (!sender) return;
    // A delayed attach/detach must converge on the currently owned camera track.
    while (options.call().joined && [...options.p2p.connections.values()].includes(peer)) {
      await sender.replaceTrack(options.camera.getSnapshot().capture?.track ?? null);
      if (sender.track === (options.camera.getSnapshot().capture?.track ?? null)) return;
    }
  }
  async function publishCamera({ capture, isCurrent }: CameraCaptureChange) {
    if (!isCurrent()) return;
    // Remote availability and local UI must not wait for slow transport setup.
    options.announceCamera();
    if (options.isSfu()) {
      try {
        const publication = options.sfu.publications.get('camera');
        if (publication?.sender) {
          await publication.sender.replaceTrack(capture.track);
          if (!isCurrent()) return;
          await options.quality.applySender(publication.sender, 'camera');
        } else await options.sfu.publish('camera', capture.track);
      } catch (error) {
        if (!isCurrent()) return;
        warn(error);
        void options.sfu.recoverPublication('camera', error);
      }
    }
    if (!isCurrent()) return;
    if (!options.isSfu())
      await Promise.all(
        [...options.p2p.connections.values()].map(async (peer) => {
          if (!isCurrent()) return;
          if (peer._tronoVideoSender) {
            await syncCameraSender(peer).catch(() => {});
            if (!isCurrent()) return;
            await options.quality.applySender(peer._tronoVideoSender, 'camera');
          }
        }),
      );
    if (!isCurrent()) return;
    options.announceCamera();
    await options.onDevicesChanged();
  }
  function cameraStopped() {
    if (!options.call().joined) return;
    options.controls.cancelPending();
    options.announceCamera();
    // Camera release and announcements cannot wait for sender detach.
    if (options.isSfu()) void options.sfu.closePublication('camera').catch(warn);
    else
      void Promise.allSettled(
        [...options.p2p.connections.values()].map((peer) => syncCameraSender(peer)),
      );
  }
  return { publishMicrophone, publishCamera, cameraStopped };
}
