export function AuthDialog() {
  return (
    <>
      <dialog
        id={'authDialog'}
        className={'auth-dialog'}
        aria-labelledby={'authTitle'}
        aria-describedby={'authIntro'}
      >
        <button
          id={'authCloseBtn'}
          className={'auth-close'}
          type={'button'}
          aria-label={'Fechar acesso à conta'}
        >
          ×
        </button>
        <span className={'auth-brand'}>✦ M&amp;N · SUA CONTA</span>
        <h2 id={'authTitle'}>Bem-vindo de volta</h2>
        <p id={'authIntro'}>Entre na sua conta para conversar e jogar.</p>
        <a
          id={'authDesktopDownload'}
          className={'auth-desktop-download'}
          href={'https://a-lei-do-trono.surge.sh/downloads/MN-Trono-0.2.10-Windows.exe'}
          download={'MN-Trono-0.2.10-Windows.exe'}
        >
          <svg
            viewBox={'0 0 24 24'}
            fill={'none'}
            stroke={'currentColor'}
            strokeWidth={'1.8'}
            aria-hidden={'true'}
          >
            <path d={'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4'}></path>
          </svg>
          <span>
            Baixe a versão desktop<small>Windows · 64 bits</small>
          </span>
        </a>
        <form id={'authForm'}>
          <label className={'auth-field hidden'}>
            Apelido
            <input
              id={'authNickname'}
              name={'nickname'}
              type={'text'}
              minLength={2}
              maxLength={20}
              autoComplete={'nickname'}
              disabled
            />
            <small>De 2 a 20 caracteres. Será seu nome no chat e no jogo.</small>
          </label>
          <label className={'auth-field'}>
            E-mail
            <input
              id={'authEmail'}
              name={'email'}
              type={'email'}
              maxLength={254}
              autoComplete={'email'}
              inputMode={'email'}
              required
            />
          </label>
          <label className={'auth-field'}>
            Senha
            <input
              id={'authPassword'}
              name={'password'}
              type={'password'}
              autoComplete={'current-password'}
              required
              aria-describedby={'authRules'}
            />
          </label>
          <label className={'auth-field hidden'}>
            Confirme a senha
            <input
              id={'authConfirm'}
              name={'password_confirmation'}
              type={'password'}
              autoComplete={'new-password'}
              disabled
            />
          </label>
          <label id={'authRememberRow'} className={'auth-check'} hidden>
            <input id={'authRemember'} type={'checkbox'} defaultChecked /> Lembre de mim neste
            computador
          </label>
          <label className={'auth-check'}>
            <input id={'authShowPassword'} type={'checkbox'} /> Mostrar senha
          </label>
          <ul
            id={'authRules'}
            className={'auth-rules hidden'}
            aria-label={'Requisitos da senha'}
            aria-live={'polite'}
          >
            <li data-password-rule={'length'}>
              <span>○</span> Mínimo de 8 caracteres
            </li>
            <li data-password-rule={'lowercase'}>
              <span>○</span> Letra minúscula (a–z)
            </li>
            <li data-password-rule={'uppercase'}>
              <span>○</span> Letra maiúscula (A–Z)
            </li>
            <li data-password-rule={'number'}>
              <span>○</span> Número (0–9)
            </li>
            <li data-password-rule={'symbol'}>
              <span>○</span> Símbolo (!, @, #…)
            </li>
          </ul>
          <button id={'authSubmitBtn'} className={'auth-primary'} type={'submit'}>
            Entrar
          </button>
          <p id={'authMessage'} className={'auth-message'} role={'status'} aria-live={'polite'}></p>
        </form>
        <div className={'auth-links'}>
          <button id={'authForgotBtn'} className={'auth-link'} type={'button'}>
            Esqueci minha senha
          </button>
        </div>
        <div id={'authModeLinks'} className={'auth-links'}>
          <button id={'authSignupBtn'} className={'auth-link'} type={'button'}>
            Criar uma conta
          </button>
          <button id={'authBackLoginBtn'} className={'auth-link hidden'} type={'button'}>
            Voltar para entrar
          </button>
        </div>
        <button id={'authGuestBtn'} className={'guest-entry-btn'} type={'button'}>
          Jogar como convidado
        </button>
        <p className={'guest-entry-note'}>
          Sem cadastro: jogo e voz da mesa. Para entrar no M&amp;N, faça login.
        </p>
      </dialog>
    </>
  );
}
