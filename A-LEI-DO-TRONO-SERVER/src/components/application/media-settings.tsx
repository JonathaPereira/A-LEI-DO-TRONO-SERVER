'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  VoiceAudioSettings,
  VoiceVideoSettings,
  VoiceCaptureSettings,
} from '../voice/settings-fields';
import { VoiceAudioPreferences } from '../voice/audio-preferences';
import { ConnectionSettings } from '../voice/diagnostics';
import { NotificationFields } from '../modals/notification-fields';
import { SettingsActivityFields } from '../modals/settings-activity-fields';
import { DesktopApplicationSettings } from './desktop-updates';
import { ResourceSettings } from './resources';
import { GameSettings } from './game-settings';
import { AccountSettings } from './profile-settings';
import { AppIcon as Icon } from './icons';
import { useModel, type ApplicationServices } from './services';
import styles from './media-dialog.module.css';
const topics = [
  ['account', 'Meu perfil', 'members'],
  ['appearance', 'Aparência', 'eye'],
  ['files', 'Meus arquivos', 'attach'],
  ['resources', 'Recursos', 'grid'],
  ['notifications', 'Notificações', 'bell'],
  ['activity', 'Atividade', 'games'],
  ['game', 'Jogos', 'games'],
  ['privacy', 'Privacidade', 'eyeSlash'],
  ['audio', 'Áudio', 'headphones'],
  ['video', 'Vídeo', 'camera'],
  ['capture', 'Transmissão', 'screen'],
  ['connection', 'Conexão', 'voice'],
  ['application', 'Aplicativo', 'settings'],
] as const;
export function MediaSettings({ runtime }: { runtime: ApplicationServices }) {
  const controller = runtime.TronoCallSettings,
    state = useModel(controller),
    dialog = useRef<HTMLDialogElement>(null);
  const desktop = !!runtime.TronoDesktop;
  const editor = useModel(runtime.TronoProfileEditor);
  const title = ['audio', 'video', 'capture', 'connection'].includes(state.topic)
    ? 'Voz e vídeo'
    : 'Configurações da Corte';
  const selected = topics.some(([id]) => id === state.topic) ? state.topic : 'audio';
  useLayoutEffect(() => {
    if (!state.open || selected !== 'connection') runtime.TronoConnectionDiagnostics.toggle(false);
  }, [runtime, state.open, selected]);
  useLayoutEffect(() => {
    if (state.open && !dialog.current?.open) dialog.current?.showModal();
    else if (!state.open && dialog.current?.open) dialog.current.close();
  }, [state.open]);
  return (
    <dialog
      closedby="any"
      ref={dialog}
      className={styles.dialog + ' ' + styles.settings}
      aria-label={title}
      data-topic={selected}
      onCancel={(event) => {
        event.preventDefault();
        if (!editor.busy) controller.close();
      }}
      onClose={() => {
        if (!dialog.current?.open) controller.close();
      }}
    >
      <header className={styles.header}>
        <div>
          <small>PREFERÊNCIAS DA CORTE</small>
          <h2>{title}</h2>
        </div>
        <button
          type="button"
          aria-label="Fechar configurações"
          disabled={editor.busy}
          onClick={controller.close}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className={styles.settingsLayout}>
        <nav aria-label="Configurações da Corte" className={styles.tabs}>
          {topics
            .filter(
              ([id]) =>
                desktop ||
                (id !== 'capture' && id !== 'activity' && id !== 'privacy' && id !== 'application'),
            )
            .map(([id, label, icon]) => (
              <button
                type="button"
                key={id}
                data-settings-tab={id}
                aria-current={selected === id ? 'page' : undefined}
                onClick={() => controller.select(id)}
              >
                <Icon name={icon} size={18} />
                {label}
              </button>
            ))}
        </nav>
        <div className={styles.fields} data-settings-fields>
          <AccountSettings runtime={runtime} />
          {desktop && (
            <section hidden={selected !== 'application'} aria-label="Aplicativo">
              <DesktopApplicationSettings client={runtime.TronoDesktopUpdates} />
            </section>
          )}
          <section hidden={selected !== 'resources'} aria-label="Recursos">
            <ResourceSettings />
          </section>
          <section hidden={selected !== 'game'} aria-label="Jogos">
            <GameSettings runtime={runtime} />
          </section>
          {desktop && (
            <section hidden={selected !== 'privacy'} aria-label="Privacidade">
              <h2>Privacidade e permissões</h2>
              <p>
                Cada compartilhamento de tela exige escolher a fonte. A câmera só é ativada quando
                você ligar seu vídeo.
              </p>
              <MediaPermissions runtime={runtime} open={state.open && selected === 'privacy'} />
            </section>
          )}
          <section hidden={selected !== 'notifications'} aria-label="Notificações">
            <NotificationFields client={runtime.TronoNotifications} />
          </section>
          {runtime.TronoDesktopActivity && (
            <section hidden={selected !== 'activity'} aria-label="Atividade">
              <SettingsActivityFields client={runtime.TronoDesktopActivity} />
            </section>
          )}
          <section hidden={selected !== 'audio'} aria-label="Áudio">
            <VoiceAudioSettings client={runtime.TronoVoiceSettings} desktop={desktop}>
              <VoiceAudioPreferences client={runtime.TronoAudioPreferences} />
            </VoiceAudioSettings>
          </section>
          <section hidden={selected !== 'video'} aria-label="Vídeo">
            <VoiceVideoSettings client={runtime.TronoVoiceSettings} desktop={desktop} />
          </section>
          {desktop && (
            <section hidden={selected !== 'capture'} aria-label="Transmissão">
              <VoiceCaptureSettings client={runtime.TronoVoiceSettings} desktop />
            </section>
          )}
          <section hidden={selected !== 'connection'} aria-label="Conexão">
            <ConnectionSettings
              client={runtime.TronoConnectionDiagnostics}
              desktop={desktop}
              showLauncher={false}
            />
            <ConnectionDetails runtime={runtime} />
          </section>
        </div>
      </div>
    </dialog>
  );
}

function MediaPermissions({ runtime, open }: { runtime: ApplicationServices; open: boolean }) {
  const [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false),
    revision = useRef(0);
  const native = runtime.TronoDesktop;
  useEffect(() => {
    const request = ++revision.current;
    setBusy(false);
    if (open && native?.getMediaPermissions)
      void native
        .getMediaPermissions()
        .then((granted) => {
          if (request === revision.current)
            setStatus(
              'Microfone: ' +
                (granted.includes('audio') ? 'permitido' : 'perguntar ao usar') +
                ' · Câmera: ' +
                (granted.includes('video') ? 'permitida' : 'perguntar ao usar'),
            );
        })
        .catch(() => {
          if (request === revision.current) setStatus('Não foi possível consultar as permissões.');
        });
    return () => {
      revision.current++;
    };
  }, [native, open]);
  if (!native?.resetMediaPermissions) return null;
  const reset = async () => {
    if (
      runtime.TronoSocial.voiceJoined &&
      !window.confirm('Redefinir as permissões encerrará sua chamada. Continuar?')
    )
      return;
    const request = ++revision.current;
    setBusy(true);
    try {
      await runtime.TronoSocial.leaveVoice();
      if (request !== revision.current) return;
      await native.resetMediaPermissions!();
      if (request === revision.current)
        setStatus('Permissões redefinidas. O app perguntará novamente ao usar microfone e câmera.');
    } catch {
      if (request === revision.current) setStatus('Não foi possível redefinir as permissões.');
    } finally {
      if (request === revision.current) setBusy(false);
    }
  };
  return (
    <div className={styles.permissions}>
      <strong>Permissões neste aplicativo</strong>
      <p role="status">{status}</p>
      <button type="button" disabled={busy} onClick={() => void reset()}>
        Redefinir permissões de microfone e câmera
      </button>
    </div>
  );
}
function ConnectionDetails({ runtime }: { runtime: ApplicationServices }) {
  const client = runtime.TronoConnectionDiagnostics,
    state = useModel(client);
  const fields = [
    ['telemetryTransport', 'Transporte'],
    ['telemetryPcState', 'Estado'],
    ['telemetryIceRoute', 'Rota'],
    ['telemetryAudioLoss', 'Perda de voz'],
    ['telemetryAudioJitter', 'Jitter de voz'],
    ['telemetryPlayback', 'Reprodução'],
    ['telemetryResources', 'Recursos do app'],
  ] as const;
  return (
    <>
      <button type="button" aria-expanded={state.open} onClick={() => client.toggle()}>
        {state.open ? 'Fechar diagnóstico' : 'Abrir diagnóstico'}
      </button>
      <section
        hidden={!state.open}
        aria-label="Diagnóstico da chamada"
        className={styles.diagnostics}
      >
        <h3>Saúde da chamada</h3>
        <p>{state.details.assessment}</p>
        <dl>
          {fields.map(([key, title]) => (
            <div key={key}>
              <dt>{title}</dt>
              <dd>{state.details.fields[key] || 'Aguardando leitura'}</dd>
            </div>
          ))}
        </dl>
        <small>{state.details.rows}</small>
        <p>{state.details.priority}</p>
        <button type="button" disabled={state.copying} onClick={() => void client.copy()}>
          Copiar diagnóstico
        </button>
        <p role="status">{state.copyStatus}</p>
      </section>
    </>
  );
}
