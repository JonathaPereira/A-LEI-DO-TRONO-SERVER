import { useSyncExternalStore } from 'react';
import type { KeyboardEvent } from 'react';
import type { Portal } from '../../lib/navigation/portal';
import { PortalCredits } from './portal-credits';
import { usePortalParallax } from './portal-parallax';
export function PortalContents({ controller }: { controller: Portal }) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const stage = usePortalParallax();
  function keyboard(event: KeyboardEvent<HTMLElement>, action: () => unknown) {
    if (
      (event.key === 'Enter' || event.key === ' ') &&
      !(event.target as Element).closest('button,input,a')
    ) {
      event.preventDefault();
      void action();
    }
  }
  return (
    <>
      <div className={'portal-noise'} aria-hidden={'true'}></div>
      <header className={'portal-header'}>
        <button
          id={'portalBrandBtn'}
          onClick={() => controller.showPortal()}
          className={'portal-brand'}
          type={'button'}
          aria-label={'Início M&N'}
        >
          <span className={'portal-brand-mark'}>✦</span>
          <strong>M&amp;N</strong>
        </button>
        <nav className={'portal-nav'} aria-label={'Navegação principal'}>
          <button
            data-portal-target={'voice'}
            className={state.target === 'voice' ? 'portal-nav-btn active' : 'portal-nav-btn'}
            onClick={() => void controller.openVoice()}
          >
            Chat de Voz
          </button>
          <button
            data-portal-target={'game'}
            className={state.target === 'game' ? 'portal-nav-btn active' : 'portal-nav-btn'}
            onClick={() => void controller.openGame()}
          >
            Jogos
          </button>
        </nav>
        <div className={'portal-account'}>
          <span className={'portal-status-dot ' + (state.connected ? 'online' : 'offline')}></span>
          <div>
            <strong id={'portalPlayerLabel'}>{state.label}</strong>
            <small id={'portalServerStatus'}>{state.serverStatus}</small>
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

      <main ref={stage} id={'portalStage'} className={'portal-stage'}>
        <article
          id={'voicePortalCard'}
          onKeyDown={(e) => keyboard(e, controller.openVoice)}
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
              disabled={state.busy}
              aria-busy={state.busy}
              onClick={() => void controller.openVoice()}
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
            >
              {state.entryStatus}
            </p>
          </div>
        </article>

        <div className={'portal-rift'} aria-hidden={'true'}>
          <span>✦</span>
          <i></i>
          <b></b>
        </div>

        <article
          id={'gamePortalCard'}
          onKeyDown={(e) => keyboard(e, controller.openGame)}
          onClick={(e) => {
            if (!(e.target as Element).closest('button,a,input')) void controller.openGame();
          }}
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
              A Lei do Trono e Azul. Escolha sua mesa, chame os amigos e continue na mesma chamada.
            </p>
            <div className={'portal-features'} aria-label={'Recursos do jogo'}>
              <span>♛ Salões</span>
              <span>⚔ Estratégia</span>
              <span>✦ Influência</span>
              <span>☾ Sombra</span>
            </div>
            <button
              id={'openGamePortalBtn'}
              onClick={() => void controller.openGame()}
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
            value={state.name}
            readOnly={state.readOnly}
            aria-readonly={state.readOnly}
            onChange={(e) => controller.queueNameCheck(e.target.value)}
            maxLength={20}
            autoComplete={'nickname'}
            aria-describedby={'portalNameAvailability'}
          />
          <small
            id={'portalNameAvailability'}
            className={
              'name-availability ' +
              (state.feedback.available
                ? 'available'
                : { NAME_TAKEN: 'taken', NAME_REQUIRED: 'required', CHECKING: 'checking' }[
                    state.feedback.code || ''
                  ] || '')
            }
            aria-live={'polite'}
          >
            {state.feedback.message}
          </small>
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
            <strong id={'portalNowPlaying'}>{state.nowPlaying}</strong>
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
          onClick={() => controller.setCredits(true)}
          className={'portal-credit-btn'}
          type={'button'}
          title={'Créditos das trilhas'}
        >
          CC0
        </button>
      </section>
      <PortalCredits controller={controller} visible={state.creditsOpen} />
    </>
  );
}
