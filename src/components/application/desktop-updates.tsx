import { desktopUpdatePresentation, type DesktopUpdates } from '../../lib/desktop/updates';
import { APP_RELEASE_VERSION, openReleaseNotesPanel } from '../../lib/application/release-notes';
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
  const isError = state.state.status === 'error';
  return (
    <>
      <h2>Aplicativo Windows</h2>
      <p>Versão instalada · {state.currentVersion}</p>
      <p role="status">{view.text}</p>
      <p className="appearance-help">
        As atualizações são baixadas automaticamente em segundo plano (modo diferencial rápido) e
        aplicadas ao sair do app ou em 1 clique quando prontas.
      </p>
      <div className="settings-action-grid">
        <button
          id="desktopUpdateCheck"
          type="button"
          disabled={state.checking || state.installing}
          onClick={() => void client.check()}
        >
          <Icon name="swap" size={16} /> {isError ? 'Tentar novamente' : 'Buscar atualizações'}
        </button>
        <button
          id="desktopReleaseNotesButton"
          type="button"
          className="secondary-button"
          onClick={() => openReleaseNotesPanel()}
        >
          <Icon name="crown" size={16} /> Novidades da v{APP_RELEASE_VERSION}
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
        {isError && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => void client.openDownload()}
          >
            Baixar instalador direto
          </button>
        )}
      </div>
    </>
  );
}

/** Persistent, high-visibility sidebar pill when an update is downloading, ready, or needs retry. */
export function DesktopUpdateSidebarBanner({ client }: { client: DesktopUpdates }) {
  const state = useModel(client),
    view = desktopUpdatePresentation(state);
  const status = state.state.status;
  if (status !== 'downloading' && status !== 'ready' && status !== 'error') return null;

  if (status === 'downloading') {
    const percent = state.state.percent ?? 0;
    return (
      <div
        className={styles.sidebarUpdate}
        data-update-state="downloading"
        role="status"
        aria-label="Baixando atualização"
      >
        <div className={styles.sidebarUpdateRow}>
          <Icon name="swap" size={15} />
          <span>
            Baixando v{state.state.version || 'nova'} · {percent}%
          </span>
        </div>
        <div className={styles.sidebarProgressTrack} aria-hidden="true">
          <div className={styles.sidebarProgressFill} style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  }

  if (status === 'ready') {
    return (
      <button
        type="button"
        className={styles.sidebarUpdateBtn}
        data-update-state="ready"
        disabled={state.installing}
        onClick={() => void client.install()}
        title={view.title}
      >
        <Icon name="swap" size={15} />
        <span>
          {state.installing
            ? 'Reiniciando e atualizando…'
            : `Atualizar para v${state.state.version || 'nova'}`}
        </span>
      </button>
    );
  }

  return (
    <div className={styles.sidebarUpdate} data-update-state="error" role="status">
      <div className={styles.sidebarUpdateActions}>
        <button
          type="button"
          className={styles.sidebarRetryBtn}
          disabled={state.checking}
          onClick={() => void client.check()}
        >
          <Icon name="swap" size={14} /> Erro ao atualizar · Tentar de novo
        </button>
        <button
          type="button"
          className={styles.sidebarLinkBtn}
          onClick={() => void client.openDownload()}
          title="Abrir página de download do instalador"
        >
          Baixar manual
        </button>
      </div>
    </div>
  );
}

export function DesktopUpdateNotice({ client }: { client: DesktopUpdates }) {
  const state = useModel(client),
    view = desktopUpdatePresentation(state);
  const isError = state.state.status === 'error';
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
        {isError && (
          <div>
            <button type="button" disabled={state.checking} onClick={() => void client.check()}>
              Tentar novamente
            </button>
            <button type="button" onClick={() => void client.openDownload()}>
              Baixar instalador direto
            </button>
          </div>
        )}
      </div>
      <button type="button" aria-label="Fechar aviso de atualização" onClick={client.close}>
        <Icon name="close" size={16} />
      </button>
    </aside>
  );
}
