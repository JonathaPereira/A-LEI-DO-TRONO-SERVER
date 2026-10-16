export function RecordingNotice() {
  return (
    <>
      <div id={'recordingNotice'} className={'recording-notice hidden'} aria-live={'polite'}>
        <span className={'recording-dot'}></span>
        <strong id={'recordingNoticeLabel'}>GRAVANDO</strong>
        <b id={'recordingTimer'}>00:00</b>
        <small id={'recordingNoticeHelp'}>Clique em Parar quando quiser encerrar.</small>
        <button id={'recordingStopBtn'} className={'recording-stop-inline'} type={'button'}>
          ■ Parar
        </button>
      </div>
    </>
  );
}
