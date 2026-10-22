import { Card, Portrait, personName, locked, type LoveLetterView } from './love-letter-pieces';
export function GuessContent({ snapshot: s, controller, rules }: LoveLetterView) {
  const state = s.room?.state,
    choice = s.selected;
  if (!state || !choice?.targetId) return null;
  const name = personName(state, choice.targetId);
  return (
    <>
      <div className="ll-guard-heading">
        <span className="ll-eyebrow">GUARDA → {name}</span>
        <h2>Qual carta está com {name}?</h2>
        <p>Clique em um palpite. Guarda não pode ser escolhida.</p>
      </div>
      <div className="ll-guess-grid" id="loveLetterGuess">
        {rules.cards
          .filter((c) => c.rank !== 1)
          .map((c) => (
            <button
              type="button"
              className="ll-guess"
              data-guess={c.rank}
              key={c.rank}
              disabled={locked(s)}
              onClick={() => void controller.guess(c.rank)}
            >
              <Portrait rank={c.rank} className="ll-reference-art" />
              <b>{c.rank}</b>
              <span>{c.name}</span>
            </button>
          ))}
      </div>
      <button type="button" className="ll-button" onClick={controller.backTargets}>
        Voltar aos alvos
      </button>
    </>
  );
}
export function PrivateContent({ snapshot: s, controller, rules }: LoveLetterView) {
  const state = s.room?.state,
    item = state?.private.at(-1);
  if (!state || !item) return null;
  return (
    <>
      <span className="ll-eyebrow">SOMENTE VOCÊ VÊ ISTO</span>
      <h2>O segredo de {personName(state, item.targetId)}</h2>
      <Card card={item.card} rules={rules} />
      <p>
        Esta era a carta no momento da observação. Trocas ou descartes posteriores podem ter mudado
        a mão.
      </p>
      <button type="button" className="ll-button ll-primary" onClick={controller.dismiss}>
        Entendido
      </button>
    </>
  );
}
