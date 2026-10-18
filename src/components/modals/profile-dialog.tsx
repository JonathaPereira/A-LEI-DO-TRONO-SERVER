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
        <span className={'auth-brand'}>✦ M&amp;N · SEU PERFIL</span>
        <h2 id={'profileTitle'}>Seu perfil</h2>
        <form id={'profileForm'}>
          <label className={'auth-field'}>
            Apelido
            <input
              id={'profileNickname'}
              type={'text'}
              minLength={2}
              maxLength={20}
              autoComplete={'nickname'}
              required
            />
            <small>De 2 a 20 caracteres. Aparece no chat e nas partidas.</small>
          </label>
          <div
            id={'profilePreview'}
            className={'profile-preview'}
            aria-label={'Prévia do ícone'}
          ></div>
          <div
            id={'avatarPresets'}
            className={'avatar-presets'}
            aria-label={'Ícones disponíveis'}
          ></div>
          <div className={'profile-photo-label'}>
            <label htmlFor={'profilePhoto'}>Usar uma foto</label>
            <button id={'profilePhotoChoose'} className={'small-btn'} type={'button'}>
              Escolher foto
            </button>
            <input
              id={'profilePhoto'}
              type={'file'}
              accept={'image/png,image/jpeg,image/webp,image/gif'}
              hidden
            />
            <small>Até 10 MB. Recorte central automático em 256 × 256 pixels.</small>
          </div>
          <p id={'profileMessage'} role={'status'} aria-live={'polite'}></p>
          <button id={'profileSave'} className={'royal-btn primary'} type={'submit'}>
            Salvar perfil
          </button>
        </form>
        <section className={'profile-appearance'} aria-labelledby={'profileAppearanceTitle'}>
          <h3 id={'profileAppearanceTitle'}>Aparência</h3>
          <div id="appLayoutPickerHost" style={{ display: 'contents' }} />
          <p className={'appearance-help'}>
            A disposição fica salva apenas para você neste aparelho. Você pode trocar durante a
            chamada.
          </p>
          <div id="appearanceFieldsHost" style={{ display: 'contents' }} />
        </section>
        <h3>Meus arquivos</h3>
        <p id={'storageUsage'}></p>
        <div id={'profileFiles'}></div>
      </dialog>
    </>
  );
}
