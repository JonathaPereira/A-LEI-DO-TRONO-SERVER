import { createPortal } from 'react-dom';
import type { ThronePublicPlayer } from '../../types/throne-match';
import type { ThroneSeatsSnapshot } from '../../types/throne-seats';

const names = { cetro: 'Cetro', chave: 'Chave', lamina: 'Lâmina', mascara: 'Máscara' };

function PlayerDetails({ player: p, local }: { player: ThronePublicPlayer; local: boolean }) {
  const influenceTip =
    p.influence >= 2
      ? 'Influência 2/2: pode usar Sigilo por 1 ou Manobra da Corte por 2 (+3/-3, limitado a 1-12).'
      : p.influence === 1
        ? 'Influência 1/2: já pode usar Sigilo para jogar uma carta oculta.'
        : `Influência ${p.influence}/2. Quem termina a vaza sem Coroa nem Sombra ganha 1, até o máximo de 2.`;
  return (
    <>
      <div className="player-name">
        <span>{p.name}</span>
        <small>{p.ai ? 'IA' : local ? 'VOCÊ' : 'ONLINE'}</small>
      </div>
      <div className="score-board">
        <div className="score-tile crown-score">
          <span className="score-icon">♛</span>
          <div>
            <small>COROAS</small>
            <strong>{p.totalCrowns}</strong>
          </div>
        </div>
        <div className="score-tile shadow-score">
          <span className="score-icon">☾</span>
          <div>
            <small>SOMBRAS</small>
            <strong>{p.totalShadows}</strong>
          </div>
        </div>
        <div className="prestige-score">
          <small>PRESTÍGIO ATUAL</small>
          <strong>
            {p.totalCrowns + p.totalShadows + 2 * Math.min(p.totalCrowns, p.totalShadows)}
          </strong>
        </div>
      </div>
      <div
        className={`influence-meter ${p.influence >= 2 ? 'ready' : ''}`}
        data-tooltip={influenceTip}
      >
        <span className="influence-mark">✦</span>
        <span>INFLUÊNCIA</span>
        <span className="influence-pips">
          {[0, 1].map((i) => (
            <i key={i} className={`influence-pip ${i < p.influence ? 'on' : ''}`} />
          ))}
        </span>
        <b>{p.influence}/2</b>
      </div>
      <div className="player-meta">
        <span>
          Rodada: ♛ {p.roundCrowns} · ☾ {p.roundShadows}
        </span>
        <span>🂠 {p.handCount + (p.reservePresent ? 1 : 0)} cartas</span>
      </div>
      <div className="public-cards">
        {p.publicCards.length ? (
          p.publicCards.map((c) => {
            const court = c.publicReason === 'Corte Aberta',
              challenge = c.publicReason === 'Desafio',
              label = `${names[c.suit]} ${c.value}`;
            return (
              <div
                key={c.id}
                className={`public-card-chip ${court ? 'corte-open' : ''} ${challenge ? 'desafio-open' : ''}`}
                title={`${c.publicReason}: ${label}`}
              >
                {court && <span className="public-label">CORTE ABERTA</span>}
                {challenge && <span className="public-label desafio-label">DESAFIO</span>}
                <img
                  src={`assets/cards/${c.suit}_${String(c.value).padStart(2, '0')}.webp`}
                  alt={label}
                />
              </div>
            );
          })
        ) : (
          <span className="tag">Nenhuma carta revelada</span>
        )}
      </div>
    </>
  );
}

export function ThroneSeatContents({
  snapshot: s,
  panels,
  coins,
}: {
  snapshot: ThroneSeatsSnapshot;
  panels: readonly HTMLElement[];
  coins: HTMLElement;
}) {
  return (
    <>
      {panels.map((host, id) =>
        createPortal(
          <>
            {s.players[id] && <PlayerDetails player={s.players[id]} local={id === s.localSeat} />}
            {/* The effects owner writes only inside this stable, empty host. */}
            <div
              id={`playerEffects${id}`}
              className="throne-player-effects"
              style={{ display: 'contents' }}
            />
          </>,
          host,
          String(id),
        ),
      )}
      {createPortal(
        s.players.map((p) => (
          <div
            key={p.id}
            id={`coinBank${p.id}`}
            className={`coin-bank coin-seat-${p.id} ${p.influence ? 'has-influence' : ''} ${p.influence >= 2 ? 'ready' : ''}`}
            data-tooltip={`${p.name}: ${p.influence}/2 Influências`}
          >
            {[0, 1].map((i) => (
              <span key={i} className={`influence-coin ${i < p.influence ? '' : 'empty'}`}>
                ✦
              </span>
            ))}
          </div>
        )),
        coins,
      )}
    </>
  );
}
