export function ScreenOptionsDialog() {
  return (
    <>
      <dialog
        id={'screenOptionsDialog'}
        className={'feature-dialog share-options-dialog'}
        aria-labelledby={'screenOptionsTitle'}
      >
        <span className={'section-eyebrow'}>TRANSMISSÃO</span>
        <h2 id={'screenOptionsTitle'}>Compartilhe do seu jeito</h2>
        <p id={'shareOptionsNote'}></p>
        <form id={'screenOptionsForm'}>
          <div className={'form-columns'}>
            <label>
              Qualidade
              <select id={'shareResolution'}>
                <option value={'720'}>720p · Equilibrada</option>
                <option value={'1080'}>1080p · Alta definição</option>
              </select>
            </label>
            <label>
              Quadros por segundo
              <select id={'shareFps'}>
                <option value={'15'}>15 FPS · Textos e slides</option>
                <option value={'30'}>30 FPS · Recomendado</option>
                <option value={'60'}>60 FPS · Movimento fluido</option>
              </select>
            </label>
          </div>
          <label className={'feature-checkbox'}>
            <input id={'shareAudio'} type={'checkbox'} defaultChecked /> Compartilhar áudio, quando
            disponível
          </label>
          <small>
            Para compartilhar só o som do jogo, escolha sua aba ou janela. O áudio do computador
            inteiro pode incluir a chamada; se houver retorno de voz, desmarque o áudio.
          </small>
          <p id={'shareReplayHelp'} className={'share-replay-help'}>
            O replay será preparado automaticamente para clipar pelo botão ✂ na barra da chamada,
            com o áudio da tela quando disponível.
          </p>
          <div className={'dialog-actions'}>
            <button id={'screenOptionsCancel'} type={'button'} className={'secondary-button'}>
              Cancelar
            </button>
            <button id={'screenOptionsConfirm'} type={'submit'} className={'primary-button'}>
              Escolher tela →
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
