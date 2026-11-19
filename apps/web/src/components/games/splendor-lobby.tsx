import { useState } from 'react';
import type { SplendorView } from './splendor-pieces';
export function SplendorLobby({ snapshot: s, controller }: SplendorView) {
  const [count, setCount] = useState(2);
  if (s.room)
    return (
      <section className="sp-waiting">
        <span className="sp-eyebrow">A MESA ESTÁ ABERTA</span>
        <h2>Convide os outros mercadores</h2>
        <div className="sp-seats">
          {s.room.players.map((p) => (
            <span key={p.id}>
              {p.name}
              {p.online ? ' · pronto' : ' · reconectando'}
            </span>
          ))}
        </div>
        {s.room.hostId === s.accountId ? (
          <>
            <button
              type="button"
              className="sp-button sp-primary"
              disabled={s.room.players.length < 2 || s.room.players.some((p) => !p.online)}
              onClick={() => controller.startGame(false)}
            >
              Começar com os presentes
            </button>
            <button
              type="button"
              className="sp-button"
              disabled={s.room.players.some((p) => !p.online)}
              onClick={() => controller.startGame(true)}
            >
              Completar com bots e começar
            </button>
          </>
        ) : (
          <p>Aguardando quem criou a mesa iniciar.</p>
        )}
      </section>
    );
  return (
    <>
      <section className="sp-lobby">
        <img
          className="sp-lobby-art"
          src="assets/games/splendor-cover.webp"
          alt="Mercador renascentista examinando uma safira"
        />
        <div>
          <span className="sp-eyebrow">2–4 MERCADORES · REGRAS CLÁSSICAS</span>
          <h2>Transforme gemas em prestígio.</h2>
          <p>
            Adquira minas, construa sua rede de comércio e atraia os nobres. Quinze pontos iniciam a
            última rodada. Sua chamada continua durante a partida.
          </p>
          <div className="sp-lobby-controls">
            <label>
              Participantes{' '}
              <select
                id="splendorPlayerCount"
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
              className="sp-button sp-primary"
              onClick={() => controller.create(count)}
            >
              Criar mesa
            </button>
            {s.resumeId && (
              <button type="button" className="sp-button" onClick={controller.resume}>
                Retomar minha mesa
              </button>
            )}
          </div>
        </div>
      </section>
      <section className="sp-open-rooms">
        <h3>Mesas abertas</h3>
        <button type="button" className="sp-link" onClick={() => void controller.refreshRooms()}>
          Atualizar mesas
        </button>
        {!s.rooms.length && <p>Nenhuma mesa esperando. Crie uma e convide seus amigos.</p>}
        {s.rooms.map((r) => (
          <button
            type="button"
            className="sp-button"
            key={r.id}
            onClick={() => controller.join(r.id)}
          >
            Mesa de {r.name} · {r.players}/{r.maxPlayers}
          </button>
        ))}
      </section>
    </>
  );
}
export function SplendorRanking({ snapshot: s, controller }: SplendorView) {
  return (
    <>
      <header>
        <h3>Cinco grandes mercadores</h3>
        <button type="button" className="sp-link" onClick={controller.refreshRanking}>
          Atualizar
        </button>
      </header>
      {s.rankingError ? (
        <p>{s.rankingError}</p>
      ) : !s.ranking.length ? (
        <p>Complete uma partida para registrar seu melhor resultado.</p>
      ) : (
        <>
          <ol className="sp-records">
            {s.ranking.map((r, i) => (
              <li key={r.playerId}>
                <b>{String(i + 1).padStart(2, '0')}</b>
                <div>
                  <strong>{r.name}</strong>
                  <small>
                    {r.cards} cartas · {r.mode === 'bots' ? 'Com bots' : 'Online'} ·{' '}
                    {new Date(r.date).toLocaleDateString('pt-BR')}
                  </small>
                </div>
                <strong>{r.score} pts</strong>
              </li>
            ))}
          </ol>
          <small>Melhor resultado por conta. Empate: menos cartas e data do recorde.</small>
        </>
      )}
    </>
  );
}
