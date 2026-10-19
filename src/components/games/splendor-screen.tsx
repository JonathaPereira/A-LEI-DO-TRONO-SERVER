import { GameAction } from './library-controls';
export function SplendorScreen() {
  return (
    <>
      <section
        id={'splendorScreen'}
        className={'screen hidden mn-games-screen sp-screen'}
        aria-label={'Splendor'}
      >
        <header className={'sp-heading'}>
          <div className={'sp-brand'}>
            <GameAction
              destination="library"
              id={'splendorBack'}
              type={'button'}
              className={'sp-button'}
              aria-label={'Voltar ao catálogo de jogos'}
            >
              ‹ Jogos
            </GameAction>
            <h1>
              SPLENDOR<small>GEMAS · COMÉRCIO · PRESTÍGIO</small>
            </h1>
          </div>
          <div className={'sp-heading-actions'}>
            <strong id={'splendorStatus'} role={'status'}></strong>
            <button
              id={'splendorFullscreen'}
              className={'sp-button'}
              type={'button'}
              aria-pressed={'false'}
            >
              Tela cheia
            </button>
            <button id={'splendorRulesButton'} className={'sp-button'} type={'button'}>
              Como jogar
            </button>
          </div>
        </header>
        <p id={'splendorNotice'} className={'sp-notice'} role={'status'} aria-live={'polite'}></p>
        <div id={'splendorContent'}></div>
        <aside
          id={'splendorRanking'}
          className={'sp-ranking'}
          aria-label={'Top 5 permanente do Splendor'}
        ></aside>
        <footer className={'sp-footnote'}>
          Splendor clássico · Marc André / Space Cowboys · Implementação de fã para a comunidade
          M&amp;N. Ilustrações e áudio próprios. Mesas ao vivo; recordes salvos no servidor.
        </footer>
        <dialog id={'splendorCardDialog'} className={'sp-dialog'} aria-label={'Carta e pagamento'}>
          <button data-close={''} type={'button'} aria-label={'Fechar carta'}>
            ×
          </button>
          <div id={'splendorCardContent'} className={'sp-card-content'}></div>
        </dialog>
        <dialog id={'splendorReturnDialog'} className={'sp-dialog'} aria-label={'Devolver fichas'}>
          <button data-close={''} type={'button'} aria-label={'Cancelar devolução'}>
            ×
          </button>
          <div id={'splendorReturnContent'}></div>
        </dialog>
        <dialog
          id={'splendorCollectionDialog'}
          className={'sp-dialog'}
          aria-label={'Coleção de desenvolvimentos'}
        >
          <button data-close={''} type={'button'} aria-label={'Fechar coleção'}>
            ×
          </button>
          <div id={'splendorCollectionContent'}></div>
        </dialog>
        <dialog
          id={'splendorRulesDialog'}
          className={'sp-dialog'}
          aria-labelledby={'splendorRulesTitle'}
        >
          <button data-close={''} type={'button'} aria-label={'Fechar regras'}>
            ×
          </button>
          <span className={'sp-eyebrow'}>O LIVRO DOS MERCADORES</span>
          <h2 id={'splendorRulesTitle'}>Como jogar Splendor</h2>
          <p>
            Regras do jogo clássico, para 2–4 pessoas: 90 cartas de desenvolvimento (40 de nível I,
            30 de nível II e 20 de nível III), 10 nobres, cinco cores de gemas e ouro curinga. O
            objetivo é terminar com mais prestígio. O primeiro mercador é sorteado, já que não
            coletamos a idade dos jogadores.
          </p>
          <ol>
            <li>
              <b>Prepare o mercado.</b> Quatro cartas ficam abertas em cada nível. Há 4 fichas por
              cor com 2 pessoas, 5 com 3 e 7 com 4; sempre 5 ouros. São revelados tantos nobres
              quanto o número de participantes mais um. Cartas e nobres restantes ficam fora da
              vista.
            </li>
            <li>
              <b>Faça uma ação por turno.</b> Pegue até 3 fichas de cores diferentes; ou 2 da mesma
              cor, apenas se a pilha tiver pelo menos 4 antes da retirada; ou reserve uma carta; ou
              compre uma carta.
            </li>
            <li>
              <b>Reserve para depois.</b> Escolha uma carta aberta ou uma carta oculta do topo de um
              dos baralhos. Receba 1 ouro se houver. Você pode ter no máximo 3 cartas reservadas.
              Elas não podem ser descartadas: só saem da reserva quando compradas. Reservar não paga
              o custo nem dá o bônus ou os pontos da carta. As reservas dos outros jogadores ficam
              ocultas.
            </li>
            <li>
              <b>Compre e construa sua rede.</b> Compre uma carta aberta ou da sua reserva. Seus
              bônus permanentes descontam o custo de cada cor; pague o restante com fichas e, se
              quiser, ouro como curinga. As fichas pagas voltam ao banco. Ganhe o bônus da carta e
              seus pontos de prestígio. Cartas sem pontos também ajudam: os bônus se acumulam e
              nunca são gastos. Uma carta pode ficar gratuita. A reposição do mercado usa o mesmo
              nível; um baralho vazio não é reabastecido.
            </li>
            <li>
              <b>Fique com até 10 fichas.</b> Se pegar fichas ou reservar e ultrapassar 10, escolha
              exatamente o excesso para devolver. Pode devolver até as fichas recém-obtidas,
              inclusive ouro. A seleção é confirmada junto com a sua ação.
            </li>
            <li>
              <b>Receba um nobre.</b> No fim da sua ação, compare seus bônus permanentes com os
              requisitos dos nobres. Fichas e ouro não contam. Um nobre elegível visita
              automaticamente e dá 3 pontos. Se houver mais de um, você escolhe um: só há uma visita
              por turno. A visita não consome uma ação e não gasta bônus.
            </li>
            <li>
              <b>Complete a última rodada.</b> Quando alguém termina seu turno com 15 ou mais
              pontos, os demais completam a rodada para que todos tenham jogado o mesmo número de
              turnos. Pode haver pontuações acima de 15. Vence quem tiver mais pontos; em empate,
              quem comprou menos cartas de desenvolvimento. Reservas e nobres não contam nesse
              desempate. Persistindo o empate, a vitória é compartilhada.
            </li>
          </ol>
          <p>
            Você pode jogar online ou completar uma mesa com bots. Uma queda curta permite retomar
            sua cadeira; ao sair voluntariamente, um bot assume e esse resultado não gera recorde
            para você. O Top 5 guarda o melhor resultado por conta, com partidas com bots
            identificadas. Recordes já salvos resistem a novos deploys; mesas em andamento ficam na
            memória do servidor.
          </p>
        </dialog>
      </section>
    </>
  );
}
