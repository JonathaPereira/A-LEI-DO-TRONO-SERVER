'use client';

import { useSyncExternalStore } from 'react';
import { APP_RELEASE_VERSION, openReleaseNotesPanel } from '../../lib/application/release-notes';
import type { PresenceStatus } from '../../types/domain';
import type { AndroidPermissionsSnapshot } from '../../lib/mobile/background-permissions';
import { Avatar } from '../profiles/avatar';
import { AppIcon as Icon } from './icons';
import { useModel, type ApplicationServices } from './services';
import styles from './mobile-profile-panel.module.css';

const noop = () => () => {};
const emptyBg = (): AndroidPermissionsSnapshot | null => null;

const STATUS_OPTIONS: readonly { value: PresenceStatus; label: string }[] = [
  { value: 'online', label: 'Online' },
  { value: 'away', label: 'Ausente' },
  { value: 'dnd', label: 'Não Perturbar' },
];

/**
 * Clean Conceito A mobile "Perfil" tab: quick status switcher, Friends & DMs,
 * Channels jump, Android background-call permissions check, Settings, and Logout.
 */
export function MobileProfilePanel({
  runtime,
  open,
  hasCallBar,
  onClose,
  onOpenChannels,
  onOpenMembers,
}: {
  runtime: ApplicationServices;
  open: boolean;
  hasCallBar: boolean;
  onClose(): void;
  onOpenChannels(): void;
  onOpenMembers(): void;
}) {
  const auth = useModel(runtime.TronoAuth);
  const community = useModel(runtime.TronoCommunity);
  const dm = useModel(runtime.TronoDirectMessages);
  const bgGuard = runtime.TronoAndroidBackground;
  const bgState = useSyncExternalStore(
    bgGuard?.subscribe ?? noop,
    bgGuard?.getSnapshot ?? emptyBg,
    emptyBg,
  );

  if (!open) return null;

  const account = auth.user || auth.guest;
  const unreadDm = dm.threads.reduce((sum, t) => sum + (t.unread || 0), 0);

  return (
    <section
      className={styles.panel}
      data-mobile-profile-panel
      data-call-bar={hasCallBar}
      aria-label="Perfil e atalhos"
    >
      <div className={styles.hero}>
        <div className={styles.identity}>
          <Avatar person={auth.user ?? { avatar_preset: 'person' }} className={styles.avatar} />
          <div className={styles.identityText}>
            <strong>{account?.nickname || 'Visitante'}</strong>
            <small>
              {auth.user
                ? community.presenceStatus === 'dnd'
                  ? 'Não Perturbar'
                  : community.presenceStatus === 'away'
                    ? 'Ausente'
                    : 'Online'
                : 'Convidado'}
            </small>
          </div>
        </div>

        {auth.user && (
          <div className={styles.statusRow} role="group" aria-label="Status de presença">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={styles.statusBtn}
                aria-pressed={community.presenceStatus === option.value}
                onClick={() => runtime.TronoCommunity.setPresenceStatus(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.group}>
        <span className={styles.groupTitle}>Comunidade</span>
        <button
          type="button"
          className={styles.rowBtn}
          onClick={() => {
            onClose();
            runtime.TronoPortal.showOnly('chatOnlyScreen');
            runtime.TronoCallNavigation.showChat();
            if (runtime.TronoAuth.user) void runtime.TronoDirectMessages.openFriends();
            else runtime.TronoAuth.open('login');
          }}
        >
          <span className={styles.rowIcon}>
            <Icon name="members" size={18} />
          </span>
          <span className={styles.rowText}>
            <strong>Amigos e mensagens diretas</strong>
            <small>Conversas privadas e pedidos de amizade</small>
          </span>
          {unreadDm > 0 && <span className={styles.badge}>{unreadDm}</span>}
        </button>

        <button
          type="button"
          className={styles.rowBtn}
          onClick={() => {
            onClose();
            onOpenChannels();
          }}
        >
          <span className={styles.rowIcon}>
            <Icon name="hash" size={18} />
          </span>
          <span className={styles.rowText}>
            <strong>Canais de texto e salas</strong>
            <small>Trocar de canal ou abrir histórico</small>
          </span>
        </button>

        <button
          type="button"
          className={styles.rowBtn}
          onClick={() => {
            onClose();
            onOpenMembers();
          }}
        >
          <span className={styles.rowIcon}>
            <Icon name="members" size={18} />
          </span>
          <span className={styles.rowText}>
            <strong>Membros da Corte</strong>
            <small>Ver quem está online ou jogando</small>
          </span>
        </button>
      </div>

      <div className={styles.group}>
        <span className={styles.groupTitle}>Aplicativo</span>
        {bgGuard && bgState?.supported && (
          <button
            type="button"
            className={styles.rowBtn}
            data-alert={!bgState.allReady}
            onClick={() => bgGuard.openModal()}
          >
            <span className={styles.rowIcon}>
              <Icon name="shield" size={18} />
            </span>
            <span className={styles.rowText}>
              <strong>Chamada em segundo plano</strong>
              <small>
                {bgState.allReady
                  ? 'Protegido para continuar com a tela desligada'
                  : 'Libere bateria e permissões para não cair'}
              </small>
            </span>
            <span className={styles.badge} data-warn={!bgState.allReady}>
              {bgState.allReady ? 'Ativo' : 'Ajustar'}
            </span>
          </button>
        )}

        {runtime.TronoAndroidUpdates && (
          <button
            type="button"
            className={styles.rowBtn}
            onClick={() => {
              onClose();
              void runtime.TronoAndroidUpdates?.check();
              runtime.TronoCallSettings.open('application');
            }}
          >
            <span className={styles.rowIcon}>
              <Icon name="swap" size={18} />
            </span>
            <span className={styles.rowText}>
              <strong>Atualizações do aplicativo</strong>
              <small>Verificar nova versão do APK Android</small>
            </span>
          </button>
        )}

        <button
          type="button"
          className={styles.rowBtn}
          onClick={() => {
            onClose();
            runtime.TronoCallSettings.open('audio');
          }}
        >
          <span className={styles.rowIcon}>
            <Icon name="settings" size={18} />
          </span>
          <span className={styles.rowText}>
            <strong>Configurações de voz, vídeo e app</strong>
            <small>Microfone, tema, notificações e atualizações</small>
          </span>
        </button>

        <button
          type="button"
          className={styles.rowBtn}
          onClick={() => {
            onClose();
            openReleaseNotesPanel();
          }}
        >
          <span className={styles.rowIcon}>
            <Icon name="crown" size={18} />
          </span>
          <span className={styles.rowText}>
            <strong>Novidades da versão {APP_RELEASE_VERSION}</strong>
            <small>Ver o que mudou na última atualização</small>
          </span>
        </button>

        {auth.user && (
          <button
            type="button"
            className={styles.rowBtn}
            data-danger="true"
            onClick={() => {
              onClose();
              void runtime.TronoAuth.logout();
            }}
          >
            <span className={styles.rowIcon}>
              <Icon name="exit" size={18} />
            </span>
            <span className={styles.rowText}>
              <strong>Sair da conta</strong>
              <small>Encerrar sessão neste aparelho</small>
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
