import type { SplendorEvent, SplendorState, SplendorRules } from '../../types/splendor';
import {
  Card,
  Gem,
  Noble,
  Player,
  shown,
  blocked,
  actionTurn,
  type SplendorView,
} from './splendor-pieces';
export function eventText(e: SplendorEvent, s: SplendorState, R: SplendorRules) {
  const name = s.players.find((p) => p.id === e.playerId)?.name ?? 'Mercador';
  if (e.kind === 'take')
    return (
      name +
      ' pegou ' +
      R.sum(e.tokens ?? []) +
      ' ficha(s)' +
      (R.sum(e.returned ?? []) ? ' e devolveu ' + R.sum(e.returned!) + '.' : '.')
    );
  if (e.kind === 'reserve')
    return (
      name +
      ' reservou uma carta ' +
      (e.blind ? 'oculta ' : '') +
      'do nível ' +
      e.level +
      (e.gold ? ' e recebeu ouro' : '') +
      (R.sum(e.returned ?? []) ? ' e devolveu ' + R.sum(e.returned!) + ' ficha(s).' : '.')
    );
  if (e.kind === 'noble') return name + ' recebeu um nobre: +3 pontos.';
  if (e.kind === 'buy')
    return (
      name +
      ' comprou uma carta: +1 bônus de ' +
      R.colors[e.card!.bonus] +
      ', +' +
      e.card!.points +
      ' ponto(s)' +
      (e.noble ? ' e um nobre (+3).' : '.')
    );
  return name + ' passou sem ação disponível.';
}
function Market(props: SplendorView) {
  const { snapshot: s, controller } = props,
    state = shown(s)!,
    p = state.players.find((p) => p.id === s.accountId)!;
  return (
    <section className="sp-market" aria-label="Mercado de desenvolvimentos">
      {[3, 2, 1].map((level) => (
        <div className="sp-market-row" data-level={level} key={level}>
          <button
            type="button"
            className={'sp-deck sp-level-' + level}
            aria-label={
              'Reservar do baralho de nível ' +
              level +
              ', ' +
              state.deckCounts[level - 1] +
              ' cartas restantes'
            }
            disabled={
              !actionTurn(s) ||
              blocked(s) ||
              p?.reserved.length >= 3 ||
              !state.deckCounts[level - 1]
            }
            onClick={() => {
              if (window.confirm('Reservar uma carta oculta do nível ' + level + '?'))
                void controller.submit({ kind: 'reserve', level });
            }}
          >
            <span className="sp-back-emblem">✦</span>
            <b>{state.deckCounts[level - 1]}</b>
            <small>NÍVEL {level}</small>
          </button>
          {state.market[level - 1].map((c, i) => (
            <Card {...props} card={c} key={c?.id ?? 'empty-' + i} />
          ))}
        </div>
      ))}
    </section>
  );
}
function Bank(props: SplendorView) {
  const { snapshot: s, controller, rules } = props,
    state = shown(s)!;
  return (
    <section className="sp-bank" aria-label="Banco de fichas">
      <header>
        <span className="sp-eyebrow">BANCO</span>
        <small>3 diferentes ou 2 iguais¹</small>
      </header>
      <div className="sp-bank-tokens">
        {state.bank.map((count, i) => (
          <button
            key={i}
            type="button"
            className={'sp-bank-token' + (s.selected[i] ? ' selected' : '')}
            data-token={i}
            data-no-click-sfx="1"
            disabled={i === 5 || !count || !actionTurn(s) || blocked(s)}
            title={
              i === 5
                ? 'Ouro: obtido ao reservar uma carta'
                : rules.colors[i] +
                  ': ' +
                  count +
                  ' disponíveis' +
                  (count >= 4 ? ' · permite pegar 2 iguais' : '')
            }
            onClick={() => controller.selectToken(i)}
          >
            <Gem color={i} count={count} chip rules={rules} />
            {s.selected[i] > 0 && <b className="sp-token-selected">+{s.selected[i]}</b>}
          </button>
        ))}
      </div>
      <small className="sp-bank-hint">
        ¹ Duas iguais: a pilha deve ter ao menos 4. Ouro vem de reservas.
      </small>
    </section>
  );
}
function ActionBar({ snapshot: s, controller, rules }: SplendorView) {
  const state = shown(s)!,
    choosing = state.phase === 'noble' && state.players[state.turn].id === s.accountId,
    finished = state.phase === 'finished',
    mine = actionTurn(s);
  return (
    <section className="sp-action-bar" aria-label="Sua jogada">
      <div>
        <strong>
          {finished
            ? 'Partida encerrada'
            : choosing
              ? 'Escolha um nobre destacado'
              : mine
                ? 'Sua vez de negociar'
                : 'Aguardando ' + state.players[state.turn].name}
        </strong>
        <small>
          {finished
            ? 'Confira os resultados e volte ao catálogo para outra mesa.'
            : choosing
              ? 'Você recebe uma visita por turno, sem gastar fichas.'
              : state.phase === 'noble'
                ? 'O mercador da vez está escolhendo um nobre.'
                : mine
                  ? 'Pegue fichas no banco ou clique em uma carta para comprar / reservar.'
                  : 'A chamada continua. Você pode examinar cartas e coleções.'}
        </small>
      </div>
      {mine && (
        <>
          <div className="sp-action-selection">
            {s.selected.map((n, i) =>
              n ? <Gem key={i} color={i} count={n} rules={rules} /> : null,
            )}
          </div>
          <button type="button" className="sp-link" onClick={controller.clearSelection}>
            Limpar
          </button>
          <button
            type="button"
            id="splendorTake"
            className="sp-button sp-primary"
            disabled={!rules.sum(s.selected) || blocked(s)}
            onClick={() => void controller.submit({ kind: 'take', tokens: [...s.selected] })}
          >
            Pegar {rules.sum(s.selected)} ficha(s)
          </button>
          {!rules.legalActions(state).length && (
            <button
              type="button"
              className="sp-button"
              onClick={() => void controller.submit({ kind: 'pass' })}
            >
              Passar · sem ações
            </button>
          )}
        </>
      )}
    </section>
  );
}
export function SplendorTable(props: SplendorView) {
  const { snapshot: s, controller, rules } = props,
    state = shown(s)!,
    me = state.players.find((p) => p.id === s.accountId),
    detail = s.replay,
    e = detail?.event;
  const phases = {
    payment: '1 · Pagamento: fichas voltam ao banco',
    showcase: '2 · Conheça a carta adquirida',
    flight: 'Transferindo os recursos',
    returned: 'Devolvendo o excesso de fichas',
    landed: 'Concluído · confira seus recursos',
  };
  return (
    <>
      {state.phase === 'finished' && (
        <section className="sp-result">
          <span className="sp-eyebrow">O PRESTÍGIO CONQUISTA A CORTE</span>
          <h2>
            {state.winners.map((id) => state.players.find((p) => p.id === id)!.name).join(' e ')}
            {state.winners.length > 1 ? ' compartilham a vitória' : ' venceu'}
          </h2>
          <p>
            Maior pontuação; no empate, menos cartas de desenvolvimento.{' '}
            {s.room?.recordStatus === 'saved'
              ? 'Recordes salvos.'
              : s.room?.recordStatus === 'pending'
                ? 'Recordes aguardando conexão.'
                : 'Conferindo os recordes…'}
          </p>
          {s.room?.recordStatus === 'pending' && (
            <button
              type="button"
              className="sp-button"
              onClick={() => void controller.retryRecord()}
            >
              Tentar guardar recordes
            </button>
          )}
        </section>
      )}
      {state.finalRound && state.phase !== 'finished' && (
        <p className="sp-final-round">
          Última rodada — todos completam o mesmo número de turnos. Vence a maior pontuação, mesmo
          acima de 15.
        </p>
      )}
      <div className="sp-table">
        <aside className="sp-players" aria-label="Mercadores e recursos">
          {me && <Player {...props} player={me} index={state.players.indexOf(me)} self />}
          <div className="sp-opponents" aria-label="Outros mercadores">
            {state.players
              .filter((p) => p !== me)
              .map((p) => (
                <Player {...props} key={p.id} player={p} index={state.players.indexOf(p)} />
              ))}
          </div>
        </aside>
        <div className="sp-center">
          <Market {...props} />
        </div>
        <aside className="sp-side">
          <Bank {...props} />
          <section className="sp-nobles-section">
            <span className="sp-eyebrow">PATRONOS · 3 PONTOS CADA</span>
            <div className="sp-nobles">
              {state.nobles.map((n) => (
                <Noble {...props} key={n.id} noble={n} />
              ))}
            </div>
          </section>
        </aside>
        <ActionBar {...props} />
      </div>
      {state.last && !detail && (
        <p className="sp-last-action" role="status">
          {eventText(state.last, state, rules)}
        </p>
      )}
      <details className="sp-history">
        <summary>Histórico de negociações</summary>
        <ol>
          {[...state.log].reverse().map((e) => (
            <li key={e.revision}>{eventText(e, state, rules)}</li>
          ))}
        </ol>
      </details>
      {detail && e && (
        <div className="sp-event-banner" role="status">
          <b className="sp-event-value">
            {detail.phase === 'landed' && e.points ? '+' + e.points : '✦'}
          </b>
          <div className="sp-event-copy">
            <strong>{phases[detail.phase]}</strong>
            <span>{eventText(e, state, rules)}</span>
            {e.payment && (
              <div className="sp-event-payment">
                <small>Fichas gastas: </small>
                {e.payment.map((n, i) =>
                  n ? <Gem key={i} color={i} count={n} chip rules={rules} /> : null,
                )}
                {!rules.sum(e.payment) && <small>nenhuma · descontos cobriram o custo</small>}
              </div>
            )}
          </div>
          <button type="button" className="sp-link" onClick={controller.stopAnimations}>
            Concluir animação
          </button>
        </div>
      )}
      {detail?.phase === 'showcase' && e?.card && (
        <div className="sp-purchase-showcase">
          <Card {...props} card={e.card} actions={false} disabled />
          <strong>Carta adquirida</strong>
          <span>+1 desconto permanente de {rules.colors[e.card.bonus]}</span>
          <b>
            {e.card.points
              ? '+' + e.card.points + ' pontos de prestígio'
              : 'Desconto para as próximas compras'}
          </b>
        </div>
      )}
    </>
  );
}
