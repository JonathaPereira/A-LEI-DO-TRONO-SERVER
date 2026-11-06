import { MusicControlHost } from '../audio/music-controls';
import { CallNavigationHost } from '@/components/navigation/call-navigation';
export function GameScreen() {
  return (
    <>
      <section id={'gameScreen'} className={'screen game-screen hidden'}>
        <header className={'topbar'}>
          <div className={'brand'}>
            <span className={'brand-crown'}>♛</span>
            <div>
              <strong>A LEI DO TRONO</strong>
              <span id="throneVersionHost" style={{ display: 'contents' }} />
            </div>
          </div>
          <div id="throneStatusHost" className="round-status"></div>
          <div className={'top-actions'}>
            <MusicControlHost id="game-volume" />
            <MusicControlHost id="game-tracks" />
            <span id="courtFullscreenHost" style={{ display: 'contents' }} />
            <MusicControlHost id="game-toggle" />
            <span id="throneLogToggleHost" style={{ display: 'contents' }}></span>
            <CallNavigationHost id="socialBtn" />
            <span id="throneSpeedHost" style={{ display: 'contents' }} />
            <span id="throneRulesHost" style={{ display: 'contents' }} />
            <span id="throneRestartHost" style={{ display: 'contents' }} />
          </div>
          <span data-game-audio-slot="" style={{ display: 'contents' }} />
        </header>

        <main className={'board-wrap'}>
          <div className={'table-aura'}></div>
          <div id={'player0'} className={'player-panel pos-bottom'}></div>
          <div id={'player1'} className={'player-panel pos-left'}></div>
          <div id={'player2'} className={'player-panel pos-top'}></div>
          <div id={'player3'} className={'player-panel pos-right'}></div>
          <div
            id={'seatMediaLayer'}
            className={'seat-media-layer'}
            aria-label={'Câmeras posicionadas junto aos assentos da mesa'}
          ></div>
          <section className={'royal-table'}>
            <div className={'table-emblem'}>
              <img src={'assets/throne.png'} alt={'Trono'} />
            </div>
            <div
              id={'tableInfluenceCoins'}
              className={'table-influence-coins'}
              aria-label={'Influências sobre a mesa'}
            ></div>
            <div id="tableCard0" className="table-card-slot slot-bottom"></div>
            <div id="tableCard1" className="table-card-slot slot-left"></div>
            <div id="tableCard2" className="table-card-slot slot-top"></div>
            <div id="tableCard3" className="table-card-slot slot-right"></div>
            <div id="throneCourtHost" className="center-info"></div>
          </section>
          <aside className={'law-tracker'}>
            <h3>Leis da rodada</h3>
            <div id={'lawTrackerList'}></div>
          </aside>
          <aside id="eventLogPanel" className="event-log-panel floating-log log-hidden"></aside>
        </main>

        <section id="throneOnlineHand" className="hand-zone hidden"></section>
        <section id="throneLocalHand" className="hand-zone hidden"></section>
      </section>
    </>
  );
}
