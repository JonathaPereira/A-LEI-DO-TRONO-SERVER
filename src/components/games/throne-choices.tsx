import { useSyncExternalStore } from 'react';
import type { ThroneChoices } from '../../lib/games/throne-choices';
import type {
  ThroneCard,
  ThroneChoiceRules,
  ThronePrompt,
  ThroneSuit,
} from '../../types/throne-choices';
import { GameDialog } from './game-dialog';
import './throne-choices.css';

const suits: Readonly<Record<ThroneSuit, { name: string; glyph: string; color: string }>> = {
  cetro: { name: 'Cetro', glyph: '♜', color: '#d4a63f' },
  chave: { name: 'Chave', glyph: '⚿', color: '#2f8a5f' },
  lamina: { name: 'Lâmina', glyph: '⚔', color: '#b13939' },
  mascara: { name: 'Máscara', glyph: '◉', color: '#8050a0' },
};
function CardImage({ card }: { card: ThroneCard }) {
  return (
    <img
      src={`assets/cards/${card.suit}_${String(card.value).padStart(2, '0')}.webp`}
      alt={`${suits[card.suit].name} ${card.value}`}
    />
  );
}
function copy(prompt: ThronePrompt): [string, string, string] {
  switch (prompt.kind) {
    case 'choose-decree':
      return ['📜', 'Escolha o Decreto', 'Você possui a escolha do Decreto desta rodada.'];
    case 'choose-trump':
      return ['⚑', 'Declare o Trunfo', 'Como Sombra, escolha o Trunfo antes da abertura da vaza.'];
    case 'choose-law':
      return [
        '☾',
        'Escolha a próxima Lei',
        'Como Sombra, você controla a Lei da próxima vaza. Antes de decidir, você pode consultar sua mão.',
      ];
    case 'usurp-target':
      return [
        '☾',
        'Usurpação — escolha uma Casa',
        'Escolha qualquer adversário para trocar uma carta fechada. Sua carta fica separada até a escolha, sem poder retornar.',
      ];
    case 'usurp-pick':
      return [
        '☾',
        'Usurpação — escolha às cegas',
        `${prompt.otherName} embaralhou a mão. Escolha uma posição entre as cartas fechadas elegíveis. Sua carta está separada e nunca pode retornar. A Corte Aberta está protegida.`,
      ];
    case 'choose-reserva':
      return [
        '♛',
        'Reserva',
        'Escolha a carta que ficará fora da mão durante as 9 primeiras vazas.',
      ];
    case 'choose-conselho':
      return [
        '♛',
        'Conselho',
        'Escolha uma carta fechada para passar à direita. As quatro trocas acontecem simultaneamente.',
      ];
    case 'choose-corte':
      return ['♛', 'Corte Aberta', 'Escolha a carta que ficará pública até ser usada.'];
    case 'rotation':
      return ['♛', 'Rotação', 'Escolha 1 carta para passar ao jogador à esquerda.'];
    case 'challenge':
      return ['♛', 'Desafio', 'Sua Coroa exige um preço: revele 1 carta da sua mão.'];
    case 'usurp-give':
      return [
        '☾',
        'Usurpação',
        `Escolha 1 carta para entregar, virada para baixo, a ${prompt.otherName}. A carta da Corte Aberta não pode ser trocada.`,
      ];
  }
}
export function ThroneChoiceDialog({
  controller,
  rules,
}: {
  controller: ThroneChoices;
  rules: ThroneChoiceRules;
}) {
  const s = useSyncExternalStore(
      controller.subscribe,
      controller.getSnapshot,
      controller.getSnapshot,
    ),
    p = s.prompt,
    c = s.context;
  const description = p ? copy(p) : ['', '', ''];
  function choices() {
    if (!p || !c) return null;
    const choose = (value: string | number) => controller.choose(p, value);
    switch (p.kind) {
      case 'choose-decree':
        return p.options.map((id) => {
          const decree = rules.decrees.find((d) => d.id === id)!;
          return (
            <button
              key={id}
              type="button"
              className="choice-card decree-choice"
              disabled={s.pending}
              onClick={() => choose(id)}
              title={decree.text}
            >
              <span className="decree-icon">{decree.icon}</span>
              <strong>{decree.name}</strong>
              <p>{decree.text}</p>
            </button>
          );
        });
      case 'choose-trump':
        return p.options.map((id) => (
          <button
            key={id}
            type="button"
            className="choice-card suit-choice"
            disabled={s.pending}
            onClick={() => choose(id)}
            style={{ borderColor: suits[id].color }}
          >
            <span className="suit-glyph" style={{ color: suits[id].color }}>
              {suits[id].glyph}
            </span>
            <strong>{suits[id].name}</strong>
          </button>
        ));
      case 'choose-law':
        return p.options.map((id) => (
          <button
            key={id}
            type="button"
            className="choice-card"
            disabled={s.pending}
            data-law={id}
            onClick={() => choose(id)}
            title={rules.laws[id].description}
          >
            <img src={rules.laws[id].img} alt={rules.laws[id].name} />
            <strong>{rules.laws[id].name}</strong>
            <small>Restam {2 - c.lawUsage[id]} uso(s) antes desta escolha.</small>
          </button>
        ));
      case 'usurp-target':
        return p.options.map((target) => (
          <button
            key={target.seat}
            type="button"
            className="choice-card"
            disabled={s.pending}
            onClick={() => choose(target.seat)}
          >
            <strong>{target.name}</strong>
          </button>
        ));
      case 'usurp-pick':
        return Array.from({ length: p.count }, (_, i) => (
          <button
            key={i}
            type="button"
            className="choice-card hidden-card-choice"
            disabled={s.pending}
            onClick={() => choose(i)}
          >
            <span className="hidden-card-back">♛</span>
            <strong>Carta {i + 1}</strong>
            <small>Face voltada para baixo</small>
          </button>
        ));
      default:
        return c.hand
          .filter((card) => p.cardIds.includes(card.id))
          .map((card) => (
            <button
              key={card.id}
              type="button"
              className="choice-card"
              disabled={s.pending}
              onClick={() => choose(card.id)}
            >
              <CardImage card={card} />
              <strong>
                {suits[card.suit].name} {card.value}
              </strong>
            </button>
          ));
    }
  }
  return (
    <GameDialog
      id="throneChoiceDialog"
      className="throne-choice-dialog"
      aria-labelledby="throneChoiceTitle"
      visible={s.open}
      onDismiss={() => {
        /* A choice remains required until the engine advances or the match ends. */
      }}
    >
      <div className="modal-card">
        <div className="modal-icon">{s.preview ? '🂠' : description[0]}</div>
        <h2 id="throneChoiceTitle">{s.preview ? `Mão de ${c?.name}` : description[1]}</h2>
        <p>
          {s.preview
            ? 'Consulte suas cartas e depois volte para escolher a Lei. As cartas públicas permanecem destacadas.'
            : description[2]}
        </p>
        <div className="modal-choices">
          {s.preview && c ? (
            <div className="deck-preview">
              {c.hand.map((card) => (
                <div
                  key={card.id}
                  className={
                    'deck-preview-card' +
                    (card.public ? ' public' : '') +
                    (card.publicReason === 'Corte Aberta' ? ' corte-open' : '')
                  }
                >
                  <CardImage card={card} />
                  <span>
                    {suits[card.suit].name} {card.value}
                  </span>
                  {card.public && <b>{card.publicReason}</b>}
                </div>
              ))}
              {c.reserve && (
                <div className="deck-preview-card reserve-preview">
                  <CardImage card={c.reserve} />
                  <span>Reserva</span>
                  <b>Obrigatória na 10ª</b>
                </div>
              )}
            </div>
          ) : (
            choices()
          )}
        </div>
        <div className="modal-footer">
          {p?.kind === 'choose-law' && (
            <button
              type="button"
              id={s.preview ? 'throneChoiceBack' : 'throneChoiceHand'}
              className="royal-btn deck-view-btn"
              disabled={s.pending}
              onClick={() => controller.preview(!s.preview)}
            >
              {s.preview
                ? '← Voltar para escolher a Lei'
                : `🂠 Ver meu deck / mão (${c?.hand.length}${c?.reserve ? ' + Reserva' : ''})`}
            </button>
          )}
        </div>
        {s.pending && <p role="status">Escolha enviada. Aguardando a mesa…</p>}
        {s.notice && <p role="status">{s.notice}</p>}
      </div>
    </GameDialog>
  );
}
