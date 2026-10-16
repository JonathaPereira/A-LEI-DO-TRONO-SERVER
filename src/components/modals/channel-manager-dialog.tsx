export function ChannelManagerDialog() {
  return (
    <>
      <dialog
        id={'channelManagerDialog'}
        className={'feature-dialog'}
        aria-labelledby={'channelManagerTitle'}
      >
        <button
          id={'channelManagerClose'}
          className={'dialog-close'}
          type={'button'}
          aria-label={'Fechar gerenciamento'}
        >
          ×
        </button>
        <span className={'section-eyebrow'}>SUA COMUNIDADE</span>
        <h2 id={'channelManagerTitle'}>Organize os canais</h2>
        <form id={'createChannelForm'}>
          <div className={'form-columns'}>
            <label>
              Nome
              <input
                id={'channelName'}
                minLength={2}
                maxLength={40}
                required
                placeholder={'Ex.: momentos'}
              />
            </label>
            <label>
              Tipo
              <select id={'channelType'}>
                <option value={'text'}># Canal de texto</option>
                <option value={'voice'}>♬ Canal de voz</option>
              </select>
            </label>
          </div>
          <label>
            Descrição <small>opcional</small>
            <input
              id={'channelDescription'}
              maxLength={160}
              placeholder={'Um espaço para compartilhar'}
            />
          </label>
          <button id={'createChannelSubmit'} className={'primary-button'} type={'submit'}>
            + Criar canal
          </button>
        </form>
        <p id={'channelManagerMessage'} className={'feature-message'} role={'status'}></p>
        <div id={'managedChannels'} className={'managed-channels'}></div>
      </dialog>
    </>
  );
}
