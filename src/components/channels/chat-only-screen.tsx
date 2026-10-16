import { ChannelList } from './channel-list';

export function ChatOnlyScreen() {
  return (
    <>
      <section id={'chatOnlyScreen'} className={'screen chat-only-screen hidden'}>
        <header className={'chat-only-topbar chat-app-header'}>
          <div className={'chat-app-brand'}>
            <span className={'chat-app-crest'}>
              M<span>&amp;</span>N
            </span>
            <div>
              <small>SEU PONTO DE ENCONTRO</small>
              <h2>Comunidade M&amp;N</h2>
              <p id={'chatOnlyStatus'}>Conectando ao salão de conversa...</p>
            </div>
          </div>
          <div className={'chat-app-statusbar'} aria-label={'Estado da comunicação'}>
            <button
              id={'telemetryStatusPill'}
              className={'connection-health neutral'}
              title={'Abrir diagnóstico da conexão'}
            >
              <i></i>
              <span id={'telemetryHealthLabel'}>Conexão</span>
              <small id={'telemetryHealthDetail'}>aguardando</small>
            </button>
            <span id={'chatOnlyTransport'} className={'transport-pill'}>
              P2P
            </span>
            <span id={'chatOnlyCount'} className={'participant-pill'}>
              0 pessoas conectadas
            </span>
          </div>
          <div className={'chat-only-top-actions'}>
            <span id={'myRoleBadge'} className={'role-badge role-member'}>
              Membro
            </span>
            <button
              id={'communityManageBtn'}
              className={'chat-header-action hidden'}
              type={'button'}
            >
              <span>⚙</span>
              <b>Gerenciar</b>
            </button>
            <button
              id={'chatProfileBtn'}
              className={'chat-header-action'}
              type={'button'}
              title={'Perfil, tema e layout'}
            >
              <span>
                <svg
                  viewBox={'0 0 24 24'}
                  fill={'none'}
                  stroke={'currentColor'}
                  strokeWidth={'1.7'}
                  aria-hidden={'true'}
                >
                  <circle cx={'12'} cy={'7'} r={'4'}></circle>
                  <path d={'M4 22v-3c0-5 16-5 16 0v3z'}></path>
                </svg>
              </span>
              <b>Perfil</b>
            </button>
            <button
              id={'chatOnlyTextBtn'}
              className={'chat-header-action'}
              title={'Abrir mensagens de texto'}
            >
              <span>💬</span>
              <b>Chat</b>
              <em id={'chatOnlyUnread'} className={'chat-header-unread hidden'}>
                0
              </em>
            </button>
            <button id={'chatOnlyOpenSocialBtn'} className={'royal-btn hidden'}>
              Abrir comunicação
            </button>
            <button
              id={'backFromChatOnlyBtn'}
              className={'chat-header-action back-action'}
              title={'Voltar ao início'}
            >
              <span>←</span>
              <b>Voltar</b>
            </button>
          </div>
        </header>
        <nav className={'mn-channel-sidebar'} aria-label={'Canais M&N'}>
          <div className={'mn-sidebar-heading'}>
            <div>
              <button
                id={'channelHomeBtn'}
                className={'channel-home'}
                type={'button'}
                aria-label={'M&N · Ir para o início'}
              >
                M&amp;N
              </button>
              <small>Seu ponto de encontro.</small>
            </div>
            <button
              id={'createChannelBtn'}
              className={'channel-add hidden'}
              type={'button'}
              aria-label={'Criar ou excluir canais'}
              title={'Gerenciar canais'}
            >
              +
            </button>
          </div>
          <div className={'mn-sidebar-scroll'}>
            <div className={'mn-sidebar-label'}>TEXTO</div>
            <ChannelList group="text" />
            <div className={'mn-sidebar-label'}>SALAS DE VOZ</div>
            <ChannelList group="voice" />
          </div>
          <div className={'mn-sidebar-bottom'}>
            <span className={'mn-online-dot'}></span>
            <div>
              <strong id={'chatOnlyRoomName'}>Geral</strong>
              <small>Canal selecionado • M&amp;N</small>
            </div>
          </div>
        </nav>
      </section>
    </>
  );
}
