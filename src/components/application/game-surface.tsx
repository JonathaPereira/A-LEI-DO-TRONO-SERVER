import { CallNavigationHost } from '../navigation/call-navigation';
import type { PrimaryScreen } from '../../lib/navigation/portal';
import { SetupScreen } from '../games/setup-screen';
import { RoomScreen } from '../games/room-screen';
import { GameScreen } from '../games/game-screen';
import { AzulScreen } from '../games/azul-screen';
import { SplendorScreen } from '../games/splendor-screen';
import { LoveLetterScreen } from '../games/love-letter-screen';
import { TicketToRideScreen } from '../games/ticket-to-ride-screen';
import { RogueliteScreen } from '../games/roguelite-screen';
import { AtalaiaScreen } from '../games/atalaia-screen';
import { NexusScreen } from '../games/nexus-screen';
import { CommunicationPanel } from '../chat/communication-panel';
import { ExchangeCinematic } from '../navigation/exchange-cinematic';
import { InfluencePublicNotice } from '../navigation/influence-public-notice';
import { TurnNotice } from '../navigation/turn-notice';
import { TrickOutcome } from '../navigation/trick-outcome';
import { ConnectionNotice } from '../navigation/connection-notice';
import { Toast } from '../navigation/toast';
import { HoverTooltip } from '../navigation/hover-tooltip';
import { BgMusic } from '../navigation/bg-music';
import { ScreenOptionsDialog } from '../modals/screen-options-dialog';
import { MediaFocusDialog } from '../modals/media-focus-dialog';

/** The existing game DOM and its borrowed communication hosts keep their identity. */
export function GameSurface({ active, screen }: { active: boolean; screen: PrimaryScreen }) {
  return (
    <div id="gameSurface" className="game-surface" data-active={active}>
      <div hidden={!active}>
        <SetupScreen />
        <RoomScreen />
        <GameScreen />
        <AzulScreen />
        <SplendorScreen />
        <LoveLetterScreen />
        <TicketToRideScreen />
        <RogueliteScreen />
        <NexusScreen />
        <AtalaiaScreen />
        <div hidden={!['setupScreen', 'roomScreen', 'gameScreen'].includes(screen)}>
          <CommunicationPanel
            active={active && ['setupScreen', 'roomScreen', 'gameScreen'].includes(screen)}
          />
          <CallNavigationHost id="socialMiniDock" />
        </div>
      </div>
      <ExchangeCinematic />
      <InfluencePublicNotice />
      <TurnNotice />
      <TrickOutcome />
      <ConnectionNotice />
      <Toast />
      <HoverTooltip />
      <BgMusic />
      <ScreenOptionsDialog />
      <MediaFocusDialog />
    </div>
  );
}
