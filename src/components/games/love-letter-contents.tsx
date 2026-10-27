import { useSyncExternalStore } from 'react';
import type { GameFullscreen } from '../../lib/games/fullscreen';
import { GameDialog } from './game-dialog';
import { LoveLetterLobby } from './love-letter-lobby';
import { LoveLetterTable, ActionGuide, History } from './love-letter-table';
import { GuessContent, PrivateContent } from './love-letter-dialogs';
import { myTurn, personName, type LoveLetterView } from './love-letter-pieces';
import { GameAction } from './library-controls';
import { PlayPresentation } from './love-letter-effects';
export function LoveLetterContents({
  controller,
  rules,
  fullscreen,
}: {
  controller: LoveLetterView['controller'];
  rules: LoveLetterView['rules'];
  fullscreen: GameFullscreen;
}) {
  const current = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const full = useSyncExternalStore(
    fullscreen.subscribe,
    fullscreen.getSnapshot,
    fullscreen.getSnapshot,
  );
  const snapshot = {
    ...current,
    room: current.room ? { ...current.room, state: current.displayState } : null,
  };
  const props = { snapshot, controller, rules },
    state = snapshot.room?.state;
  const status = snapshot.presentation
    ? 'Jogada em andamento · acompanhe a mesa'
    : !state
      ? '2–6 jogadores · blefe e dedução'
      : state.phase === 'finished'
        ? 'Partida encerrada'
        : state.phase === 'round-over'
          ? 'Rodada encerrada'
          : myTurn(snapshot)
            ? 'Sua vez · escolha uma carta'
            : 'Vez de ' + personName(state, state.players[state.turn].id);
  function leave() {
    if (
      !state ||
      state.phase === 'finished' ||
      window.confirm('Sair da partida? Um bot assume sua cadeira. A chamada continua conectada.')
    )
      void controller.leave();
  }

  return (
    <>
      <header className={'ll-heading'}>
        <div className={'ll-brand'}>
          <GameAction
            destination="library"
            id={'loveLetterBack'}
            type={'button'}
            className={'ll-button'}
            aria-label={'Voltar aos jogos'}
          >
            ‹ Jogos
          </GameAction>
          <h1>
            LOVE LETTER<small>2ª EDIÇÃO · INTRIGA NA CORTE</small>
          </h1>
        </div>
        <div className={'ll-heading-actions'}>
          <strong id={'loveLetterStatus'} role={'status'}>
            {status}
          </strong>
          <button
            id={'loveLetterFullscreen'}
            type={'button'}
            className={'ll-button'}
            aria-pressed={full.active}
            disabled={full.pending}
            onClick={() => void fullscreen.toggle()}
          >
            {full.active ? 'Sair da tela cheia' : 'Tela cheia'}
          </button>
          <button
            id={'loveLetterRulesButton'}
            onClick={() => controller.showRules(true)}
            type={'button'}
            className={'ll-button'}
          >
            Como jogar
          </button>
          <span data-game-audio-slot="" style={{ display: 'contents' }} />
        </div>
      </header>
      <p id={'loveLetterNotice'} className={'ll-notice'} role={'status'} aria-live={'polite'}>
        {snapshot.notice}
      </p>
      <PlayPresentation {...props} />
      <div id={'loveLetterContent'}>
        {snapshot.room && (
          <div className="ll-room-tools">
            <span>
              Mesa {snapshot.room.id} ·{' '}
              {state
                ? 'Rodada ' + state.round + ' · ' + state.target + ' favores para vencer'
                : snapshot.room.maxPlayers + ' lugares'}
            </span>
            <button type="button" className="ll-link" onClick={leave}>
              Sair da mesa
            </button>
          </div>
        )}
        {state ? (
          <>
            <ActionGuide {...props} />
            <LoveLetterTable {...props} />
            <History {...props} />
          </>
        ) : (
          <LoveLetterLobby {...props} />
        )}
      </div>
      <footer className={'ll-footnote'}>
        Love Letter · Seiji Kanai / Z-Man Games · Regras da segunda edição (2019). Implementação de
        fã para M&amp;N, com ilustrações próprias. As mesas ficam no servidor durante a partida; a
        chamada permanece independente.
      </footer>
      <GameDialog
        visible={!!snapshot.selected?.targetId}
        onDismiss={controller.cancelSelection}
        id={'loveLetterPlayDialog'}
        className={'ll-dialog'}
        aria-label={'Jogar carta'}
      >
        <button
          data-close={''}
          type={'button'}
          aria-label={'Voltar'}
          onClick={controller.cancelSelection}
        >
          ×
        </button>
        <div id={'loveLetterPlayContent'} className={'ll-play-content'}>
          <GuessContent {...props} />
        </div>
      </GameDialog>
      <GameDialog
        visible={snapshot.privateOpen}
        onDismiss={controller.closePrivate}
        id={'loveLetterPrivateDialog'}
        className={'ll-dialog'}
        aria-label={'Informação secreta'}
      >
        <button
          data-close={''}
          type={'button'}
          aria-label={'Fechar informação secreta'}
          onClick={controller.closePrivate}
        >
          ×
        </button>
        <div id={'loveLetterPrivateContent'} className={'ll-private-content'}>
          <PrivateContent {...props} />
        </div>
      </GameDialog>
      <GameDialog
        visible={snapshot.rulesOpen}
        onDismiss={() => controller.showRules(false)}
        id={'loveLetterRulesDialog'}
        className={'ll-dialog'}
        aria-labelledby={'loveLetterRulesTitle'}
      >
        <button
          data-close={''}
          type={'button'}
          aria-label={'Fechar regras'}
          onClick={() => controller.showRules(false)}
        >
          ×
        </button>
        <span className={'ll-eyebrow'}>O LIVRO DA CORTE</span>
        <h2 id={'loveLetterRulesTitle'}>Love Letter · 2ª edição</h2>
        <p>
          De 2 a 6 pessoas disputam rodadas para conquistar fichas de favor. O baralho tem 21
          cartas. Só você vê sua mão; os descartes ficam públicos. O aplicativo sorteia a primeira
          pessoa da partida.
        </p>
        <h3>Preparação e turno</h3>
        <p>
          Uma carta é separada, oculta. Com duas pessoas, outras três são removidas de face para
          cima. Cada pessoa recebe uma carta. Na sua vez, compre uma e jogue uma das duas,
          resolvendo o efeito. O app compra automaticamente no início do seu turno.
        </p>
        <h3>As dez personagens</h3>
        <ol start={0}>
          <li>
            <b>Espiã (2):</b> no fim da rodada, se só você, entre os sobreviventes, jogou ou
            descartou Espiã, ganhe 1 favor extra. Não conta como vitória da rodada e no máximo uma
            ficha é recebida, mesmo com duas Espiãs. Não precisa vencer a rodada: o bônus também
            vale quando o baralho acaba e outra pessoa vence pela maior carta. Se duas pessoas que
            usaram Espiã continuarem na rodada até o fim, ninguém recebe esse bônus.
          </li>
          <li>
            <b>Guarda (6):</b> escolha outra pessoa e adivinhe sua carta, exceto Guarda. Se acertar,
            ela sai da rodada.
          </li>
          <li>
            <b>Padre (2):</b> veja, em segredo, a carta de outra pessoa.
          </li>
          <li>
            <b>Barão (2):</b> compare sua carta restante com a de outra pessoa. Quem tem valor menor
            sai. No empate, ninguém sai.
          </li>
          <li>
            <b>Aia (2):</b> protege você dos efeitos das outras pessoas até o início do seu próximo
            turno.
          </li>
          <li>
            <b>Príncipe (2):</b> escolha uma pessoa, inclusive você, para descartar a mão e comprar
            outra. Se descartar Princesa, ela sai. Se o baralho estiver vazio, use a carta separada.
          </li>
          <li>
            <b>Chanceler (2):</b> compre até duas cartas, guarde uma e coloque as demais no fundo do
            baralho na ordem escolhida. Se só houver uma carta, compre uma. Se não houver nenhuma,
            apenas descarte o Chanceler.
          </li>
          <li>
            <b>Rei (1):</b> troque sua carta restante com a de outra pessoa.
          </li>
          <li>
            <b>Condessa (1):</b> se estiver com Príncipe ou Rei, obrigatoriamente jogue a Condessa.
            Você pode jogá-la voluntariamente em qualquer outro caso.
          </li>
          <li>
            <b>Princesa (1):</b> se jogá-la ou descartá-la, você sai imediatamente da rodada.
          </li>
        </ol>
        <h3>Alvos e proteção</h3>
        <p>
          Você não pode escolher alguém eliminado ou protegido por Aia. Só o Príncipe permite
          escolher a si mesmo; se todos os demais estiverem protegidos, o Príncipe precisa escolher
          você. Se não houver alvo válido para Guarda, Padre, Barão ou Rei, a carta é descartada sem
          efeito.
        </p>
        <h3>Fim da rodada</h3>
        <p>
          A rodada termina quando só resta uma pessoa ou, depois de resolver todos os efeitos, o
          baralho está vazio. Entre os sobreviventes, a maior carta vence; pessoas empatadas vencem
          juntas e cada uma recebe 1 favor. Não se soma o descarte para desempatar nesta edição. A
          Espiã pode conceder mais 1 favor. O vencedor começa a próxima rodada; em empate, o app
          sorteia entre os vencedores.
        </p>
        <h3>Vitória da partida</h3>
        <p>
          Com 2 pessoas: 6 favores. Com 3: 5 favores. Com 4: 4 favores. Com 5 ou 6: 3 favores. Ao
          fim de uma rodada, quem alcançar a meta vence; se mais de uma pessoa alcançar,
          compartilham a vitória.
        </p>
        <h3>Conexão e privacidade</h3>
        <p>
          O servidor valida cartas, alvos, efeitos e favores. As mãos adversárias, o baralho, a
          carta separada e as escolhas do Chanceler permanecem secretos. Informações do Padre só são
          enviadas a quem jogou. Você tem 90 segundos para reconectar; se sair ou não voltar, um bot
          assume. Mesas ao vivo não sobrevivem ao reinício do backend.
        </p>
      </GameDialog>
    </>
  );
}
