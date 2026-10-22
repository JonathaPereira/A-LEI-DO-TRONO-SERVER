export function RemotePcDialog() {
  return (
    <dialog id="remotePcDialog" className="remote-pc-dialog" aria-labelledby="remotePcTitle">
      <header>
        <div>
          <span className="remote-pc-eyebrow">JOGUE JUNTO, NO MESMO PC</span>
          <h2 id="remotePcTitle">
            Compartilhar PC <span className="remote-beta">Beta</span>
          </h2>
        </div>
        <button id="remotePcClose" type="button" aria-label="Fechar compartilhamento de PC">
          ×
        </button>
      </header>
      <p className="remote-pc-warning">
        <strong>Função em testes.</strong> Qualidade e atraso variam com a rede e o computador. Ao
        compartilhar, tudo que aparecer no monitor escolhido poderá ser visto. Mouse, teclado ou
        controle virtual só são liberados com sua autorização. Você continua ouvindo e falando na
        chamada.
      </p>
      <p id="remotePcSupport" className="remote-pc-note">
        Atualize o backend no Render para habilitar esta beta.
      </p>
      <section id="remotePcSetup">
        <p id="remotePcHostNotice" className="remote-pc-note">
          Para compartilhar seu PC, use o aplicativo Windows atualizado. Você pode receber um
          convite e assistir por aqui.
        </p>
        <p id="remotePcVoiceNotice" className="remote-pc-note">
          Entre na voz com sua conta e convide alguém da mesma chamada.
        </p>
        <label>
          Compartilhar com
          <select id="remotePcTarget" aria-label="Pessoa que poderá assistir ao PC"></select>
        </label>
        <label>
          Transmissão
          <select id="remotePcProfile" defaultValue="fast">
            <option value="fast">Resposta rápida · 720p / 60 FPS</option>
            <option value="quality">Mais detalhes · 1080p / 60 FPS</option>
          </select>
        </label>
        <p id="remotePcDriverNotice" className="remote-pc-note" hidden>
          Para o convidado ser outro jogador, instale o driver opcional ViGEmBus no seu PC. O
          projeto do driver foi encerrado e o uso é opcional.{' '}
          <button id="remotePcDriver" type="button">
            Abrir versão oficial do driver
          </button>{' '}
          <button id="remotePcDriverCheck" type="button">
            Verificar instalação
          </button>
        </p>
        <label className="remote-pc-audio">
          <input id="remotePcAudio" type="checkbox" /> Incluir áudio isolado de um jogo ou
          aplicativo <small>Windows compatível · escolha o aplicativo na próxima tela.</small>
        </label>
        <p className="remote-pc-footnote">
          Um monitor e um convidado por sessão. Para jogar com dois controles: conecte seu gamepad
          local antes de liberar o controle virtual do convidado. Use Start no jogo para entrar como
          jogador 2.
        </p>
      </section>
      <section id="remotePcSession" hidden>
        <div className="remote-pc-session-heading">
          <strong id="remotePcPeer"></strong>
          <span className="remote-beta">Beta</span>
        </div>
        <video
          id="remotePcVideo"
          autoPlay
          playsInline
          tabIndex={0}
          aria-label="PC compartilhado; clique para controlar após autorização"
        ></video>
        <p id="remotePcHint"></p>
        <label id="remotePcInputLabel" hidden>
          Como controlar
          <select id="remotePcInputMode" defaultValue="desktop">
            <option value="desktop">Mouse e teclado do PC</option>
            <option value="gamepad">Gamepad · jogador separado</option>
            <option value="keyboard-gamepad">Teclado como gamepad · jogador separado</option>
          </select>
        </label>
        <p id="remotePcGamepadHint" className="remote-pc-footnote" hidden></p>
        <details className="remote-pc-metrics">
          <summary>Qualidade da conexão</summary>
          <p id="remotePcMetrics">Aguardando conexão…</p>
          <small>
            RTT é o tempo de ida e volta da rede; não mede sozinho o atraso total do jogo.
          </small>
        </details>
      </section>
      <p id="remotePcStatus" role="status" aria-live="polite"></p>
      <footer>
        <button id="remotePcStart" type="button" className="remote-primary">
          Escolher monitor e convidar
        </button>
        <button id="remotePcAccept" type="button" className="remote-primary" hidden>
          Aceitar e assistir
        </button>
        <button id="remotePcRequestControl" type="button" hidden>
          Pedir controle
        </button>
        <button id="remotePcRevoke" type="button" hidden>
          Retirar controle
        </button>
        <button id="remotePcFullscreen" type="button" hidden>
          Tela cheia
        </button>
        <button id="remotePcEnd" type="button" className="remote-danger" hidden>
          Encerrar compartilhamento
        </button>
      </footer>
    </dialog>
  );
}
