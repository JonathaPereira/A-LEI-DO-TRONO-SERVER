export function ChannelFilesDialog() {
  return (
    <>
      <dialog
        id={'channelFilesDialog'}
        className={'feature-dialog wide-dialog'}
        aria-labelledby={'channelFilesTitle'}
      >
        <button
          id={'channelFilesClose'}
          className={'dialog-close'}
          type={'button'}
          aria-label={'Fechar anexos'}
        >
          ×
        </button>
        <span className={'section-eyebrow'}>ARQUIVOS DO CANAL</span>
        <h2 id={'channelFilesTitle'}>Fotos &amp; anexos</h2>
        <p id={'channelFilesMessage'} className={'feature-message'} role={'status'}></p>
        <div id={'channelFileList'} className={'channel-file-list'}></div>
      </dialog>
    </>
  );
}
