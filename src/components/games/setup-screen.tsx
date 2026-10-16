export function SetupScreen() {
  return (
    <>
      <section id={'setupScreen'} className={'screen setup-screen lobby-screen hidden'}>
        <div className={'setup-card lobby-card'}>
          <button id={'backFromLobbyBtn'} className={'back-lobby portal-back-btn'} type={'button'}>
            ← Voltar ao portal
          </button>
          <div className={'crest'}>♛</div>
          <h1>A LEI DO TRONO</h1>
          <p className={'subtitle'}>Protótipo digital v0.8.0-alpha • Playtest Online</p>
          <p className={'intro'}>
            Identifique-se, escolha um salão e prepare sua Casa. Cada sala comporta até 4 jogadores.
          </p>

          <div className={'identity-row'}>
            <label className={'identity-name-field'}>
              <span>Seu nome na Corte</span>
              <input
                id={'playerIdentity'}
                defaultValue={'Jogador'}
                maxLength={20}
                autoComplete={'nickname'}
                aria-describedby={'nameAvailability'}
              />
              <small
                id={'nameAvailability'}
                className={'name-availability'}
                aria-live={'polite'}
              ></small>
            </label>
            <button id={'manualBtn'} className={'royal-btn manual-btn'}>
              📜 Manual temático
            </button>
          </div>

          <div className={'room-grid'} id={'roomGrid'}>
            <article className={'room-card'} data-room={'sala-cetro'}>
              <div className={'room-glyph cetro'}>♜</div>
              <div>
                <small>SALÃO I</small>
                <h3>Sala do Cetro</h3>
                <p>Uma mesa aberta para até quatro Casas.</p>
              </div>
              <div className={'room-footer'}>
                <span id={'roomCount0'}>0 / 4</span>
                <button className={'royal-btn room-enter'} data-room={'sala-cetro'}>
                  Entrar
                </button>
              </div>
            </article>
            <article className={'room-card'} data-room={'sala-chave'}>
              <div className={'room-glyph chave'}>⚿</div>
              <div>
                <small>SALÃO II</small>
                <h3>Sala da Chave</h3>
                <p>Uma mesa aberta para até quatro Casas.</p>
              </div>
              <div className={'room-footer'}>
                <span id={'roomCount1'}>0 / 4</span>
                <button className={'royal-btn room-enter'} data-room={'sala-chave'}>
                  Entrar
                </button>
              </div>
            </article>
            <article className={'room-card'} data-room={'sala-mascara'}>
              <div className={'room-glyph mascara'}>◉</div>
              <div>
                <small>SALÃO III</small>
                <h3>Sala da Máscara</h3>
                <p>Uma mesa aberta para até quatro Casas.</p>
              </div>
              <div className={'room-footer'}>
                <span id={'roomCount2'}>0 / 4</span>
                <button className={'royal-btn room-enter'} data-room={'sala-mascara'}>
                  Entrar
                </button>
              </div>
            </article>
          </div>
          <article className={'chat-only-entry'}>
            <div className={'chat-only-glyph'}>◫</div>
            <div className={'chat-only-copy'}>
              <small>FORA DA MESA</small>
              <h3>Somente chat</h3>
              <p>
                Salão livre para texto, áudio, câmera e compartilhamento de tela. Sem limite fixo de
                participantes imposto pelo servidor e sem iniciar uma partida.
              </p>
            </div>
            <button id={'chatOnlyBtn'} className={'royal-btn primary'}>
              Entrar no Salão Livre
            </button>
          </article>
          <div className={'lobby-status'}>
            <span className={'status-dot'}></span>
            <span id={'networkStatus'}>Conectando ao servidor da Corte...</span>
          </div>
          <div className={'lobby-audio-panel'} aria-label={'Controles de áudio do lobby'}>
            <button id={'lobbyMusicBtn'} className={'royal-btn lobby-music-toggle'}>
              ♫ Música ligada
            </button>
            <label className={'lobby-volume'}>
              <span>Volume</span>
              <input
                id={'lobbyMusicVolume'}
                type={'range'}
                min={'0'}
                max={'100'}
                defaultValue={'32'}
              />
              <output id={'lobbyMusicVolumeValue'}>32%</output>
            </label>
            <div
              className={'music-track-select lobby-track-select'}
              aria-label={'Escolha da trilha'}
            >
              <button className={'track-btn active'} data-track={'lofi'}>
                Lo-fi
              </button>
              <button className={'track-btn'} data-track={'edm'}>
                EDM
              </button>
              <button className={'track-btn'} data-track={'rock'}>
                Rock
              </button>
              <button className={'track-btn'} data-track={'electronic'}>
                Eletrônica
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
