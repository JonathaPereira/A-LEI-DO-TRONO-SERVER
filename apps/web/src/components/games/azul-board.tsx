import type { CSSProperties } from 'react';
import type { AzulPlayer, AzulState, AzulSnapshot, AzulRules, AzulDetail } from '../../types/azul';
import type { Azul } from '../../lib/games/azul';

export function AzulTile({ color, ghost = false }: { color: number; ghost?: boolean }) {
  const colors = ['Azul', 'Amarelo', 'Vermelho', 'Preto', 'Branco'];
  return (
    <span
      className={'az-tile az-color-' + color + (ghost ? ' az-ghost' : '')}
      aria-label={color === 5 ? 'Marcador de primeiro jogador' : colors[color]}
    />
  );
}
interface View {
  snapshot: AzulSnapshot;
  controller: Azul;
  rules: AzulRules;
}
function Pick({
  tiles,
  source,
  color,
  factory = false,
  duplicate = false,
  snapshot,
  controller,
  rules,
}: View & {
  tiles: number[];
  source: number;
  color: number;
  factory?: boolean;
  duplicate?: boolean;
}) {
  const s = snapshot.replay?.state ?? snapshot.room!.state!,
    count = tiles.filter((c) => c === color).length;
  const selected = snapshot.selection?.source === source && snapshot.selection.color === color;
  return (
    <button
      type="button"
      className={'az-pick' + (factory ? '' : ' az-center-group') + (selected ? ' selected' : '')}
      data-no-click-sfx="1"
      data-source={source}
      data-color={color}
      title={'Pegar ' + count + ' ' + rules.colors[color]}
      aria-label={
        (source === -1 ? 'Centro' : 'Fábrica ' + (source + 1)) +
        ': pegar ' +
        count +
        ' ' +
        rules.colors[color]
      }
      tabIndex={duplicate ? -1 : undefined}
      aria-hidden={duplicate || undefined}
      disabled={
        snapshot.pending ||
        !!snapshot.replay ||
        s.phase !== 'draft' ||
        s.players[s.turn].id !== snapshot.accountId
      }
      onClick={() => controller.select(source, color)}
    >
      {Array.from({ length: factory ? 1 : count }, (_, i) => (
        <AzulTile key={i} color={color} />
      ))}
    </button>
  );
}
function Supply(props: View & { state: AzulState }) {
  const { state: s, snapshot, rules } = props,
    selection = snapshot.selection;
  const selectedCount = selection
    ? (selection.source === -1 ? s.center : (s.factories[selection.source] ?? [])).filter(
        (c) => c === selection.color,
      ).length
    : 0;
  return (
    <section className="az-supply" aria-label="Fábricas e centro">
      <div className="az-supply-title">
        <span className="az-eyebrow">A MESA DOS ARTESÃOS</span>
        <strong>Mercado de azulejos</strong>
        <small>
          {s.bagCount} no saco · {s.discardCount} no descarte
        </small>
      </div>
      <div
        className={'az-market-ring' + (s.center.length > 10 ? ' az-market-expanded' : '')}
        data-factories={s.factories.length}
      >
        {s.factories.map((tiles, source) => {
          const angle = ((-90 + (source * 360) / s.factories.length) * Math.PI) / 180;
          return (
            <div
              className="az-factory"
              data-factory={source}
              key={source}
              style={
                {
                  '--factory-x': 50 + 37 * Math.cos(angle) + '%',
                  '--factory-y': 50 + 37 * Math.sin(angle) + '%',
                } as CSSProperties
              }
            >
              <span className="az-factory-label">{source + 1}</span>
              {tiles.length ? (
                <div className="az-factory-pieces">
                  {tiles.map((color, i) => (
                    <Pick
                      {...props}
                      key={i}
                      tiles={tiles}
                      source={source}
                      color={color}
                      factory
                      duplicate={tiles.indexOf(color) !== i}
                    />
                  ))}
                </div>
              ) : (
                <span className="az-empty-factory">✥</span>
              )}
            </div>
          );
        })}
        <section className="az-center">
          <strong>CENTRO</strong>
          <div className="az-center-tiles">
            {s.marker && <AzulTile color={5} />}
            {[...new Set(s.center)]
              .sort((a, b) => a - b)
              .map((color) => (
                <Pick {...props} key={color} tiles={s.center} source={-1} color={color} />
              ))}
            {!s.center.length && (
              <small>
                {s.phase === 'scoring' ? 'Contando os mosaicos…' : 'As sobras vêm para cá'}
              </small>
            )}
          </div>
        </section>
      </div>
      <p className="az-instruction">
        {snapshot.replay
          ? 'Acompanhe cada azulejo e suas conexões.'
          : selection
            ? selectedCount +
              ' × ' +
              rules.colors[selection.color] +
              ' · escolha uma linha destacada. As sobras vão para o chão.'
            : 'Escolha uma cor. Depois, escolha uma linha no seu tabuleiro.'}
      </p>
    </section>
  );
}
function PlayerBoard({
  player: p,
  seat,
  state: s,
  snapshot,
  controller,
  rules,
}: View & { player: AzulPlayer; seat: number; state: AzulState }) {
  const mine = p.id === snapshot.accountId,
    active = s.phase === 'draft' && s.players[s.turn].id === p.id;
  const detail = snapshot.replay?.detail,
    scoring = detail?.playerId === p.id,
    locked = snapshot.pending || !!snapshot.replay,
    selection = snapshot.selection;
  return (
    <article
      className={
        'az-board' +
        (mine ? ' az-mine' : '') +
        (active ? ' az-turn' : '') +
        (scoring ? ' az-scoring' : '')
      }
      data-azul-player={p.id}
      data-seat={seat}
    >
      <header className="az-board-heading">
        <div className="az-name-plaque">
          <strong>
            {p.name}
            {mine ? ' · você' : ''}
          </strong>
          <small>
            {p.forfeited
              ? 'Saiu · bot jogando'
              : p.bot
                ? 'Artesão automático'
                : scoring
                  ? 'Pontuando o mosaico'
                  : active
                    ? 'Sua escolha de azulejos'
                    : 'Artesão'}
          </small>
        </div>
        <div className="az-score-plaque">
          <span className="az-score-cube" aria-hidden="true" />
          <small>PONTOS</small>
          <b className="az-score">{p.score} pts</b>
        </div>
      </header>
      <div className="az-board-grid">
        <div className="az-lines">
          {p.lines.map((line, row) => {
            const valid = !!(
              mine &&
              active &&
              selection &&
              !locked &&
              rules.canPlace(p, row, selection.color)
            );
            return (
              <button
                key={row}
                type="button"
                className={
                  'az-pattern-row' +
                  (valid ? ' az-valid' : '') +
                  (scoring && detail.kind === 'placement' && detail.row === row
                    ? ' az-row-scoring'
                    : '')
                }
                data-azul-row={row}
                data-no-click-sfx="1"
                disabled={!valid}
                onClick={() => void controller.move(row)}
                aria-label={
                  'Linha ' +
                  (row + 1) +
                  ': ' +
                  line.count +
                  ' de ' +
                  (row + 1) +
                  (line.color !== null ? ', ' + rules.colors[line.color] : '') +
                  (valid ? ', colocar azulejos selecionados' : '')
                }
              >
                {Array.from({ length: row + 1 }, (_, j) =>
                  j >= row + 1 - line.count ? (
                    <AzulTile key={j} color={line.color!} />
                  ) : (
                    <span key={j} className="az-slot" />
                  ),
                )}
              </button>
            );
          })}
        </div>
        <div className="az-wall-arrows">
          {p.lines.map((_, row) => (
            <span key={row} className="az-wall-arrow" aria-hidden="true" />
          ))}
        </div>
        <div className="az-wall">
          {p.wall.flatMap((line, row) =>
            line.map((filled, col) => {
              const cells = detail && 'cells' in detail ? detail.cells : [],
                connection = scoring ? cells.findIndex(([r, c]) => r === row && c === col) : -1;
              const target =
                scoring && detail.kind === 'placement' && detail.row === row && detail.col === col;
              return (
                <span
                  key={row + ',' + col}
                  data-cell={row + ',' + col}
                  className={
                    'az-wall-cell' +
                    (connection >= 0 ? ' az-connected' : '') +
                    (target ? ' az-score-target' : '')
                  }
                  style={
                    connection >= 0
                      ? ({ '--connection-index': connection } as CSSProperties)
                      : undefined
                  }
                >
                  <AzulTile color={(col - row + 5) % 5} ghost={!filled} />
                  {target && detail.landed && <b className="az-points-pop">+{detail.points}</b>}
                </span>
              );
            }),
          )}
        </div>
      </div>
      <div className="az-board-bottom">
        <div
          className={'az-floor' + (scoring && detail.kind === 'floor' ? ' az-floor-scoring' : '')}
        >
          <button
            type="button"
            className="az-floor-label"
            disabled={!(mine && active && selection && !locked)}
            title="Enviar os azulejos selecionados para o chão"
            data-no-click-sfx="1"
            onClick={() => void controller.move(-1)}
          >
            Chão
          </button>
          <div className="az-floor-slots">
            {rules.penalties.map((penalty, i) => (
              <div className="az-floor-slot" key={i}>
                <small>−{penalty}</small>
                {p.floor[i] !== undefined ? (
                  <AzulTile color={p.floor[i]} />
                ) : (
                  <span className="az-slot" />
                )}
              </div>
            ))}
          </div>
        </div>
        <div
          className="az-bonus-key"
          aria-label="Bônus finais: linha 2, coluna 7, cor completa 10 pontos"
        >
          {[
            ['━━━━', '+2'],
            ['▥', '+7'],
            ['✥', '+10'],
          ].map(([symbol, value]) => (
            <span key={value}>
              <i>{symbol}</i>
              <b>{value}</b>
            </span>
          ))}
        </div>
      </div>
      <p
        className="az-round-score"
        title={p.last ? 'O total nunca fica abaixo de zero.' : undefined}
      >
        {p.last
          ? 'Rodada: +' +
            p.last.points +
            ' na parede · −' +
            p.last.penalty +
            ' no chão · saldo ' +
            (p.last.delta >= 0 ? '+' : '') +
            p.last.delta
          : mine
            ? 'Seu ateliê · complete as linhas da direita para a esquerda'
            : 'Ateliê de ' + p.name}
      </p>
      {p.bonus && (
        <p className="az-bonus">
          Bônus: {p.bonus.rows} linhas × 2 · {p.bonus.columns} colunas × 7 · {p.bonus.sets} cores ×
          10 = +{p.bonus.total}
        </p>
      )}
    </article>
  );
}
function stepCopy(step: AzulDetail) {
  if (step.kind === 'placement')
    return {
      label: 'Linha ' + (step.row + 1) + ' → parede',
      description:
        step.horizontal > 1 && step.vertical > 1
          ? step.horizontal + ' na horizontal + ' + step.vertical + ' na vertical'
          : step.horizontal > 1
            ? step.horizontal + ' azulejos conectados na horizontal'
            : step.vertical > 1
              ? step.vertical + ' azulejos conectados na vertical'
              : 'Azulejo isolado',
      points: '+' + step.points,
    };
  if (step.kind === 'floor')
    return {
      label: 'Penalidade do chão',
      description:
        'Chão: −' +
        step.penalty +
        ' · desconto aplicado: ' +
        step.applied +
        ' · mínimo de 0 pontos.',
      points: '−' + step.applied,
    };
  const label = {
    rows: 'linhas completas',
    columns: 'colunas completas',
    sets: 'conjuntos da mesma cor',
  }[step.type];
  return {
    label: 'Bônus de ' + label,
    description:
      step.count + ' ' + label + ' × ' + { rows: 2, columns: 7, sets: 10 }[step.type] + ' pontos',
    points: '+' + step.points,
  };
}
function Scoring({ snapshot, controller }: View) {
  const replay = snapshot.replay!,
    detail = replay.detail,
    copy = detail ? stepCopy(detail) : null;
  return (
    <section
      className="az-scoring-banner"
      aria-label="Contagem de pontos"
      role="status"
      aria-live="polite"
    >
      {copy && (
        <b className={'az-scoring-value' + (detail!.kind === 'floor' ? ' az-negative' : '')}>
          {copy.points}
        </b>
      )}
      <div className="az-scoring-copy">
        {copy ? (
          <>
            <small>
              {replay.state.players.find((p) => p.id === detail!.playerId)!.name} · rodada{' '}
              {replay.round}
            </small>
            <strong>{copy.label}</strong>
            <span>{copy.description}</span>
          </>
        ) : (
          <>
            <small>O MERCADO FECHOU</small>
            <strong>Vamos pontuar a rodada {replay.round}</strong>
            <span>Uma peça de cada linha completa vai para a parede.</span>
          </>
        )}
      </div>
      <span className="az-scoring-progress">
        {replay.progress} / {replay.total}
      </span>
      <button type="button" className="az-button" onClick={controller.finishReplay}>
        Concluir contagem
      </button>
    </section>
  );
}
export function AzulTable(props: View) {
  const { snapshot, controller } = props,
    s = snapshot.replay?.state ?? snapshot.room!.state!;
  const local = s.players.find((p) => p.id === snapshot.accountId),
    players = local ? [local, ...s.players.filter((p) => p !== local)] : s.players;
  const saved = {
    saving: 'Salvando os recordes…',
    saved: 'Recordes salvos no ranking permanente.',
    pending: 'Resultado aguardando conexão com o ranking. O servidor tentará novamente.',
    unranked: 'Partida sem recordes elegíveis.',
  };
  return (
    <>
      {snapshot.replay && <Scoring {...props} />}
      {s.phase === 'finished' && (
        <div className="az-result" role="status">
          <h2>
            {s.winners.map((id) => s.players.find((p) => p.id === id)!.name).join(' e ')}
            {s.winners.length > 1 ? ' venceram!' : ' venceu!'}
          </h2>
          <p>
            {snapshot.room!.recordStatus
              ? saved[snapshot.room!.recordStatus]
              : 'Calculando os recordes…'}
          </p>
          {snapshot.room!.recordStatus === 'pending' && (
            <button
              type="button"
              className="az-button"
              onClick={() => void controller.retryRecord()}
            >
              Tentar salvar novamente
            </button>
          )}
          <button
            type="button"
            className="az-button az-primary"
            onClick={() => void controller.leave()}
          >
            Nova partida
          </button>
        </div>
      )}
      <div className="az-table">
        <Supply {...props} state={s} />
        <div className="az-boards">
          {players.map((player, seat) => (
            <PlayerBoard {...props} key={player.id} player={player} seat={seat} state={s} />
          ))}
        </div>
      </div>
    </>
  );
}
