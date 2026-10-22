export function TicketToRideScreen() {
  return (
    <section
      id="ticketToRideScreen"
      className="screen hidden mn-games-screen tr-screen"
      aria-label="Ticket to Ride, mapa clássico dos EUA"
    >
      <header className="tr-heading">
        <div className="tr-brand">
          <button id="ticketToRideBack" type="button" className="tr-button">
            ‹ Jogos
          </button>
          <h1>
            TICKET TO RIDE<small>ESTADOS UNIDOS · MAPA CLÁSSICO</small>
          </h1>
        </div>
        <div className="tr-heading-actions">
          <strong id="ticketToRideStatus" role="status">
            ESTAÇÃO M&amp;N
          </strong>
          <button id="ticketToRideFullscreen" className="tr-button" type="button">
            Tela cheia
          </button>
          <button id="ticketToRideRulesButton" className="tr-button" type="button">
            Como jogar
          </button>
        </div>
      </header>
      <p id="ticketToRideNotice" className="tr-notice" role="status" aria-live="polite" />
      <div id="ticketToRideContent" />
      <footer className="tr-footnote">
        Ticket to Ride · Alan R. Moon / Days of Wonder. Implementação de fã para M&amp;N. Tabuleiro
        dos EUA e artes de cartas e vagões fornecidos pelo proprietário. Não inclui expansões. A
        chamada e o compartilhamento de PC continuam independentes da mesa. Mesas em andamento ficam
        na memória do servidor; um reinício encerra as partidas.
      </footer>
      <dialog
        id="ticketToRideRulesDialog"
        className="tr-dialog"
        aria-labelledby="ticketToRideRulesTitle"
      >
        <button type="button" data-close="" aria-label="Fechar regras">
          ×
        </button>
        <span className="tr-eyebrow">O GUIA DO VIAJANTE</span>
        <h2 id="ticketToRideRulesTitle">Uma ferrovia de costa a costa</h2>
        <p>
          De 2 a 5 participantes. Cada pessoa começa com 45 vagões, 4 cartas de trem e 3 bilhetes;
          mantenha pelo menos 2 bilhetes, sem mostrá-los aos demais.
        </p>
        <ol>
          <li>
            <strong>Comprar cartas:</strong> compre duas cartas, abertas ou do monte. Uma locomotiva
            aberta vale pelas duas compras e só pode ser a primeira. Locomotiva do monte conta como
            uma carta. Cinco cartas ficam abertas; três locomotivas abertas fazem o mercado ser
            renovado, quando o estoque permite.
          </li>
          <li>
            <strong>Construir:</strong> pague cartas da mesma cor e quantidade da rota. Cinza aceita
            qualquer cor única. Locomotivas substituem cartas. Comprimentos de 1, 2, 3, 4, 5 e 6 dão
            1, 2, 4, 7, 10 e 15 pontos. Você precisa de vagões suficientes.
          </li>
          <li>
            <strong>Comprar destinos:</strong> receba até 3 bilhetes; mantenha pelo menos 1. Os
            rejeitados vão ao fundo. Conexões usam apenas suas próprias rotas, sem direção.
          </li>
        </ol>
        <p>
          Em partidas com 2 ou 3 participantes, construir uma rota dupla bloqueia a outra. Com 4 ou
          5, ambas podem ser construídas, por pessoas diferentes.
        </p>
        <p>
          Quando alguém termina um turno com 2 vagões ou menos, cada pessoa joga mais um turno,
          incluindo quem iniciou a rodada final. Bilhetes concluídos somam pontos; os demais
          subtraem seu valor. Maior caminho contínuo recebe +10, inclusive em empate. Um caminho
          pode visitar uma cidade mais de uma vez, mas nunca repetir uma rota. O desempate considera
          mais bilhetes concluídos e depois o maior caminho; persistindo o empate, a vitória é
          compartilhada.
        </p>
        <p>
          Selecione um destino para destacar suas cidades. Clique em um trecho do mapa para ver os
          pagamentos possíveis. Os bots conhecem somente sua própria mão e bilhetes. Reconexão
          permite retomar seu lugar por 90 segundos; sair transfere o lugar para um bot.
        </p>
      </dialog>
    </section>
  );
}
