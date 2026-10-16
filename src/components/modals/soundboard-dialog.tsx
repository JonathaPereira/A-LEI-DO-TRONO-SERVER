export function SoundboardDialog() {
  return (
    <>
      <aside
        id={'soundboardDialog'}
        className={'feature-dialog soundboard-menu'}
        aria-labelledby={'soundboardTitle'}
        role={'dialog'}
        hidden
      >
        <header className={'soundboard-heading'}>
          <div>
            <span className={'section-eyebrow'}>NA CHAMADA</span>
            <h2 id={'soundboardTitle'}>Efeitos sonoros</h2>
          </div>
          <button
            id={'soundboardClose'}
            className={'dialog-close'}
            type={'button'}
            aria-label={'Fechar efeitos'}
          >
            ×
          </button>
        </header>
        <p id={'soundboardCallHint'}></p>
        <div className={'sound-volume'}>
          <label htmlFor={'soundboardVolume'}>Volume para mim</label>
          <input id={'soundboardVolume'} type={'range'} min={'0'} max={'100'} defaultValue={'70'} />
          <output id={'soundboardVolumeValue'}>70%</output>
          <button id={'soundStop'} className={'secondary-button'} type={'button'}>
            Parar áudio
          </button>
        </div>
        <div id={'soundboardList'} className={'soundboard-list'}></div>
        <details id={'soundUploadDetails'} className={'sound-upload-details'}>
          <summary>＋ Adicionar efeito</summary>
          <form id={'soundUploadForm'} className={'sound-upload-form'}>
            <label>
              Nome
              <input id={'soundName'} maxLength={40} required placeholder={'Ex.: aplausos'} />
            </label>
            <label>
              Escolher áudio
              <input
                id={'soundFile'}
                type={'file'}
                accept={'audio/*,.mp3,.wav,.ogg,.m4a,.webm'}
                required
              />
              <small>Até 20 MB. Áudios longos podem ser recortados abaixo.</small>
            </label>
            <section
              id={'soundTrimEditor'}
              className={'sound-trim-editor'}
              aria-label={'Recortar áudio'}
              hidden
            >
              <div className={'trim-heading'}>
                <strong>Escolha seu trecho</strong>
                <output id={'soundTrimDuration'}></output>
              </div>
              <canvas
                id={'soundWaveform'}
                width={'640'}
                height={'100'}
                aria-hidden={'true'}
              ></canvas>
              <div className={'trim-fields'}>
                <label>
                  Início (s)
                  <input
                    id={'soundTrimStart'}
                    type={'number'}
                    min={'0'}
                    step={'0.01'}
                    defaultValue={'0'}
                    inputMode={'decimal'}
                  />
                </label>
                <label>
                  Fim (s)
                  <input
                    id={'soundTrimEnd'}
                    type={'number'}
                    min={'0.05'}
                    step={'0.01'}
                    defaultValue={'15'}
                    inputMode={'decimal'}
                  />
                </label>
              </div>
              <label>
                Posição inicial
                <input
                  id={'soundTrimStartRange'}
                  className={'trim-range'}
                  aria-label={'Posição inicial do recorte'}
                  type={'range'}
                  min={'0'}
                  step={'0.01'}
                  defaultValue={'0'}
                />
              </label>
              <label>
                Posição final
                <input
                  id={'soundTrimEndRange'}
                  className={'trim-range'}
                  aria-label={'Posição final do recorte'}
                  type={'range'}
                  min={'0'}
                  step={'0.01'}
                  defaultValue={'15'}
                />
              </label>
              <div className={'trim-footer'}>
                <small>Trecho de até 15 segundos. Ajuste os dois pontos ou clique na onda.</small>
                <button id={'soundTrimPreview'} className={'secondary-button'} type={'button'}>
                  ▶ Ouvir trecho
                </button>
              </div>
            </section>
            <button id={'soundUpload'} type={'submit'} className={'primary-button'} disabled>
              ↑ Enviar trecho
            </button>
          </form>
        </details>
        <p
          id={'soundboardMessage'}
          className={'feature-message'}
          role={'status'}
          aria-live={'polite'}
        ></p>
      </aside>
    </>
  );
}
