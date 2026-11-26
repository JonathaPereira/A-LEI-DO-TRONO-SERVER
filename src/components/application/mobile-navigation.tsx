'use client';
import { useSyncExternalStore } from 'react';
import type { PrimaryScreen } from '../../lib/navigation/portal';
import type { AndroidPermissionsSnapshot } from '../../lib/mobile/background-permissions';
import { useModel, type ApplicationServices } from './services';
import { AppIcon as Icon } from './icons';
import styles from './mobile.module.css';

const noop = () => () => {};
const emptyBg = (): AndroidPermissionsSnapshot | null => null;

export type MobilePanel = 'none' | 'voice' | 'profile';

export function MobileNavigation({
  runtime,
  screen,
  panel,
  onSelectPanel,
}: {
  runtime: ApplicationServices;
  screen: PrimaryScreen;
  panel: MobilePanel;
  onSelectPanel(next: MobilePanel): void;
}) {
  const call = useModel(runtime.TronoCallNavigation);
  const channels = useModel(runtime.TronoChannels);
  const dm = useModel(runtime.TronoDirectMessages);
  const toolbar = useModel(runtime.TronoCallToolbar);
  const bgGuard = runtime.TronoAndroidBackground;
  const bgState = useSyncExternalStore(
    bgGuard?.subscribe ?? noop,
    bgGuard?.getSnapshot ?? emptyBg,
    emptyBg,
  );

  const joined = runtime.TronoSocial.voiceJoined || runtime.TronoSocial.voiceJoining;
  const onCallStage = panel === 'none' && screen === 'chatOnlyScreen' && call.page === 'call';
  const liveVoiceCount = channels.channels
    .filter((c) => c.type !== 'text')
    .reduce((sum, c) => sum + c.players.filter((p) => p.inVoice).length, 0);
  const unreadChat =
    Object.values(channels.notices).reduce((sum, n) => sum + (n?.unread || 0), 0) +
    dm.threads.reduce((sum, t) => sum + (t.unread || 0), 0);
  const micMuted = toolbar.buttons.muteMicBtn.active;
  const needsBgSetup = Boolean(bgState?.supported && bgState.checked && !bgState.allReady);

  const openChat = () => {
    onSelectPanel('none');
    runtime.TronoDirectMessages.close();
    runtime.TronoPortal.showOnly('chatOnlyScreen');
    runtime.TronoCallNavigation.showChat();
  };

  return (
    <div className={styles.dock}>
      {joined && !onCallStage && (
        <div className={styles.activeCallBar}>
          <button
            type="button"
            className={styles.activeCallMain}
            onClick={() => {
              onSelectPanel('none');
              runtime.TronoDirectMessages.close();
              runtime.TronoPortal.showOnly('chatOnlyScreen');
              runtime.TronoCallNavigation.showCall();
            }}
          >
            <Icon name="voice" size={18} />
            <span>
              Chamada em andamento{call.voiceRoom?.name ? ` · ${call.voiceRoom.name}` : ''}
              <small>Toque para voltar</small>
            </span>
            <Icon name="arrow" size={16} />
          </button>
          <button
            type="button"
            className={styles.activeCallMute}
            aria-label={micMuted ? 'Ativar microfone' : 'Mutar microfone'}
            aria-pressed={micMuted}
            onClick={() => void runtime.TronoCallToolbar.activate('muteMicBtn')}
          >
            <Icon name={micMuted ? 'microphoneSlash' : 'microphone'} size={18} />
          </button>
        </div>
      )}
      <nav className={styles.tabs} aria-label="Navegação do celular">
        <button
          type="button"
          aria-label="Voz"
          aria-current={panel === 'voice' || onCallStage ? 'page' : undefined}
          onClick={() => {
            if (joined && panel !== 'voice' && !onCallStage) {
              onSelectPanel('none');
              runtime.TronoDirectMessages.close();
              runtime.TronoPortal.showOnly('chatOnlyScreen');
              runtime.TronoCallNavigation.showCall();
              return;
            }
            onSelectPanel('voice');
          }}
        >
          <span className={styles.iconWrap}>
            <Icon name="voice" size={20} />
            {liveVoiceCount > 0 && (
              <span className={styles.badge} data-kind="voice">
                {liveVoiceCount}
              </span>
            )}
          </span>
          <span>Voz</span>
        </button>

        <button
          type="button"
          aria-label="Chat"
          aria-current={
            panel === 'none' && screen === 'chatOnlyScreen' && call.page === 'chat'
              ? 'page'
              : undefined
          }
          onClick={openChat}
        >
          <span className={styles.iconWrap}>
            <Icon name="chat" size={20} />
            {unreadChat > 0 && <span className={styles.badge}>{unreadChat}</span>}
          </span>
          <span>Chat</span>
        </button>

        <button
          type="button"
          aria-label="Jogos"
          aria-current={panel === 'none' && screen === 'gamesScreen' ? 'page' : undefined}
          onClick={() => {
            onSelectPanel('none');
            void runtime.TronoGameLibrary.open('library');
          }}
        >
          <span className={styles.iconWrap}>
            <Icon name="games" size={20} />
          </span>
          <span>Jogos</span>
        </button>

        <button
          type="button"
          aria-label="Perfil"
          aria-current={panel === 'profile' ? 'page' : undefined}
          onClick={() => onSelectPanel(panel === 'profile' ? 'none' : 'profile')}
        >
          <span className={styles.iconWrap}>
            <Icon name="profile" size={20} />
            {needsBgSetup && (
              <span className={styles.badge} data-kind="warn" aria-label="Configurar 2º plano">
                !
              </span>
            )}
          </span>
          <span>Perfil</span>
        </button>
      </nav>
    </div>
  );
}
