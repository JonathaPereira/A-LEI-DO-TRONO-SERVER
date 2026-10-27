import { Card, eventText, personName, type LoveLetterView } from './love-letter-pieces';
import { loveLetterTimings } from '../../lib/games/love-letter';

export function PlayPresentation({ snapshot: s, rules }: LoveLetterView) {
  const effect = s.presentation,
    state = s.room?.state;
  if (!effect || !state) return null;
  const { event, phase } = effect,
    rank = event.card?.rank ?? 6,
    actor = personName(state, event.playerId),
    target = event.targetId ? personName(state, event.targetId) : null,
    announcing = phase === 'announce';
  return (
    <div className="ll-presentation-host">
      <section
        className={'ll-presentation ll-effect-rank-' + rank}
        data-phase={phase}
        data-revision={event.revision}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="ll-presentation-card" key={event.revision}>
          {event.card ? (
            <Card card={event.card} rules={rules} />
          ) : (
            <span className="ll-eyebrow">CHANCELER</span>
          )}
        </div>
        <div className="ll-presentation-copy">
          <span className="ll-eyebrow">{announcing ? 'CARTA NA MESA' : 'EFEITO DA CARTA'}</span>
          <h2>
            {actor}{' '}
            {event.kind === 'chancellor'
              ? 'concluiu o Chanceler'
              : 'jogou ' + rules.cards[rank].name}
            {target && <> em {target}</>}
          </h2>
          {target && (
            <div className="ll-effect-path" aria-hidden="true">
              <span>{actor}</span>
              <b>→</b>
              <span>{target}</span>
            </div>
          )}
          {announcing ? (
            <>
              {rank === 1 && target && (
                <p>
                  Palpite: <strong>{rules.cards[event.guess!].name}</strong>
                </p>
              )}
              <p className="ll-effect-suspense">
                {rank === 1 && target ? 'Será que acertou?' : 'Resolvendo o efeito…'}
              </p>
              <span
                className="ll-effect-progress"
                style={{
                  animationDuration:
                    (rank === 1 && target ? loveLetterTimings.guard : loveLetterTimings.announce) +
                    'ms',
                }}
                aria-hidden="true"
              />
            </>
          ) : (
            <p className="ll-effect-outcome">{eventText(event, state, rules)}</p>
          )}
          {!announcing && !event.noTarget && [2, 3, 5, 7].includes(rank) && (
            <div className="ll-effect-hands" aria-hidden="true">
              <Card
                card={rank === 5 && event.discarded ? event.discarded : { hidden: true }}
                rules={rules}
                small
              />
              <span>{rank === 7 ? '⇄' : rank === 3 ? '⚖' : rank === 5 ? '→' : '◈'}</span>
              <Card card={{ hidden: true }} rules={rules} small />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function LastPlayedCard({ snapshot: s, rules }: LoveLetterView) {
  const state = s.room!.state!,
    event =
      s.presentation?.event.kind === 'play'
        ? s.presentation.event
        : state.log.findLast((e) => e.kind === 'play' && e.round === state.round);
  if (!event?.card) return null;
  return (
    <section className="ll-last-card" aria-label="Última carta jogada">
      <Card card={event.card} rules={rules} small />
      <div>
        <span className="ll-eyebrow">ÚLTIMA CARTA</span>
        <strong>{rules.cards[event.card.rank].name}</strong>
        <p>
          {personName(state, event.playerId)}
          {event.targetId && <> → {personName(state, event.targetId)}</>}
        </p>
      </div>
    </section>
  );
}
