export function TrickOutcome() {
  return (
    <>
      <div id={'trickOutcome'} className={'trick-outcome hidden'} aria-hidden={'true'}>
        <div id={'crownOutcome'} className={'outcome-layer crown-outcome hidden'}>
          <div className={'outcome-symbol'}>♛</div>
          <div className={'outcome-kicker'}>A COROA FOI CONQUISTADA</div>
          <div id={'crownOutcomeName'} className={'outcome-name'}></div>
        </div>
        <div id={'shadowOutcome'} className={'outcome-layer shadow-outcome hidden'}>
          <div className={'shadow-mist'}></div>
          <div className={'outcome-symbol shadow-symbol'}>☾</div>
          <div className={'outcome-kicker'}>A SOMBRA SE ERGUE</div>
          <div id={'shadowOutcomeName'} className={'outcome-name'}></div>
        </div>
      </div>
    </>
  );
}
