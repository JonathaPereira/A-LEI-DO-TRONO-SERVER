export function Modal() {
  return (
    <>
      <div id={'modal'} className={'modal hidden'} role={'dialog'} aria-modal={'true'}>
        <div className={'modal-backdrop'}></div>
        <div className={'modal-card'}>
          <button id={'modalClose'} className={'modal-close hidden'}>
            ×
          </button>
          <div id={'modalIcon'} className={'modal-icon'}>
            ♛
          </div>
          <h2 id={'modalTitle'}></h2>
          <p id={'modalText'}></p>
          <div id={'modalChoices'} className={'modal-choices'}></div>
          <div id={'modalFooter'} className={'modal-footer'}></div>
        </div>
      </div>
    </>
  );
}
