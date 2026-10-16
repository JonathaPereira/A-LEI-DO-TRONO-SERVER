import { AmbientBackground } from '@/components/navigation/ambient-background';
import { PortalScreen } from '@/components/navigation/portal-screen';
import { SetupScreen } from '@/components/games/setup-screen';
import { RoomScreen } from '@/components/games/room-screen';
import { ChatOnlyScreen } from '@/components/channels/chat-only-screen';
import { GameScreen } from '@/components/games/game-screen';
import { CommunicationPanel } from '@/components/chat/communication-panel';
import { SocialMiniDock } from '@/components/navigation/social-mini-dock';
import { ExchangeCinematic } from '@/components/navigation/exchange-cinematic';
import { ConnectionNotice } from '@/components/navigation/connection-notice';
import { RecordingNotice } from '@/components/navigation/recording-notice';
import { InfluencePublicNotice } from '@/components/navigation/influence-public-notice';
import { TurnNotice } from '@/components/navigation/turn-notice';
import { TrickOutcome } from '@/components/navigation/trick-outcome';
import { Toast } from '@/components/navigation/toast';
import { HoverTooltip } from '@/components/navigation/hover-tooltip';
import { Modal } from '@/components/navigation/modal';
import { RulesDrawer } from '@/components/navigation/rules-drawer';
import { AuthDialog } from '@/components/modals/auth-dialog';
import { GuestDialog } from '@/components/modals/guest-dialog';
import { CommunityToggle } from '@/components/channels/community-toggle';
import { CommunityPanel } from '@/components/channels/community-panel';
import { CallNoticeHost } from '@/components/navigation/call-notice-host';
import { BgMusic } from '@/components/navigation/bg-music';
import { ProfileDialog } from '@/components/modals/profile-dialog';
import { ClipsDialog } from '@/components/modals/clips-dialog';
import { ScreenOptionsDialog } from '@/components/modals/screen-options-dialog';
import { ChannelManagerDialog } from '@/components/modals/channel-manager-dialog';
import { RoleDialog } from '@/components/modals/role-dialog';
import { ChannelFilesDialog } from '@/components/modals/channel-files-dialog';
import { SoundboardToggle } from '@/components/navigation/soundboard-toggle';
import { SoundboardDialog } from '@/components/modals/soundboard-dialog';
import { MediaFocusDialog } from '@/components/modals/media-focus-dialog';
import { GamesScreen } from '@/components/games/games-screen';
import { RogueliteScreen } from '@/components/games/roguelite-screen';
import { AzulScreen } from '@/components/games/azul-screen';
import { SplendorScreen } from '@/components/games/splendor-screen';
import { LoveLetterScreen } from '@/components/games/love-letter-screen';
import { LegacyRuntime } from '@/legacy/legacy-runtime';
import { AttachmentImageViewer } from '@/components/files/image-viewer';

export function Application() {
  return (
    <>
      <AmbientBackground />
      <PortalScreen />
      <SetupScreen />
      <RoomScreen />
      <ChatOnlyScreen />
      <GameScreen />
      <CommunicationPanel />
      <SocialMiniDock />
      <ExchangeCinematic />
      <ConnectionNotice />
      <RecordingNotice />
      <InfluencePublicNotice />
      <TurnNotice />
      <TrickOutcome />
      <Toast />
      <HoverTooltip />
      <Modal />
      <RulesDrawer />
      <AuthDialog />
      <GuestDialog />
      <CommunityToggle />
      <CommunityPanel />
      <CallNoticeHost />
      <BgMusic />
      <ProfileDialog />
      <ClipsDialog />
      <ScreenOptionsDialog />
      <ChannelManagerDialog />
      <RoleDialog />
      <ChannelFilesDialog />
      <SoundboardToggle />
      <SoundboardDialog />
      <MediaFocusDialog />
      <GamesScreen />
      <RogueliteScreen />
      <AzulScreen />
      <SplendorScreen />
      <LoveLetterScreen />
      <AttachmentImageViewer />
      <LegacyRuntime />
    </>
  );
}
