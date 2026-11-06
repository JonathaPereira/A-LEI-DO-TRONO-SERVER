export function ExchangeCinematic() {
  return (
    <>
      <div id={'exchangeCinematic'} className={'exchange-cinematic hidden'} aria-hidden={'true'}>
        <div className={'exchange-vignette'}></div>
        <div className={'exchange-header'}>
          <span id={'exchangeIcon'} className={'exchange-icon'}>
            ⇄
          </span>
          <div>
            <small id={'exchangeKicker'}>MOVIMENTO DA CORTE</small>
            <strong id={'exchangeTitle'}>Troca de cartas</strong>
            <span id={'exchangeSubtitle'}>As cartas estão mudando de mãos.</span>
          </div>
        </div>
        <div id={'exchangeStage'} className={'exchange-stage'}></div>
      </div>
    </>
  );
}
