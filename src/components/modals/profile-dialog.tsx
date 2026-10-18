export function ProfileDialog() {
  return (
    <>
      <dialog
        id={'profileDialog'}
        className={'auth-dialog profile-card'}
        aria-labelledby={'profileTitle'}
      >
        <button
          id={'profileClose'}
          className={'auth-close'}
          type={'button'}
          aria-label={'Fechar perfil'}
        >
          ×
        </button>
        <div id="profileEditorHost" className="profile-editor-host" />
        <section className={'profile-appearance'} aria-labelledby={'profileAppearanceTitle'}>
          <h3 id={'profileAppearanceTitle'}>Aparência</h3>
          <div id="appLayoutPickerHost" style={{ display: 'contents' }} />
          <p className={'appearance-help'}>
            A disposição fica salva apenas para você neste aparelho. Você pode trocar durante a
            chamada.
          </p>
          <div id="appearanceFieldsHost" style={{ display: 'contents' }} />
        </section>
        <div id="profileFilesHost" />
      </dialog>
    </>
  );
}
