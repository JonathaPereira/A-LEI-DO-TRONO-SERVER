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
          <fieldset className={'app-layout-picker'}>
            <legend>Disposição do aplicativo</legend>
            <label className={'app-layout-option'}>
              <input type={'radio'} name={'appLayout'} value={'original'} />
              <span className={'layout-preview layout-preview-original'} aria-hidden={'true'}>
                <i></i>
                <i></i>
                <i></i>
                <i></i>
              </span>
              <strong>Original / Padrão</strong>
              <small>Visual original, com os controles na barra inferior.</small>
            </label>
            <label className={'app-layout-option'}>
              <input type={'radio'} name={'appLayout'} value={'discord'} />
              <span className={'layout-preview layout-preview-discord'} aria-hidden={'true'}>
                <i></i>
                <i></i>
                <i></i>
                <i></i>
              </span>
              <strong>Discord</strong>
              <small>Canais à esquerda, conversa ao centro e seu perfil no canto inferior.</small>
            </label>
          </fieldset>
          <p className={'appearance-help'}>
            A disposição fica salva apenas para você neste aparelho. Você pode trocar durante a
            chamada.
          </p>
          <p id={'appLayoutStatus'} className={'appearance-help'} role={'status'}></p>
          <fieldset className={'theme-picker'}>
            <legend>Cores do tema</legend>
            <label
              className={'theme-option'}
              style={{ '--swatch': '#a99cff' } as React.CSSProperties}
            >
              <input type={'radio'} name={'profileTheme'} value={'purple'} />
              <span className={'theme-swatch'} aria-hidden={'true'}></span>
              <span>Roxo · padrão</span>
            </label>
            <label
              className={'theme-option'}
              style={{ '--swatch': '#69d29b' } as React.CSSProperties}
            >
              <input type={'radio'} name={'profileTheme'} value={'green'} />
              <span className={'theme-swatch'} aria-hidden={'true'}></span>
              <span>Verde e preto</span>
            </label>
            <label
              className={'theme-option'}
              style={{ '--swatch': '#f47b85' } as React.CSSProperties}
            >
              <input type={'radio'} name={'profileTheme'} value={'red'} />
              <span className={'theme-swatch'} aria-hidden={'true'}></span>
              <span>Preto e vermelho</span>
            </label>
            <label
              className={'theme-option'}
              style={{ '--swatch': '#75bdf2' } as React.CSSProperties}
            >
              <input type={'radio'} name={'profileTheme'} value={'blue'} />
              <span className={'theme-swatch'} aria-hidden={'true'}></span>
              <span>Azul e preto</span>
            </label>
            <label
              className={'theme-option'}
              style={{ '--swatch': '#efd470' } as React.CSSProperties}
            >
              <input type={'radio'} name={'profileTheme'} value={'yellow'} />
              <span className={'theme-swatch'} aria-hidden={'true'}></span>
              <span>Amarelo e preto</span>
            </label>
            <label
              className={'theme-option'}
              style={{ '--swatch': '#5fddcc' } as React.CSSProperties}
            >
              <input type={'radio'} name={'profileTheme'} value={'teal'} />
              <span className={'theme-swatch'} aria-hidden={'true'}></span>
              <span>Turquesa e preto</span>
            </label>
            <label
              className={'theme-option'}
              style={{ '--swatch': '#ffad72' } as React.CSSProperties}
            >
              <input type={'radio'} name={'profileTheme'} value={'orange'} />
              <span className={'theme-swatch'} aria-hidden={'true'}></span>
              <span>Laranja e preto</span>
            </label>
            <label
              className={'theme-option'}
              style={{ '--swatch': '#efa3cd' } as React.CSSProperties}
            >
              <input type={'radio'} name={'profileTheme'} value={'rose'} />
              <span className={'theme-swatch'} aria-hidden={'true'}></span>
              <span>Rosa e preto</span>
            </label>
            <label
              className={'theme-option'}
              style={{ '--swatch': '#99acff' } as React.CSSProperties}
            >
              <input type={'radio'} name={'profileTheme'} value={'indigo'} />
              <span className={'theme-swatch'} aria-hidden={'true'}></span>
              <span>Índigo e preto</span>
            </label>
            <label
              className={'theme-option'}
              style={{ '--swatch': '#c1cad6' } as React.CSSProperties}
            >
              <input type={'radio'} name={'profileTheme'} value={'graphite'} />
              <span className={'theme-swatch'} aria-hidden={'true'}></span>
              <span>Grafite e preto</span>
            </label>
          </fieldset>
          <p className={'appearance-help'}>
            Aplica na hora, só para você neste aparelho. Não muda o tema dos outros na chamada.
          </p>
          <div className={'profile-layout'}>
            <div>
              <strong>Layout dos painéis</strong>
              <p className={'appearance-help'}>
                Arraste as bordas laterais, inferiores ou os cantos para ajustar o tamanho.
              </p>
            </div>
            <button id={'layoutResetBtn'} className={'secondary-button'} type={'button'}>
              ↺ Voltar ao padrão
            </button>
          </div>
          <p
            id={'appearanceMessage'}
            className={'appearance-help'}
            role={'status'}
            aria-live={'polite'}
          ></p>
        </section>
        <h3>Meus arquivos</h3>
        <p id={'storageUsage'}></p>
        <div id={'profileFiles'}></div>
      </dialog>
    </>
  );
}
