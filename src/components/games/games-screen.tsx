import { GameAction } from './library-controls';
export function GamesScreen() {
  return (
    <>
      <section
        id={'gamesScreen'}
        className={'screen hidden mn-games-screen'}
        aria-label={'Catálogo de jogos'}
      >
        <header className={'games-heading'}>
          <div>
            <span className={'games-eyebrow'}>M&amp;N · JUNTOS NA MESMA MESA</span>
            <h1>Escolha a próxima partida.</h1>
            <p>Sua chamada continua. O próximo jogo é só um convite.</p>
          </div>
          <div className={'games-heading-actions'}>
            <GameAction
              destination="community"
              id={'gamesVoice'}
              type={'button'}
              className={'games-voice-link'}
            >
              🎙 Voltar à comunidade
            </GameAction>
            <GameAction
              destination="home"
              id={'gamesHome'}
              type={'button'}
              className={'az-text-button'}
              aria-label={'M&N · Voltar ao início'}
            >
              M&amp;N
            </GameAction>
          </div>
        </header>
        <div className={'games-catalog'}>
          <GameAction
            destination="throne"
            id={'playThrone'}
            className={'games-card games-card-throne'}
            type={'button'}
          >
            <span className={'games-cover'}>
              <img
                className={'games-throne-art'}
                src={'assets/games/throne-cover.webp'}
                alt={'Trono, coroa, cetro, chave, máscara e lâmina'}
                width={'1120'}
                height={'1400'}
                loading={'lazy'}
                decoding={'async'}
              />
              <span>
                A LEI DO
                <br />
                <b>TRONO</b>
              </span>
            </span>
            <span className={'games-card-body'}>
              <small>ESTRATÉGIA · CARTAS · 4 JOGADORES</small>
              <strong>A Lei do Trono</strong>
              <span>Influência, leis e alianças. A Coroa espera pela sua Casa.</span>
              <b className={'games-card-cta'}>
                Entrar nos salões{' '}
                <i aria-hidden={'true'}>
                  <svg
                    viewBox={'0 0 24 24'}
                    fill={'none'}
                    stroke={'currentColor'}
                    strokeWidth={'1.7'}
                  >
                    <path d={'M7 17 17 7M7 7h10v10'}></path>
                  </svg>
                </i>
              </b>
            </span>
          </GameAction>
          <GameAction
            destination="azul"
            id={'playAzul'}
            className={'games-card games-card-azul'}
            type={'button'}
          >
            <span className={'games-cover'}>
              <img
                className={'games-box-art'}
                src={'assets/azul/box-cover.webp'}
                alt={'Caixa do jogo Azul'}
                width={'1230'}
                height={'1278'}
                loading={'eager'}
                decoding={'async'}
              />
              <span>
                AZUL<small>O prazer de criar mosaicos.</small>
              </span>
            </span>
            <span className={'games-card-body'}>
              <small>ESTRATÉGIA · AZULEJOS · 2–4 JOGADORES</small>
              <strong>Azul</strong>
              <span>Um palácio, cinco cores e escolhas que fazem a diferença.</span>
              <b className={'games-card-cta'}>
                Escolher uma mesa{' '}
                <i aria-hidden={'true'}>
                  <svg
                    viewBox={'0 0 24 24'}
                    fill={'none'}
                    stroke={'currentColor'}
                    strokeWidth={'1.7'}
                  >
                    <path d={'M7 17 17 7M7 7h10v10'}></path>
                  </svg>
                </i>
              </b>
            </span>
          </GameAction>
          <GameAction
            destination="roguelite"
            id={'playRoguelite'}
            className={'games-card games-card-cinzas'}
            type={'button'}
          >
            <span className={'games-cover'}>
              <img
                className={'games-cinzas-art'}
                src={'roguelite/assets/catalogue-cover.png'}
                alt={'Portal das ruínas de Cinzas do Abismo'}
                loading={'lazy'}
                decoding={'async'}
                width={'1536'}
                height={'1024'}
              />
              <span>
                CINZAS
                <br />
                DO ABISMO<small>Uma vida. Infinitas combinações.</small>
              </span>
            </span>
            <span className={'games-card-body'}>
              <small>ROGUELITE · PLATAFORMA · SOLO · V0.5</small>
              <strong>Cinzas do Abismo</strong>
              <span>Explore túneis, combine cartas e enfrente a campanha ou a horda sem fim.</span>
              <b className={'games-card-cta'}>
                Atravessar o portal{' '}
                <i aria-hidden={'true'}>
                  <svg
                    viewBox={'0 0 24 24'}
                    fill={'none'}
                    stroke={'currentColor'}
                    strokeWidth={'1.7'}
                  >
                    <path d={'M7 17 17 7M7 7h10v10'}></path>
                  </svg>
                </i>
              </b>
            </span>
          </GameAction>
          <GameAction
            destination="splendor"
            id={'playSplendor'}
            className={'games-card games-card-splendor'}
            type={'button'}
          >
            <span className={'games-cover'}>
              <img
                src={'assets/games/splendor-cover.webp'}
                alt={'Mercador renascentista e pedras preciosas'}
                width={'1120'}
                height={'1400'}
                loading={'lazy'}
                decoding={'async'}
              />
              <span>
                SPLENDOR<small>Gemas, comércio e prestígio.</small>
              </span>
            </span>
            <span className={'games-card-body'}>
              <small>ESTRATÉGIA · GEMAS · 2–4 JOGADORES</small>
              <strong>Splendor</strong>
              <span>Construa sua rede de comércio e conquiste o prestígio da corte.</span>
              <b className={'games-card-cta'}>
                Negociar uma partida{' '}
                <i aria-hidden={'true'}>
                  <svg
                    viewBox={'0 0 24 24'}
                    fill={'none'}
                    stroke={'currentColor'}
                    strokeWidth={'1.7'}
                  >
                    <path d={'M7 17 17 7M7 7h10v10'}></path>
                  </svg>
                </i>
              </b>
            </span>
          </GameAction>
          <GameAction
            destination="ticket-to-ride"
            id={'playTicketToRide'}
            className={'games-card games-card-railway'}
            type={'button'}
          >
            <span className={'games-cover games-railway-cover'}>
              <span className={'games-railway-mark'} aria-hidden={'true'}>
                ▰<br />
                ━━━━━━━━
              </span>
              <span>
                TICKET TO RIDE<small>A grande viagem americana.</small>
              </span>
            </span>
            <span className={'games-card-body'}>
              <small>FERROVIAS · DESTINOS · 2–5 JOGADORES</small>
              <strong>Ticket to Ride · EUA</strong>
              <span>
                Conecte as cidades do mapa clássico. Cada destino guarda uma nova história.
              </span>
              <b className={'games-card-cta'}>
                Embarcar na viagem <i aria-hidden={'true'}>↗</i>
              </b>
            </span>
          </GameAction>
          <GameAction
            destination="love-letter"
            id={'playLoveLetter'}
            className={'games-card games-card-love-letter'}
            type={'button'}
          >
            <span className={'games-cover'}>
              <span className={'games-love-letter-art'} aria-hidden={'true'}></span>
              <span>
                LOVE LETTER<small>Um segredo. O favor da corte.</small>
              </span>
            </span>
            <span className={'games-card-body'}>
              <small>BLEFE · DEDUÇÃO · 2–6 JOGADORES</small>
              <strong>Love Letter</strong>
              <span>Guarde seu segredo e conquiste o favor da princesa. Segunda edição.</span>
              <b className={'games-card-cta'}>
                Entrar na corte{' '}
                <i aria-hidden={'true'}>
                  <svg
                    viewBox={'0 0 24 24'}
                    fill={'none'}
                    stroke={'currentColor'}
                    strokeWidth={'1.7'}
                  >
                    <path d={'M7 17 17 7M7 7h10v10'}></path>
                  </svg>
                </i>
              </b>
            </span>
          </GameAction>
          <GameAction
            destination="nexus"
            id={'playNexus'}
            className={'games-card games-card-nexus'}
            type={'button'}
          >
            <span className={'games-cover'}>
              <img
                src={'assets/games/nexus-cover.webp'}
                alt={'Vesper diante da cidade do Nexus e do Farol azul'}
                width={'630'}
                height={'500'}
                loading={'lazy'}
                decoding={'async'}
              />
            </span>
            <span className={'games-card-body'}>
              <small>RPG TÁTICO 2D · CAMPANHA · PVP 1×1</small>
              <strong>Nexus</strong>
              <span>Reúna seu trio, combine habilidades e desafie seus amigos.</span>
              <b className={'games-card-cta'}>
                Entrar no Nexus <i aria-hidden={'true'}>↗</i>
              </b>
            </span>
          </GameAction>
        </div>
        <p className={'games-footnote'}>
          Partidas online e bots · Controles da chamada sempre disponíveis no aplicativo.
        </p>
      </section>
    </>
  );
}
