import { desktopUpdatePresentation, type DesktopUpdates } from '../../lib/desktop/updates';
import { useModel } from './services';
import { AppIcon as Icon } from './icons';
import styles from './notices.module.css';
export function DesktopApplicationSettings({ client }: { client?: DesktopUpdates }) {
  return client ? (
    <UpdateSettings client={client} />
  ) : (
    <p>Atualizações não estão disponíveis neste ambiente.</p>
  );
}
function UpdateSettings({ client }: { client: DesktopUpdates }) {
  const state = useModel(client),
    view = desktopUpdatePresentation(state);
  return (
    <>
      <h2>Aplicativo Windows</h2>
      <p>Versão instalada · {state.currentVersion}</p>
      <p role="status">{view.text}</p>
      <div className="settings-action-grid">
        <button
          id="desktopUpdateCheck"
          type="button"
          disabled={state.checking || state.installing}
          onClick={() => void client.check()}
        >
          <Icon name="swap" size={16} /> Buscar atualizações
        </button>
        {view.ready && (
          <button
            type="button"
            disabled={state.checking || state.installing}
            onClick={() => void client.install()}
          >
            {view.restart}
          </button>
        )}
      </div>
    </>
  );
}
export function DesktopUpdateNotice({ client }: { client: DesktopUpdates }) {
  const state = useModel(client),
    view = desktopUpdatePresentation(state);
  return (
    <aside
      className={styles.notice}
      role="status"
      aria-label="Atualização do aplicativo"
      hidden={!state.visible}
    >
      <Icon name="swap" />
      <div>
        <strong>Aplicativo Windows</strong>
        <p>{view.text}</p>
        {view.ready && (
          <button
            type="button"
            disabled={state.checking || state.installing}
            onClick={() => void client.install()}
          >
            {view.restart}
          </button>
        )}
      </div>
      <button type="button" aria-label="Fechar aviso de atualização" onClick={client.close}>
        <Icon name="close" size={16} />
      </button>
    </aside>
  );
}
