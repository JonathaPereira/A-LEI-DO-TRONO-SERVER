'use client';

import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { SETTINGS_TOPICS } from '../../lib/settings/controller';
import type { SettingsController } from '../../lib/settings/controller';

import type { SettingsRuntime, Contents } from '../../lib/settings/runtime';
import {
  VoiceAudioSettings,
  VoiceVideoSettings,
  VoiceCaptureSettings,
} from '../voice/settings-fields';
import { ConnectionSettings } from '../voice/diagnostics';
import { VoiceAudioPreferences } from '../voice/audio-preferences';
import { SettingsActivityFields } from './settings-activity-fields';
import { NotificationFields } from './notification-fields';

/** These empty slots explicitly lend their children to controllers not converted yet. */
const ContentSlot = memo(function ContentSlot({
  content,
  id,
  hidden,
}: {
  content?: DocumentFragment;
  id?: string;
  hidden?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host || !content) return;
    host.append(content);
    return () => {
      content.append(...host.childNodes);
    };
  }, [content]);
  return <div ref={ref} id={id} hidden={hidden} />;
});

export function CallSettings({
  runtime,
  controller,
  panel,
  dialog,
  contents,
}: {
  runtime: SettingsRuntime;
  controller: SettingsController;
  panel: HTMLElement;
  dialog: HTMLDialogElement | null;
  contents: Contents;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const content = useRef<HTMLDivElement>(null),
    tabs = useRef<HTMLDivElement>(null);
  const [account, setAccount] = useState(() => readAccount());
  const [permissions, setPermissions] = useState(''),
    [permissionMessage, setPermissionMessage] = useState('');
  const [resetting, setResetting] = useState(false);
  const permissionRevision = useRef(0);
  function readAccount() {
    return {
      user: runtime.TronoAuth.user,
      remembered: runtime.TronoAuth.remembered,
      error: runtime.TronoAuth.rememberError,
    };
  }
  async function readPermissions() {
    const revision = ++permissionRevision.current;
    try {
      const granted = await runtime.TronoDesktop!.getMediaPermissions();
      if (revision === permissionRevision.current)
        setPermissions(
          'Microfone: ' +
            (granted.includes('audio') ? 'permitido' : 'perguntar ao usar') +
            ' · Câmera: ' +
            (granted.includes('video') ? 'permitida' : 'perguntar ao usar'),
        );
    } catch {
      if (revision === permissionRevision.current)
        setPermissions('Não foi possível consultar as permissões.');
    }
  }
  useEffect(() => {
    let active = true;
    const sync = () => {
      if (active) setAccount(readAccount());
    };
    window.addEventListener('trono-auth-change', sync);
    window.addEventListener('trono-remember-change', sync);
    void runtime.TronoAuth.ready.then(sync);
    return () => {
      active = false;
      permissionRevision.current++;
      window.removeEventListener('trono-auth-change', sync);
      window.removeEventListener('trono-remember-change', sync);
    };
  }, [runtime]);
  useLayoutEffect(() => {
    panel.classList.toggle('hidden', !state.open);
    if (dialog) {
      if (state.open && !dialog.open) dialog.showModal();
      else if (!state.open && dialog.open) dialog.close();
    }
  }, [state.open, panel, dialog]);
  useEffect(() => {
    const close = () => controller.close();
    const backdrop = (event: Event) => {
      if (event.target === dialog) close();
    };
    dialog?.addEventListener('close', close);
    dialog?.addEventListener('click', backdrop);
    return () => {
      dialog?.removeEventListener('close', close);
      dialog?.removeEventListener('click', backdrop);
    };
  }, [controller, dialog]);
  useEffect(() => {
    content.current?.scrollTo(0, 0);
    if (state.open && dialog && state.topic === 'account' && runtime.TronoAuth.user)
      void runtime.TronoProfile.open({ inline: true });
    if (state.open && dialog && state.topic === 'privacy') void readPermissions();
  }, [state.topic, state.open, dialog, account.user?.email]);
  useLayoutEffect(() => {
    if (!dialog || !content.current || !tabs.current) return;
    const host = content.current,
      nav = tabs.current;
    let frame = 0;
    const fit = () => {
      frame = 0;
      if (!dialog.open) return;
      const pane = host.querySelector<HTMLElement>('.voice-settings-pane:not([hidden])');
      if (!pane) return;
      const stacked = matchMedia(
        '(max-width:640px), (max-aspect-ratio:1/1) and (max-width:1200px)',
      ).matches;
      const style = getComputedStyle(host),
        padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      const bodyHeight = pane.scrollHeight + padding,
        navHeight = stacked ? 60 : Math.min(nav.scrollHeight, 560);
      const desired = 64 + (stacked ? navHeight + bodyHeight : Math.max(navHeight, bodyHeight)) + 2;
      dialog.style.height =
        Math.min(innerHeight - 24, Math.max(stacked ? 260 : 420, desired)) + 'px';
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };
    const resize = new ResizeObserver(schedule),
      mutation = new MutationObserver(schedule);
    for (const pane of host.children) resize.observe(pane);
    mutation.observe(host, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['hidden', 'class'],
    });
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, [dialog, state.open, state.topic]);
  async function resetPermissions() {
    if (
      runtime.TronoSocial.voiceJoined &&
      !confirm('Redefinir as permissões encerrará sua chamada. Continuar?')
    )
      return;
    setResetting(true);
    try {
      await runtime.TronoSocial.leaveVoice();
      await runtime.TronoDesktop!.resetMediaPermissions();
      await readPermissions();
      setPermissionMessage(
        'Permissões redefinidas. O app perguntará novamente ao usar microfone e câmera.',
      );
    } catch {
      setPermissionMessage('Não foi possível redefinir as permissões.');
    } finally {
      setResetting(false);
    }
  }
  return (
    <>
      <div className="voice-settings-head">
        <div>
          <small>CENTRAL DE CONTROLE</small>
          <strong>{dialog ? 'Configurações' : 'Configurações da chamada'}</strong>
        </div>
        <button
          id="voiceSettingsClose"
          className="settings-close"
          title="Fechar configurações"
          onClick={controller.close}
        >
          ×
        </button>
      </div>
      <div
        ref={tabs}
        className="voice-settings-tabs"
        role="tablist"
        aria-label={dialog ? 'Tópicos das configurações' : 'Categorias das configurações'}
        onKeyDown={(event) => {
          if (
            !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
          )
            return;
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
          );
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (index < 0) return;
          event.preventDefault();
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : (index +
                    (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1) +
                    buttons.length) %
                  buttons.length;
          buttons[next].focus();
          buttons[next].click();
        }}
      >
        {controller.topics.map((topic) => (
          <button
            key={topic}
            id={'desktop-settings-tab-' + topic}
            type="button"
            className={'voice-settings-tab' + (state.topic === topic ? ' active' : '')}
            role="tab"
            data-settings-tab={topic}
            aria-selected={state.topic === topic}
            aria-controls={'desktop-settings-' + topic}
            onClick={() => controller.select(topic)}
          >
            {SETTINGS_TOPICS[topic]}
          </button>
        ))}
      </div>
      <div ref={content} className="voice-settings-content">
        {controller.topics.map((topic) => (
          <section
            key={topic}
            id={'desktop-settings-' + topic}
            className={'voice-settings-pane' + (state.topic === topic ? ' active' : '')}
            data-settings-panel={topic}
            role="tabpanel"
            aria-labelledby={'desktop-settings-tab-' + topic}
            hidden={state.topic !== topic}
            onClick={
              topic === 'game' || topic === 'account'
                ? (event) => {
                    if (
                      event.target instanceof Element &&
                      event.target.closest(topic === 'game' ? 'button' : '#accountLogoutBtn')
                    )
                      controller.close();
                  }
                : undefined
            }
          >
            {topic === 'account' ? (
              <>
                <h2>Minha conta</h2>
                <p id="desktopAccountName">
                  {account.user
                    ? account.user.nickname + ' · ' + account.user.email
                    : 'Entre para editar seu perfil e seus arquivos.'}
                </p>
                <button
                  id="desktopAccountLogin"
                  className="primary-button"
                  type="button"
                  hidden={!!account.user}
                  onClick={() => {
                    controller.close();
                    runtime.TronoAuth.open('login');
                  }}
                >
                  Entrar na conta
                </button>
                <label className="auth-check desktop-remember" hidden={!account.user}>
                  <input
                    id="settingsRemember"
                    type="checkbox"
                    checked={account.remembered}
                    onChange={(event) => {
                      const saved = runtime.TronoAuth.setRemember(event.target.checked);
                      // Auth changes its preference synchronously; storage reports later.
                      setAccount(readAccount());
                      void saved;
                    }}
                  />{' '}
                  Lembre de mim neste computador
                </label>
                <p id="settingsRememberHelp" className="appearance-help" role="status">
                  {account.error ||
                    'A sessão é protegida pelo Windows. Sua senha não é salva. Sair da conta remove a sessão lembrada.'}
                </p>
                <ContentSlot
                  content={contents.account}
                  id="desktopAccountDetails"
                  hidden={!account.user}
                />
              </>
            ) : topic === 'privacy' ? (
              <>
                <h2>Privacidade e permissões</h2>
                <p className="appearance-help">
                  As permissões aceitas de microfone e câmera ficam salvas neste computador. A
                  câmera continua desligada até você ativá-la. Cada compartilhamento de tela exige
                  escolher a fonte.
                </p>
                <p id="desktopPermissionsStatus" role="status">
                  {permissions}
                </p>
                <button
                  id="desktopResetPermissions"
                  className="secondary-button"
                  type="button"
                  disabled={resetting}
                  onClick={() => {
                    void resetPermissions();
                  }}
                >
                  Redefinir permissões de voz e câmera
                </button>
                <p id="desktopPermissionsMessage" role="status">
                  {permissionMessage}
                </p>
              </>
            ) : topic === 'connection' ? (
              <ConnectionSettings client={runtime.TronoConnectionDiagnostics} desktop={!!dialog} />
            ) : topic === 'audio' ? (
              <VoiceAudioSettings client={runtime.TronoVoiceSettings} desktop={!!dialog}>
                <VoiceAudioPreferences client={runtime.TronoAudioPreferences} />
              </VoiceAudioSettings>
            ) : topic === 'video' ? (
              <VoiceVideoSettings client={runtime.TronoVoiceSettings} desktop={!!dialog} />
            ) : topic === 'capture' ? (
              <VoiceCaptureSettings client={runtime.TronoVoiceSettings} desktop />
            ) : topic === 'activity' ? (
              runtime.TronoDesktopActivity ? (
                <SettingsActivityFields client={runtime.TronoDesktopActivity} />
              ) : null
            ) : topic === 'notifications' ? (
              <NotificationFields client={runtime.TronoNotifications} />
            ) : (
              <ContentSlot content={contents[topic]} />
            )}
          </section>
        ))}
      </div>
    </>
  );
}
