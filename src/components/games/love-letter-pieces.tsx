import type { LoveLetter } from '../../lib/games/love-letter';
import type {
  LoveLetterSnapshot,
  LoveLetterRules,
  LoveLetterHandCard,
  LoveLetterPlayer,
  LoveLetterState,
  LoveLetterEvent,
} from '../../types/love-letter';
import { Avatar } from '../profiles/avatar';
export interface LoveLetterView {
  snapshot: LoveLetterSnapshot;
  controller: LoveLetter;
  rules: LoveLetterRules;
}
export const shortEffects = [
  'Só você usou Espiã e sobreviveu? +1 favor.',
  'Adivinhe uma carta, exceto Guarda.',
  'Veja em segredo a mão de outra pessoa.',
  'Compare mãos. O menor valor sai.',
  'Proteção até seu próximo turno.',
  'Escolha quem descarta a mão e compra outra.',
  'Compre até 2. Guarde 1; devolva as outras ao fundo.',
  'Troque a mão com a de outra pessoa.',
  'Jogue se estiver com Príncipe ou Rei.',
  'Descartou esta carta? Você sai da rodada.',
];
export const myTurn = (s: LoveLetterSnapshot) =>
  !!s.room?.state &&
  ['action', 'chancellor'].includes(s.room.state.phase) &&
  s.room.state.players[s.room.state.turn].id === s.accountId;
export const locked = (s: LoveLetterSnapshot) => s.pending || !s.connected;
export function Portrait({
  rank,
  className = 'll-portrait',
}: {
  rank: number;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        backgroundPosition:
          (rank % 5) * 25 +
          '% ' +
          Math.floor(rank / 5) * (className === 'll-portrait' ? 75 : 100) +
          '%',
      }}
    />
  );
}
export function Seal() {
  return (
    <span className="ll-seal" aria-hidden="true">
      ⚜
    </span>
  );
}
export function Favor({ player: p, target }: { player: LoveLetterPlayer; target: number }) {
  return (
    <div className="ll-favors" aria-label={p.score + ' de ' + target + ' fichas de favor'}>
      {Array.from({ length: p.score }, (_, i) => (
        <Seal key={i} />
      ))}
      {!p.score && <small>Nenhum favor ainda</small>}
    </div>
  );
}
export function Card({
  card: c,
  rules,
  small = false,
  onClick,
  disabled = false,
  chosen = false,
  pressed,
}: {
  card: LoveLetterHandCard;
  rules: LoveLetterRules;
  small?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  chosen?: boolean;
  pressed?: boolean;
}) {
  if (c.hidden)
    return (
      <div className={'ll-card ll-back' + (small ? ' ll-small' : '')} aria-label="Carta oculta">
        <span className="ll-back-motif">⚜</span>
        <Seal />
      </div>
    );
  const d = rules.cards[c.rank],
    title = d.rank + ' · ' + d.name + ': ' + d.effect,
    props = {
      className:
        'll-card' +
        (small ? ' ll-small' : '') +
        (chosen ? ' ll-chosen' : '') +
        (pressed ? ' ll-selected' : ''),
      'data-ll-card': c.id,
      title,
      'aria-label': title,
    };
  const contents = (
    <>
      <Portrait rank={c.rank} className="ll-card-art" />
      <b className="ll-rank">{c.rank}</b>
      <i className="ll-suit">⚜</i>
      <span className="ll-card-copy">
        <strong>{d.name.toLocaleUpperCase('pt-BR')}</strong>
        {!small && <small>{shortEffects[c.rank]}</small>}
      </span>
    </>
  );
  return onClick ? (
    <button {...props} type="button" disabled={disabled} aria-pressed={pressed} onClick={onClick}>
      {contents}
    </button>
  ) : (
    <div {...props}>{contents}</div>
  );
}
export function PlayerAvatar({
  id,
  rank,
  snapshot: s,
}: {
  id: string;
  rank: number;
  snapshot: LoveLetterSnapshot;
}) {
  const profile = s.room!.players.find((p) => p.id === id);
  return (
    <span className="ll-avatar">
      {profile?.avatar_preset ? (
        <Avatar
          person={{ avatar_preset: profile.avatar_preset, avatar_file_id: profile.avatar_file_id }}
          className="ll-profile-avatar"
        />
      ) : (
        <Portrait rank={rank} />
      )}{' '}
      {profile?.online && <i className="ll-online" title="Online" />}
    </span>
  );
}
export function Target({ id, ...props }: LoveLetterView & { id: string }) {
  const { snapshot: s, controller, rules } = props,
    state = s.room!.state!,
    choice = s.selected,
    c = state.players
      .find((p) => p.id === s.accountId)
      ?.hand.find((c) => !c.hidden && c.id === choice?.cardId);
  if (
    !choice ||
    !c ||
    c.hidden ||
    ![1, 2, 3, 5, 7].includes(c.rank) ||
    locked(s) ||
    !rules.eligible(state, c.rank).includes(id)
  )
    return null;
  return (
    <button
      type="button"
      className="ll-target-hit"
      data-target-id={id}
      onClick={() => void controller.chooseTarget(id)}
    >
      Usar {rules.cards[c.rank].name} em {state.players.find((p) => p.id === id)!.name}
    </button>
  );
}
export function isTarget(props: LoveLetterView, id: string) {
  const { snapshot: s, rules } = props,
    state = s.room!.state!,
    c = state.players
      .find((p) => p.id === s.accountId)
      ?.hand.find((c) => !c.hidden && c.id === s.selected?.cardId);
  return (
    !!c &&
    !c.hidden &&
    !locked(s) &&
    [1, 2, 3, 5, 7].includes(c.rank) &&
    rules.eligible(state, c.rank).includes(id)
  );
}
export function personName(s: LoveLetterState, id: string) {
  return s.players.find((p) => p.id === id)?.name ?? 'Cortesão';
}
export function eventText(e: LoveLetterEvent, s: LoveLetterState, R: LoveLetterRules) {
  const who = personName(s, e.playerId),
    target = e.targetId ? personName(s, e.targetId) : null;
  if (e.kind === 'round-start') return 'Nova rodada · ' + who + ' começa.';
  if (e.kind === 'chancellor')
    return who + ' guardou uma carta e devolveu as demais ao fundo, em segredo.';
  let text = who + ' jogou ' + R.cards[e.card!.rank].name + (target ? ' em ' + target : '') + '. ';
  if (e.noTarget) text += 'Não havia alvo disponível. ';
  else if (e.card!.rank === 0) text += 'Espiã registrada: pode render favor se sobreviver. ';
  else if (e.card!.rank === 1)
    text +=
      'Palpite: ' + R.cards[e.guess!].name + '. ' + (e.missed ? 'Não acertou. ' : 'Acertou! ');
  else if (e.card!.rank === 2) text += 'Somente ' + who + ' viu a carta de ' + target + '. ';
  else if (e.card!.rank === 3)
    text += e.tied ? 'Mãos empatadas; ninguém sai. ' : 'O menor valor foi eliminado. ';
  else if (e.card!.rank === 4) text += who + ' fica protegido até seu próximo turno. ';
  else if (e.card!.rank === 5)
    text +=
      'Descartou ' +
      R.cards[e.discarded!.rank].name +
      (e.eliminated.length ? '. ' : ' e comprou outra carta, oculta. ');
  else if (e.card!.rank === 6) text += who + ' está escolhendo o que guardar e devolver. ';
  else if (e.card!.rank === 7) text += 'As duas mãos foram trocadas em segredo. ';
  else if (e.card!.rank === 8) text += 'A Condessa foi descartada. ';
  if (e.eliminated.length)
    text += 'Fora da rodada: ' + e.eliminated.map((id) => personName(s, id)).join(', ') + '.';
  if (e.roundResult) {
    text +=
      ' Rodada encerrada: ' +
      e.roundResult.winners.map((id) => personName(s, id)).join(' e ') +
      ' recebe(m) +1 favor.';
    if (e.roundResult.spyWinner)
      text += ' ' + personName(s, e.roundResult.spyWinner) + ' recebe +1 pela Espiã.';
  }
  return text.trim();
}
