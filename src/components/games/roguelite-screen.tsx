export function RogueliteScreen() {
  return (
    <>
      <section
        id={'rogueliteScreen'}
        className={'screen hidden mn-games-screen rg-screen'}
        aria-label={'Cinzas do Abismo'}
      >
        <header className={'rg-heading'}>
          <button id={'rogueliteBack'} type={'button'} aria-label={'Voltar ao catálogo de jogos'}>
            ‹ Jogos
          </button>
          <div>
            <h1>
              Cinzas do Abismo <small>v0.5</small>
            </h1>
            <p>Sua chamada continua · Progresso salvo neste dispositivo · Backup no menu do jogo</p>
          </div>
          <button id={'rogueliteFullscreen'} type={'button'} aria-pressed={'false'}>
            Tela cheia
          </button>
        </header>
        <div id={'rogueliteViewport'} className={'rg-viewport'}>
          <section id={'rogueliteLoading'} className={'rg-loading'} role={'status'}>
            <strong id={'rogueliteLoadStatus'}>Abrindo Cinzas do Abismo…</strong>
            <progress
              id={'rogueliteProgress'}
              max={'100'}
              value={'0'}
              aria-label={'Preparação do jogo'}
            ></progress>
            <p>
              No aplicativo, os recursos são guardados neste computador na primeira abertura para
              jogar novamente sem conexão.
            </p>
            <button id={'rogueliteRetry'} type={'button'} hidden>
              Tentar novamente
            </button>
          </section>
        </div>
      </section>
    </>
  );
}
