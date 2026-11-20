import type { MediaTransport } from './domain';

export interface VoiceTransportSnapshot {
  readonly mode: MediaTransport | 'stopping';
  readonly roomMode: 'p2p' | 'sfu' | null;
}
