export function ClipsDialog() {
  return (
    <>
      <dialog
        id={'clipsDialog'}
        className={'feature-dialog clips-dialog'}
        aria-labelledby={'clipsTitle'}
      >
        <header className={'clips-heading'}>
          <div>
            <small>REPLAY LOCAL</small>
            <h2 id={'clipsTitle'}>Seus clipes</h2>
          </div>
          <button
            id={'clipClose'}
            className={'dialog-close'}
            type={'button'}
            aria-label={'Fechar central de clipes'}
          >
            ×
          </button>
        </header>
        <div className={'replay-summary'}>
          <span id={'clipReplayDot'} className={'replay-dot'} aria-hidden={'true'}></span>
          <span id={'clipSource'}>Compartilhe sua tela para habilitar o replay</span>
          <button id={'clipNow'} type={'button'} disabled>
            Clipar últimos 30 s
          </button>
        </div>
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
            Preferências
          </button>
        </nav>
        <p id={'clipsStatus'} className={'clips-status'} role={'status'} aria-live={'polite'}>
          Ao compartilhar a tela, o replay fica pronto automaticamente.
        </p>
        <section id={'clipsLibrary'} role={'tabpanel'}>
          <div className={'clips-library-actions'}>
            <button id={'clipShare'} type={'button'}>
              Compartilhar tela
            </button>
            <button id={'clipStopLocal'} type={'button'} hidden>
              Parar replay local
            </button>
            <button id={'clipChooseSource'} type={'button'} hidden>
              Trocar fonte do replay
            </button>
            <button id={'clipResume'} type={'button'} hidden>
              Retomar replay
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
          <label className={'clip-audio'}>
            <input id={'clipAuto'} type={'checkbox'} defaultChecked /> Preparar replay
            automaticamente ao compartilhar a tela
          </label>
          <label id={'clipDesktopAutoLabel'} className={'clip-audio'} hidden>
            <input id={'clipDesktopAuto'} type={'checkbox'} defaultChecked /> Preparar a tela
            principal ao abrir o aplicativo
          </label>
          <div className={'clips-settings'}>
            <label>
              Qualidade do arquivo
              <select id={'clipQuality'}>
                <option value={'light'}>720p · Leve</option>
                <option value={'balanced'}>1080p · Alta</option>
                <option value={'high'}>1440p · Máxima</option>
              </select>
            </label>
            <label>
              FPS
              <select id={'clipFps'} defaultValue="60">
                <option value={'30'}>30 FPS</option>
                <option value={'60'}>60 FPS</option>
              </select>
            </label>
            <label>
              Trecho recente
              <select id={'clipSeconds'} defaultValue="30">
                <option value={'15'}>15 segundos</option>
                <option value={'30'}>30 segundos</option>
                <option value={'60'}>60 segundos</option>
                <option value={'120'}>2 minutos</option>
              </select>
            </label>
            <label>
              Atalho
              <button
                id={'clipShortcut'}
                type={'button'}
                aria-label={'Escolher atalho para clipar'}
              >
                Ctrl + Shift + X
              </button>
            </label>
          </div>
          <p className={'clips-help'}>
            Áudio da tela incluído automaticamente quando disponível no compartilhamento. A
            resolução depende da origem; configure antes de compartilhar para capturar com a
            qualidade desejada. Mudar estas opções reinicia só o replay e descarta o buffer
            anterior.
          </p>
          <div className={'clip-destination'}>
            <div>
              <small>SALVAR EM</small>
              <strong id={'clipFolder'}></strong>
            </div>
            <button id={'clipChooseFolder'} type={'button'}>
              Escolher pasta
            </button>
            <button id={'clipResetFolder'} type={'button'} hidden>
              Salvar como / Downloads
            </button>
          </div>
          <div className={'clip-desktop-panel'}>
            <strong>Atalho durante o jogo · Windows</strong>
            <p id={'clipDesktopStatus'} role={'status'}>
              Abra o componente M&amp;N Clipes para usar o atalho com o jogo em foco.
            </p>
            <label>
              Código mostrado no aplicativo
              <input
                id={'clipDesktopCode'}
                type={'text'}
                autoComplete={'off'}
                spellCheck={'false'}
                placeholder={'Cole o código de conexão local'}
              />
            </label>
            <button id={'clipDesktopConnect'} type={'button'}>
              Conectar ao Windows
            </button>
            <button id={'clipDesktopDisconnect'} type={'button'} hidden>
              Desconectar
            </button>
          </div>
          <details className={'clips-info'}>
            <summary>Armazenamento e recursos</summary>
            <p>
              O replay mantém apenas os segundos recentes na memória do computador. Parar o
              compartilhamento descarta esse buffer, preservando os clipes que você criou. O buffer
              e os clipes não são enviados à Cloudflare; a transmissão da chamada continua usando
              sua infraestrutura normal. Limpar os dados do site pode apagar os pendentes.
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
