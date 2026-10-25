'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { PrimaryScreen, PortalSnapshot } from '../../lib/navigation/portal';
import type { GameDestination } from '../../lib/games/library';
import { Avatar } from '../profiles/avatar';
import { AccountForm, AccountOverlay } from './auth';
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
  'ticketToRideScreen',
  'rogueliteScreen',
  'nexusScreen',
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
  if (!runtime.TronoSocial.voiceJoined && !runtime.TronoSocial.voiceJoining) return null;
  return (
    <div className={styles.callSummary}>
      <span className={styles.connection}>
        <Icon name="voice" size={14} />{' '}
        {runtime.TronoSocial.voiceJoining ? 'Conectando…' : 'Conectado à voz'}
      </span>
      <small>{nav.voiceRoom?.name || 'Sala de jogo'}</small>
      <div>
        {(['muteMicBtn', 'deafenVoiceBtn', 'joinVoiceBtn'] as const).map((id) => (
          <button
            type="button"
            key={id}
            aria-label={state.buttons[id].label}
            title={state.buttons[id].label}
            aria-pressed={state.buttons[id].active}
            disabled={state.buttons[id].disabled}
            onClick={() => void runtime.TronoCallToolbar.activate(id)}
          >
            {id === 'muteMicBtn' ? (
              <Icon name={state.buttons[id].active ? 'microphoneSlash' : 'microphone'} />
            ) : id === 'deafenVoiceBtn' ? (
              <Icon name="headphones" />
            ) : (
              <Icon name="exit" />
            )}
          </button>
        ))}
      </div>
    </div>
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
    dm = useModel(runtime.TronoDirectMessages);
  const account = auth.user || auth.guest;
  const open = async (id: string, voice = false) => {
    close();
    runtime.TronoDirectMessages.close();
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
        <Icon name="chevron" size={17} />
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
            data-active={dm.open}
            onClick={() => {
              close();
              if (!auth.user) {
                runtime.TronoAuth.open('login');
                return;
              }
              runtime.TronoPortal.showOnly('chatOnlyScreen');
              void runtime.TronoDirectMessages.openFriends();
            }}
          >
            <Icon name="members" />
            <span>Pessoas da Corte</span>
          </button>
        </div>
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
                data-active={!dm.open && channels.selectedId === c.id}
                aria-current={!dm.open && channels.selectedId === c.id ? 'page' : undefined}
                data-channel={c.id}
                onClick={() => void open(c.id)}
              >
                <span className={styles.hash}>
                  <Icon name="hash" />
                </span>
                <span>{c.name}</span>
                {!!channels.notices[c.id]?.unread && (
                  <b className={styles.badge}>{channels.notices[c.id].unread}</b>
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
                  onClick={() => void open(c.id, true)}
                >
                  <Icon name="voice" />
                  <span>{c.name}</span>
                  <small>{c.players.filter((p) => p.inVoice).length || ''}</small>
                </button>
                {c.players
                  .filter((p) => p.inVoice)
                  .map((p) => (
                    <div className={styles.voicePerson} key={p.id}>
                      <Avatar person={p} className={styles.tinyAvatar} />
                      {p.name}
                    </div>
                  ))}
              </div>
            ))}
        {!!dm.threads.length && (
          <>
            <div className={styles.sectionLabel}>MENSAGENS DIRETAS</div>
            {dm.threads.map((p) => (
              <button
                className={styles.channel}
                key={p.peerId}
                onClick={() => {
                  close();
                  runtime.TronoPortal.showOnly('chatOnlyScreen');
                  void runtime.TronoDirectMessages.open(p.peerId);
                }}
              >
                <Avatar person={p} className={styles.tinyAvatar} />
                <span>{p.name}</span>
                {!!p.unread && <b className={styles.badge}>{p.unread}</b>}
              </button>
            ))}
          </>
        )}
      </div>
      <CallSummary runtime={runtime} />
      <footer className={styles.account}>
        <span className={styles.initialAvatar}>{account?.nickname.slice(0, 1) || 'C'}</span>
        <div>
          <strong>{account?.nickname || 'Visitante'}</strong>
          <small>{auth.user ? 'Sua conta' : auth.guest ? 'Convidado' : 'Bem-vindo ao M&N'}</small>
        </div>
        {account ? (
          <button
            aria-label="Sair da conta"
            title="Sair da conta"
            onClick={() =>
              void (auth.user ? runtime.TronoAuth.logout() : runtime.TronoAuth.endGuest())
            }
          >
            <Icon name="exit" />
          </button>
        ) : (
          <button className={styles.link} onClick={() => runtime.TronoPortal.showPortal()}>
            Entrar
          </button>
        )}
      </footer>
    </>
  );
}
function Members({ runtime }: { runtime: ApplicationServices }) {
  const state = useModel(runtime.TronoCommunity),
    members = state.presence?.members.filter((m) => m.online) ?? [];
  return (
    <>
      <div className={styles.sectionLabel}>ONLINE — {members.length}</div>
      {members.map((person) => (
        <button
          key={person.id}
          className={styles.member}
          onClick={() => {
            runtime.TronoPortal.showOnly('chatOnlyScreen');
            void runtime.TronoDirectMessages.open(person.id);
          }}
          disabled={person.guest || person.id === runtime.TronoAuth.user?.id}
        >
          <Avatar person={person} className={styles.avatar} />
          <span>
            <strong>{person.name}</strong>
            <small>{person.activity?.name || person.roomName || 'Disponível'}</small>
          </span>
          <i className={styles.onlineDot} />
        </button>
      ))}
      {!members.length && (
        <p className={styles.sidebarHint}>
          {state.connected
            ? 'Nenhum membro online no momento.'
            : 'Aguardando presença da comunidade…'}
        </p>
      )}
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
  const screen = portal?.screen ?? 'portalScreen',
    game = GAME_SCREENS.has(screen);
  const [drawer, setDrawer] = useState(false),
    [members, setMembers] = useState(true);
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
      if (e.key === 'Escape') {
        setDrawer(false);
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, []);
  return (
    <>
      <div className={styles.app} data-game={game} data-drawer={drawer}>
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
            <button
              className={styles.iconButton}
              aria-label={members ? 'Ocultar membros' : 'Mostrar membros'}
              aria-expanded={members}
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
                {screen === 'portalScreen' && <AccountForm runtime={runtime} />}
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
                <Conversation runtime={runtime} />
                <aside className={styles.members} hidden={!members} aria-label="Membros online">
                  <Members runtime={runtime} />
                </aside>
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
      <div className={styles.gameStage}>{children(game, screen)}</div>
      {game && runtime && (
        <button
          className={styles.gameReturn}
          onClick={() => void runtime.TronoGameLibrary.open('library')}
        >
          <Icon name="back" size={15} /> Biblioteca de jogos
        </button>
      )}
      {runtime && <AccountOverlay runtime={runtime} inline={screen === 'portalScreen'} />}
    </>
  );
}
