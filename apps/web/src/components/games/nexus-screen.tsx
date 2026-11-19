export function NexusScreen() {
  return (
    <section
      id="nexusScreen"
      className="screen hidden mn-games-screen nexus-screen"
      aria-labelledby="nexusTitle"
    >
      <header className="nexus-heading">
        <button id="nexusBack" className="secondary-button" type="button">
          ‹ Jogos
        </button>
        <h1 id="nexusTitle">
          Nexus <small>· Ecos do Crepúsculo</small>
        </h1>
        <div className="nexus-toolbar">
          <a
            className="secondary-button"
            href="https://semchakra10.itch.io/nexus-mn"
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir no itch.io ↗
          </a>
          <button id="nexusClose" className="secondary-button" type="button" hidden>
            Fechar jogo
          </button>
          <button
            id="nexusFullscreen"
            className="secondary-button"
            type="button"
            aria-pressed="false"
            hidden
          >
            Tela cheia
          </button>
        </div>
      </header>
      <div className="nexus-intro">
        <img
          src="assets/games/nexus-cover.webp"
          alt="Vesper e a cidade do Nexus"
          width="630"
          height="500"
          loading="lazy"
          decoding="async"
        />
        <div className="nexus-copy">
          <span className="nexus-tag">TRÊS HERÓIS. CINCO RESSONÂNCIAS.</span>
          <h2>Seu próximo confronto começa aqui.</h2>
          <p>
            Explore a campanha ou monte um trio para desafiar seus amigos no PvP online. Os arquivos
            do jogo ficam no itch.io e são carregados ao jogar.
          </p>
          <div className="nexus-actions">
            <button id="nexusLaunch" className="primary-button" type="button">
              Jogar Nexus
            </button>
            <a
              id="nexusExternal"
              href="https://semchakra10.itch.io/nexus-mn"
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir no itch.io ↗
            </a>
          </div>
          <ol className="nexus-help">
            <li>
              Abra o jogo e escolha <strong>PvP online</strong>.
            </li>
            <li>Selecione seus três heróis e configure os engastes.</li>
            <li>Crie uma sala e compartilhe o código com seu adversário.</li>
            <li>O adversário entra com o código. Ambos confirmam para começar.</li>
          </ol>
          <p>
            Sua chamada continua no Trono. A conta e o progresso do Nexus são separados; o progresso
            local depende do navegador e dispositivo usados.
          </p>
        </div>
      </div>
      <p id="nexusStatus" className="nexus-status" role="status" aria-live="polite">
        Pronto para jogar. O jogo só é carregado quando você clicar em Jogar.
      </p>
      <p id="nexusLeaveNote" className="nexus-status" hidden>
        A partida e o áudio continuam ao navegar pelo Trono. Volte a Nexus para jogar ou use “Fechar
        jogo” para encerrar; fechar durante o PvP pode causar derrota.
      </p>
      <div id="nexusViewport" className="nexus-viewport"></div>
    </section>
  );
}
