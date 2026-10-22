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
          <div id="clipPreferencesHost" />
          <div id="clipDesktopHost" />
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
