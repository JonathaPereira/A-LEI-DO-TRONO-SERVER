import { useState } from 'react';
import type { LoveLetterView } from './love-letter-pieces';
export function LoveLetterLobby({ snapshot: s, controller }: LoveLetterView) {
  const [count, setCount] = useState(4);
  if (s.room)
    return (
      <section className="ll-waiting">
        <h2>A corte está se reunindo.</h2>
        <p>Seus amigos encontram esta mesa em Love Letter → Mesas abertas.</p>
        <div className="ll-seats">
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
              className="ll-button ll-primary"
              disabled={s.room.players.length < 2 || s.room.players.some((p) => !p.online)}
              onClick={() => controller.startGame(false)}
            >
              Começar com os presentes
            </button>
            <button
              type="button"
              className="ll-button"
              disabled={s.room.players.some((p) => !p.online)}
              onClick={() => controller.startGame(true)}
            >
              Completar com bots e começar
            </button>
          </>
        ) : (
          <p>Aguardando o anfitrião.</p>
        )}
      </section>
    );
  return (
    <section className="ll-lobby">
      <span className="ll-eyebrow">UMA CARTA. UM SEGREDO. O FAVOR DA CORTE.</span>
      <h2>A quem você confia sua carta?</h2>
      <p>
        Engane os rivais, proteja seu segredo e conquiste a princesa. Regras da 2ª edição, com Espiã
        e Chanceler. Sua chamada continua conectada.
      </p>
      <div className="ll-lobby-controls">
        <label>
          Participantes{' '}
          <select
            id="loveLetterPlayerCount"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="ll-button ll-primary"
          onClick={() => controller.create(count)}
        >
          Criar mesa
        </button>
        {s.resumeId && (
          <button type="button" className="ll-button" onClick={controller.resume}>
            Retomar minha mesa
          </button>
        )}
      </div>
      <div className="ll-open-rooms">
        <h3>Mesas abertas</h3>
        <button type="button" className="ll-button" onClick={() => void controller.refreshRooms()}>
          Atualizar
        </button>
        {!s.rooms.length && <p>Crie uma mesa para convidar seus amigos ou jogar com bots.</p>}
        {s.rooms.map((r) => (
          <button
            type="button"
            className="ll-button"
            key={r.id}
            onClick={() => controller.join(r.id)}
          >
            {r.name} · {r.players}/{r.maxPlayers}
          </button>
        ))}
      </div>
    </section>
  );
}
