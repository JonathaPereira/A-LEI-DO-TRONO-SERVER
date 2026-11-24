'use client';
import type { AudioPlayer } from '../../lib/audio/player';

export function MusicControlHost({ id }: { id: string }) {
  return <span data-music-control={id} style={{ display: 'contents' }} />;
}
export function MusicControls(_props: { client: AudioPlayer; section: string }) {
  return null;
}
