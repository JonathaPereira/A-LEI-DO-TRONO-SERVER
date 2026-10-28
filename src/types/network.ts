import type { AccountRole, MediaTransport } from './domain';
import type { SocketMessage } from './socket';

export interface NetworkAccount {
  id: string;
  nickname: string;
  role: Exclude<AccountRole, 'guest'>;
  permissions: Record<string, boolean>;
}

export interface GuestIdentity {
  id: string;
  nickname: string;
  ticket: string;
  expiresAt: number;
}

/** The account controller is read lazily: it is installed after the network client. */
export interface NetworkIdentity {
  readonly user: NetworkAccount | null;
  getAccessToken(): Promise<string | null>;
  open(mode: 'login'): void;
  expire(): void;
  ensureGuest(name?: string): Promise<boolean>;
}

export interface NetworkFeatures {
  readonly azul: boolean;
  readonly splendor: boolean;
  readonly loveLetter: boolean;
  readonly similo?: boolean;
  readonly ticketToRide: boolean;
  readonly remotePc: boolean;
  readonly remotePcProtocol: number;
  readonly independentTextChannels: boolean;
  readonly independentGameVoice: boolean;
  readonly gameActivity: boolean;
}

export interface NetworkSnapshot {
  readonly connected: boolean;
  readonly clientId: string | null;
  readonly currentRoom: string | null;
  readonly primaryRoom: string | null;
  readonly gameRoom: string | null;
  readonly features: NetworkFeatures;
}

export interface RoomReference {
  id: string;
  kind: 'chat' | 'game';
  [key: string]: unknown;
}

/** Only events that affect connection and membership state are covered here. */
export type NetworkStateEvent = SocketMessage &
  (
    | { type: 'connection'; connected: boolean }
    | { type: 'welcome'; clientId: string; serverVersion?: string; features: NetworkFeatures }
    | { type: 'joined-room' | 'voice-room-attached'; room: RoomReference }
    | {
        type: 'joined-game-room' | 'joined-text-channel';
        room: RoomReference;
        primaryRoomId?: string | null;
        chatRoomId?: string | null;
      }
    | {
        type: 'left-game-room' | 'left-voice-room';
        primaryRoomId?: string | null;
        chatRoomId?: string | null;
      }
    | { type: 'channel-deleted'; roomId: string }
  );

export interface NameAvailability {
  available: boolean;
  name?: string;
  code?: string | null;
  message?: string;
}

export interface PreparedVoice {
  mode: MediaTransport;
  revision: number;
  moderation?: {
    muted?: boolean;
    mediaBlocked?: boolean;
    blockedUntil?: number;
  };
}

export interface VoiceContext {
  deafened?: boolean;
  screenSettings?: { fps?: number };
}
