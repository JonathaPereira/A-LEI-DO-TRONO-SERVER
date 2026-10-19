import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { ThroneHand } from '../../lib/games/throne-hand';
import { throneSuits } from '../../lib/games/throne-choice-protocol';
import { GameDialog } from './game-dialog';
import './throne-hand.css';

const names = { cetro: 'Cetro', chave: 'Chave', lamina: 'Lâmina', mascara: 'Máscara' };
const actions = { none: 'Nenhuma', sigilo: 'Sigilo', plus: 'Manobra +3', minus: 'Manobra -3' };
export function ThroneHandContents({
  controller,
  dialogHost,
  mode,
}: {
  controller: ThroneHand;
  dialogHost: HTMLElement;
  mode: 'local' | 'online';
}) {
  const s = useSyncExternalStore(
      controller.subscribe,
      controller.getSnapshot,
      controller.getSnapshot,
    ),
    c = s.mode === mode ? s.context : null;
  const local = mode === 'local',
    demo = local && s.mode === mode && s.demo,
    dialogId = local ? 'throneLocalHandDialog' : 'throneHandDialog';
  const awaiting = !!c && !c.automaticReserve && c.phase === 'await-play' && c.turn === c.you,
    usable = awaiting && c.canUseInfluence && !s.pending,
    hidden = !!c && s.action !== 'none';
  const legal = c
    ? hidden
      ? c.hiddenLegal.filter(
          (id) => !c.opening || c.hand.find((card) => card.id === id)?.suit === s.declaredSuit,
        )
      : c.legal
    : [];
  const hand = c ? [...c.hand] : [];
  if (s.sorted)
    hand.sort(
      (a, b) => throneSuits.indexOf(a.suit) - throneSuits.indexOf(b.suit) || a.value - b.value,
    );
  const instruction =
    s.notice ||
    (s.pending
      ? 'Enviando jogada ao servidor...'
      : awaiting
        ? hidden && c.opening
          ? s.declaredSuit
            ? `${actions[s.action]}: escolha uma carta de ${names[s.declaredSuit]}.`
            : 'Influência ativa: anuncie primeiro o naipe.'
          : 'Sua vez: escolha uma carta válida.'
        : c?.automaticReserve && c.phase === 'await-play' && c.turn === c.you
          ? 'A Reserva será jogada automaticamente.'
          : c?.phase === 'game-over'
            ? 'Partida encerrada.'
            : 'Aguarde sua vez.');
  const status = !c
    ? '0/2 • indisponível'
    : c.influenceBlocked
      ? `${c.influence}/2 • ${c.decreeName} bloqueia o uso`
      : !c.influence
        ? '0/2 • ganhe 1 ao ficar sem Coroa/Sombra'
        : hidden
          ? `${c.influence}/2 • ${actions[s.action]} selecionado`
          : c.influence === 1
            ? '1/2 • Sigilo disponível'
            : '2/2 • Sigilo ou Manobra disponíveis';
  return (
    <>
      <div className="hand-toolbar">
        <div>
          <strong id={local ? 'handTitle' : undefined}>
            {demo
              ? 'Modo demonstração'
              : `Sua mão • ${hand.length}${c?.reserve ? ' + Reserva' : ''}`}
          </strong>
          <span id={local ? 'instructionText' : 'throneHandInstruction'} role="status">
            {demo ? 'Acompanhe a Crônica da Corte.' : instruction}
          </span>
        </div>
        <div className="hand-actions">
          <button
            className="small-btn"
            id={local ? 'sortHandBtn' : 'throneHandSort'}
            disabled={!c || demo}
            onClick={() => controller.sort()}
          >
            Ordenar
          </button>
          <label
            id={local ? 'influenceToggleWrap' : 'throneHandInfluenceWrap'}
            className={`influence-toggle ${c && c.influence >= 1 && !c.influenceBlocked ? 'ready' : ''} ${usable && c.opening ? 'opening-ready' : ''} ${!usable ? 'disabled' : ''}`}
          >
            <input
              type="checkbox"
              id={local ? 'influenceToggle' : 'throneHandInfluence'}
              disabled={!usable}
              checked={!!c && (hidden || !!s.dialog)}
              onChange={(e) => c && controller.toggleInfluence(c, e.target.checked)}
            />
            <span className="influence-emblem">✦</span>
            <span className="influence-copy">
              <strong>INFLUÊNCIA</strong>
              <small id={local ? 'influenceStatusText' : undefined}>{demo ? '—' : status}</small>
            </span>
            <span className="influence-action">USAR</span>
          </label>
        </div>
      </div>
      <div
        id={local ? 'humanHand' : 'throneOnlineHandCards'}
        className="hand"
        aria-label="Sua mão"
        aria-busy={s.pending}
      >
        {demo && (
          <div className="throne-demo-hand">
            Modo simulação: quatro casas jogam automaticamente.
          </div>
        )}
        {hand.map((card) => {
          const locked = !awaiting || s.pending || !!s.dialog || !s.visible,
            illegal = awaiting && !legal.includes(card.id);
          return (
            <button
              type="button"
              key={card.id}
              data-card={card.id}
              disabled={locked || illegal}
              className={`hand-card ${card.public ? 'public' : ''} ${card.publicReason === 'Corte Aberta' ? 'corte-open-hand' : ''} ${card.publicReason === 'Desafio' ? 'desafio-open-hand' : ''} ${illegal ? 'illegal' : ''} ${locked ? 'locked' : ''}`}
              onClick={(event) => {
                const r = event.currentTarget.getBoundingClientRect();
                if (c)
                  controller.play(c, card.id, {
                    left: r.left,
                    top: r.top,
                    width: r.width,
                    height: r.height,
                  });
              }}
            >
              <img
                src={`assets/cards/${card.suit}_${String(card.value).padStart(2, '0')}.webp`}
                alt={`${names[card.suit]} ${card.value}${card.publicReason ? ' • ' + card.publicReason : ''}`}
              />
            </button>
          );
        })}
      </div>
      {createPortal(
        <GameDialog
          id={dialogId}
          className="throne-choice-dialog"
          aria-labelledby={`${dialogId}Title`}
          visible={!!c && !!s.dialog && s.visible}
          onDismiss={() => controller.dismiss()}
        >
          <div className="modal-card">
            <h2 id={`${dialogId}Title`}>
              {s.dialog === 'suit' ? 'Anuncie o naipe' : 'Influência da Corte'}
            </h2>
            <p>
              {s.dialog === 'suit'
                ? 'Ao abrir a vaza com Influência, anuncie o naipe real da carta antes de jogá-la.'
                : 'A carta continua oculta. O uso de Influência e a Manobra escolhida serão anunciados para todos.'}
            </p>
            <div className="choice-grid">
              {c && s.dialog === 'influence' && (
                <>
                  <button
                    className="choice-card"
                    data-influence="sigilo"
                    onClick={() => controller.chooseInfluence(c, 'sigilo')}
                  >
                    <strong>Sigilo — gastar 1</strong>
                    <span>Jogue a carta oculta sem mudar o valor.</span>
                  </button>
                  {c.canUseManeuver && (
                    <>
                      <button
                        className="choice-card"
                        data-influence="plus"
                        onClick={() => controller.chooseInfluence(c, 'plus')}
                      >
                        <strong>Manobra +3 — gastar 2</strong>
                        <span>Valor máximo: 12.</span>
                      </button>
                      <button
                        className="choice-card"
                        data-influence="minus"
                        onClick={() => controller.chooseInfluence(c, 'minus')}
                      >
                        <strong>Manobra -3 — gastar 2</strong>
                        <span>Valor mínimo: 1.</span>
                      </button>
                    </>
                  )}
                </>
              )}
              {c &&
                s.dialog === 'suit' &&
                throneSuits
                  .filter((suit) =>
                    c.hand.some((card) => card.suit === suit && c.hiddenLegal.includes(card.id)),
                  )
                  .map((suit) => (
                    <button
                      key={suit}
                      className="choice-card"
                      data-suit={suit}
                      onClick={() => controller.chooseSuit(c, suit)}
                    >
                      <strong>{names[suit]}</strong>
                    </button>
                  ))}
            </div>
            <button className="small-btn" onClick={() => controller.dismiss()}>
              Cancelar
            </button>
          </div>
        </GameDialog>,
        dialogHost,
      )}
    </>
  );
}
