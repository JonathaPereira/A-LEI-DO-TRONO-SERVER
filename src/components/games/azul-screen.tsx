import { GameAction } from './library-controls';
export function AzulScreen() {
  return (
    <>
      <section
        id={'azulScreen'}
        className={'screen hidden mn-games-screen az-screen'}
        aria-label={'Azul'}
      >
        <header className={'az-heading'}>
          <div className={'az-title'}>
            <GameAction
              destination="library"
              id={'azulBack'}
              type={'button'}
              className={'az-icon-button'}
              aria-label={'Voltar ao catálogo de jogos'}
            >
              ‹
            </GameAction>
            <div>
              <span className={'az-eyebrow'}>ATELIÊ M&amp;N</span>
              <h1>
                AZUL<span>O jogo dos azulejos</span>
              </h1>
            </div>
          </div>
          <div className={'az-heading-actions'}>
            <strong id={'azulTurnStatus'} role={'status'}></strong>
            <button
              id={'azulFullscreen'}
              type={'button'}
              className={'az-button'}
              aria-pressed={'false'}
            >
              Tela cheia
            </button>
            <button id={'azulRulesButton'} type={'button'} className={'az-button'}>
              Como jogar
            </button>
          </div>
        </header>
        <p id={'azulNotice'} className={'az-notice'} role={'status'} aria-live={'polite'}></p>
        <div className={'az-layout'}>
          <div id={'azulContent'}></div>
          <aside
            id={'azulRanking'}
            className={'az-ranking'}
            aria-label={'Top 5 permanente'}
          ></aside>
        </div>
        <footer className={'az-footnote'}>
          Regras do tabuleiro colorido de Azul · Michael Kiesling · Implementação de fã para a
          comunidade M&amp;N. Arte dos componentes aprovada pela comunidade.
        </footer>
        <dialog
          id={'azulRulesDialog'}
          className={'feature-dialog az-rules-dialog'}
          aria-labelledby={'azulRulesTitle'}
        >
          <button
            id={'azulRulesClose'}
            type={'button'}
            className={'dialog-close'}
            aria-label={'Fechar regras'}
          >
            ×
          </button>
          <span className={'az-eyebrow'}>MANUAL DO ARTESÃO</span>
          <h2 id={'azulRulesTitle'}>Como jogar Azul</h2>
          <p>
            Para 2–4 participantes. O objetivo é terminar com mais pontos. Cada cor tem 20 azulejos;
            cada fábrica recebe 4. São 5, 7 ou 9 fábricas conforme o número de pessoas. O primeiro
            jogador da primeira rodada é sorteado.
          </p>
          <ol>
            <li>
              <b>Escolha uma cor.</b> Pegue todos os azulejos daquela cor em uma fábrica ou no
              centro. As outras cores da fábrica vão ao centro. A primeira pessoa a pegar do centro
              leva o marcador 1 para o chão e começa a próxima rodada.
            </li>
            <li>
              <b>Prepare uma linha.</b> Coloque os azulejos em uma única linha de 1 a 5 espaços, da
              direita para a esquerda. A linha aceita só uma cor e a parede dessa linha não pode já
              ter essa cor. As sobras vão para o chão. Você também pode mandar a seleção toda para o
              chão.
            </li>
            <li>
              <b>Complete a parede.</b> Quando acabarem os azulejos da mesa, as linhas completas
              movem um azulejo para a posição da mesma cor na parede, de cima para baixo. Os demais
              são descartados. Linhas incompletas continuam na próxima rodada.
            </li>
            <li>
              <b>Pontue as conexões.</b> Um azulejo isolado vale 1 ponto. Se conecta na horizontal
              ou vertical, vale o comprimento do grupo contínuo. Se conecta nas duas direções, some
              os dois comprimentos, contando o novo azulejo em ambos.
            </li>
            <li>
              <b>Aplique as penalidades.</b> Cada espaço ocupado do chão desconta 1, 1, 2, 2, 2, 3 e
              3 pontos. O marcador também ocupa um espaço. O total nunca fica negativo. O chão é
              limpo; o descarte só volta ao saco quando ele esvaziar.
            </li>
            <li>
              <b>Finalize o mosaico.</b> A partida termina no fim da rodada em que alguém completa
              uma linha horizontal da parede. Some +2 por linha horizontal, +7 por coluna e +10 por
              conjunto de 5 da mesma cor. Empate: vence quem completou mais linhas horizontais;
              persistindo, a vitória é compartilhada.
            </li>
          </ol>
          <p>
            O ranking guarda o melhor resultado por conta, incluindo partidas com bots
            identificadas. Bots e participantes que saíram da partida não recebem recordes. A mesa
            em andamento fica no servidor e pode ser retomada após uma queda curta; deploys encerram
            mesas em andamento. Recordes já salvos ficam no Supabase.
          </p>
        </dialog>
      </section>
    </>
  );
}
