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
              <small id={'versionLabel'}>Protótipo digital v0.8.0-alpha</small>
            </div>
          </div>
          <div id="throneStatusHost" className="round-status"></div>
          <div className={'top-actions'}>
            <div className={'music-volume'} title={'Volume da música de fundo'}>
              <span>♫</span>
              <input
                id={'musicVolume'}
                type={'range'}
                min={'0'}
                max={'100'}
                defaultValue={'32'}
                aria-label={'Volume da música'}
              />
              <output id={'musicVolumeValue'}>32%</output>
            </div>
            <div className={'music-track-select top-track-select'} aria-label={'Escolha da trilha'}>
              <button
                className={'track-btn active'}
                data-track={'lofi'}
                title={'Lofi again — omfgdude • CC0'}
              >
                Lo-fi
              </button>
              <button
                className={'track-btn'}
                data-track={'edm'}
                title={'Joyfully — MintoDog • CC0'}
              >
                EDM
              </button>
              <button
                className={'track-btn'}
                data-track={'rock'}
                title={'Codename Granny II — Kistol • CC0'}
              >
                Rock
              </button>
              <button
                className={'track-btn'}
                data-track={'electronic'}
                title={'Claimed by the Void — vitalezzz • CC0'}
              >
                Eletrônica
              </button>
            </div>
            <button
              id={'courtFullscreen'}
              className={'icon-btn'}
              type={'button'}
              aria-pressed={'false'}
              title={'Tela cheia nativa'}
            >
              ⛶ Tela cheia
            </button>
            <button id={'musicBtn'} className={'icon-btn'} title={'Ativar ou silenciar música'}>
              ♫ Música
            </button>
            <button
              id={'recordMatchBtn'}
              className={'icon-btn record-btn'}
              title={'Gravar a partida exibida nesta aba'}
            >
              ⏺ Gravar
            </button>
            <span id="throneLogToggleHost" style={{ display: 'contents' }}></span>
            <CallNavigationHost id="socialBtn" />
            <button id={'speedBtn'} className={'icon-btn'} title={'Alternar velocidade'}>
              ⏱ Normal
            </button>
            <button id={'rulesBtn'} className={'icon-btn'} title={'Resumo de regras'}>
              📜 Regras
            </button>
            <button id={'restartBtn'} className={'icon-btn danger'} title={'Voltar ao início'}>
              ↻ Início
            </button>
          </div>
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
        <section id="throneLocalHand" className={'hand-zone'}>
          <div className={'hand-toolbar'}>
            <div>
              <strong id={'handTitle'}>Sua mão</strong>
              <span id={'instructionText'}>Aguarde...</span>
            </div>
            <div className={'hand-actions'}>
              <button id={'sortHandBtn'} className={'small-btn'}>
                Ordenar
              </button>
              <label
                id={'influenceToggleWrap'}
                className={'influence-toggle disabled'}
                data-tooltip={
                  'Influência 2.0: com 1 ficha use Sigilo para jogar uma carta oculta; com 2, use Manobra da Corte (+3 ou -3). O valor efetivo nunca passa de 12 nem fica abaixo de 1. Ao abrir oculta, anuncie o naipe real.'
                }
              >
                <input type={'checkbox'} id={'influenceToggle'} disabled />
                <span className={'influence-emblem'}>✦</span>
                <span className={'influence-copy'}>
                  <strong>INFLUÊNCIA</strong>
                  <small id={'influenceStatusText'}>0/2 • indisponível</small>
                </span>
                <span className={'influence-action'}>USAR</span>
              </label>
            </div>
          </div>
          <div id={'humanHand'} className={'hand'}></div>
        </section>
      </section>
    </>
  );
}
