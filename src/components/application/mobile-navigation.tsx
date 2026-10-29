'use client';
import type { PrimaryScreen } from '../../lib/navigation/portal';
import { useModel, type ApplicationServices } from './services';
import { AppIcon as Icon } from './icons';
import styles from './mobile.module.css';

export function MobileNavigation({
  runtime,
  screen,
  members,
  toggleMembers,
  openChannels,
}: {
  runtime: ApplicationServices;
  screen: PrimaryScreen;
  members: boolean;
  toggleMembers(): void;
  openChannels(): void;
}) {
  const call = useModel(runtime.TronoCallNavigation);
  const dm = useModel(runtime.TronoDirectMessages);
  const communication = () => {
    runtime.TronoPortal.showOnly('chatOnlyScreen');
    runtime.TronoCallNavigation.showChat();
  };
  const joined = runtime.TronoSocial.voiceJoined || runtime.TronoSocial.voiceJoining;
  return (
    <div className={styles.dock}>
      {joined && !(screen === 'chatOnlyScreen' && call.page === 'call') && (
        <button
          className={styles.activeCall}
          onClick={() => {
            runtime.TronoDirectMessages.close();
            runtime.TronoPortal.showOnly('chatOnlyScreen');
            runtime.TronoCallNavigation.showCall();
          }}
        >
          <Icon name="voice" size={18} />
          <span>
            Chamada em andamento <small>Toque para voltar</small>
          </span>
          <Icon name="arrow" size={16} />
        </button>
      )}
      <nav className={styles.tabs} aria-label="Navegação do celular">
        <button
          aria-label="Conversas"
          aria-current={
            screen === 'chatOnlyScreen' && call.page === 'chat' && !dm.open ? 'page' : undefined
          }
          onClick={() => {
            runtime.TronoDirectMessages.close();
            communication();
          }}
        >
          <Icon name="chat" />
          <span>Conversas</span>
        </button>
        <button
          aria-label="Jogos"
          aria-current={screen === 'gamesScreen' ? 'page' : undefined}
          onClick={() => void runtime.TronoGameLibrary.open('library')}
        >
          <Icon name="games" />
          <span>Jogos</span>
        </button>
        <button
          aria-label="Amigos e mensagens"
          aria-current={
            screen === 'chatOnlyScreen' && dm.open && call.page === 'chat' ? 'page' : undefined
          }
          onClick={() => {
            communication();
            if (runtime.TronoAuth.user) void runtime.TronoDirectMessages.openFriends();
            else runtime.TronoAuth.open('login');
          }}
        >
          <Icon name="members" />
          <span>Amigos</span>
        </button>
        <button
          aria-label={members ? 'Recolher membros no celular' : 'Abrir membros no celular'}
          aria-expanded={members}
          onClick={toggleMembers}
        >
          <Icon name="members" />
          <span>Membros</span>
        </button>
        <button aria-label="Canais e opções" onClick={openChannels}>
          <Icon name="menu" />
          <span>Menu</span>
        </button>
      </nav>
    </div>
  );
}
