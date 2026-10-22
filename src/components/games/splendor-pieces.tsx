import type { Splendor } from '../../lib/games/splendor';
import type {
  SplendorSnapshot,
  SplendorRules,
  SplendorData,
  SplendorReserve,
  SplendorNoble,
  SplendorPlayer,
} from '../../types/splendor';
export interface SplendorView {
  snapshot: SplendorSnapshot;
  controller: Splendor;
  rules: SplendorRules;
  data: SplendorData;
}
export const shown = (s: SplendorSnapshot) => s.replay?.state ?? s.room?.state;
export const blocked = (s: SplendorSnapshot) => s.pending || !!s.replay || !s.connected;
export const actionTurn = (s: SplendorSnapshot) =>
  shown(s)?.phase === 'action' && shown(s)?.players[shown(s)!.turn].id === s.accountId;
export function Gem({
  color,
  count,
  chip = false,
  rules,
  met,
  title,
}: {
  color: number;
  count?: number;
  chip?: boolean;
  rules: SplendorRules;
  met?: boolean;
  title?: string;
}) {
  return (
    <span
      className={'sp-gem sp-gem-' + color + (chip ? ' sp-chip' : '') + (met ? ' sp-met' : '')}
      title={title}
      aria-label={rules.colors[color] + (count !== undefined ? ': ' + count : '')}
    >
      <i>{rules.symbols[color]}</i>
      {count !== undefined && <b>{count}</b>}
    </span>
  );
}
export function Costs({
  cost,
  bonuses,
  rules,
}: {
  cost: number[];
  bonuses?: number[];
  rules: SplendorRules;
}) {
  return (
    <span className="sp-costs">
      {cost.map((n, i) =>
        n ? (
          <Gem
            key={i}
            color={i}
            count={n}
            rules={rules}
            met={bonuses ? bonuses[i] >= n : false}
            title={
              bonuses ? rules.colors[i] + ': ' + bonuses[i] + ' de ' + n + ' bônus' : undefined
            }
          />
        ) : null,
      )}
    </span>
  );
}
export function Card({
  card: c,
  small = false,
  actions = true,
  disabled = false,
  ...props
}: SplendorView & {
  card: SplendorReserve | null;
  small?: boolean;
  actions?: boolean;
  disabled?: boolean;
}) {
  const { snapshot: s, controller, rules } = props;
  if (!c) return <span className="sp-card sp-empty" />;
  if (c.hidden)
    return (
      <button
        type="button"
        className={
          'sp-card' + (small ? ' sp-card-small' : '') + ' sp-card-back sp-level-' + c.level
        }
        data-card=""
        disabled
        aria-label={'Carta reservada oculta, nível ' + c.level}
      >
        <span className="sp-back-emblem">✦</span>
        <small>NÍVEL {c.level}</small>
      </button>
    );
  const state = shown(s),
    p = state?.players.find((p) => p.id === s.accountId),
    affordable = p && !!rules.payment(p, c),
    index = (c.level - 1) * 4 + (Number(c.id.slice(1)) % 4);
  const title =
    'Nível ' + c.level + ' · ' + c.points + ' ponto(s) · bônus de ' + rules.colors[c.bonus];
  return (
    <button
      type="button"
      className={
        'sp-card' +
        (small ? ' sp-card-small' : '') +
        (actions && actionTurn(s) && affordable && !blocked(s) ? ' sp-affordable' : '')
      }
      data-card={c.id}
      data-no-click-sfx="1"
      title={title}
      aria-label={
        title +
        '. Custo: ' +
        c.cost
          .map((v, i) => (v ? v + ' ' + rules.colors[i] : null))
          .filter(Boolean)
          .join(', ') +
        (affordable ? '. Você pode comprar.' : '')
      }
      disabled={disabled}
      onClick={() => controller.openCard(c.id, actions)}
    >
      <span
        className="sp-card-art"
        style={{
          backgroundPosition: ((index % 4) * 100) / 3 + '% ' + Math.floor(index / 4) * 50 + '%',
        }}
      />
      <span className="sp-card-top">
        <b className="sp-card-points">{c.points || ''}</b>
        <Gem color={c.bonus} rules={rules} />
      </span>
      <Costs cost={c.cost} rules={rules} />
    </button>
  );
}
export function Noble({
  noble: n,
  inert = false,
  ...props
}: SplendorView & { noble: SplendorNoble; inert?: boolean }) {
  const { snapshot: s, controller, rules, data } = props,
    state = shown(s),
    p = state?.players.find((p) => p.id === s.accountId);
  const eligible =
    !inert &&
    state?.phase === 'noble' &&
    state.eligible.includes(n.id) &&
    state.players[state.turn].id === s.accountId;
  const i = data.nobles.findIndex((v) => v.id === n.id);
  return (
    <button
      type="button"
      className={'sp-noble' + (eligible ? ' sp-noble-eligible' : '')}
      data-noble={n.id}
      data-no-click-sfx="1"
      disabled={!eligible || blocked(s)}
      onClick={() => {
        if (eligible && !blocked(s)) void controller.submit({ kind: 'noble', id: n.id });
      }}
      aria-label={
        'Nobre: 3 pontos. Requer ' +
        n.cost
          .map((v, i) => (v ? v + ' bônus de ' + rules.colors[i] : null))
          .filter(Boolean)
          .join(', ') +
        (eligible ? '. Escolher este nobre.' : '')
      }
    >
      <span
        className="sp-noble-art"
        style={{ backgroundPosition: (i % 5) * 25 + '% ' + Math.floor(i / 5) * 100 + '%' }}
      />
      <b className="sp-noble-points">3</b>
      <Costs cost={n.cost} bonuses={p?.bonuses} rules={rules} />
    </button>
  );
}
export function Player({
  player: p,
  index,
  self = false,
  ...props
}: SplendorView & { player: SplendorPlayer; index: number; self?: boolean }) {
  const { snapshot: s, controller, rules } = props,
    state = shown(s)!,
    detail = s.replay;
  return (
    <article
      className={
        'sp-player' +
        (self ? ' sp-self' : '') +
        (state.turn === index && state.phase !== 'finished' ? ' sp-player-active' : '')
      }
      data-player={p.id}
    >
      <header>
        <div>
          <strong>
            {p.name}
            {self ? ' · você' : ''}
          </strong>
          <small>
            {p.forfeited
              ? 'Saiu · bot assume'
              : p.bot
                ? 'Mercador automático'
                : index === state.starter
                  ? 'Primeiro da rodada'
                  : 'Mercador'}
          </small>
        </div>
        <b className="sp-score" data-score={p.id} title="Pontos de prestígio">
          {detail?.event.playerId === p.id ? detail.displayScore : p.score}
        </b>
      </header>
      <section
        className="sp-holdings sp-inventory sp-purchasing-power"
        aria-label={'Poder de compra por cor de ' + p.name}
      >
        <strong className="sp-inventory-title">PODER DE COMPRA · POR COR</strong>
        <div className="sp-resource-colors">
          {rules.colors.map((name, color) => (
            <div
              className="sp-resource-color"
              data-resource-color={color}
              key={color}
              aria-label={
                color < 5
                  ? name +
                    ': ' +
                    p.bonuses[color] +
                    ' cartas + ' +
                    p.tokens[color] +
                    ' fichas = ' +
                    (p.bonuses[color] + p.tokens[color]) +
                    ' de poder de compra'
                  : 'Ouro: ' + p.tokens[5] + ' fichas curingas, usadas uma vez'
              }
            >
              <small className="sp-resource-name">{name}</small>
              <div className="sp-resource-equation">
                {color < 5 && (
                  <>
                    <span
                      className="sp-bonus-card"
                      data-bonus={color}
                      title="Cartas: desconto permanente"
                    >
                      <Gem color={color} rules={rules} />
                      <b>{p.bonuses[color]}</b>
                    </span>
                    <i className="sp-resource-plus">+</i>
                  </>
                )}
                <span
                  className="sp-wallet-color"
                  data-wallet-color={color}
                  title="Fichas: gastas nas compras"
                >
                  <Gem color={color} count={p.tokens[color]} chip rules={rules} />
                </span>
              </div>
              <b className="sp-resource-total">
                {color < 5
                  ? '= ' + (p.bonuses[color] + p.tokens[color])
                  : p.tokens[5] + ' curinga(s)'}
              </b>
            </div>
          ))}
        </div>
        <small className="sp-resource-legend">
          ▱ Cartas ficam · ● Fichas gastas voltam ao banco · Ouro completa uma cor
        </small>
      </section>
      <div className="sp-player-foot">
        <small>
          {rules.sum(p.tokens)}/10 fichas · {p.cards.length} cartas · {p.nobles.length} nobres
        </small>
        <button type="button" className="sp-link" onClick={() => controller.openCollection(p.id)}>
          Ver cartas ({p.cards.length})
        </button>
      </div>
      <details className="sp-player-details">
        <summary>Reservas · {p.reserved.length}/3</summary>
        <div className="sp-reserved" aria-label={'Cartas reservadas de ' + p.name}>
          {p.reserved.map((c, i) => (
            <Card {...props} card={c} small key={c.hidden ? 'hidden-' + i : c.id} />
          ))}
          {!p.reserved.length && <small>Nenhuma carta reservada.</small>}
        </div>
      </details>
    </article>
  );
}
