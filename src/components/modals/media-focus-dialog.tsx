export function MediaFocusDialog() {
  return (
    <>
      <dialog
        id={'mediaFocusDialog'}
        className={'media-focus-dialog'}
        aria-labelledby={'mediaFocusTitle'}
      >
        <header>
          <div>
            <span className={'section-eyebrow'}>VISUALIZAÇÃO EM GRUPO</span>
            <h2 id={'mediaFocusTitle'}>Grade de até 6 pessoas</h2>
            <p>
              Marque quem quer ver. Use ⛶ na câmera ou na tela para sair da grade e abrir em tela
              cheia.
            </p>
          </div>
          <div className={'dialog-actions'}>
            <button
              id={'mediaFocusFullscreen'}
              className={'secondary-button'}
              type={'button'}
              title={'Abrir a primeira mídia selecionada em tela cheia'}
            >
              ⛶ Tela cheia do destaque
            </button>
            <button
              id={'mediaFocusClose'}
              className={'dialog-close'}
              type={'button'}
              aria-label={'Fechar mosaico'}
            >
              ×
            </button>
          </div>
        </header>
        <div className={'media-focus-selection'}>
          <div id={'mediaFocusPicker'}></div>
          <output id={'mediaFocusCount'}>0 de 6 pessoas</output>
        </div>
        <div id={'mediaFocusGrid'} className={'media-focus-grid'}></div>
      </dialog>
    </>
  );
}
