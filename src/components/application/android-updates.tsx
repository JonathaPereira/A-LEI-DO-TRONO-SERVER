'use client';

import { androidUpdatePresentation, type AndroidUpdates } from '../../lib/mobile/android-updates';
import { APP_RELEASE_VERSION, openReleaseNotesPanel } from '../../lib/application/release-notes';
import { useModel } from './services';
import { AppIcon as Icon } from './icons';
import styles from './notices.module.css';

export function AndroidApplicationSettings({ client }: { client?: AndroidUpdates }) {
  return client ? (
    <AndroidUpdateSettings client={client} />
  ) : (
    <p>Atualizações do Android não estão disponíveis neste ambiente.</p>
  );
}

function AndroidUpdateSettings({ client }: { client: AndroidUpdates }) {
  const state = useModel(client),
    view = androidUpdatePresentation(state);
  const status = state.state.status;
  const busy = state.checking || state.downloading || state.installing;
  const isError = status === 'error';

  return (
    <>
      <h2>Aplicativo Android</h2>
      <p>Versão instalada · {state.currentVersion}</p>
      <p role="status">{view.text}</p>
      <p className="appearance-help">
        Cada atualização verifica a assinatura de integridade SHA-256 antes de abrir o instalador
        nativo do Android.
      </p>
      {(status === 'downloading' || status === 'verifying') && (
        <div className={styles.sidebarProgressTrack} aria-hidden="true">
          <div
            className={styles.sidebarProgressFill}
            style={{ width: `${state.state.percent ?? 0}%` }}
          />
        </div>
      )}
      <div className="settings-action-grid">
        <button
          id="androidUpdateCheck"
          type="button"
          disabled={busy}
          onClick={() => void client.check()}
        >
          <Icon name="swap" size={16} /> {isError ? 'Tentar novamente' : 'Buscar atualizações'}
        </button>
        {(view.available || view.ready) && (
          <button
            id="androidUpdateAction"
            type="button"
            disabled={busy}
            onClick={() => void client.downloadAndInstall()}
          >
            <Icon name="swap" size={16} /> {view.actionLabel}
          </button>
        )}
        <button
          id="androidReleaseNotesButton"
          type="button"
          className="secondary-button"
          onClick={() => openReleaseNotesPanel()}
        >
          <Icon name="crown" size={16} /> Novidades da v{APP_RELEASE_VERSION}
        </button>
        {isError && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => void client.openDownload()}
          >
            Baixar APK manualmente
          </button>
        )}
      </div>
    </>
  );
}

/** Persistent banner in the sidebar/drawer when an Android APK update is available, downloading, or ready. */
export function AndroidUpdateSidebarBanner({ client }: { client: AndroidUpdates }) {
  const state = useModel(client),
    view = androidUpdatePresentation(state);
  const status = state.state.status;
  if (
    status !== 'available' &&
    status !== 'downloading' &&
    status !== 'verifying' &&
    status !== 'ready' &&
    status !== 'permission_required' &&
    status !== 'error'
  )
    return null;

  if (status === 'downloading' || status === 'verifying') {
    const percent = state.state.percent ?? 0;
    return (
      <div
        className={styles.sidebarUpdate}
        data-android-update-state={status}
        role="status"
        aria-label="Baixando atualização Android"
      >
        <div className={styles.sidebarUpdateRow}>
          <Icon name="swap" size={15} />
          <span>
            {status === 'verifying'
              ? `Verificando SHA-256 (${view.versionLabel})…`
              : `Baixando ${view.versionLabel} · ${percent}%`}
          </span>
        </div>
        <div className={styles.sidebarProgressTrack} aria-hidden="true">
          <div className={styles.sidebarProgressFill} style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  }

  if (status === 'available' || status === 'ready' || status === 'permission_required') {
    return (
      <button
        type="button"
        className={styles.sidebarUpdateBtn}
        data-android-update-state={status}
        disabled={state.downloading || state.installing}
        onClick={() => void client.downloadAndInstall()}
        title={view.text}
      >
        <Icon name="swap" size={15} />
        <span>
          {state.installing
            ? 'Abrindo instalador…'
            : state.downloading
              ? 'Baixando atualização…'
              : view.actionLabel}
        </span>
      </button>
    );
  }

  return (
    <div className={styles.sidebarUpdate} data-android-update-state="error" role="status">
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
          title="Abrir página de download do APK"
        >
          Baixar APK
        </button>
      </div>
    </div>
  );
}

export function AndroidUpdateNotice({ client }: { client: AndroidUpdates }) {
  const state = useModel(client),
    view = androidUpdatePresentation(state);
  const status = state.state.status;
  const isError = status === 'error';
  const busy = state.checking || state.downloading || state.installing;

  return (
    <aside
      className={styles.notice}
      role="status"
      aria-label="Atualização do aplicativo Android"
      hidden={!state.visible}
    >
      <Icon name="swap" />
      <div>
        <strong>Aplicativo Android</strong>
        <p>{view.text}</p>
        {(view.available || view.ready) && (
          <button type="button" disabled={busy} onClick={() => void client.downloadAndInstall()}>
            {view.actionLabel}
          </button>
        )}
        {isError && (
          <button type="button" disabled={busy} onClick={() => void client.check()}>
            Tentar novamente
          </button>
        )}
      </div>
      <button type="button" aria-label="Dispensar aviso" onClick={client.close}>
        <Icon name="close" size={16} />
      </button>
    </aside>
  );
}
