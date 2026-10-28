import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { SimiloController } from '../../lib/games/similo/controller';
import type { GameFullscreen } from '../../lib/games/fullscreen';
import type { SimiloSettings } from '../../types/similo';
import { getCard, type ThemeId } from '../../lib/games/similo/catalog';
import { captain, consensus, ELIMINATIONS, type Relation } from '../../lib/games/similo/rules';
import { AppIcon as Icon } from '../application/icons';
import { Avatar } from '../profiles/avatar';
import { CardSlot, Portrait, InfoText, Modal } from './similo-pieces';
import styles from './similo.module.css';
import { SimiloLobby } from './similo-lobby';
const COLORS = ['#86c6ac', '#e3a786', '#b2a2e5', '#dcc178', '#82b9de', '#dd92b0', '#a8c478'];
type Settings = Omit<SimiloSettings, 'narratorId'>;
export function SimiloContents({
  controller,
  fullscreen,
  back,
  sound,
}: {
  controller: SimiloController;
  fullscreen: GameFullscreen;
  back: () => void;
  sound: (kind: string) => void;
}) {
  const s = useSyncExternalStore(
      controller.subscribe,
      controller.getSnapshot,
      controller.getSnapshot,
    ),
    full = useSyncExternalStore(
      fullscreen.subscribe,
      fullscreen.getSnapshot,
      fullscreen.getSnapshot,
    ),
    room = s.room,
    g = room?.state;
  const [draft, setDraft] = useState<Settings>({
      boardThemes: ['animals'],
      clueThemes: ['animals'],
      maxPlayers: 5,
    }),
    [inspection, setInspection] = useState<{ id: string; scope: string } | null>(null),
    [help, setHelp] = useState(false),
    [leave, setLeave] = useState(false),
    [muted, setMuted] = useState(false),
    [selection, setSelection] = useState<string[]>([]),
    [clue, setClue] = useState<string | null>(null),
    [relation, setRelation] = useState<Relation>('like'),
    [final, setFinal] = useState<string[]>([]),
    [localNotice, setLocalNotice] = useState('');
  const scope = `${s.accountId}:${room?.id}:${g?.id}`;
  const inspect = inspection?.scope === scope ? inspection.id : null;
  const setInspect = (id: string | null) => setInspection(id ? { id, scope } : null);
  const active = !!s.visible,
    host = room?.hostId === s.accountId,
    narrator = g?.config.narrator === s.accountId,
    voter = g?.config.guessers.indexOf(s.accountId || '') ?? -1,
    vote = g?.votes[voter],
    quota = g ? ELIMINATIONS[g.round] : 1,
    agreement = g ? consensus(g) : null,
    captainIndex = g ? captain(g) : -1,
    captainId = g?.config.guessers[captainIndex],
    isCaptain = captainId === s.accountId,
    allConfirmed = !!g && g.phase === 'vote' && agreement?.confirmed === g.config.guessers.length,
    locked = s.pending || !s.connected || !!room?.players.some((p) => !p.online),
    readyChoice = agreement?.ready ? agreement.selected : final;
  const name = (id: string | null | undefined) =>
    room?.players.find((p) => p.id === id)?.name || 'Participante';
  useEffect(() => {
    setSelection([]);
    setFinal([]);
    setClue(null);
    setInspect(null);
    setLocalNotice('');
  }, [room?.id, g?.round, g?.id, s.accountId]);
  useEffect(() => {
    if (!active) {
      setInspect(null);
      setHelp(false);
      setLeave(false);
    }
  }, [active]);
  useEffect(() => {
    if (vote) setSelection([...vote.selected]);
  }, [vote?.selected.join('|'), vote?.confirmed, g?.round]);
  useEffect(() => {
    if (!g || !active) return;
    setClue(null);
    setFinal([]);
    setLocalNotice('');
    if (!muted)
      sound(
        g.phase === 'clue'
          ? 'similo-card'
          : g.phase === 'vote'
            ? 'similo-card'
            : g.phase === 'resolving'
              ? 'similo-resolve'
              : g.won
                ? 'similo-win'
                : 'similo-lose',
      );
  }, [g?.id, g?.phase, g?.round]);
  function notify(kind: string) {
    if (!muted) sound(kind);
  }
  function toggle(id: string) {
    if (!g || locked || g.phase !== 'vote' || narrator || g.eliminated.includes(id)) return;
    const decision = allConfirmed && isCaptain && agreement?.disagreement;
    if (!decision && vote?.confirmed) return;
    const chosen = decision ? final : selection;
    setLocalNotice('');
    if (!chosen.includes(id) && chosen.length >= quota) {
      setLocalNotice(`Marque exatamente ${quota} carta(s). Desmarque uma para trocar.`);
      return;
    }
    const next = chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id];
    if (decision) setFinal(next);
    else setSelection(next);
    notify('similo-tap');
  }
  function themes(label: 'boardThemes' | 'clueThemes', v: ThemeId[]) {
    if (room) {
      if (v.length) void controller.configure({ ...room.settings, [label]: v });
    } else setDraft({ ...draft, [label]: v });
  }

  const subtitle = !g
    ? 'Prepare seus baralhos e convide a mesa.'
    : g.phase === 'finished'
      ? g.won
        ? 'A mesa encontrou a conexão!'
        : 'A carta secreta foi eliminada.'
      : g.phase === 'clue'
        ? narrator
          ? 'Sua vez: escolha uma pista e indique a relação.'
          : `Aguarde a pista de ${name(g.config.narrator)}.`
        : g.phase === 'resolving'
          ? 'Revelando a escolha da mesa…'
          : allConfirmed
            ? agreement?.disagreement
              ? `${name(captainId)} decide: os votos divergiram.`
              : `${name(captainId)} pode confirmar a seleção unânime.`
            : `Vote em ${quota} carta${quota > 1 ? 's' : ''} para eliminar.`;
  return (
    <div
      className={`${styles.similo} ${g ? styles.playing : styles.lobby}`}
      data-phase={g?.phase || 'lobby'}
      data-round={g ? g.round + 1 : undefined}
    >
      <header className={styles.header}>
        <button className={styles.back} onClick={back} aria-label="Voltar aos jogos">
          <Icon name="back" />
        </button>
        <div className={styles.brand}>
          <Icon name="eye" size={28} />
          <span>
            SIMILO<small>CONEXÕES À MESA</small>
          </span>
        </div>
        <span className={styles.connection}>{s.connected ? 'Mesa online' : 'Reconectando…'}</span>
        <nav aria-label="Controles do Similo">
          <span id="similoShellControls" className={styles.shellControls} />
          <span data-game-audio-slot="similo" />
          <button className={styles.help} onClick={() => setHelp(true)}>
            Como jogar
          </button>
          <button
            aria-label={muted ? 'Ativar sons do Similo' : 'Silenciar sons do Similo'}
            aria-pressed={!muted}
            onClick={() => setMuted(!muted)}
          >
            <Icon name={muted ? 'eyeSlash' : 'music'} />
          </button>
          <button
            aria-label="Tela cheia do Similo"
            aria-pressed={full.active}
            onClick={() => void fullscreen.toggle()}
          >
            <Icon name="expand" />
          </button>
          {room && <button onClick={() => setLeave(true)}>Sair da mesa</button>}
        </nav>
      </header>
      {(s.notice || localNotice) && (
        <p role="status" className={styles.notice}>
          {s.notice || localNotice}
        </p>
      )}
      {room?.players.some((p) => !p.online) && (
        <p role="status" className={styles.notice}>
          Partida pausada: aguardando{' '}
          {room.players
            .filter((p) => !p.online)
            .map((p) => p.name)
            .join(', ')}{' '}
          reconectar (até 90 segundos).
        </p>
      )}
      {!g ? (
        <SimiloLobby
          s={s}
          draft={draft}
          setDraft={setDraft}
          controller={controller}
          locked={locked}
          host={host}
          themes={themes}
        />
      ) : (
        <>
          <section className={styles.roundbar} aria-label="Andamento da partida">
            <div>
              <span className={styles.eyebrow}>
                RODADA {g.round + 1} DE 5 · {g.board.length - g.eliminated.length} CARTAS NA MESA
              </span>
              <h1 aria-live="polite">{subtitle}</h1>
            </div>
            <ol aria-label="Cartas a eliminar por rodada">
              {ELIMINATIONS.map((q, i) => (
                <li
                  key={i}
                  aria-current={i === g.round ? 'step' : undefined}
                  data-done={i < g.round}
                >
                  <small>{i + 1}ª</small>
                  {q}
                </li>
              ))}
            </ol>
          </section>
          {g.phase === 'finished' && (
            <section
              role="status"
              className={`${styles.result} ${g.won ? styles.win : styles.loss}`}
            >
              <Icon name={g.won ? 'check' : 'eye'} size={28} />
              <div>
                <strong>{g.won ? 'Vocês venceram!' : 'Quase! Vamos tentar outra conexão?'}</strong>
                <p>A carta secreta era {getCard(g.secretId!).name}.</p>
              </div>
              {host && (
                <button
                  className={styles.primary}
                  disabled={locked}
                  onClick={() => void controller.rematch()}
                >
                  Jogar novamente
                </button>
              )}
            </section>
          )}
          <main className={styles.tableLayout}>
            <section className={styles.boardArea} aria-label="Mesa de cartas">
              <div className={styles.board} data-testid="similo-board">
                {g.board.map((id, i) => {
                  const eliminated = g.eliminated.includes(id),
                    revealing = g.pending.includes(id),
                    secret = id === g.secretId,
                    selected = (
                      allConfirmed && isCaptain && agreement?.disagreement ? final : selection
                    ).includes(id),
                    canChoose =
                      g.phase === 'vote' &&
                      !narrator &&
                      !locked &&
                      !eliminated &&
                      (!vote?.confirmed || (allConfirmed && isCaptain && agreement?.disagreement));
                  const voters = g.config.guessers
                    .map((person, index) => ({ person, index }))
                    .filter(({ index }) => g.votes[index]?.selected.includes(id));
                  return (
                    <CardSlot
                      key={id}
                      id={id}
                      inspect={setInspect}
                      className={`${eliminated && !(secret && g.phase === 'finished') ? styles.eliminated : ''} ${revealing ? styles.revealing : ''} ${selected ? styles.selected : ''} ${secret && (narrator || g.phase === 'finished') ? styles.secret : ''}`}
                      style={
                        {
                          '--delay': `${g.pending.indexOf(id) * 140}ms`,
                          '--deal': `${i * 30}ms`,
                        } as CSSProperties
                      }
                    >
                      <button
                        className={styles.cardButton}
                        aria-label={`${canChoose ? 'Selecionar' : 'Ver'} ${getCard(id).name}${eliminated ? ' — eliminada' : ''}${secret && (narrator || g.phase === 'finished') ? ' — carta secreta' : ''}`}
                        aria-pressed={canChoose ? selected : undefined}
                        disabled={eliminated && !(secret && g.phase === 'finished')}
                        onClick={() => (canChoose ? toggle(id) : setInspect(id))}
                      >
                        <Portrait id={id} />
                        {secret && (narrator || g.phase === 'finished') && (
                          <span className={styles.secretMark}>CARTA SECRETA</span>
                        )}
                        {eliminated && <span className={styles.eliminatedMark}>Eliminada</span>}
                      </button>
                      <div className={styles.tokens}>
                        {voters.slice(0, 3).map(({ person, index }) => (
                          <span
                            key={person}
                            className={styles.token}
                            role="img"
                            style={{ '--voter': COLORS[index] } as CSSProperties}
                            title={`${name(person)}${g.votes[index].confirmed ? ' confirmou' : ''}`}
                            aria-label={`Voto de ${name(person)}`}
                            data-confirmed={g.votes[index].confirmed}
                          >
                            {name(person).slice(0, 1).toUpperCase()}
                            {g.votes[index].confirmed && <b>✓</b>}
                          </span>
                        ))}
                        {voters.length > 3 && (
                          <span
                            className={styles.token}
                            role="img"
                            style={{ '--voter': '#e1ce9a' } as CSSProperties}
                            title={voters
                              .slice(3)
                              .map((v) => name(v.person))
                              .join(', ')}
                            aria-label={`Mais ${voters.length - 3} votos: ${voters
                              .slice(3)
                              .map((v) => name(v.person))
                              .join(', ')}`}
                          >
                            +{voters.length - 3}
                          </span>
                        )}
                      </div>
                    </CardSlot>
                  );
                })}
              </div>
            </section>
            <aside className={styles.sidebar}>
              <div className={styles.role}>
                <span className={styles.eyebrow}>SEU PAPEL</span>
                <strong>
                  {narrator
                    ? 'Informante de pistas'
                    : isCaptain
                      ? 'Capitão dos adivinhadores'
                      : 'Adivinhador'}
                </strong>
                <p>
                  {narrator
                    ? 'Só você vê o segredo. Dê pistas com cartas, sem falar sobre a solução.'
                    : isCaptain
                      ? 'Ouça a mesa. Nesta rodada, você decide quando os votos divergem.'
                      : 'Marque as cartas que devem sair e confirme seu voto.'}
                </p>
                {narrator && g.secretId && (
                  <button className={styles.secretPeek} onClick={() => setInspect(g.secretId)}>
                    <Icon name="eye" />
                    Segredo: {getCard(g.secretId).name}
                  </button>
                )}
              </div>
              <section className={styles.members}>
                <h2>A mesa</h2>
                {room.players.map((p) => {
                  const index = g.config.guessers.indexOf(p.id),
                    v = g.votes[index];
                  return (
                    <div key={p.id} data-self={p.id === s.accountId}>
                      <Avatar
                        person={{ ...p, avatar_preset: p.avatar_preset ?? undefined }}
                        className={styles.avatar}
                      />
                      <div>
                        <strong>
                          {p.name}
                          {p.id === s.accountId ? ' (você)' : ''}
                        </strong>
                        <small>
                          {p.id === g.config.narrator
                            ? 'Informante'
                            : p.id === captainId
                              ? '♛ Capitão da rodada'
                              : 'Adivinhador'}
                        </small>
                      </div>
                      {v && (
                        <span className={styles.voteStatus}>
                          {v.confirmed
                            ? '✓ Confirmou'
                            : g.phase === 'vote'
                              ? 'Votando…'
                              : 'Aguarda pista'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </section>
              <section className={styles.decision} aria-live="polite">
                <span className={styles.eyebrow}>
                  {allConfirmed ? 'DECISÃO DA RODADA' : 'PRÓXIMO PASSO'}
                </span>
                <h2>
                  {g.phase === 'finished'
                    ? 'Fim de partida'
                    : g.phase === 'resolving'
                      ? 'Revelando…'
                      : narrator
                        ? 'Conecte sem palavras'
                        : allConfirmed
                          ? agreement?.disagreement
                            ? 'O capitão decide'
                            : 'A mesa concordou'
                          : `Elimine ${quota} carta${quota > 1 ? 's' : ''}`}
                </h2>
                <p>
                  {g.phase === 'clue'
                    ? narrator
                      ? 'Escolha uma carta da mão abaixo. Ela se parece com o segredo ou é diferente?'
                      : `Aguarde a pista de ${name(g.config.narrator)}.`
                    : g.phase === 'resolving'
                      ? 'A escolha será revelada para todos ao mesmo tempo.'
                      : g.phase === 'finished'
                        ? 'A última carta deve ser o segredo. Cinco boas conexões vencem.'
                        : allConfirmed
                          ? agreement?.disagreement
                            ? isCaptain
                              ? `Marque ${quota} carta(s) na mesa para sua decisão final. Os votos continuam visíveis.`
                              : `Aguarde ${name(captainId)} escolher a seleção final.`
                            : `${name(captainId)} confirma as cartas escolhidas por todos.`
                          : `${agreement?.confirmed}/${g.config.guessers.length} votos confirmados. ${!narrator ? `${selection.length}/${quota} na sua seleção.` : ''}`}
                </p>
                {g.phase === 'vote' && !narrator && !allConfirmed && (
                  <button
                    className={styles.primary}
                    disabled={locked || (!vote?.confirmed && selection.length !== quota)}
                    onClick={() => {
                      if (vote?.confirmed) void controller.move({ kind: 'reopen' });
                      else {
                        notify('similo-vote');
                        void controller.move({
                          kind: 'vote',
                          selected: selection,
                          confirmed: true,
                        });
                      }
                    }}
                  >
                    {vote?.confirmed
                      ? 'Alterar meu voto'
                      : `Confirmar ${quota} carta${quota > 1 ? 's' : ''}`}
                  </button>
                )}
                {allConfirmed && isCaptain && (
                  <button
                    className={styles.primary}
                    disabled={locked || readyChoice.length !== quota}
                    onClick={() => void controller.move({ kind: 'resolve', selected: readyChoice })}
                  >
                    Eliminar {quota} carta{quota > 1 ? 's' : ''}
                  </button>
                )}
                {g.phase === 'vote' && vote?.confirmed && allConfirmed && (
                  <button
                    className={styles.quiet}
                    disabled={locked}
                    onClick={() => void controller.move({ kind: 'reopen' })}
                  >
                    Alterar meu voto
                  </button>
                )}
              </section>
            </aside>
          </main>
          <footer className={styles.dock}>
            <div className={styles.dockTitle}>
              <strong>
                {narrator && g.phase === 'clue' ? 'Sua mão de pistas' : 'Pistas na mesa'}
              </strong>
              <span>
                {narrator && g.phase === 'clue'
                  ? 'Escolha 1 carta para a rodada.'
                  : 'Vertical = parece · Horizontal = diferente'}
              </span>
            </div>
            {narrator && g.phase === 'clue' ? (
              <div className={styles.clueComposer}>
                <div className={styles.hand}>
                  {g.hand.map((id) => (
                    <CardSlot
                      key={id}
                      id={id}
                      inspect={setInspect}
                      className={clue === id ? styles.selected : ''}
                    >
                      <button
                        className={styles.cardButton}
                        aria-label={`Escolher pista ${getCard(id).name}`}
                        aria-pressed={clue === id}
                        disabled={locked}
                        onClick={() => {
                          setClue(id);
                          notify('similo-tap');
                        }}
                      >
                        <Portrait id={id} />
                      </button>
                    </CardSlot>
                  ))}
                </div>
                <div className={styles.clueActions}>
                  <div className={styles.relations}>
                    <button aria-pressed={relation === 'like'} onClick={() => setRelation('like')}>
                      ↟ Parece com
                      <br />
                      <small>pista vertical</small>
                    </button>
                    <button
                      aria-pressed={relation === 'unlike'}
                      onClick={() => setRelation('unlike')}
                    >
                      ↔ É diferente
                      <br />
                      <small>pista horizontal</small>
                    </button>
                  </div>
                  <button
                    className={styles.primary}
                    disabled={!clue || locked}
                    onClick={() => {
                      if (clue) void controller.move({ kind: 'clue', cardId: clue, relation });
                    }}
                  >
                    Jogar pista
                  </button>
                  <p>{clue ? getCard(clue).name : 'Selecione uma carta da sua mão.'}</p>
                </div>
              </div>
            ) : (
              <div className={styles.history}>
                {g.clues.length ? (
                  g.clues.map((c) => (
                    <div key={c.round} className={styles.clueHistory}>
                      <span>
                        {c.round + 1}ª pista ·{' '}
                        {c.relation === 'like' ? 'Parece com' : 'É diferente'}
                      </span>
                      <CardSlot
                        id={c.cardId}
                        inspect={setInspect}
                        className={c.relation === 'unlike' ? styles.unlike : ''}
                      >
                        <button
                          className={styles.cardButton}
                          aria-label={`Ver pista ${getCard(c.cardId).name}`}
                          onClick={() => setInspect(c.cardId)}
                        >
                          <Portrait id={c.cardId} />
                        </button>
                      </CardSlot>
                    </div>
                  ))
                ) : (
                  <p className={styles.empty}>
                    A primeira conexão está chegando. As pistas ficam aqui durante toda a partida.
                  </p>
                )}
              </div>
            )}
          </footer>
        </>
      )}
      {active && help && (
        <Modal title="Como jogar Similo" close={() => setHelp(false)}>
          <div className={styles.rules}>
            <p>
              Jogo cooperativo de 2 a 8 pessoas. O informante conhece uma carta secreta entre as 12
              cartas da mesa. Os outros precisam deixá-la por último.
            </p>
            <ol>
              <li>
                O informante escolhe uma de suas cinco cartas: vertical indica semelhança;
                horizontal indica diferença. A conexão pode ser visual, temática ou conceitual. Sem
                explicar a pista em palavras.
              </li>
              <li>
                Os adivinhadores discutem, selecionam e confirmam as cartas a eliminar: 1, 2, 3, 4 e
                1 nas cinco rodadas.
              </li>
              <li>
                O capitão muda a cada rodada, na ordem da lista. Após todos votarem, ele confirma o
                consenso ou escolhe a seleção final se houver divergência. Essa é a variante de
                capitão desta mesa.
              </li>
              <li>
                Eliminar o segredo encerra a partida com derrota. Se a última carta for o segredo,
                todos vencem.
              </li>
              <li>
                Escolha até dois temas para a mesa e até dois para as pistas, independentemente. A
                mesma carta não aparece simultaneamente na mesa e no baralho de pistas.
              </li>
            </ol>
            <p>
              Passe o mouse ou foque o “i” para ler uma curiosidade. Toque no “i” para ampliar.
              Todos podem consultar essas informações; datas aproximadas e espécies de referência
              estão identificadas.
            </p>
          </div>
        </Modal>
      )}
      {active && inspect && (
        <Modal title={getCard(inspect).name} close={() => setInspect(null)}>
          <div className={styles.inspection}>
            <Portrait id={inspect} />
            <div>
              <InfoText id={inspect} />
            </div>
          </div>
        </Modal>
      )}
      {active && leave && (
        <Modal title="Sair da mesa?" close={() => setLeave(false)}>
          <p>
            {g
              ? 'Sair encerra esta partida para todos. Você pode voltar ao catálogo sem sair da mesa.'
              : 'Sua cadeira será liberada.'}
          </p>
          <div className={styles.modalActions}>
            <button onClick={() => setLeave(false)}>Continuar na mesa</button>
            <button
              className={styles.primary}
              onClick={() => {
                setLeave(false);
                void controller.leave();
              }}
            >
              Confirmar saída
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
