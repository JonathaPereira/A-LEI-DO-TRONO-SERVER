import { useRef, useSyncExternalStore } from 'react';
import type { Azul } from '../../lib/games/azul';
import type { GameFullscreen } from '../../lib/games/fullscreen';
import type { AzulRules } from '../../types/azul';
import { AzulLobby, AzulRanking } from './azul-lobby';
import { AzulTable } from './azul-board';
import { GameAction } from './library-controls';
export function AzulContents({
  controller,
  fullscreen,
  rules,
}: {
  controller: Azul;
  fullscreen: GameFullscreen;
  rules: AzulRules;
}) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const full = useSyncExternalStore(
    fullscreen.subscribe,
    fullscreen.getSnapshot,
    fullscreen.getSnapshot,
  );
  const rulesDialog = useRef<HTMLDialogElement>(null);
  const state = snapshot.replay?.state ?? snapshot.room?.state;
  const status = !snapshot.room
    ? 'Escolha sua mesa'
    : !state
      ? 'Aguardando os artesãos'
      : state.phase === 'finished'
        ? 'Mosaico concluído'
        : snapshot.replay
          ? 'Contagem da rodada ' + snapshot.replay.round
          : 'Rodada ' +
            state.round +
            ' · ' +
            (state.players[state.turn].id === snapshot.accountId
              ? 'Sua vez'
              : state.players[state.turn].name + ' está jogando');
  function leave() {
    if (
      !snapshot.room?.state ||
      snapshot.room.state.phase === 'finished' ||
      window.confirm(
        'Sair desta partida? Um bot assume sua cadeira e este resultado não entra nos seus recordes.',
      )
    )
      void controller.leave();
  }
  return (
    <>
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
          <strong id={'azulTurnStatus'} role={'status'}>
            {status}
          </strong>
          <button
            id={'azulFullscreen'}
            type={'button'}
            className={'az-button'}
            aria-pressed={full.active}
            disabled={full.pending}
            onClick={() => void fullscreen.toggle()}
          >
            {full.active ? 'Sair da tela cheia' : 'Tela cheia'}
          </button>
          <button
            id={'azulRulesButton'}
            type={'button'}
            className={'az-button'}
            onClick={() => rulesDialog.current?.showModal()}
          >
            Como jogar
          </button>
          <span data-game-audio-slot="" style={{ display: 'contents' }} />
        </div>
      </header>
      <p id={'azulNotice'} className={'az-notice'} role={'status'} aria-live={'polite'}>
        {snapshot.notice}
      </p>
      <div className={'az-layout'}>
        <div id={'azulContent'}>
          {snapshot.room && (
            <div className="az-room-tools">
              <span>Mesa {snapshot.room.id}</span>
              <button type="button" className="az-text-button" onClick={leave}>
                Sair da mesa
              </button>
            </div>
          )}
          {snapshot.room?.state ? (
            <AzulTable snapshot={snapshot} controller={controller} rules={rules} />
          ) : (
            <AzulLobby snapshot={snapshot} controller={controller} />
          )}
        </div>
        <aside id={'azulRanking'} className={'az-ranking'} aria-label={'Top 5 permanente'}>
          <AzulRanking snapshot={snapshot} controller={controller} />
        </aside>
      </div>
      <footer className={'az-footnote'}>
        Regras do tabuleiro colorido de Azul · Michael Kiesling · Implementação de fã para a
        comunidade M&amp;N. Arte dos componentes aprovada pela comunidade.
      </footer>
      <div id="azulEffects" aria-hidden="true" />
      <dialog
        ref={rulesDialog}
        id={'azulRulesDialog'}
        className={'feature-dialog az-rules-dialog'}
        aria-labelledby={'azulRulesTitle'}
      >
        <button
          id={'azulRulesClose'}
          onClick={() => rulesDialog.current?.close()}
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
            <b>Escolha uma cor.</b> Pegue todos os azulejos daquela cor em uma fábrica ou no centro.
            As outras cores da fábrica vão ao centro. A primeira pessoa a pegar do centro leva o
            marcador 1 para o chão e começa a próxima rodada.
          </li>
          <li>
            <b>Prepare uma linha.</b> Coloque os azulejos em uma única linha de 1 a 5 espaços, da
            direita para a esquerda. A linha aceita só uma cor e a parede dessa linha não pode já
            ter essa cor. As sobras vão para o chão. Você também pode mandar a seleção toda para o
            chão.
          </li>
          <li>
            <b>Complete a parede.</b> Quando acabarem os azulejos da mesa, as linhas completas movem
            um azulejo para a posição da mesma cor na parede, de cima para baixo. Os demais são
            descartados. Linhas incompletas continuam na próxima rodada.
          </li>
          <li>
            <b>Pontue as conexões.</b> Um azulejo isolado vale 1 ponto. Se conecta na horizontal ou
            vertical, vale o comprimento do grupo contínuo. Se conecta nas duas direções, some os
            dois comprimentos, contando o novo azulejo em ambos.
          </li>
          <li>
            <b>Aplique as penalidades.</b> Cada espaço ocupado do chão desconta 1, 1, 2, 2, 2, 3 e 3
            pontos. O marcador também ocupa um espaço. O total nunca fica negativo. O chão é limpo;
            o descarte só volta ao saco quando ele esvaziar.
          </li>
          <li>
            <b>Finalize o mosaico.</b> A partida termina no fim da rodada em que alguém completa uma
            linha horizontal da parede. Some +2 por linha horizontal, +7 por coluna e +10 por
            conjunto de 5 da mesma cor. Empate: vence quem completou mais linhas horizontais;
            persistindo, a vitória é compartilhada.
          </li>
        </ol>
        <p>
          O ranking guarda o melhor resultado por conta, incluindo partidas com bots identificadas.
          Bots e participantes que saíram da partida não recebem recordes. A mesa em andamento fica
          no servidor e pode ser retomada após uma queda curta; deploys encerram mesas em andamento.
          Recordes já salvos ficam no Supabase.
        </p>
      </dialog>
    </>
  );
}
