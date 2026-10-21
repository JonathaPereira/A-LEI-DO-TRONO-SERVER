import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { authModes, type AuthForms } from '../../lib/auth/forms';
import { passwordChecks } from '../../lib/auth/password';

const rules = {
  length: 'Mínimo de 8 caracteres',
  lowercase: 'Letra minúscula (a–z)',
  uppercase: 'Letra maiúscula (A–Z)',
  number: 'Número (0–9)',
  symbol: 'Símbolo (!, @, #…)',
} as const;

/** Dialogs project the form owner; native modal focus stays within the active identity flow. */
export function AuthDialogs({ forms, desktop }: { forms: AuthForms; desktop: boolean }) {
  const state = useSyncExternalStore(forms.subscribe, forms.getSnapshot, forms.getSnapshot),
    auth = useRef<HTMLDialogElement>(null),
    guest = useRef<HTMLDialogElement>(null);
  const { mode, fields, busy } = state,
    copy = authModes[mode],
    checks = passwordChecks(fields.password),
    policy = mode === 'signup' || mode === 'reset',
    password = mode !== 'recover';
  useLayoutEffect(() => {
    if (!state.open && auth.current?.open) auth.current.close();
    if (!state.guestOpen && guest.current?.open) guest.current.close();
    if (state.open && auth.current && !auth.current.open) auth.current.showModal();
    if (state.guestOpen && guest.current && !guest.current.open) guest.current.showModal();
  }, [state.open, state.guestOpen]);
  useLayoutEffect(() => {
    const field =
      state.focus === 'confirm'
        ? 'authConfirm'
        : state.focus === 'nickname'
          ? 'authNickname'
          : state.focus === 'password'
            ? 'authPassword'
            : 'authEmail';
    if (state.open) auth.current?.querySelector<HTMLInputElement>('#' + field)?.focus();
  }, [state.open, state.focusVersion, state.focus]);
  useLayoutEffect(() => {
    if (state.guestOpen) guest.current?.querySelector<HTMLInputElement>('#guestNickname')?.focus();
  }, [state.guestOpen]);
  return (
    <>
      <dialog
        ref={auth}
        id="authDialog"
        className="auth-dialog"
        aria-labelledby="authTitle"
        aria-describedby="authIntro"
        onClose={() => {
          if (!auth.current?.open && forms.getSnapshot().open) forms.close();
        }}
        onCancel={(event) => {
          event.preventDefault();
          forms.close();
        }}
      >
        <button
          id="authCloseBtn"
          className="auth-close"
          type="button"
          aria-label="Fechar acesso à conta"
          disabled={busy}
          onClick={forms.close}
        >
          ×
        </button>
        <span className="auth-brand">✦ M&amp;N · SUA CONTA</span>
        <h2 id="authTitle">{copy.title}</h2>
        <p id="authIntro">{copy.intro}</p>
        <a
          id="authDesktopDownload"
          className="auth-desktop-download"
          href="https://a-lei-do-trono.surge.sh/downloads/MN-Trono-0.2.10-Windows.exe"
          download="MN-Trono-0.2.10-Windows.exe"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" />
          </svg>
          <span>
            Baixe a versão desktop<small>Windows · 64 bits</small>
          </span>
        </a>
        <form
          id="authForm"
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            void forms.submit();
          }}
        >
          <label className={'auth-field' + (mode === 'signup' ? '' : ' hidden')}>
            Apelido
            <input
              id="authNickname"
              name="nickname"
              type="text"
              minLength={2}
              maxLength={20}
              autoComplete="nickname"
              required={mode === 'signup'}
              disabled={busy || mode !== 'signup'}
              value={fields.nickname}
              onChange={(event) => forms.setField('nickname', event.target.value)}
            />
            <small>De 2 a 20 caracteres. Será seu nome no chat e no jogo.</small>
          </label>
          <label className={'auth-field' + (mode === 'reset' ? ' hidden' : '')}>
            E-mail
            <input
              id="authEmail"
              name="email"
              type="email"
              maxLength={254}
              autoComplete="email"
              inputMode="email"
              required={mode !== 'reset'}
              disabled={busy || mode === 'reset'}
              value={fields.email}
              onChange={(event) => forms.setField('email', event.target.value)}
            />
          </label>
          <label className={'auth-field' + (password ? '' : ' hidden')}>
            Senha
            <input
              id="authPassword"
              name="password"
              type={state.showPassword ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'login' ? 1 : 8}
              required={password}
              disabled={busy || !password}
              aria-describedby="authRules"
              value={fields.password}
              onChange={(event) => forms.setField('password', event.target.value)}
            />
          </label>
          <label className={'auth-field' + (policy ? '' : ' hidden')}>
            Confirme a senha
            <input
              id="authConfirm"
              name="password_confirmation"
              type={state.showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required={policy}
              disabled={busy || !policy}
              value={fields.confirm}
              onChange={(event) => forms.setField('confirm', event.target.value)}
            />
          </label>
          <label id="authRememberRow" className="auth-check" hidden={!desktop || mode !== 'login'}>
            <input
              id="authRemember"
              type="checkbox"
              checked={state.remembered}
              disabled={busy}
              onChange={(event) => {
                void forms.setRemember(event.target.checked);
              }}
            />{' '}
            Lembre de mim neste computador
          </label>
          <label className="auth-check">
            <input
              id="authShowPassword"
              type="checkbox"
              checked={state.showPassword}
              onChange={(event) => forms.setShowPassword(event.target.checked)}
            />{' '}
            Mostrar senha
          </label>
          <ul
            id="authRules"
            className={'auth-rules' + (policy ? '' : ' hidden')}
            aria-label="Requisitos da senha"
            aria-live="polite"
          >
            {(Object.keys(rules) as Array<keyof typeof rules>).map((key) => (
              <li key={key} data-password-rule={key} className={checks[key] ? 'passed' : ''}>
                <span>{checks[key] ? '✓' : '○'}</span> {rules[key]}
              </li>
            ))}
          </ul>
          <button id="authSubmitBtn" className="auth-primary" type="submit" disabled={busy}>
            {copy.button}
          </button>
          <p
            id="authMessage"
            className={'auth-message' + (state.error ? ' auth-error' : '')}
            role="status"
            aria-live="polite"
          >
            {state.message}
          </p>
        </form>
        <div className="auth-links">
          <button
            id="authForgotBtn"
            className={'auth-link' + (mode === 'login' ? '' : ' hidden')}
            type="button"
            disabled={busy}
            onClick={() => forms.switchMode('recover')}
          >
            Esqueci minha senha
          </button>
        </div>
        <div id="authModeLinks" className={'auth-links' + (mode === 'reset' ? ' hidden' : '')}>
          <button
            id="authSignupBtn"
            className={'auth-link' + (mode === 'signup' ? ' hidden' : '')}
            type="button"
            disabled={busy}
            onClick={() => forms.switchMode('signup')}
          >
            Criar uma conta
          </button>
          <button
            id="authBackLoginBtn"
            className={'auth-link' + (mode === 'login' ? ' hidden' : '')}
            type="button"
            disabled={busy}
            onClick={() => forms.switchMode('login')}
          >
            Voltar para entrar
          </button>
        </div>
        <button
          id="authGuestBtn"
          className={'guest-entry-btn' + (mode === 'login' ? '' : ' hidden')}
          type="button"
          disabled={busy}
          onClick={forms.openGuest}
        >
          Jogar como convidado
        </button>
        <p className="guest-entry-note">
          Sem cadastro: jogo e voz da mesa. Para entrar no M&amp;N, faça login.
        </p>
      </dialog>
      <dialog
        ref={guest}
        id="guestDialog"
        className="auth-dialog"
        aria-labelledby="guestTitle"
        onClose={() => {
          if (!guest.current?.open && forms.getSnapshot().guestOpen) forms.closeGuest();
        }}
        onCancel={(event) => {
          event.preventDefault();
          forms.closeGuest();
        }}
      >
        <button
          id="guestClose"
          className="auth-close"
          type="button"
          aria-label="Fechar acesso de convidado"
          onClick={forms.closeGuest}
        >
          ×
        </button>
        <span className="auth-brand">♛ A LEI DO TRONO</span>
        <h2 id="guestTitle">Jogar como convidado</h2>
        <p className="guest-entry-note">
          Escolha seu nome para jogar e usar a voz na mesa. O chat M&amp;N continua exclusivo para
          quem tem conta.
        </p>
        <form
          id="guestForm"
          aria-busy={state.guestBusy}
          onSubmit={(event) => {
            event.preventDefault();
            void forms.submitGuest();
          }}
        >
          <label className="auth-field">
            Nome do convidado
            <input
              id="guestNickname"
              type="text"
              minLength={2}
              maxLength={20}
              autoComplete="nickname"
              required
              disabled={state.guestBusy}
              value={state.guestName}
              onChange={(event) => forms.setGuestName(event.target.value)}
            />
          </label>
          <button
            id="guestSubmit"
            className="auth-primary"
            type="submit"
            disabled={state.guestBusy}
          >
            Entrar no jogo
          </button>
          <p id="guestMessage" className="auth-message" role="status" aria-live="polite">
            {state.guestMessage}
          </p>
        </form>
      </dialog>
    </>
  );
}
