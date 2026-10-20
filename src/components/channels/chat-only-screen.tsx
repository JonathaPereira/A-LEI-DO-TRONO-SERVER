import { CallNavigationHost } from '@/components/navigation/call-navigation';
import { ChannelList } from './channel-list';
import { WorkspaceHost, WorkspaceIcon } from '../navigation/workspace-controls';

export function ChatOnlyScreen() {
  return (
    <>
      <section id={'chatOnlyScreen'} className={'screen chat-only-screen hidden'}>
        <div id="callWorkspace" aria-label="Comunidade M&N">
          <header id="workspaceHeader" className={'chat-only-topbar chat-app-header'}>
            <WorkspaceHost id="sidebar" />
            <div className={'chat-app-brand'}>
              <span className={'chat-app-crest'}>
                <WorkspaceIcon>
                  <path d="M3 19V5l9 9 9-9v14l-9-9-9 9" />
                </WorkspaceIcon>
              </span>
              <div>
                <small>SEU PONTO DE ENCONTRO</small>
                <h2 id="workspaceTitle" />
                <p id="chatOnlyStatus" />
              </div>
            </div>
            <div className={'chat-app-statusbar'} aria-label={'Estado da comunicação'}>
              <span id="voiceConnectionIndicator" style={{ display: 'contents' }} />
              <span id="chatOnlyCount" className="participant-pill" />
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
              <WorkspaceHost id="layout" />
              <span id="creatorAccountsButtonHost" style={{ display: 'contents' }} />
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
              <CallNavigationHost id="chatOnlyTextBtn" />
              <CallNavigationHost id="chatOnlyOpenSocialBtn" />
              <span id="communityBackHost" style={{ display: 'contents' }} />
            </div>
          </header>
          <div id="callWorkspaceSidebar">
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
                <details id="workspaceTools">
                  <summary aria-label="Mais opções" title="Mais opções">
                    <WorkspaceIcon>
                      <circle cx="5" cy="12" r="1" />
                      <circle cx="12" cy="12" r="1" />
                      <circle cx="19" cy="12" r="1" />
                    </WorkspaceIcon>
                  </summary>
                  <div id="workspaceToolsActions" />
                </details>
              </div>
              <nav
                id="workspaceAreaTabs"
                className="workspace-area-tabs"
                aria-label="Áreas da comunidade"
              />
              <div className={'mn-sidebar-scroll'}>
                <section className="workspace-direct-menu">
                  <WorkspaceHost id="direct" />
                </section>
                <div className={'mn-sidebar-label'}>TEXTO</div>
                <ChannelList group="text" />
                <div className={'mn-sidebar-label'}>SALAS DE VOZ</div>
                <ChannelList group="voice" />
              </div>
              <div className={'mn-sidebar-bottom'}>
                <span className={'mn-online-dot'}></span>
                <div>
                  <strong id="chatOnlyRoomName" />
                  <small>Canal selecionado • M&amp;N</small>
                </div>
              </div>
            </nav>
          </div>
          <main id="callWorkspaceMain" />
          <WorkspaceHost id="header" />
          <WorkspaceHost id="shade" />
        </div>
      </section>
    </>
  );
}
