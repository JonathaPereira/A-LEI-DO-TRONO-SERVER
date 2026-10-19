import type { LoveLetterPlayer, LoveLetterCard } from '../../types/love-letter';
import {
  Card,
  Favor,
  Portrait,
  PlayerAvatar,
  Target,
  isTarget,
  myTurn,
  locked,
  personName,
  eventText,
  type LoveLetterView,
} from './love-letter-pieces';
function Station({
  player: p,
  index,
  ...props
}: LoveLetterView & { player: LoveLetterPlayer; index: number }) {
  const { snapshot: s } = props,
    state = s.room!.state!,
    roster = s.room!.players.find((x) => x.id === p.id);
  return (
    <article
      className={
        'll-opponent' +
        (p.eliminated ? ' ll-eliminated' : '') +
        (state.turn === index && ['action', 'chancellor'].includes(state.phase)
          ? ' ll-active'
          : '') +
        (isTarget(props, p.id) ? ' ll-valid-target' : '') +
        (s.effectTarget === p.id ? ' ll-effect-target' : '')
      }
      data-ll-player={p.id}
    >
      <header>
        <PlayerAvatar id={p.id} rank={(index + 2) % 10} snapshot={s} />
        <div className="ll-identity">
          <strong>{p.name}</strong>
          <Favor player={p} target={state.target} />
        </div>
        {p.protected && <span className="ll-shield">♜ Protegido</span>}
        {p.eliminated && <span className="ll-out">Fora da rodada</span>}
        {roster?.bot && <small className="ll-bot">Bot</small>}
      </header>
      <div className="ll-opponent-cards">
        <div className="ll-hidden-hand">
          <small>Carta na mão</small>
          {p.hand.map((c, i) => (
            <Card card={c} small rules={props.rules} key={c.hidden ? 'hidden-' + i : c.id} />
          ))}
          {!p.hand.length && <span className="ll-empty-hand">—</span>}
        </div>
        <div className="ll-discards">
          <small>Descartes públicos</small>
          <div className="ll-discard-row">
            {p.discards.map((c) => (
              <Card card={c} small rules={props.rules} key={c.id} />
            ))}
            {!p.discards.length && <span className="ll-empty-hand">Nenhum descarte</span>}
          </div>
        </div>
      </div>
      <Target {...props} id={p.id} />
    </article>
  );
}
function Reference({ snapshot: s, rules: R }: LoveLetterView) {
  const state = s.room!.state!,
    known = new Map<string, LoveLetterCard>();
  for (const p of state.players) for (const c of p.discards) known.set(c.id, c);
  for (const c of state.faceUpRemoved) known.set(c.id, c);
  if (state.roundResult) for (const h of state.roundResult.hands) known.set(h.card.id, h.card);
  const recent = state.log
    .filter((e) => e.round === state.round && e.kind !== 'round-start')
    .slice(-4)
    .reverse();
  return (
    <aside className="ll-court">
      <section className="ll-last">
        <h3>Última jogada</h3>
        <p>{state.last ? eventText(state.last, state, R) : 'As cartas foram distribuídas.'}</p>
      </section>
      <h2>⚜ A CORTE</h2>
      <p className="ll-count-key">Reveladas / total · o restante ainda está oculto</p>
      {R.cards.map((c) => {
        const used = [...known.values()].filter((v) => v.rank === c.rank).length;
        return (
          <details
            className={'ll-reference-card' + (used === c.count ? ' ll-all-seen' : '')}
            data-rank={c.rank}
            key={c.rank}
          >
            <summary>
              <Portrait rank={c.rank} className="ll-reference-art" />
              <b>{c.rank}</b>
              <span>{c.name}</span>
              <small className="ll-card-count">
                {used}/{c.count}
              </small>
            </summary>
            <p>
              {c.effect} Reveladas: {used}. Ainda ocultas: {c.count - used}.
            </p>
          </details>
        );
      })}
      <section className="ll-recent">
        <h3>Jogadas desta rodada</h3>
        <ol>
          {recent.map((e) => (
            <li key={e.revision}>
              {e.card && <Card card={e.card} rules={R} small />}
              <span>{eventText(e, state, R)}</span>
            </li>
          ))}
          {!recent.length && <li>Aguardando a primeira carta.</li>}
        </ol>
      </section>
    </aside>
  );
}
function RoundResult({ snapshot: s, controller, rules }: LoveLetterView) {
  const state = s.room!.state!,
    finished = state.phase === 'finished';
  return (
    <section className="ll-result" role="status">
      <span className="ll-eyebrow">
        {finished ? 'O FAVOR DA PRINCESA' : 'RODADA ' + state.round + ' ENCERRADA'}
      </span>
      <h2>
        {(finished ? state.winners : state.roundWinners)
          .map((id) => personName(state, id))
          .join(' e ')}
        {finished ? ' conquistou a corte' : ' · +1 favor'}
      </h2>
      <div className="ll-reveal">
        {state.roundResult!.hands.map((h) => (
          <div key={h.playerId}>
            <strong>{personName(state, h.playerId)}</strong>
            <Card card={h.card} rules={rules} small />
          </div>
        ))}
      </div>
      {state.spyWinner && (
        <p>Espiã: {personName(state, state.spyWinner)} recebe +1 favor adicional.</p>
      )}
      <p>
        {state.roundResult!.reason === 'last-survivor'
          ? 'Uma pessoa permaneceu na rodada.'
          : 'O baralho acabou. A maior carta vence; empates dividem a vitória da rodada.'}
      </p>
      {!finished &&
        (s.room!.hostId === s.accountId ? (
          <button
            type="button"
            className="ll-button ll-primary"
            disabled={locked(s)}
            onClick={() => void controller.nextRound()}
          >
            Próxima rodada
          </button>
        ) : (
          <p>Aguardando o anfitrião iniciar a próxima rodada.</p>
        ))}
      {finished && (
        <button
          type="button"
          className="ll-button ll-primary"
          onClick={() => void controller.leave()}
        >
          Nova partida
        </button>
      )}
    </section>
  );
}
function Chancellor({ snapshot: s, controller, rules }: LoveLetterView) {
  const state = s.room!.state!,
    p = state.players.find((p) => p.id === s.accountId)!,
    choice = s.chancellor;
  if (!choice) return null;
  return (
    <section className="ll-chancellor">
      <span className="ll-eyebrow">DECISÃO PRIVADA · CHANCELER</span>
      <h2>Guarde uma carta. Ordene as demais.</h2>
      <p>
        A primeira devolvida será comprada depois da segunda. As cartas vão para o fundo, sem
        revelar aos outros.
      </p>
      <div className="ll-chancellor-cards">
        {p.hand
          .filter((c): c is LoveLetterCard => !c.hidden)
          .map((c) => (
            <Card
              key={c.id}
              card={c}
              rules={rules}
              onClick={() => controller.chooseKeep(c.id)}
              disabled={locked(s)}
              pressed={choice.keep === c.id}
            />
          ))}
      </div>
      <div className="ll-bottom-order">
        {choice.bottom.map((id, i) => {
          const c = p.hand.find((c): c is LoveLetterCard => !c.hidden && c.id === id)!;
          return (
            <span key={id}>
              {i + 1}º ao fundo: {rules.cards[c.rank].name}
            </span>
          );
        })}
        {choice.bottom.length === 2 && (
          <button
            type="button"
            className="ll-button"
            disabled={locked(s)}
            onClick={controller.invertBottom}
          >
            Inverter ordem
          </button>
        )}
      </div>
      <button
        type="button"
        className="ll-button ll-primary"
        disabled={locked(s)}
        onClick={() => void controller.confirmChancellor()}
      >
        Guardar carta e concluir
      </button>
    </section>
  );
}
function Hand(props: LoveLetterView) {
  const { snapshot: s, controller, rules } = props,
    state = s.room!.state!,
    me = state.players.find((p) => p.id === s.accountId)!;
  return (
    <section
      className={
        'll-self' +
        (isTarget(props, me.id) ? ' ll-valid-target' : '') +
        (s.effectTarget === me.id ? ' ll-effect-target' : '')
      }
    >
      <div className="ll-self-identity">
        <span className="ll-eyebrow">SUA INFLUÊNCIA NA CORTE</span>
        <h3>
          <PlayerAvatar id={me.id} rank={9} snapshot={s} />
          {me.name} · você
        </h3>
        <Favor player={me} target={state.target} />
        <small>
          {me.score} / {state.target} favores para vencer
        </small>
        {me.protected && <span className="ll-shield">♜ Protegido</span>}
      </div>
      <div className="ll-hand">
        {(state.phase === 'chancellor' && myTurn(s)
          ? []
          : me.hand.filter((c): c is LoveLetterCard => !c.hidden)
        ).map((c) => {
          const disabled =
            !myTurn(s) ||
            locked(s) ||
            state.phase !== 'action' ||
            (rules.forced(me) && c.rank !== 8);
          return (
            <div className="ll-hand-card" key={c.id}>
              <Card
                card={c}
                rules={rules}
                onClick={() => controller.selectCard(c.id)}
                disabled={disabled}
                chosen={s.selected?.cardId === c.id}
              />
              {!disabled && (
                <button
                  type="button"
                  className="ll-button ll-play"
                  onClick={() => controller.selectCard(c.id)}
                >
                  Jogar {rules.cards[c.rank].name}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="ll-hand-instruction">
        {me.eliminated
          ? 'Você retorna na próxima rodada.'
          : state.phase === 'chancellor'
            ? myTurn(s)
              ? 'Escolha do Chanceler acima.'
              : 'Aguardando a escolha do Chanceler.'
            : myTurn(s)
              ? rules.forced(me)
                ? 'Você precisa jogar a Condessa.'
                : 'Clique na carta que deseja usar.'
              : 'Sua mão é secreta. Aguarde sua vez.'}
      </p>
      <details className="ll-my-discards">
        <summary>Seus descartes · {me.discards.length}</summary>
        <div className="ll-discard-row">
          {me.discards.map((c) => (
            <Card card={c} rules={rules} small key={c.id} />
          ))}
        </div>
      </details>
      <Target {...props} id={me.id} />
    </section>
  );
}
export function ActionGuide({ snapshot: s, controller, rules }: LoveLetterView) {
  const state = s.room!.state!,
    c = state.players
      .find((p) => p.id === s.accountId)
      ?.hand.find((c): c is LoveLetterCard => !c.hidden && c.id === s.selected?.cardId);
  if (!c || s.selected?.revision !== state.revision) return null;
  const targeted = [1, 2, 3, 5, 7].includes(c.rank),
    targets = targeted ? rules.eligible(state, c.rank) : [];
  return (
    <section className="ll-action-guide" role="status">
      <Card card={c} rules={rules} small />
      {targets.length > 0 && (
        <button
          type="button"
          className="ll-link"
          onClick={(e) =>
            e.currentTarget
              .closest('#loveLetterContent')
              ?.querySelector('.ll-target-hit')
              ?.scrollIntoView({
                block: 'center',
                behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                  ? 'instant'
                  : 'smooth',
              })
          }
        >
          Ver alvos
        </button>
      )}
      <div>
        <strong>Usar {rules.cards[c.rank].name}</strong>
        <p>
          {targeted && targets.length
            ? 'Clique em uma pessoa destacada na mesa.'
            : targeted
              ? 'Sem alvo disponível: a carta será descartada sem efeito.'
              : c.rank === 9
                ? 'Atenção: descartar a Princesa elimina você desta rodada.'
                : rules.cards[c.rank].effect}
        </p>
      </div>
      <button type="button" className="ll-link" onClick={controller.cancelSelection}>
        Cancelar
      </button>
      {!targets.length && (
        <button
          type="button"
          id="loveLetterConfirm"
          className="ll-button ll-primary"
          disabled={locked(s)}
          onClick={() => void controller.confirmSelected()}
        >
          {c.rank === 9 ? 'Descartar Princesa e sair' : 'Usar ' + rules.cards[c.rank].name}
        </button>
      )}
    </section>
  );
}
export function LoveLetterTable(props: LoveLetterView) {
  const { snapshot: s, rules } = props,
    state = s.room!.state!;
  return (
    <div className="ll-table">
      <div className="ll-felt">
        <div className="ll-opponents" data-count={state.players.length - 1}>
          {state.players.map((p, i) =>
            p.id !== s.accountId ? <Station {...props} key={p.id} player={p} index={i} /> : null,
          )}
        </div>
        <div className="ll-table-center">
          <div className="ll-deck">
            <Card card={{ hidden: true }} rules={rules} />
            <small>Baralho · {state.deckCount} cartas</small>
          </div>
          <div className="ll-removed">
            {state.removed && (
              <>
                <Card card={{ hidden: true }} rules={rules} />
                <small>Carta removida</small>
              </>
            )}
          </div>
          {state.faceUpRemoved.length > 0 && (
            <details className="ll-public-removed">
              <summary>3 cartas fora desta rodada</summary>
              <div className="ll-discard-row">
                {state.faceUpRemoved.map((c) => (
                  <Card card={c} rules={rules} small key={c.id} />
                ))}
              </div>
            </details>
          )}
        </div>
        {['round-over', 'finished'].includes(state.phase) ? (
          <RoundResult {...props} />
        ) : state.phase === 'chancellor' && myTurn(s) ? (
          <Chancellor {...props} />
        ) : null}
        <Hand {...props} />
      </div>
      <Reference {...props} />
    </div>
  );
}
export function History({ snapshot: s, controller, rules }: LoveLetterView) {
  const state = s.room!.state!;
  return (
    <>
      <details className="ll-history" open>
        <summary>Histórico de jogadas · {state.log.length}</summary>
        <ol>
          {[...state.log].reverse().map((e) => {
            const heading =
                e.kind === 'play'
                  ? personName(state, e.playerId) +
                    ' jogou ' +
                    rules.cards[e.card!.rank].name +
                    (e.targetId ? ' em ' + personName(state, e.targetId) : '')
                  : e.kind === 'chancellor'
                    ? personName(state, e.playerId) + ' concluiu o Chanceler'
                    : 'Nova rodada',
              text = eventText(e, state, rules);
            return (
              <li className="ll-log-entry" data-log-revision={e.revision} key={e.revision}>
                {e.card && <Portrait rank={e.card.rank} className="ll-reference-art" />}
                <div>
                  <small className="ll-log-round">Rodada {e.round}</small>
                  <strong>{heading}</strong>
                  <p>{e.kind === 'play' ? text.slice(heading.length + 2) : text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </details>
      {state.private.length > 0 && (
        <button type="button" className="ll-link" onClick={controller.showPrivate}>
          Rever informação secreta
        </button>
      )}
    </>
  );
}
