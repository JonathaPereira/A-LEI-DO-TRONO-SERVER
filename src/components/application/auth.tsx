'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { authModes } from '../../lib/auth/forms';
import { passwordChecks } from '../../lib/auth/password';
import { version } from '../../../electron/package.json';
import { useModel, type ApplicationServices } from './services';
import { AppIcon as Icon } from './icons';
import styles from './shell.module.css';

export function AccountForm({ runtime }: { runtime: ApplicationServices }) {
  const forms = runtime.TronoAuth.forms,
    state = useModel(forms),
    account = useModel(runtime.TronoAuth);
  const { mode, fields, busy } = state;
  const checks = passwordChecks(fields.password);
  const rules = {
    length: '8 caracteres',
    lowercase: 'Minúscula',
    uppercase: 'Maiúscula',
    number: 'Número',
    symbol: 'Símbolo',
  };
  const guest = state.guestOpen;
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.focusVersion)
      host.current
        ?.querySelector<HTMLInputElement>(
          guest ? '#guestNickname' : '#auth' + state.focus[0].toUpperCase() + state.focus.slice(1),
        )
        ?.focus();
  }, [state.focusVersion, state.focus, guest]);
  return (
    <div ref={host} className={styles.authCard}>
      <span className={styles.authBrand}>
        <Icon name="crown" size={27} /> A Corte
      </span>
      <h1>{guest ? 'Uma cadeira à sua espera' : authModes[mode].title}</h1>
      <p>{guest ? 'Escolha seu nome para jogar e usar a voz da mesa.' : authModes[mode].intro}</p>
      {guest ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void forms.submitGuest();
          }}
        >
          <label>
            Nome do convidado
            <input
              id="guestNickname"
              required
              minLength={2}
              maxLength={20}
              autoComplete="nickname"
              value={state.guestName}
              disabled={state.guestBusy}
              onChange={(e) => forms.setGuestName(e.target.value)}
            />
          </label>
          <button className={styles.primary} disabled={state.guestBusy}>
            {state.guestBusy ? 'Conectando…' : 'Escolher um jogo'}
          </button>
          <p role="status">{state.guestMessage}</p>
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              forms.closeGuest();
              forms.open('login');
            }}
          >
            Voltar para entrar
          </button>
        </form>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void forms.submit();
            }}
            aria-busy={busy}
          >
            {mode === 'signup' && (
              <label>
                Nome de exibição
                <input
                  id="authNickname"
                  autoComplete="nickname"
                  required
                  minLength={2}
                  maxLength={20}
                  value={fields.nickname}
                  disabled={busy}
                  onChange={(e) => forms.setField('nickname', e.target.value)}
                />
              </label>
            )}
            {mode !== 'reset' && (
              <label>
                E-mail
                <input
                  id="authEmail"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={fields.email}
                  disabled={busy}
                  onChange={(e) => forms.setField('email', e.target.value)}
                />
              </label>
            )}
            {mode !== 'recover' && (
              <label>
                Senha
                <span className={styles.password}>
                  <input
                    id="authPassword"
                    type={state.showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required
                    value={fields.password}
                    disabled={busy}
                    onChange={(e) => forms.setField('password', e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={state.showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={state.showPassword}
                    onClick={() => forms.setShowPassword(!state.showPassword)}
                  >
                    <Icon name={state.showPassword ? 'eyeSlash' : 'eye'} size={18} />
                  </button>
                </span>
              </label>
            )}
            {(mode === 'signup' || mode === 'reset') && (
              <>
                <label>
                  Confirme a senha
                  <input
                    id="authConfirm"
                    type={state.showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={fields.confirm}
                    disabled={busy}
                    onChange={(e) => forms.setField('confirm', e.target.value)}
                  />
                </label>
                <ul className={styles.passwordRules} aria-label="Requisitos da senha">
                  {Object.entries(rules).map(([key, label]) => (
                    <li key={key} data-passed={checks[key as keyof typeof checks]}>
                      {checks[key as keyof typeof checks] && <Icon name="check" size={12} />}{' '}
                      {label}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {runtime.TronoDesktop && mode === 'login' && (
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={state.remembered}
                  disabled={busy}
                  onChange={(e) => void forms.setRemember(e.target.checked)}
                />
                Lembrar neste computador
              </label>
            )}
            {mode === 'login' && (
              <button
                type="button"
                className={styles.link}
                disabled={busy}
                onClick={() => forms.switchMode('recover')}
              >
                Esqueci minha senha
              </button>
            )}
            <button id="authSubmit" className={styles.primary} disabled={busy}>
              {busy ? 'Aguarde…' : authModes[mode].button}
            </button>
            <p id="authMessage" role="status" data-error={state.error}>
              {state.message || account.rememberError}
            </p>
          </form>
          <div className={styles.authLinks}>
            {mode === 'login' ? (
              <>
                <span>Ainda não tem conta?</span>
                <button
                  type="button"
                  className={styles.link}
                  disabled={busy}
                  onClick={() => forms.switchMode('signup')}
                >
                  Criar conta
                </button>
              </>
            ) : (
              mode !== 'reset' && (
                <button
                  type="button"
                  className={styles.link}
                  disabled={busy}
                  onClick={() => forms.switchMode('login')}
                >
                  Voltar para entrar
                </button>
              )
            )}
          </div>
          {mode === 'login' && (
            <button
              type="button"
              className={styles.secondary}
              disabled={busy}
              onClick={forms.openGuest}
            >
              Jogar como convidado
            </button>
          )}
          {!runtime.TronoDesktop && (
            <a
              className={styles.download}
              href={
                'https://a-lei-do-trono.surge.sh/downloads/MN-Trono-' + version + '-Windows.exe'
              }
              download
            >
              Baixar para Windows
            </a>
          )}
        </>
      )}
    </div>
  );
}

export function AccountOverlay({
  runtime,
  inline,
}: {
  runtime: ApplicationServices;
  inline: boolean;
}) {
  const forms = runtime.TronoAuth.forms,
    state = useModel(forms),
    dialog = useRef<HTMLDialogElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  const open = !inline && (state.open || state.guestOpen);
  useLayoutEffect(() => {
    if (open && !dialog.current?.open) {
      previous.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.current?.showModal();
    } else if (!open && dialog.current?.open) {
      dialog.current.close();
      previous.current?.focus();
    }
  }, [open]);
  return (
    <dialog
      className={styles.accountDialog}
      ref={dialog}
      aria-label="Acesso à conta"
      onCancel={(e) => {
        e.preventDefault();
        forms.close();
        forms.closeGuest();
      }}
    >
      <button
        type="button"
        className={styles.close}
        aria-label="Fechar acesso à conta"
        disabled={state.busy || state.guestBusy}
        onClick={() => {
          forms.close();
          forms.closeGuest();
        }}
      >
        <Icon name="close" />
      </button>
      {open && <AccountForm runtime={runtime} />}
    </dialog>
  );
}
