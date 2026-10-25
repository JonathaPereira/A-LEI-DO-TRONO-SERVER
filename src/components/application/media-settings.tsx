'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  VoiceAudioSettings,
  VoiceVideoSettings,
  VoiceCaptureSettings,
} from '../voice/settings-fields';
import { VoiceAudioPreferences } from '../voice/audio-preferences';
import { ConnectionSettings } from '../voice/diagnostics';
import { AppIcon as Icon } from './icons';
import { useModel, type ApplicationServices } from './services';
import styles from './media-dialog.module.css';
const topics = [
  ['audio', 'Áudio', 'headphones'],
  ['video', 'Vídeo', 'camera'],
  ['capture', 'Transmissão', 'screen'],
  ['connection', 'Conexão', 'voice'],
] as const;
export function MediaSettings({ runtime }: { runtime: ApplicationServices }) {
  const controller = runtime.TronoCallSettings,
    state = useModel(controller),
    dialog = useRef<HTMLDialogElement>(null);
  const desktop = !!runtime.TronoDesktop;
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
      ref={dialog}
      className={styles.dialog + ' ' + styles.settings}
      aria-label="Voz e vídeo"
      onCancel={(event) => {
        event.preventDefault();
        controller.close();
      }}
      onClose={() => {
        if (!dialog.current?.open) controller.close();
      }}
    >
      <header className={styles.header}>
        <div>
          <small>PREFERÊNCIAS DA CORTE</small>
          <h2>Voz e vídeo</h2>
        </div>
        <button type="button" aria-label="Fechar configurações" onClick={controller.close}>
          <Icon name="close" />
        </button>
      </header>
      <div className={styles.settingsLayout}>
        <nav aria-label="Configurações de mídia" className={styles.tabs}>
          {topics
            .filter(([id]) => desktop || id !== 'capture')
            .map(([id, label, icon]) => (
              <button
                type="button"
                key={id}
                aria-current={selected === id ? 'page' : undefined}
                onClick={() => controller.select(id)}
              >
                <Icon name={icon} size={18} />
                {label}
              </button>
            ))}
        </nav>
        <div className={styles.fields}>
          <section hidden={selected !== 'audio'} aria-label="Áudio">
            <VoiceAudioSettings client={runtime.TronoVoiceSettings} desktop={desktop}>
              <VoiceAudioPreferences client={runtime.TronoAudioPreferences} />
              {desktop && <MediaPermissions runtime={runtime} open={state.open} />}
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
