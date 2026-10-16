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
          <div className={'round-status'}>
            <span id={'roundBadge'}>Rodada 1/3</span>
            <span id={'trickBadge'}>Vaza 1/10</span>
            <span id={'turnBadge'}>Preparando...</span>
            <span id={'turnTimer'} className={'turn-timer idle'}>
              01:00
            </span>
          </div>
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
            <button
              id={'logBtn'}
              className={'icon-btn'}
              title={'Abrir ou ocultar a Crônica da Corte'}
            >
              ☷ Log
            </button>
            <button
              id={'socialBtn'}
              className={'icon-btn social-top-btn'}
              title={'Chat de texto, voz e câmera'}
            >
              💬 Chat{' '}
              <span id={'chatUnread'} className={'chat-unread hidden'}>
                0
              </span>
            </button>
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
            <div id={'tableCard0'} className={'table-card-slot slot-bottom'}>
              <span>J1</span>
            </div>
            <div id={'tableCard1'} className={'table-card-slot slot-left'}>
              <span>J2</span>
            </div>
            <div id={'tableCard2'} className={'table-card-slot slot-top'}>
              <span>J3</span>
            </div>
            <div id={'tableCard3'} className={'table-card-slot slot-right'}>
              <span>J4</span>
            </div>
            <div className={'center-info'}>
              <div className={'law-mini'}>
                <img id={'currentLawImg'} src={'assets/laws/ordem.svg'} alt={'Lei atual'} />
                <div>
                  <small>LEI ATUAL</small>
                  <strong id={'currentLawName'}>ORDEM</strong>
                  <span id={'lawUsesText'}>Uso 1 de 2</span>
                </div>
              </div>
              <div id={'trumpInfo'} className={'trump-info hidden'}>
                Trunfo: <strong id={'trumpSuitText'}>—</strong>
              </div>
              <div id={'leadSuitInfo'} className={'trump-info lead-suit-info hidden'}>
                Naipe anunciado: <strong id={'leadSuitText'}>—</strong>
              </div>
              <div id={'decreeBadge'} className={'decree-badge'}>
                <small>DECRETO</small>
                <strong>—</strong>
              </div>
            </div>
          </section>
          <aside className={'law-tracker'}>
            <h3>Leis da rodada</h3>
            <div id={'lawTrackerList'}></div>
          </aside>
          <aside id={'eventLogPanel'} className={'event-log-panel floating-log log-hidden'}>
            <div id={'eventDragHandle'} className={'event-head'}>
              <h3>Crônica da Corte</h3>
              <div className={'event-head-actions'}>
                <button id={'logResetBtn'} title={'Restaurar posição e tamanho'}>
                  ↺
                </button>
                <button id={'clearLogBtn'} title={'Limpar registro'}>
                  ⌫
                </button>
                <button id={'logHideBtn'} title={'Ocultar janela'}>
                  ×
                </button>
              </div>
            </div>
            <div id={'eventLog'} className={'event-log'}></div>
            <div className={'resize-hint'}>arraste pelo título • redimensione pelo canto ↘</div>
            <div id={'logResizeGrip'} className={'log-resize-grip'} title={'Redimensionar'}></div>
          </aside>
        </main>

        <section className={'hand-zone'}>
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
