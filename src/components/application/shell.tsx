'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import type { CallNavigationSnapshot } from '../../types/call-navigation';
import type { PrimaryScreen, PortalSnapshot } from '../../lib/navigation/portal';
import type { GameDestination } from '../../lib/games/library';
import { Avatar } from '../profiles/avatar';
import { DirectProfileBanner } from '../profiles/decorations';
import { AccountForm, AccountOverlay } from './auth';
import { QuickPanel } from './quick-panel';
import panelStyles from './quick-panel.module.css';
import { QuickAudio } from './quick-audio';
import { CommunityActions, ChannelFilesAction, CommunityDialogs } from './community-settings';
import { ProfileDialogs } from './profile-settings';
import { MediaSettings } from './media-settings';
import { ApplicationNotices } from './notices';
import { CallSurface } from './call';
import { Conversation } from './conversation';
import { useModel, useServices, type ApplicationServices } from './services';
import { AppIcon as Icon } from './icons';
import styles from './shell.module.css';

const noop = () => () => {};
const empty = () => null;
const GAME_SCREENS = new Set<PrimaryScreen>([
  'setupScreen',
  'roomScreen',
  'gameScreen',
  'azulScreen',
  'splendorScreen',
  'loveLetterScreen',
  'similoScreen',
  'ticketToRideScreen',
  'rogueliteScreen',
  'nexusScreen',
  'atalaiaScreen',
]);
const games: readonly {
  id: GameDestination;
  title: string;
  tag: string;
  description: string;
  image: string;
}[] = [
  {
    id: 'throne',
    title: 'A Lei do Trono',
    tag: 'ESTRATÉGIA · CARTAS',
    description: 'A Corte espera sua próxima jogada.',
    image: '/assets/games/throne-cover.webp',
  },
  {
    id: 'azul',
    title: 'Azul',
    tag: 'ESTRATÉGIA · 2–4 JOGADORES',
    description: 'Uma cor de cada vez. Uma obra só sua.',
    image: '/assets/azul/box-cover.webp',
  },
  {
    id: 'splendor',
    title: 'Splendor',
    tag: 'ESTRATÉGIA · 2–4 JOGADORES',
    description: 'Gemas, prestígio e uma boa oportunidade.',
    image: '/assets/games/splendor-cover.webp',
  },
  {
    id: 'similo',
    title: 'Similo',
    tag: 'DEDUÇÃO COOPERATIVA · 2–8 JOGADORES',
    description: 'Uma pista, mil conexões. Misture temas e descubra o segredo.',
    image: '/assets/similo/cover.svg',
  },
  {
    id: 'love-letter',
    title: 'Love Letter',
    tag: 'DEDUÇÃO · 2–6 JOGADORES',
    description: 'Poucas cartas. Muitas intenções.',
    image: '/assets/love-letter/table.webp',
  },
  {
    id: 'ticket-to-ride',
    title: 'Ticket to Ride',
    tag: 'ESTRATÉGIA · 2–5 JOGADORES',
    description: 'Conecte cidades. Planeje seu caminho.',
    image: '/assets/ticket-to-ride/board-usa.jpg',
  },
  {
    id: 'roguelite',
    title: 'Cinzas do Abismo',
    tag: 'AÇÃO · SOLO',
    description: 'Uma nova jornada a cada tentativa.',
    image: '/roguelite/assets/catalogue-cover.png',
  },
  {
    id: 'atalaia',
    title: 'Atalaia',
    tag: 'TOWER DEFENSE · SOLO',
    description: 'Quinze ondas para defender o cristal.',
    image: '/assets/games/atalaia-cover.jpg',
  },
  {
    id: 'nexus',
    title: 'Nexus',
    tag: 'AVENTURA · JOGO EXTERNO',
    description: 'Ecos do Crepúsculo, na sua próxima aventura.',
    image: '/assets/games/nexus-cover.webp',
  },
];
function CallSummary({ runtime }: { runtime: ApplicationServices }) {
  const state = useModel(runtime.TronoCallToolbar),
    nav = useModel(runtime.TronoCallNavigation);
  const joined = runtime.TronoSocial.voiceJoined || runtime.TronoSocial.voiceJoining;
  return (
    <section className={styles.callSummary} hidden={!joined} aria-label="Conexão de voz">
      <div className={styles.connectionRow}>
        <button
          type="button"
          className={styles.connectionTarget}
          aria-label="Voltar à chamada"
          onClick={() => {
            runtime.TronoDirectMessages.close();
            runtime.TronoPortal.showOnly('chatOnlyScreen');
            runtime.TronoCallNavigation.showCall();
          }}
        >
          <Icon name="voice" size={22} />
          <span>
            <strong>{runtime.TronoSocial.voiceJoining ? 'Conectando…' : 'Voz conectada'}</strong>
            <small>{nav.voiceRoom?.name || 'Sala de jogo'}</small>
          </span>
        </button>
        <QuickAudio runtime={runtime} />
        <button
          type="button"
          className={styles.disconnectVoice}
          aria-label={state.buttons.joinVoiceBtn.label}
          title={state.buttons.joinVoiceBtn.label}
          disabled={state.buttons.joinVoiceBtn.disabled}
          onClick={() => void runtime.TronoCallToolbar.activate('joinVoiceBtn')}
        >
          <Icon name="disconnect" size={19} />
        </button>
      </div>
      <div className={styles.voiceActions}>
        {(['cameraBtn', 'screenShareBtn'] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-label={state.buttons[id].label}
            title={state.buttons[id].label}
            aria-pressed={state.buttons[id].active}
            disabled={state.buttons[id].disabled}
            onClick={() => void runtime.TronoCallToolbar.activate(id)}
          >
            <Icon
              name={
                id === 'cameraBtn' ? (state.buttons[id].active ? 'camera' : 'cameraOff') : 'screen'
              }
              size={19}
            />
          </button>
        ))}
        <button
          id="soundboardToggle"
          type="button"
          aria-label="Efeitos sonoros da sidebar"
          title="Efeitos sonoros"
          aria-expanded="false"
          aria-controls="soundboardDialog"
        >
          <Icon name="music" size={19} />
        </button>
      </div>
    </section>
  );
}
function Navigation({
  runtime,
  screen,
  close,
}: {
  runtime: ApplicationServices;
  screen: PrimaryScreen;
  close(): void;
}) {
  const auth = useModel(runtime.TronoAuth),
    channels = useModel(runtime.TronoChannels),
    dm = useModel(runtime.TronoDirectMessages),
    call = useModel(runtime.TronoCallNavigation),
    toolbar = useModel(runtime.TronoCallToolbar),
    stage = useModel(runtime.TronoCallStage);
  const account = auth.user || auth.guest;
  const [directExpanded, setDirectExpanded] = useState(false);
  const visibleThreads = directExpanded
    ? dm.threads
    : dm.threads.filter((thread, index) => index < 6 || thread.peerId === dm.peerId);
  useEffect(() => setDirectExpanded(false), [account?.id]);
  const open = async (id: string, voice = false) => {
    close();
    runtime.TronoDirectMessages.close();
    if (voice) runtime.TronoCallNavigation.showCall();
    else runtime.TronoCallNavigation.showChat();
    try {
      if (voice) runtime.TronoSocial.primeVoiceGesture();
      if (screen !== 'chatOnlyScreen') {
        const entered = await runtime.TronoCommunityNavigation.enter({
          channelId: id,
          textOnly: !voice,
        });
        if (entered && voice) await runtime.TronoChatHub.switchChannel(id, { connectVoice: true });
      } else if (voice) await runtime.TronoChatHub.switchChannel(id, { connectVoice: true });
      else await runtime.TronoMessenger.joinChannel(id, { showText: true });
    } catch (error) {
      runtime.TronoChatComposer.reportStatus(
        error instanceof Error ? error.message : 'Não foi possível abrir o canal.',
      );
    }
  };
  return (
    <>
      <div className={styles.sidebarHeader}>
        <button
          className={styles.brandHome}
          aria-label="Comunicação"
          onClick={() => {
            close();
            runtime.TronoCallNavigation.showChat();
            void runtime.TronoPortal.openVoice();
          }}
        >
          <span className={styles.crest}>
            <Icon name="crown" size={28} />
          </span>
          <div>
            <strong>A Corte</strong>
            <small>A LEI DO TRONO</small>
          </div>
        </button>
      </div>
      <div className={styles.sidebarScroll}>
        <div className={styles.primaryNavigation}>
          <button
            className={styles.friendsButton}
            aria-label="Biblioteca de jogos"
            data-active={screen === 'gamesScreen'}
            onClick={() => {
              close();
              void runtime.TronoGameLibrary.open('library');
            }}
          >
            <Icon name="games" />
            <span>Biblioteca de jogos</span>
            <small>7</small>
          </button>
          <button
            className={styles.friendsButton}
            data-active={
              screen === 'chatOnlyScreen' && call.page === 'chat' && dm.open && !dm.peerId
            }
            onClick={() => {
              close();
              if (!auth.user) {
                runtime.TronoAuth.open('login');
                return;
              }
              runtime.TronoCallNavigation.showChat();
              runtime.TronoPortal.showOnly('chatOnlyScreen');
              void runtime.TronoDirectMessages.openFriends();
            }}
          >
            <Icon name="members" />
            <span>Pessoas da Corte</span>
          </button>
        </div>
        <CommunityActions runtime={runtime} />
        <div className={styles.sectionLabel}>CANAIS DE TEXTO</div>
        {!auth.user && (
          <p className={styles.sidebarHint}>
            Entre na sua conta para acessar os canais da comunidade.
          </p>
        )}
        {auth.user && !channels.ready && <p className={styles.sidebarHint}>Carregando canais…</p>}
        {auth.user && channels.ready && !channels.channels.length && (
          <p className={styles.sidebarHint}>Nenhum canal disponível.</p>
        )}
        {auth.user &&
          channels.channels
            .filter((c) => c.type !== 'voice')
            .map((c) => (
              <button
                key={c.id}
                className={styles.channel}
                data-active={
                  screen === 'chatOnlyScreen' &&
                  call.page === 'chat' &&
                  !dm.open &&
                  channels.selectedId === c.id
                }
                aria-current={
                  screen === 'chatOnlyScreen' &&
                  call.page === 'chat' &&
                  !dm.open &&
                  channels.selectedId === c.id
                    ? 'page'
                    : undefined
                }
                data-channel={c.id}
                data-muted={!!channels.notices[c.id]?.muted}
                title={
                  channels.notices[c.id]?.muted ? 'Notificações silenciadas neste canal' : undefined
                }
                onClick={() => void open(c.id)}
              >
                <span className={styles.hash}>
                  <Icon name="hash" />
                </span>
                <span className={styles.channelLabel}>{c.name}</span>
                {channels.notices[c.id]?.muted && <Icon name="bellOff" size={14} />}
                {!!channels.notices[c.id]?.unread && (
                  <b
                    className={styles.badge}
                    data-channel-unread
                    aria-label={channels.notices[c.id].unread + ' mensagens não lidas'}
                  >
                    {channels.notices[c.id].unread}
                  </b>
                )}
              </button>
            ))}
        <div className={styles.sectionLabel}>SALAS DE VOZ</div>
        {auth.user &&
          channels.channels
            .filter((c) => c.type !== 'text')
            .map((c) => (
              <div key={c.id}>
                <button
                  className={styles.channel}
                  aria-label={'Entrar na voz de ' + c.name}
                  data-voice-channel={c.id}
                  data-active={
                    screen === 'chatOnlyScreen' &&
                    call.page === 'call' &&
                    call.voiceRoom?.id === c.id
                  }
                  data-connected={call.voiceRoom?.id === c.id}
                  aria-pressed={call.voiceRoom?.id === c.id}
                  onClick={() => void open(c.id, true)}
                >
                  <Icon name="voice" />
                  <span className={styles.channelLabel}>{c.name}</span>
                  <small>{c.players.filter((p) => p.inVoice).length || ''}</small>
                </button>
                {c.players
                  .filter((p) => p.inVoice)
                  .map((p) => (
                    <div className={styles.voicePerson} key={p.id} data-voice-person={p.id}>
                      <DirectProfileBanner
                        accountId={
                          stage.participants.find((person) => person.id === p.id)?.accountId ?? ''
                        }
                      />
                      <Avatar person={p} className={styles.tinyAvatar} />
                      <span>{p.name}</span>
                    </div>
                  ))}
              </div>
            ))}
        {!!dm.threads.length && (
          <details className={styles.directGroup} open aria-label="Mensagens diretas">
            <summary>
              <Icon name="chevron" size={13} />
              <span>Mensagens diretas</span>
              <small>{dm.threads.length}</small>
            </summary>
            {visibleThreads.map((p) => (
              <button
                className={styles.channel + ' ' + styles.directMessage}
                data-direct-peer={p.peerId}
                key={p.peerId}
                data-active={
                  screen === 'chatOnlyScreen' &&
                  call.page === 'chat' &&
                  dm.open &&
                  dm.peerId === p.peerId
                }
                onClick={() => {
                  close();
                  runtime.TronoCallNavigation.showChat();
                  runtime.TronoPortal.showOnly('chatOnlyScreen');
                  void runtime.TronoDirectMessages.open(p.peerId);
                }}
              >
                <DirectProfileBanner accountId={p.peerId} />
                <Avatar person={p} className={styles.tinyAvatar} />
                <span className={styles.channelLabel}>{p.name}</span>
                {!!p.unread && <b className={styles.badge}>{p.unread}</b>}
              </button>
            ))}
            {dm.threads.length > 6 && (
              <button
                type="button"
                className={styles.moreDirect}
                onClick={() => setDirectExpanded(!directExpanded)}
              >
                {directExpanded
                  ? 'Mostrar menos'
                  : `Mostrar todas as conversas (${dm.threads.length})`}
              </button>
            )}
          </details>
        )}
      </div>
      <CallSummary runtime={runtime} />
      <footer className={styles.account} data-account-card>
        <DirectProfileBanner accountId={auth.user?.id ?? ''} />
        {account ? (
          <Avatar person={auth.user ?? { avatar_preset: 'person' }} className={styles.avatar} />
        ) : (
          <span className={styles.initialAvatar}>C</span>
        )}
        <div>
          <QuickPanel
            label="Meu perfil"
            trigger={<strong>{account?.nickname || 'Visitante'}</strong>}
          >
            <div className={panelStyles.identity}>
              <DirectProfileBanner accountId={auth.user?.id ?? ''} />
              {account && (
                <Avatar
                  person={auth.user ?? { avatar_preset: 'person' }}
                  className={styles.avatar}
                />
              )}
              <strong>{account?.nickname || 'Visitante'}</strong>
              <small>{auth.user ? 'Sua conta na Corte' : 'Convidado'}</small>
            </div>
            <button
              type="button"
              data-close-panel
              onClick={() =>
                auth.user
                  ? runtime.TronoCallSettings.open('account')
                  : runtime.TronoAuth.open('login')
              }
            >
              <Icon name="members" size={18} />
              Editar perfil
            </button>
            {auth.user && (
              <button
                type="button"
                data-close-panel
                onClick={() => void runtime.TronoProfileViewer.open(auth.user!.id)}
              >
                <Icon name="eye" size={18} />
                Ver meu cartão
              </button>
            )}
            <button
              type="button"
              data-close-panel
              onClick={() => runtime.TronoCallSettings.open('account')}
            >
              <Icon name="settings" size={18} />
              Configurações da Corte
            </button>
            <button
              type="button"
              data-close-panel
              onClick={() =>
                void (auth.user ? runtime.TronoAuth.logout() : runtime.TronoAuth.endGuest())
              }
            >
              <Icon name="exit" size={18} />
              Sair da conta
            </button>
          </QuickPanel>
          <small>{auth.user ? 'Sua conta' : auth.guest ? 'Convidado' : 'Bem-vindo ao M&N'}</small>
        </div>
        {(['muteMicBtn', 'deafenVoiceBtn'] as const).map((id) => (
          <button
            type="button"
            key={id}
            aria-label={toolbar.buttons[id].label}
            title={toolbar.buttons[id].label}
            aria-pressed={toolbar.buttons[id].active}
            disabled={toolbar.buttons[id].disabled}
            onClick={() => void runtime.TronoCallToolbar.activate(id)}
          >
            <Icon
              name={
                id === 'muteMicBtn'
                  ? toolbar.buttons[id].active
                    ? 'microphoneSlash'
                    : 'microphone'
                  : 'headphones'
              }
              size={18}
            />
          </button>
        ))}
        <button
          type="button"
          aria-label="Voz e vídeo"
          title="Voz e vídeo"
          onClick={() => runtime.TronoCallSettings.open('audio')}
        >
          <Icon name="settings" size={18} />
        </button>
      </footer>
    </>
  );
}
function Members({ runtime }: { runtime: ApplicationServices }) {
  const state = useModel(runtime.TronoCommunity),
    management = useModel(runtime.TronoChannelManagement);
  const people = state.presence?.members ?? [];
  return (
    <>
      {!state.connected && (
        <p className={styles.sidebarHint} role="status">
          {state.presence
            ? 'Reconectando… Exibindo a última presença recebida.'
            : 'Aguardando presença da comunidade…'}
        </p>
      )}
      {state.presence?.scope === 'community' && !state.presence.directoryReady && (
        <p className={styles.sidebarHint} role="status">
          Carregando membros…
        </p>
      )}
      {[true, false].map((online) => {
        const members = people.filter((person) => person.online === online);
        const label = online ? 'Online' : 'Offline';
        return (
          <section key={label} aria-label={label}>
            <h2 className={styles.sectionLabel}>
              {label.toUpperCase()} — {members.length}
            </h2>
            {members.map((person) => (
              <div key={person.id} className={styles.memberRow}>
                <button
                  type="button"
                  className={styles.member}
                  data-online={person.online}
                  onClick={() => void runtime.TronoProfileViewer.open(person.id)}
                  aria-label={'Ver perfil de ' + person.name}
                  disabled={person.guest}
                >
                  {person.online && (
                    <DirectProfileBanner accountId={person.guest ? '' : person.id} />
                  )}
                  <Avatar person={person} className={styles.avatar} />
                  <span className={styles.memberIdentity}>
                    <strong>{person.name}</strong>
                    <small>
                      {person.online
                        ? person.activity?.name || person.roomName || 'Disponível'
                        : 'Offline'}
                    </small>
                  </span>
                  <i className={styles.onlineDot} data-online={person.online} aria-hidden="true" />
                </button>
                {management.canManageRoles &&
                  !person.guest &&
                  person.id !== management.accountId &&
                  person.role !== 'creator' && (
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={'Alterar cargo de ' + person.name}
                      onClick={() => runtime.TronoChannelManagement.editRole(person)}
                    >
                      <Icon name="settings" size={14} />
                    </button>
                  )}
              </div>
            ))}
            {!members.length && (
              <p className={styles.sidebarHint}>
                {online ? 'Nenhum membro online no momento.' : 'Nenhum membro offline nesta lista.'}
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}
function Communication({ runtime }: { runtime: ApplicationServices }) {
  const nav = useModel(runtime.TronoCallNavigation),
    route = useModel(runtime.TronoPortal);
  const [chat, setChat] = useState(false);
  return (
    <>
      <div className={styles.conversationLayout} data-call={nav.page === 'call'}>
        <CallSurface
          runtime={runtime}
          visible={nav.page === 'call' && route.screen === 'chatOnlyScreen'}
          chatOpen={chat}
          toggleChat={() => setChat(!chat)}
        />
        <div className={styles.conversationPane} hidden={nav.page === 'call' && !chat}>
          {nav.page === 'call' && (
            <button
              type="button"
              className={styles.closeCallChat}
              aria-label="Fechar conversa da chamada"
              onClick={() => setChat(false)}
            >
              <Icon name="close" size={17} />
            </button>
          )}
          <Conversation runtime={runtime} />
        </div>
      </div>
    </>
  );
}
function Catalog({ runtime }: { runtime: ApplicationServices }) {
  return (
    <div className={styles.catalog}>
      <div className={styles.catalogHeading}>
        <span className={styles.sectionLabel}>UMA PAUSA. UMA PARTIDA.</span>
        <h1>O que vamos jogar?</h1>
        <p>A próxima história começa na mesma mesa.</p>
      </div>
      <div className={styles.gameGrid}>
        {games.map((game) => (
          <button
            className={styles.gameCard}
            data-game={game.id}
            key={game.id}
            onClick={() => void runtime.TronoGameLibrary.open(game.id)}
          >
            <span className={styles.cover}>
              <img src={game.image} alt="" loading="lazy" />
              <span>{game.title.slice(0, 1)}</span>
            </span>
            <div>
              <small>{game.tag}</small>
              <h2>{game.title}</h2>
              <p>{game.description}</p>
              <strong>
                Jogar <Icon name="arrow" size={15} />
              </strong>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
export function ApplicationShell({
  children,
}: {
  children(active: boolean, screen: PrimaryScreen): ReactNode;
}) {
  const runtime = useServices();
  const portal = useSyncExternalStore<PortalSnapshot | null>(
    runtime?.TronoPortal.subscribe ?? noop,
    runtime?.TronoPortal.getSnapshot ?? empty,
    empty,
  );
  const callNav = useSyncExternalStore<CallNavigationSnapshot | null>(
    runtime?.TronoCallNavigation.subscribe ?? noop,
    runtime?.TronoCallNavigation.getSnapshot ?? empty,
    empty,
  );
  const session = useSyncExternalStore(
    runtime?.TronoAuth.subscribe ?? noop,
    runtime?.TronoAuth.getSnapshot ?? empty,
    empty,
  );
  const [sessionReady, setSessionReady] = useState(false);
  useEffect(() => {
    let current = true;
    if (runtime)
      void runtime.TronoAuth.ready.then(() => {
        if (current) setSessionReady(true);
      });
    return () => {
      current = false;
    };
  }, [runtime]);
  const entry = !session?.user && !session?.guest;
  const screen = entry ? 'portalScreen' : (portal?.screen ?? 'portalScreen'),
    game = GAME_SCREENS.has(screen);
  const [similoControls, setSimiloControls] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSimiloControls(
      screen === 'similoScreen' ? document.getElementById('similoShellControls') : null,
    );
  }, [screen]);
  const [drawer, setDrawer] = useState(false),
    [members, setMembers] = useState(true);
  const memberIdentity = session?.user?.id ?? session?.guest?.id ?? null;
  useEffect(() => setMembers(true), [memberIdentity]);
  useEffect(() => {
    const surface = document.getElementById('gameSurface');
    if (!surface) return;
    const mirror = () => {
      surface.className = 'game-surface ' + document.body.className;
      for (const [key, value] of Object.entries(document.body.dataset))
        if (value !== undefined) surface.dataset[key] = value;
      surface.dataset.appLayout = document.body.dataset.appLayout || 'original';
      surface.style.cssText = document.body.style.cssText;
    };
    const observer = new MutationObserver(mirror);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-app-layout', 'data-games-view'],
    });
    mirror();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (
        e.key !== 'Escape' ||
        e.defaultPrevented ||
        document.fullscreenElement ||
        document.querySelector('dialog:modal, [popover]:popover-open, .media-maximized')
      )
        return;
      if (drawer) {
        setDrawer(false);
        return;
      }
      if (window.matchMedia('(max-width: 1000px)').matches) setMembers(false);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [drawer]);
  return (
    <>
      <div
        className={styles.workspace}
        data-members={members && !entry}
        data-call={screen === 'chatOnlyScreen' && callNav?.page === 'call'}
      >
        <div className={styles.workspaceContent}>
          <div
            className={styles.app}
            data-game={game}
            data-entry={entry}
            data-drawer={drawer}
            data-call={screen === 'chatOnlyScreen' && callNav?.page === 'call'}
          >
            <aside className={styles.sidebar} aria-label="Canais e conversas">
              {runtime && (
                <Navigation runtime={runtime} screen={screen} close={() => setDrawer(false)} />
              )}
            </aside>
            {drawer && (
              <button
                className={styles.shade}
                aria-label="Fechar canais"
                onClick={() => setDrawer(false)}
              />
            )}
            <main className={styles.main}>
              <header className={styles.header}>
                <button
                  className={styles.drawerButton}
                  aria-label="Abrir canais"
                  aria-expanded={drawer}
                  onClick={() => setDrawer(!drawer)}
                >
                  <Icon name="menu" />
                </button>
                <span className={styles.headerSymbol}>
                  {screen === 'gamesScreen' ? <Icon name="games" /> : <Icon name="chat" />}
                </span>
                <div className={styles.headerText}>
                  <strong>
                    {screen === 'gamesScreen'
                      ? 'Biblioteca de jogos'
                      : screen === 'portalScreen'
                        ? 'Seu lugar à mesa'
                        : 'A Corte'}
                  </strong>
                  <small>
                    {screen === 'gamesScreen'
                      ? 'Escolha sua próxima história.'
                      : 'A mesa está aberta. Puxe uma cadeira.'}
                  </small>
                </div>
                <span className={styles.headerStatus} data-connected={portal?.connected}>
                  {portal?.connected ? 'Conectado' : 'Conectando…'}
                </span>
                {runtime && screen === 'chatOnlyScreen' && <ChannelFilesAction runtime={runtime} />}
                <button
                  className={styles.iconButton}
                  aria-label={members ? 'Ocultar membros' : 'Mostrar membros'}
                  aria-expanded={members}
                  aria-controls="communityMembers"
                  onClick={() => setMembers(!members)}
                >
                  <Icon name="members" />
                </button>
              </header>
              <section
                id="portalScreen"
                className={screen === 'portalScreen' ? styles.authScreen : 'hidden'}
                aria-label="Acesso ao M&N"
              >
                {runtime ? (
                  <>
                    {screen === 'portalScreen' &&
                      (entry && sessionReady ? (
                        <AccountForm runtime={runtime} />
                      ) : (
                        <p role="status">Preparando sua sessão…</p>
                      ))}
                    {portal?.entryStatus && (
                      <p role="status" className={styles.entryStatus}>
                        {portal.entryStatus}
                      </p>
                    )}
                  </>
                ) : (
                  <p className={styles.loading} role="status">
                    Preparando seu ponto de encontro…
                  </p>
                )}
              </section>
              <section
                id="chatOnlyScreen"
                className={screen === 'chatOnlyScreen' ? styles.communityScreen : 'hidden'}
                aria-label="Comunicação M&N"
              >
                {runtime && (
                  <>
                    <Communication runtime={runtime} />
                  </>
                )}
              </section>
              <section
                id="gamesScreen"
                className={screen === 'gamesScreen' ? styles.gamesScreen : 'hidden'}
                aria-label="Catálogo de jogos"
              >
                {runtime && <Catalog runtime={runtime} />}
              </section>
            </main>
          </div>
          <div
            id="gameResourceDock"
            className={styles.gameResources}
            hidden={!game || screen === 'similoScreen'}
          >
            {runtime && (
              <button
                type="button"
                aria-label="Recursos da Corte"
                onClick={() => runtime.TronoCallSettings.open('resources')}
              >
                <Icon name="settings" size={18} />
              </button>
            )}
          </div>
          <div className={styles.gameStage}>{children(game, screen)}</div>
          {similoControls &&
            runtime &&
            createPortal(
              <>
                <button
                  type="button"
                  aria-label={members ? 'Ocultar membros' : 'Mostrar membros'}
                  aria-expanded={members}
                  aria-controls="communityMembers"
                  onClick={() => setMembers(!members)}
                >
                  <Icon name="members" size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Recursos da Corte"
                  onClick={() => runtime.TronoCallSettings.open('resources')}
                >
                  <Icon name="settings" size={18} />
                </button>
              </>,
              similoControls,
            )}
          {game && screen !== 'similoScreen' && runtime && (
            <button
              className={styles.gameReturn}
              onClick={() => void runtime.TronoGameLibrary.open('library')}
            >
              <Icon name="back" size={15} /> Biblioteca de jogos
            </button>
          )}
          {game && screen !== 'similoScreen' && !members && (
            <button
              type="button"
              className={styles.gameMembersToggle}
              aria-label="Mostrar membros"
              aria-expanded="false"
              aria-controls="communityMembers"
              onClick={() => setMembers(true)}
            >
              <Icon name="members" size={18} /> Membros
            </button>
          )}
        </div>
        {runtime && (
          <aside
            id="communityMembers"
            className={styles.members}
            hidden={entry || !members}
            aria-label="Membros da Corte"
          >
            <header className={styles.membersHeader}>
              <h2>Membros da Corte</h2>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Ocultar lista de membros"
                onClick={() => setMembers(false)}
              >
                <Icon name="close" size={18} />
              </button>
            </header>
            <div className={styles.membersScroll}>
              <Members runtime={runtime} />
            </div>
          </aside>
        )}
      </div>
      {runtime && (
        <>
          <AccountOverlay runtime={runtime} inline={entry || screen === 'portalScreen'} />
          <MediaSettings runtime={runtime} />
          <ProfileDialogs runtime={runtime} />
          <CommunityDialogs runtime={runtime} />
          <ApplicationNotices runtime={runtime} />
        </>
      )}
    </>
  );
}
