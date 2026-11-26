'use client';

import { useModel, type ApplicationServices } from '../application/services';
import { AppIcon as Icon } from '../application/icons';
import styles from './android-permissions-modal.module.css';

/**
 * Prompts Android users right on app open whenever any permission required for
 * uninterrupted screen-off calls (Microphone, Notifications, Battery exemption, Bluetooth)
 * is missing, so nobody has to hunt through buried settings.
 */
export function AndroidPermissionsModal({ runtime }: { runtime: ApplicationServices }) {
  const guard = runtime.TronoAndroidBackground;
  if (!guard) return null;
  return <AndroidPermissionsModalBody guard={guard} />;
}

function AndroidPermissionsModalBody({
  guard,
}: {
  guard: NonNullable<ApplicationServices['TronoAndroidBackground']>;
}) {
  const state = useModel(guard);
  if (!state.supported || !state.modalOpen) return null;

  const missingCount = [
    state.microphone,
    state.notifications,
    state.batteryUnrestricted,
    state.bluetooth,
  ].filter((ok) => !ok).length;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="androidBgPermTitle"
      data-android-permissions-modal
    >
      <div className={styles.card}>
        <div className={styles.head}>
          <span className={styles.emblem}>
            <Icon name="shield" size={22} />
          </span>
          <div className={styles.headText}>
            <h2 id="androidBgPermTitle">Manter chamadas com a tela desligada</h2>
            <p>
              {state.allReady
                ? 'Tudo pronto! O Android manterá sua chamada ativa mesmo com o celular bloqueado.'
                : 'Autorize estas permissões agora para que sua chamada de voz não caia nem pause em segundo plano.'}
            </p>
          </div>
        </div>

        <div className={styles.list}>
          <button
            type="button"
            className={styles.item}
            data-ready={state.microphone}
            disabled={state.busy}
            onClick={() => void guard.requestRuntimePermissions()}
          >
            <span className={styles.itemInfo}>
              <strong>Microfone</strong>
              <small>Necessário para falar nas salas de voz</small>
            </span>
            <span className={styles.pill} data-ready={state.microphone}>
              {state.microphone ? 'Ativo' : 'Permitir'}
            </span>
          </button>

          <button
            type="button"
            className={styles.item}
            data-ready={state.notifications}
            disabled={state.busy}
            onClick={() => void guard.requestRuntimePermissions()}
          >
            <span className={styles.itemInfo}>
              <strong>Notificação de chamada</strong>
              <small>Mantém o serviço ativo com Mutar/Desligar na tela bloqueada</small>
            </span>
            <span className={styles.pill} data-ready={state.notifications}>
              {state.notifications ? 'Ativo' : 'Permitir'}
            </span>
          </button>

          <button
            type="button"
            className={styles.item}
            data-ready={state.batteryUnrestricted}
            disabled={state.busy}
            onClick={() => void guard.requestBatteryExemption()}
          >
            <span className={styles.itemInfo}>
              <strong>Bateria sem restrições</strong>
              <small>Impede o Android de suspender a chamada ao apagar a tela</small>
            </span>
            <span className={styles.pill} data-ready={state.batteryUnrestricted}>
              {state.batteryUnrestricted ? 'Ativo' : 'Liberar'}
            </span>
          </button>

          <button
            type="button"
            className={styles.item}
            data-ready={state.bluetooth}
            disabled={state.busy}
            onClick={() => void guard.requestRuntimePermissions()}
          >
            <span className={styles.itemInfo}>
              <strong>Fone Bluetooth</strong>
              <small>Troca automática entre fone Bluetooth, auricular e viva-voz</small>
            </span>
            <span className={styles.pill} data-ready={state.bluetooth}>
              {state.bluetooth ? 'Ativo' : 'Permitir'}
            </span>
          </button>
        </div>

        {state.error && (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        )}

        <div className={styles.actions}>
          {!state.allReady ? (
            <button
              type="button"
              className={styles.primary}
              disabled={state.busy}
              onClick={() => void guard.configureAll()}
            >
              {state.busy
                ? 'Solicitando permissões…'
                : missingCount === 1
                  ? 'Liberar permissão restante'
                  : 'Permitir tudo agora'}
            </button>
          ) : (
            <button type="button" className={styles.primary} onClick={() => guard.dismissModal()}>
              Concluir
            </button>
          )}
          {!state.allReady && (
            <button
              type="button"
              className={styles.secondary}
              disabled={state.busy}
              onClick={() => guard.dismissModal()}
            >
              Agora não
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
