import { AppIcon as Icon } from '../application/icons';
export function ClipsDialog() {
  return (
    <>
      <dialog
        closedby="any"
        id={'clipsDialog'}
        className={'feature-dialog clips-dialog'}
        aria-labelledby={'clipsTitle'}
      >
        <header className={'clips-heading'}>
          <div>
            <small>CLIPES LOCAIS</small>
            <h2 id={'clipsTitle'}>Seus clipes</h2>
          </div>
          <button
            id={'clipClose'}
            className={'dialog-close'}
            type={'button'}
            aria-label={'Fechar central de clipes'}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className={'replay-summary'} id="clipCaptureIndicator" data-active="false">
          <span id={'clipReplayDot'} className={'replay-dot'} aria-hidden={'true'}></span>
          <span id={'clipSource'}>Captura desligada</span>
          <button id={'clipNow'} type={'button'} disabled>
            Clipar últimos 30 s
          </button>
        </div>
        <p id="clipCaptureDetails" className="clips-help" />
        <section aria-label="Captura local de clipes">
          <button id="clipLocalStart" type="button">
            Ativar captura local…
          </button>
          <button id="clipLocalStop" type="button" hidden>
            Desligar captura local
          </button>
          <p id="clipLocalStatus" role="status">
            Captura local desligada
          </p>
          <p>
            Escolha uma tela ou janela para guardar os últimos segundos, sem entrar em chamada ou
            transmitir. Desligada ao abrir o aplicativo; ative apenas quando quiser capturar.
          </p>
        </section>
        <label className="clip-audio-choice">
          Som dos clipes
          <select id="clipAudioMode" defaultValue="on">
            <option value="on">Microfone + áudio da captura</option>
            <option value="none">Sem som</option>
          </select>
        </label>
        <label className="clip-audio">
          <input id="clipAuto" type="checkbox" defaultChecked /> Preparar clipes ao transmitir a
          tela
        </label>
        <nav className={'clips-tabs'} role={'tablist'} aria-label={'Central de clipes'}>
          <button
            type={'button'}
            role={'tab'}
            data-clips-tab={'library'}
            aria-controls={'clipsLibrary'}
            aria-selected={'true'}
            className={'active'}
          >
            Biblioteca <b id={'clipPendingCount'}>0</b>
          </button>
          <button
            type={'button'}
            role={'tab'}
            data-clips-tab={'preferences'}
            aria-controls={'clipsPreferences'}
            aria-selected={'false'}
          >
            Configurações dos clipes
          </button>
        </nav>
        <p id={'clipsStatus'} className={'clips-status'} role={'status'} aria-live={'polite'}>
          Ative a captura local ou use a tela que você está transmitindo.
        </p>
        <section id={'clipsLibrary'} role={'tabpanel'}>
          <div className={'clips-library-actions'}>
            <button id={'clipShare'} type={'button'}>
              Transmitir tela na chamada…
            </button>
            <button id={'clipResume'} type={'button'} hidden>
              Retomar preparação de clipes
            </button>
            <button id={'clipFloating'} type={'button'} hidden>
              Janela flutuante
            </button>
          </div>
          <div id={'clipList'} className={'clip-list'}></div>
          <p className={'clips-footnote'}>
            Clipes guardados neste navegador e nesta conta. Salve os que quiser manter
            definitivamente.
          </p>
        </section>
        <section id={'clipsPreferences'} role={'tabpanel'} hidden>
          <div id="clipPreferencesHost" />
          <div id="clipDesktopHost" />
          <details className={'clips-info'}>
            <summary>Armazenamento e recursos</summary>
            <p>
              Apenas os segundos recentes ficam temporariamente na memória do computador. Desligar a
              captura local ou parar a transmissão descarta esses segundos, preservando os clipes
              que você criou. Os clipes ficam neste dispositivo; a transmissão da chamada continua
              usando sua infraestrutura normal. Limpar os dados do site pode apagar os pendentes.
            </p>
            <p>
              Qualidade alta e 60 FPS exigem mais processamento. O limite de memória pode encurtar
              trechos longos. Sem o componente Windows, o atalho só funciona com esta página ou a
              janela de clipes em foco.
            </p>
          </details>
        </section>
      </dialog>
    </>
  );
}
