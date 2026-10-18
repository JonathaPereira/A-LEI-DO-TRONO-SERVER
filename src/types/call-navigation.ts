import type { RoomReference } from './network';

/** Only navigation fields are validated here; game payloads remain opaque to this domain. */
export interface NavigationRoom extends RoomReference {
  readonly name?: string;
  readonly channelType?: 'text' | 'voice' | 'mixed';
  readonly voiceActive?: boolean;
}
export interface CallNavigationSnapshot {
  readonly hub: boolean;
  readonly panelAvailable: boolean;
  readonly panelOpen: boolean;
  readonly drawerOpen: boolean;
  readonly unread: number;
  readonly muted: boolean;
  readonly gameCommunicationOpen: boolean;
  readonly voiceRoom: NavigationRoom | null;
  readonly textRoom: NavigationRoom | null;
}
