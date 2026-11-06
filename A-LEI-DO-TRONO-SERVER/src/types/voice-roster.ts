import type { MediaTransport } from './domain';
import type { TransmissionQuality } from './realtime';

/** Private call membership, distinct from public room presence. */
export interface VoiceParticipant {
  readonly id: string;
  readonly accountId: string | null;
  readonly name: string;
  readonly avatar_preset: string;
  readonly avatar_file_id: string | null;
  readonly role?: string;
  readonly seat?: number;
  readonly joined: true;
  readonly reconnecting?: boolean;
  readonly muted: boolean;
  readonly serverMuted?: boolean;
  readonly mediaBlocked?: boolean;
  readonly deafened: boolean;
  readonly camera: boolean;
  readonly screen: boolean;
  readonly transport: MediaTransport;
  readonly quality: TransmissionQuality;
}
export interface VoiceStateUpdate {
  readonly playerId: string;
  readonly joined: boolean;
  readonly name?: string;
  readonly seat?: number;
  readonly muted: boolean;
  readonly serverMuted?: boolean;
  readonly mediaBlocked?: boolean;
  readonly deafened: boolean;
  readonly camera: boolean;
  readonly screen: boolean;
  readonly transport?: MediaTransport;
  readonly quality?: TransmissionQuality;
}
export interface VoiceNotice {
  readonly playerId: string;
  readonly kind: 'joined' | 'left' | 'disconnected';
  readonly name?: string;
  readonly id?: string;
  readonly roomId: string;
  readonly reason?: string;
  readonly at?: number;
  readonly guest?: boolean;
}
export interface VoiceRosterSnapshot {
  readonly participants: readonly VoiceParticipant[];
  readonly initialized: boolean;
  readonly eventsSupported: boolean;
}
