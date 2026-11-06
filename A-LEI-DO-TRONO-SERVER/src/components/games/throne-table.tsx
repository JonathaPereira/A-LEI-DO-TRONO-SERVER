import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { ThroneChoiceRules } from '../../types/throne-choices';
import type { ThroneVisiblePlay } from '../../types/throne-match';
import type { ThroneTableState } from '../../types/throne-table';
import { throneLaws } from '../../lib/games/throne-choice-protocol';
import {
  throneLawTooltip,
  throneDecreeTooltip,
  throneSuitDetails,
} from '../../lib/games/throne-court-copy';

const effective = (play: ThroneVisiblePlay) =>
  Math.max(1, Math.min(12, (play.card?.value || 0) + play.modifier));
const asset = (card: NonNullable<ThroneVisiblePlay['card']>) =>
  `assets/cards/${card.suit}_${String(card.value).padStart(2, '0')}.webp`;

function HiddenPlay({ play, own }: { play: ThroneVisiblePlay; own: boolean }) {
  const [peek, setPeek] = useState(false),
    canPeek = own && !!play.card;
  return (
    <div
      className={`card-back ${canPeek ? 'private-hidden-card' : ''} ${peek ? 'peek' : ''}`}
      tabIndex={canPeek ? 0 : undefined}
      role={canPeek ? 'button' : undefined}
      aria-label={canPeek ? 'Consultar sua carta oculta' : undefined}
      aria-pressed={canPeek ? peek : undefined}
      onClick={canPeek ? () => setPeek((p) => !p) : undefined}
      onKeyDown={
        canPeek
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setPeek((p) => !p);
              }
            }
          : undefined
      }
    >
      <span>♛</span>
      {canPeek && (
        <>
          <img className="private-hidden-peek" src={asset(play.card!)} alt="Sua carta oculta" />
          <em>
            {play.modifier
              ? `${play.modifier > 0 ? '+3' : '-3'} → ${effective(play)}`
              : 'passe o mouse'}
          </em>
        </>
      )}
      {play.influenceAction !== 'none' && (
        <b
          className={`public-influence-badge ${play.influenceAction === 'plus' ? 'plus' : play.influenceAction === 'minus' ? 'minus' : ''}`}
        >
          {play.influenceAction === 'sigilo'
            ? '✦ SIGILO'
            : play.influenceAction === 'plus'
              ? '✦✦ +3'
              : '✦✦ -3'}
        </b>
      )}
    </div>
  );
}
function TablePlay({ play, state: s }: { play: ThroneVisiblePlay; state: ThroneTableState }) {
  if (play.hidden) return <HiddenPlay play={play} own={play.playerId === s.localSeat} />;
  if (!play.card) return null;
  return (
    <div className="revealed-card-wrap">
      <img
        className={`card-face ${s.flipping.includes(play.playerId) ? 'flip-reveal' : ''}`}
        src={asset(play.card)}
        alt={`${throneSuitDetails[play.card.suit].name} ${play.card.value}`}
      />
      {!!play.modifier && (
        <span className={`maneuver-badge ${play.modifier > 0 ? 'plus' : 'minus'}`}>
          {play.modifier > 0 ? '+3' : '-3'} → {effective(play)}
        </span>
      )}
    </div>
  );
}

export function ThroneTableContents({
  state: s,
  rules,
  slots,
  court,
  tracker,
}: {
  state: ThroneTableState | null;
  rules: ThroneChoiceRules;
  slots: readonly HTMLElement[];
  court: HTMLElement;
  tracker: HTMLElement;
}) {
  const law = rules.laws[s?.currentLaw || 'ordem'],
    decree = rules.decrees.find((d) => d.id === s?.decree),
    trump = s?.trump ? throneSuitDetails[s.trump] : null;
  return (
    <>
      {slots.map((slot, id) => {
        const play = s?.plays.find((p) => p.playerId === id);
        return createPortal(
          play && s ? (
            <TablePlay key={`${s.round}:${s.trick}:${id}`} play={play} state={s} />
          ) : (
            <span>{s?.names[id] || `J${id + 1}`}</span>
          ),
          slot,
          String(id),
        );
      })}
      {createPortal(
        <>
          <div
            className="law-mini"
            data-tooltip={throneLawTooltip(rules, s, s?.currentLaw || 'ordem')}
            tabIndex={0}
          >
            <img id="currentLawImg" src={law.img} alt="Lei atual" />
            <div>
              <small>LEI ATUAL</small>
              <strong id="currentLawName">{law.name.toUpperCase()}</strong>
              <span id="lawUsesText">Uso {Math.min(2, s?.lawUsage[s.currentLaw] || 1)} de 2</span>
            </div>
          </div>
          <div id="trumpInfo" className={`trump-info ${trump ? '' : 'hidden'}`}>
            Trunfo:{' '}
            <strong id="trumpSuitText">
              {trump ? (
                <span className="trump-glyph" style={{ color: trump.color }}>
                  {trump.glyph}
                </span>
              ) : (
                '—'
              )}
            </strong>
          </div>
          <div
            id="leadSuitInfo"
            className={`trump-info lead-suit-info ${s?.declaredLeadSuit ? '' : 'hidden'}`}
          >
            Naipe anunciado:{' '}
            <strong id="leadSuitText">
              {s?.declaredLeadSuit ? throneSuitDetails[s.declaredLeadSuit].name : '—'}
            </strong>
          </div>
          <div
            id="decreeBadge"
            className="decree-badge"
            data-tooltip={throneDecreeTooltip(rules, s)}
            tabIndex={0}
            role={s?.decree === 'espionagem' ? 'button' : undefined}
            aria-label={
              s?.decree === 'espionagem'
                ? 'Espionagem: consultar sua informação privada'
                : undefined
            }
          >
            <small>DECRETO</small>
            <strong>{decree ? `${decree.icon} ${decree.name}` : 'Escolhendo...'}</strong>
          </div>
        </>,
        court,
      )}
      {createPortal(
        throneLaws.map((id) => (
          <div
            key={id}
            className={`law-track-row ${s?.currentLaw === id ? 'current' : ''}`}
            data-tooltip={throneLawTooltip(rules, s, id)}
            tabIndex={0}
          >
            <span>{rules.laws[id].name}</span>
            <span className="law-pips">
              {[0, 1].map((i) => (
                <i key={i} className={`law-pip ${i < (s?.lawUsage[id] || 0) ? 'used' : ''}`} />
              ))}
            </span>
          </div>
        )),
        tracker,
      )}
    </>
  );
}
