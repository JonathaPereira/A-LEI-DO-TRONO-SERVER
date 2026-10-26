import { directPerson } from '../../lib/messenger/selectors';
import { Avatar } from '../profiles/avatar';
import { DesktopUpdateNotice } from './desktop-updates';
import { AppIcon as Icon } from './icons';
import { useModel, type ApplicationServices } from './services';
import styles from './notices.module.css';
/** Presentation subscriptions only; expiry, delivery and account isolation remain in their owners. */
export function ApplicationNotices({ runtime }: { runtime: ApplicationServices }) {
  const messenger = useModel(runtime.TronoDirectMessages),
    community = useModel(runtime.TronoCommunity);
  return (
    <section className={styles.notices} aria-label="Avisos da Corte">
      {runtime.TronoDesktopUpdates && <DesktopUpdateNotice client={runtime.TronoDesktopUpdates} />}
      {community.notices.map((item) => (
        <div className={styles.notice} key={item.key} role="status" data-passive="true">
          <Icon name="voice" size={18} />
          <p>{item.text}</p>
        </div>
      ))}
      {messenger.toasts.map((toast) => (
        <article
          key={toast.peerId}
          className={styles.notice + ' messenger-toast'}
          aria-label={'Mensagem de ' + toast.name}
          onPointerEnter={() => runtime.TronoDirectMessages.toastTimer(toast.peerId, true)}
          onPointerLeave={() => runtime.TronoDirectMessages.toastTimer(toast.peerId)}
          onFocus={() => runtime.TronoDirectMessages.toastTimer(toast.peerId, true)}
          onBlur={() => runtime.TronoDirectMessages.toastTimer(toast.peerId)}
        >
          <button
            className={styles.open + ' messenger-toast-open'}
            type="button"
            onClick={() => void runtime.TronoDirectMessages.open(toast.peerId)}
          >
            <Avatar
              person={directPerson(messenger, toast.peerId) ?? {}}
              className={styles.avatar}
            />
            <span>
              <strong>{toast.name}</strong>
              <span>{toast.text}</span>
            </span>
          </button>
          <button
            type="button"
            className="messenger-toast-dismiss"
            aria-label={'Dispensar aviso de ' + toast.name}
            onClick={() => runtime.TronoDirectMessages.removeToast(toast.peerId)}
          >
            <Icon name="close" size={16} />
          </button>
        </article>
      ))}
    </section>
  );
}
