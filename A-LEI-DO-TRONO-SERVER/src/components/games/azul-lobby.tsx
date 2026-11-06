import { useState } from 'react';
import type { Azul } from '../../lib/games/azul';
import type { AzulSnapshot } from '../../types/azul';

export function AzulLobby({
  snapshot: s,
  controller,
}: {
  snapshot: AzulSnapshot;
  controller: Azul;
}) {
  const [count, setCount] = useState(2);
  if (s.room)
    return (
      <div className="az-lobby">
        <h2>À mesa, artesãos.</h2>
        <p>
          Seus amigos encontram esta partida em Azul → Mesas abertas. A chamada continua conectada.
        </p>
        <div className="az-seated">
          {s.room.players.map((p) => (
            <span key={p.id}>
              {p.name}
              {p.id === s.room!.hostId ? ' · anfitrião' : ''}
              {!p.online ? ' · reconectando…' : ''}
            </span>
          ))}
        </div>
        {s.room.hostId === s.accountId ? (
          <div className="az-lobby-controls">
            <button
              type="button"
              className="az-button az-primary"
              disabled={s.room.players.length < 2}
              onClick={() => controller.startGame(false)}
            >
              Iniciar com os presentes
            </button>
            <button type="button" className="az-button" onClick={() => controller.startGame(true)}>
              Completar com bots e iniciar
            </button>
          </div>
        ) : (
          <p>O anfitrião inicia a partida.</p>
        )}
      </div>
    );
  return (
    <div className="az-lobby">
      <div className="az-lobby-intro">
        <img
          className="az-lobby-cover"
          src="assets/azul/box-cover.webp"
          alt="Caixa do jogo Azul"
          width={1230}
          height={1278}
          decoding="async"
        />
        <div>
          <span className="az-eyebrow">DE 2 A 4 ARTESÃOS</span>
          <h2>Seu próximo mosaico começa aqui.</h2>
          <p>
            Escolha azulejos, complete as linhas e construa sua parede. Jogue com amigos ou contra
            os artesãos automáticos.
          </p>
        </div>
      </div>
      <div className="az-lobby-controls">
        <label>
          Participantes{' '}
          <select
            id="azulPlayerCount"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {[2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="az-button az-primary"
          onClick={() => controller.create(count)}
        >
          Criar mesa
        </button>
        {s.resumeId && (
          <button type="button" className="az-button" onClick={controller.resume}>
            Retomar minha mesa
          </button>
        )}
      </div>
      <div className="az-open-rooms">
        <h3>Mesas abertas</h3>
        <button
          type="button"
          className="az-text-button"
          onClick={() => void controller.refreshRooms()}
        >
          Atualizar mesas
        </button>
        {!s.rooms.length && <p>Nenhuma mesa esperando. Crie a sua e convide seus amigos.</p>}
        {s.rooms.map((r) => (
          <button
            key={r.id}
            type="button"
            className="az-button"
            onClick={() => controller.join(r.id)}
          >
            Mesa de {r.name} · {r.players}/{r.maxPlayers}
          </button>
        ))}
      </div>
    </div>
  );
}
export function AzulRanking({
  snapshot: s,
  controller,
}: {
  snapshot: AzulSnapshot;
  controller: Azul;
}) {
  return (
    <>
      <header>
        <h3>Os cinco recordistas</h3>
        <button
          type="button"
          className="az-refresh"
          aria-label="Atualizar recordes"
          onClick={controller.refreshRanking}
        >
          ↻
        </button>
      </header>
      {s.rankingError ? (
        <p className="az-error">{s.rankingError}</p>
      ) : !s.ranking.length ? (
        <p>
          O primeiro mosaico perfeito pode ser seu. Complete uma partida para entrar no ranking.
        </p>
      ) : (
        <>
          <ol className="az-records">
            {s.ranking.map((r, index) => (
              <li key={r.playerId}>
                <b>{String(index + 1).padStart(2, '0')}</b>
                <span>
                  <strong>{r.name}</strong>
                  <small>
                    {r.mode === 'bots' ? 'Contra bots' : 'Mesa online'} ·{' '}
                    {new Date(r.date).toLocaleDateString('pt-BR')}
                  </small>
                </span>
                <strong>{r.score} pts</strong>
              </li>
            ))}
          </ol>
          <small>Melhor resultado por conta. Empate: linhas completas e data do recorde.</small>
        </>
      )}
    </>
  );
}
