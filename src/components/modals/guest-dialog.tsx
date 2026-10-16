export function GuestDialog() {
  return (
    <>
      <dialog id={'guestDialog'} className={'auth-dialog'} aria-labelledby={'guestTitle'}>
        <button
          id={'guestClose'}
          className={'auth-close'}
          type={'button'}
          aria-label={'Fechar acesso de convidado'}
        >
          ×
        </button>
        <span className={'auth-brand'}>♛ A LEI DO TRONO</span>
        <h2 id={'guestTitle'}>Jogar como convidado</h2>
        <p className={'guest-entry-note'}>
          Escolha seu nome para jogar e usar a voz na mesa. O chat M&amp;N continua exclusivo para
          quem tem conta.
        </p>
        <form id={'guestForm'}>
          <label className={'auth-field'}>
            Nome do convidado
            <input
              id={'guestNickname'}
              type={'text'}
              minLength={2}
              maxLength={20}
              autoComplete={'nickname'}
              required
            />
          </label>
          <button id={'guestSubmit'} className={'auth-primary'} type={'submit'}>
            Entrar no jogo
          </button>
          <p
            id={'guestMessage'}
            className={'auth-message'}
            role={'status'}
            aria-live={'polite'}
          ></p>
        </form>
      </dialog>
    </>
  );
}
