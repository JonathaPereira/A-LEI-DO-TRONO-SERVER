export function PortalScreen() {
  return (
    <>
      <section
        id={'portalScreen'}
        className={'screen portal-screen'}
        aria-label={'Escolha sua experiência'}
      >
        <div className={'portal-noise'} aria-hidden={'true'}></div>
        <header className={'portal-header'}>
          <button
            id={'portalBrandBtn'}
            className={'portal-brand'}
            type={'button'}
            aria-label={'Início M&N'}
          >
            <span className={'portal-brand-mark'}>✦</span>
            <strong>M&amp;N</strong>
          </button>
          <nav className={'portal-nav'} aria-label={'Navegação principal'}>
            <button className={'portal-nav-btn'} data-portal-target={'voice'}>
              Chat de Voz
            </button>
            <button className={'portal-nav-btn'} data-portal-target={'game'}>
              Jogos
            </button>
          </nav>
          <div className={'portal-account'}>
            <span className={'portal-status-dot'}></span>
            <div>
              <strong id={'portalPlayerLabel'}>Jogador</strong>
              <small id={'portalServerStatus'}>Conectando à Corte…</small>
            </div>
            <button id={'accountLoginBtn'} className={'account-action'} type={'button'}>
              Entrar
            </button>
            <button id={'accountProfileBtn'} className={'account-action hidden'} type={'button'}>
              Meu perfil
            </button>
            <button id={'accountLogoutBtn'} className={'account-action hidden'} type={'button'}>
              Sair
            </button>
            <button id={'accountGuestExitBtn'} className={'account-action hidden'} type={'button'}>
              Sair do convidado
            </button>
          </div>
        </header>

        <main id={'portalStage'} className={'portal-stage'}>
          <article
            id={'voicePortalCard'}
            className={'portal-choice portal-choice-voice'}
            tabIndex={0}
            aria-label={'Abrir Chat de Voz M&N'}
          >
            <div className={'portal-choice-shade'}></div>
            <div className={'portal-choice-content'}>
              <span className={'portal-kicker'}>
                <i></i> COMUNICAÇÃO EM TEMPO REAL
              </span>
              <h1>
                <small>Chat de Voz</small>M&amp;N
              </h1>
              <p>
                Seu espaço para estar junto. Converse, compartilhe a tela e encontre sua comunidade.
              </p>
              <div className={'portal-features'} aria-label={'Recursos do chat'}>
                <span>🎙 Voz</span>
                <span>▣ Câmera</span>
                <span>▤ Tela</span>
                <span>♫ Efeitos</span>
              </div>
              <button
                id={'openVoicePortalBtn'}
                className={'portal-cta portal-cta-blue'}
                type={'button'}
              >
                <span>🎙</span> Abrir Chat de Voz <b>→</b>
              </button>
              <p
                id={'portalEntryStatus'}
                className={'portal-entry-status'}
                role={'status'}
                aria-live={'polite'}
              ></p>
            </div>
          </article>

          <div className={'portal-rift'} aria-hidden={'true'}>
            <span>✦</span>
            <i></i>
            <b></b>
          </div>

          <article
            id={'gamePortalCard'}
            className={'portal-choice portal-choice-game'}
            tabIndex={0}
            aria-label={'Abrir catálogo de jogos'}
          >
            <div className={'portal-choice-shade'}></div>
            <div className={'portal-choice-content portal-choice-content-right'}>
              <span className={'portal-kicker'}>
                <i></i> UMA COMUNIDADE · VÁRIAS MESAS
              </span>
              <h1>
                <small>Encontre sua</small>PARTIDA
              </h1>
              <p>
                A Lei do Trono e Azul. Escolha sua mesa, chame os amigos e continue na mesma
                chamada.
              </p>
              <div className={'portal-features'} aria-label={'Recursos do jogo'}>
                <span>♛ Salões</span>
                <span>⚔ Estratégia</span>
                <span>✦ Influência</span>
                <span>☾ Sombra</span>
              </div>
              <button
                id={'openGamePortalBtn'}
                className={'portal-cta portal-cta-gold'}
                type={'button'}
              >
                <span>♛</span> Explorar jogos <b>→</b>
              </button>
              <button id={'openGuestGameBtn'} className={'guest-entry-btn'} type={'button'}>
                Jogar como convidado
              </button>
              <p className={'guest-entry-note'}>
                Convidados podem jogar e conversar por voz na mesa. O chat M&amp;N exige uma conta.
              </p>
            </div>
          </article>
        </main>

        <section className={'portal-identity-bar'} aria-label={'Identidade e trilha sonora'}>
          <label className={'portal-identity'}>
            <span>Seu nome</span>
            <input
              id={'portalIdentity'}
              defaultValue={'Jogador'}
              maxLength={20}
              autoComplete={'nickname'}
              aria-describedby={'portalNameAvailability'}
            />
            <small
              id={'portalNameAvailability'}
              className={'name-availability'}
              aria-live={'polite'}
            ></small>
          </label>
          <div className={'portal-now-playing'}>
            <span className={'music-pulse'} aria-hidden={'true'}>
              <i></i>
              <i></i>
              <i></i>
              <i></i>
            </span>
            <div>
              <small>TRILHA CC0</small>
              <strong id={'portalNowPlaying'}>Lo-fi • omfgdude</strong>
              <small
                id={'portalMusicStatus'}
                className={'music-playback-status'}
                role={'status'}
                aria-live={'polite'}
              ></small>
            </div>
          </div>
          <div className={'portal-track-select'} aria-label={'Escolha da trilha'}>
            <button
              className={'track-btn active'}
              data-track={'lofi'}
              title={'Lofi again — omfgdude • CC0'}
            >
              Lo-fi
            </button>
            <button className={'track-btn'} data-track={'edm'} title={'Joyfully — MintoDog • CC0'}>
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
          <button id={'portalMusicBtn'} className={'portal-music-btn'} type={'button'}>
            ♫ Música ligada
          </button>
          <label className={'portal-volume'}>
            <span>Volume</span>
            <input
              id={'portalMusicVolume'}
              type={'range'}
              min={'0'}
              max={'100'}
              defaultValue={'32'}
            />
            <output id={'portalMusicVolumeValue'}>32%</output>
          </label>
          <button
            id={'portalCreditsBtn'}
            className={'portal-credit-btn'}
            type={'button'}
            title={'Créditos das trilhas'}
          >
            CC0
          </button>
        </section>
      </section>
    </>
  );
}
