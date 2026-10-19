import { useSyncExternalStore } from 'react';
import type { GameFullscreen } from '../../lib/games/fullscreen';
import { SplendorLobby, SplendorRanking } from './splendor-lobby';
import { SplendorTable } from './splendor-table';
import { CardContent, ReturnContent, CollectionContent, GameDialog } from './splendor-dialogs';
import { shown, type SplendorView } from './splendor-pieces';
import { GameAction } from './library-controls';
export function SplendorContents({
  controller,
  rules,
  data,
  fullscreen,
}: {
  controller: SplendorView['controller'];
  rules: SplendorView['rules'];
  data: SplendorView['data'];
  fullscreen: GameFullscreen;
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
  const props = { snapshot, controller, rules, data },
    state = shown(snapshot);
  const status = !state
    ? 'O mercado aguarda você'
    : state.phase === 'finished'
      ? 'Partida encerrada'
      : 'Rodada ' +
        state.round +
        (state.finalRound
          ? ' · Última rodada'
          : state.phase === 'noble'
            ? ' · Visita de um nobre'
            : ' · ' + state.players[state.turn].name);
  function leave() {
    if (
      !state ||
      state.phase === 'finished' ||
      window.confirm(
        'Sair da partida? Um bot assume sua cadeira; esse resultado não entra nos seus recordes.',
      )
    )
      void controller.leave();
  }

  return (
    <>
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
          <strong id={'splendorStatus'} role={'status'}>
            {status}
          </strong>
          <button
            id={'splendorFullscreen'}
            className={'sp-button'}
            type={'button'}
            aria-pressed={full.active}
            disabled={full.pending}
            onClick={() => void fullscreen.toggle()}
          >
            {full.active ? 'Sair da tela cheia' : 'Tela cheia'}
          </button>
          <button
            id={'splendorRulesButton'}
            onClick={() => controller.showRules(true)}
            className={'sp-button'}
            type={'button'}
          >
            Como jogar
          </button>
          <span data-game-audio-slot="" style={{ display: 'contents' }} />
        </div>
      </header>
      <p id={'splendorNotice'} className={'sp-notice'} role={'status'} aria-live={'polite'}>
        {snapshot.notice}
      </p>
      <div id={'splendorContent'}>
        {snapshot.room && (
          <div className="sp-room-tools">
            <span>
              Mesa {snapshot.room.id} · {snapshot.room.players.length} mercadores
            </span>
            <button type="button" className="sp-link" onClick={leave}>
              Sair da mesa
            </button>
          </div>
        )}
        {snapshot.room?.state ? <SplendorTable {...props} /> : <SplendorLobby {...props} />}
      </div>
      <aside
        id={'splendorRanking'}
        className={'sp-ranking'}
        aria-label={'Top 5 permanente do Splendor'}
      >
        <SplendorRanking {...props} />
      </aside>
      <div id="splendorEffects" aria-hidden="true" />
      <footer className={'sp-footnote'}>
        Splendor clássico · Marc André / Space Cowboys · Implementação de fã para a comunidade
        M&amp;N. Ilustrações e áudio próprios. Mesas ao vivo; recordes salvos no servidor.
      </footer>
      <GameDialog
        visible={!!snapshot.card}
        onDismiss={controller.closeCard}
        id={'splendorCardDialog'}
        className={'sp-dialog'}
        aria-label={'Carta e pagamento'}
      >
        <button
          data-close={''}
          type={'button'}
          aria-label={'Fechar carta'}
          onClick={controller.closeCard}
        >
          ×
        </button>
        <div id={'splendorCardContent'} className={'sp-card-content'}>
          <CardContent {...props} />
        </div>
      </GameDialog>
      <GameDialog
        visible={!!snapshot.returns}
        onDismiss={controller.closeReturn}
        id={'splendorReturnDialog'}
        className={'sp-dialog'}
        aria-label={'Devolver fichas'}
      >
        <button
          data-close={''}
          type={'button'}
          aria-label={'Cancelar devolução'}
          onClick={controller.closeReturn}
        >
          ×
        </button>
        <div id={'splendorReturnContent'}>
          <ReturnContent {...props} />
        </div>
      </GameDialog>
      <GameDialog
        visible={!!snapshot.collection}
        onDismiss={controller.closeCollection}
        id={'splendorCollectionDialog'}
        className={'sp-dialog'}
        aria-label={'Coleção de desenvolvimentos'}
      >
        <button
          data-close={''}
          type={'button'}
          aria-label={'Fechar coleção'}
          onClick={controller.closeCollection}
        >
          ×
        </button>
        <div id={'splendorCollectionContent'}>
          <CollectionContent {...props} />
        </div>
      </GameDialog>
      <GameDialog
        visible={snapshot.rulesOpen}
        onDismiss={() => controller.showRules(false)}
        id={'splendorRulesDialog'}
        className={'sp-dialog'}
        aria-labelledby={'splendorRulesTitle'}
      >
        <button
          data-close={''}
          type={'button'}
          aria-label={'Fechar regras'}
          onClick={() => controller.showRules(false)}
        >
          ×
        </button>
        <span className={'sp-eyebrow'}>O LIVRO DOS MERCADORES</span>
        <h2 id={'splendorRulesTitle'}>Como jogar Splendor</h2>
        <p>
          Regras do jogo clássico, para 2–4 pessoas: 90 cartas de desenvolvimento (40 de nível I, 30
          de nível II e 20 de nível III), 10 nobres, cinco cores de gemas e ouro curinga. O objetivo
          é terminar com mais prestígio. O primeiro mercador é sorteado, já que não coletamos a
          idade dos jogadores.
        </p>
        <ol>
          <li>
            <b>Prepare o mercado.</b> Quatro cartas ficam abertas em cada nível. Há 4 fichas por cor
            com 2 pessoas, 5 com 3 e 7 com 4; sempre 5 ouros. São revelados tantos nobres quanto o
            número de participantes mais um. Cartas e nobres restantes ficam fora da vista.
          </li>
          <li>
            <b>Faça uma ação por turno.</b> Pegue até 3 fichas de cores diferentes; ou 2 da mesma
            cor, apenas se a pilha tiver pelo menos 4 antes da retirada; ou reserve uma carta; ou
            compre uma carta.
          </li>
          <li>
            <b>Reserve para depois.</b> Escolha uma carta aberta ou uma carta oculta do topo de um
            dos baralhos. Receba 1 ouro se houver. Você pode ter no máximo 3 cartas reservadas. Elas
            não podem ser descartadas: só saem da reserva quando compradas. Reservar não paga o
            custo nem dá o bônus ou os pontos da carta. As reservas dos outros jogadores ficam
            ocultas.
          </li>
          <li>
            <b>Compre e construa sua rede.</b> Compre uma carta aberta ou da sua reserva. Seus bônus
            permanentes descontam o custo de cada cor; pague o restante com fichas e, se quiser,
            ouro como curinga. As fichas pagas voltam ao banco. Ganhe o bônus da carta e seus pontos
            de prestígio. Cartas sem pontos também ajudam: os bônus se acumulam e nunca são gastos.
            Uma carta pode ficar gratuita. A reposição do mercado usa o mesmo nível; um baralho
            vazio não é reabastecido.
          </li>
          <li>
            <b>Fique com até 10 fichas.</b> Se pegar fichas ou reservar e ultrapassar 10, escolha
            exatamente o excesso para devolver. Pode devolver até as fichas recém-obtidas, inclusive
            ouro. A seleção é confirmada junto com a sua ação.
          </li>
          <li>
            <b>Receba um nobre.</b> No fim da sua ação, compare seus bônus permanentes com os
            requisitos dos nobres. Fichas e ouro não contam. Um nobre elegível visita
            automaticamente e dá 3 pontos. Se houver mais de um, você escolhe um: só há uma visita
            por turno. A visita não consome uma ação e não gasta bônus.
          </li>
          <li>
            <b>Complete a última rodada.</b> Quando alguém termina seu turno com 15 ou mais pontos,
            os demais completam a rodada para que todos tenham jogado o mesmo número de turnos. Pode
            haver pontuações acima de 15. Vence quem tiver mais pontos; em empate, quem comprou
            menos cartas de desenvolvimento. Reservas e nobres não contam nesse desempate.
            Persistindo o empate, a vitória é compartilhada.
          </li>
        </ol>
        <p>
          Você pode jogar online ou completar uma mesa com bots. Uma queda curta permite retomar sua
          cadeira; ao sair voluntariamente, um bot assume e esse resultado não gera recorde para
          você. O Top 5 guarda o melhor resultado por conta, com partidas com bots identificadas.
          Recordes já salvos resistem a novos deploys; mesas em andamento ficam na memória do
          servidor.
        </p>
      </GameDialog>
    </>
  );
}
