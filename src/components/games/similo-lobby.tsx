import type { Dispatch, SetStateAction } from 'react';
import type { SimiloController, SimiloSnapshot } from '../../lib/games/similo/controller';
import type { SimiloSettings } from '../../types/similo';
import type { ThemeId } from '../../lib/games/similo/catalog';
import { Avatar } from '../profiles/avatar';
import { AppIcon as Icon } from '../application/icons';
import { Portrait, DeckPicker } from './similo-pieces';
import styles from './similo.module.css';
type Settings = Omit<SimiloSettings, 'narratorId'>;
export function SimiloLobby({
  s,
  draft,
  setDraft,
  controller,
  locked,
  host,
  themes,
}: {
  s: SimiloSnapshot;
  draft: Settings;
  setDraft: Dispatch<SetStateAction<Settings>>;
  controller: SimiloController;
  locked: boolean;
  host: boolean;
  themes: (label: 'boardThemes' | 'clueThemes', v: ThemeId[]) => void;
}) {
  const room = s.room,
    settings = room?.settings || draft;
  return (
    <main className={styles.lobbyMain}>
      <section className={styles.intro}>
        <span className={styles.eyebrow}>DEDUÇÃO COOPERATIVA · 2–8 PESSOAS</span>
        <h1>
          Uma pista.
          <br />
          <em>Mil conexões.</em>
        </h1>
        <p>
          Doze cartas, um segredo. Leia as conexões, troque ideias e deixe a carta certa para o
          final.
        </p>
        <div className={styles.fan} aria-hidden="true">
          {['history-0', 'animals-0', 'myths-0'].map((id) => (
            <Portrait key={id} id={id} />
          ))}
        </div>
        <p className={styles.miniRule}>
          5 rodadas · Elimine 1 → 2 → 3 → 4 → 1<br />O capitão da rodada resolve divergências.
        </p>
        {room && (
          <section className={styles.members}>
            <h2>Mesa {room.id}</h2>
            {room.players.map((p) => (
              <div key={p.id}>
                <Avatar
                  person={{ ...p, avatar_preset: p.avatar_preset ?? undefined }}
                  className={styles.avatar}
                />
                <strong>{p.name}</strong>
                <span>{p.id === room.settings.narratorId ? 'Informante' : 'Adivinhador'}</span>
              </div>
            ))}
            <p>Compartilhe o código ou peça para entrar na lista de mesas abertas.</p>
          </section>
        )}
      </section>
      <div className={styles.setup}>
        <div className={styles.setupTitle}>
          <div>
            <span className={styles.eyebrow}>{room ? 'LOBBY COMPARTILHADO' : 'CRIE SUA MESA'}</span>
            <h2>{room ? 'Todos prontos?' : 'Baralhos que se conectam'}</h2>
          </div>
          <span className={styles.pill}>120 cartas ilustradas</span>
        </div>
        <DeckPicker
          label="Cartas dos adivinhadores"
          selected={settings.boardThemes}
          onChange={(v) => themes('boardThemes', v)}
          disabled={!!room && (!host || locked)}
        />
        <DeckPicker
          label="Cartas do informante"
          selected={settings.clueThemes}
          onChange={(v) => themes('clueThemes', v)}
          disabled={!!room && (!host || locked)}
        />
        <div className={styles.lobbyActions}>
          <label>
            Vagas na mesa
            <select
              value={settings.maxPlayers}
              disabled={!!room && (!host || locked)}
              onChange={(e) => {
                const maxPlayers = Number(e.target.value);
                if (room) void controller.configure({ ...room.settings, maxPlayers });
                else setDraft({ ...draft, maxPlayers });
              }}
            >
              {Array.from({ length: 7 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n} disabled={!!room && n < room.players.length}>
                  {n} pessoas
                </option>
              ))}
            </select>
          </label>
          {room && (
            <label>
              Quem dá as pistas?
              <select
                value={room.settings.narratorId}
                disabled={!host || locked}
                onChange={(e) =>
                  void controller.configure({ ...room.settings, narratorId: e.target.value })
                }
              >
                {room.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {room ? (
            <button
              className={styles.primary}
              disabled={!host || locked || room.players.length < 2}
              onClick={() => void controller.startGame()}
            >
              {host ? 'Começar partida' : 'Aguardando o anfitrião'}
            </button>
          ) : (
            <button
              className={styles.primary}
              disabled={
                s.pending || !s.connected || !draft.boardThemes.length || !draft.clueThemes.length
              }
              onClick={() => void controller.create(draft)}
            >
              Criar mesa online <Icon name="arrow" />
            </button>
          )}
        </div>
        {!room && (
          <section className={styles.openRooms}>
            <h3>Mesas abertas</h3>
            <button onClick={() => void controller.refresh()} disabled={s.pending}>
              Atualizar lista
            </button>
            {s.resumeId && (
              <button
                className={styles.primary}
                onClick={() => void controller.resume()}
                disabled={s.pending}
              >
                Retomar minha mesa
              </button>
            )}
            {s.rooms.length ? (
              s.rooms.map((r) => (
                <button key={r.id} onClick={() => void controller.join(r.id)} disabled={s.pending}>
                  <span>
                    {r.name} · {r.id}
                  </span>
                  <strong>
                    Entrar · {r.players}/{r.maxPlayers}
                  </strong>
                </button>
              ))
            ) : (
              <p>Nenhuma mesa aberta. Crie a sua e convide alguém.</p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
