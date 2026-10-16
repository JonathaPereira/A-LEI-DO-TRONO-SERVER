export function TurnNotice() {
  return (
    <>
      <div
        id={'turnNotice'}
        className={'turn-notice hidden'}
        aria-hidden={'true'}
        aria-live={'assertive'}
      >
        <div className={'turn-notice-vignette'}></div>
        <div className={'turn-notice-card'}>
          <span className={'turn-notice-crown'}>♛</span>
          <small>O TRONO O CHAMA</small>
          <strong>SUA VEZ</strong>
          <span id={'turnNoticeLaw'}>Escolha sua carta</span>
          <b id={'turnNoticeClock'}>01:00</b>
          <em>Você tem 1 minuto para agir.</em>
        </div>
      </div>
    </>
  );
}
