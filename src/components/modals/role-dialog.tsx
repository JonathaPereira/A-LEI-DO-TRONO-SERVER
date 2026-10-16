export function RoleDialog() {
  return (
    <>
      <dialog id={'roleDialog'} className={'feature-dialog'} aria-labelledby={'roleTitle'}>
        <button
          id={'roleClose'}
          className={'dialog-close'}
          type={'button'}
          aria-label={'Fechar cargo'}
        >
          ×
        </button>
        <span className={'section-eyebrow'}>PERMISSÕES</span>
        <h2 id={'roleTitle'}>
          Cargo de <span id={'rolePersonName'}></span>
        </h2>
        <p>Somente o criador pode conceder ou remover Admin.</p>
        <form id={'roleForm'}>
          <input id={'rolePersonId'} type={'hidden'} />
          <label>
            Cargo
            <select id={'roleSelect'}>
              <option value={'member'}>Membro</option>
              <option value={'admin'}>Admin</option>
            </select>
          </label>
          <p id={'roleMessage'} className={'feature-message'} role={'status'}></p>
          <button id={'roleSave'} className={'primary-button'} type={'submit'}>
            Salvar cargo
          </button>
        </form>
      </dialog>
    </>
  );
}
