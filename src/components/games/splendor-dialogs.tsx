import { useRef, useLayoutEffect } from 'react';
import type { ComponentProps } from 'react';
import {
  Card,
  Costs,
  Gem,
  Noble,
  shown,
  actionTurn,
  blocked,
  type SplendorView,
} from './splendor-pieces';
export function GameDialog({
  visible,
  onDismiss,
  ...props
}: Omit<ComponentProps<'dialog'>, 'open' | 'onClose' | 'onCancel'> & {
  visible: boolean;
  onDismiss(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    if (visible && !dialog.open) dialog.showModal();
    else if (!visible && dialog.open) dialog.close();
  }, [visible]);
  return (
    <dialog
      {...props}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onDismiss();
      }}
      onClose={() => {
        if (visible && !ref.current?.open) onDismiss();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onDismiss();
        }
      }}
    />
  );
}
export function CardContent(props: SplendorView) {
  const { snapshot: s, controller, rules } = props,
    choice = s.card,
    state = shown(s),
    p = state?.players.find((p) => p.id === s.accountId);
  if (!choice || !state) return null;
  const c = choice.card,
    owned = state.players.some((p) => p.cards.some((v) => v.id === c.id)),
    reserved = p?.reserved.some((v) => !v.hidden && v.id === c.id),
    cost = p ? rules.price(p, c) : [],
    pay = choice.payment;
  return (
    <>
      <Card {...props} card={c} actions={false} disabled />
      <div className="sp-card-detail">
        <span className="sp-eyebrow">DESENVOLVIMENTO · NÍVEL {c.level}</span>
        <h2>{c.points} ponto(s) de prestígio</h2>
        <p>
          Bônus permanente de {rules.colors[c.bonus]}. Cada bônus reduz em 1 o custo dessa cor nas
          próximas compras.
        </p>
        {p && (
          <>
            <h3>Custo após seus bônus</h3>
            <Costs cost={cost} rules={rules} />
            {!rules.sum(cost) && <p className="sp-free">Gratuita com seus bônus.</p>}
            <div id="splendorPayment">
              {!pay ? (
                <p className="sp-unaffordable">
                  Ainda faltam fichas. Você pode reservar a carta para comprar depois.
                </p>
              ) : (
                <>
                  <div className="sp-payment-total">
                    <strong>Pagamento:</strong>
                    {pay.map((n, i) =>
                      n ? <Gem key={i} color={i} count={n} rules={rules} /> : null,
                    )}
                    {!rules.sum(pay) && <span>nenhuma ficha</span>}
                  </div>
                  {p.tokens[5] > 0 && (
                    <details className="sp-payment-options">
                      <summary>Escolher uso do ouro</summary>
                      {cost.map((due, i) =>
                        due ? (
                          <div className="sp-payment-row" key={i}>
                            <span>{rules.colors[i]}</span>
                            <button
                              type="button"
                              disabled={!pay[i] || pay[5] >= p.tokens[5]}
                              onClick={() => controller.payGold(i, true)}
                            >
                              Usar ouro
                            </button>
                            <button
                              type="button"
                              disabled={!pay[5] || pay[i] >= Math.min(due, p.tokens[i])}
                              onClick={() => controller.payGold(i, false)}
                            >
                              Usar cor
                            </button>
                          </div>
                        ) : null,
                      )}
                    </details>
                  )}
                </>
              )}
            </div>
          </>
        )}
        <div className="sp-dialog-actions">
          <button
            type="button"
            id="splendorBuy"
            className="sp-button sp-primary"
            disabled={!choice.actions || owned || !actionTurn(s) || blocked(s) || !pay}
            onClick={() => void controller.buy()}
          >
            Comprar carta
          </button>
          {!reserved && !owned && (
            <button
              type="button"
              id="splendorReserve"
              className="sp-button"
              disabled={
                !choice.actions || !actionTurn(s) || blocked(s) || (p?.reserved.length ?? 3) >= 3
              }
              onClick={() => void controller.reserve()}
            >
              Reservar{state.bank[5] ? ' · +1 ouro' : ''}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
export function ReturnContent({ snapshot: s, controller, rules }: SplendorView) {
  const c = s.returns;
  if (!c) return null;
  return (
    <>
      <span className="sp-eyebrow">LIMITE DE 10 FICHAS</span>
      <h2>Escolha o que devolver</h2>
      <p>
        Você ficará com {rules.sum(c.held)} fichas. Devolva {c.excess} para concluir a jogada.
      </p>
      <div className="sp-return-tokens">
        {c.held.map((held, i) =>
          held ? (
            <button
              type="button"
              className="sp-token-choice"
              data-return-token={i}
              key={i}
              onClick={() => controller.returnToken(i)}
            >
              <Gem color={i} count={held - c.returned[i]} chip rules={rules} />
              <small>Devolver: {c.returned[i]}</small>
            </button>
          ) : null,
        )}
      </div>
      <div className="sp-dialog-actions">
        <button type="button" className="sp-button" onClick={controller.dismiss}>
          Cancelar
        </button>
        <button
          type="button"
          className="sp-button sp-primary"
          disabled={rules.sum(c.returned) !== c.excess}
          onClick={() => void controller.confirmReturn()}
        >
          Devolver {rules.sum(c.returned)} / {c.excess}
        </button>
      </div>
    </>
  );
}
export function CollectionContent(props: SplendorView) {
  const { snapshot: s } = props,
    p = shown(s)?.players.find((p) => p.id === s.collection);
  if (!p) return null;
  return (
    <>
      <span className="sp-eyebrow">DESENVOLVIMENTOS E NOBRES</span>
      <h2>Coleção de {p.name}</h2>
      <div className="sp-collection">
        {p.cards.map((c) => (
          <Card {...props} key={c.id} card={c} small actions={false} />
        ))}
        {!p.cards.length && <p>Nenhuma carta comprada ainda.</p>}
      </div>
      {p.nobles.length > 0 && (
        <div className="sp-nobles">
          {p.nobles.map((n) => (
            <Noble {...props} key={n.id} noble={n} inert />
          ))}
        </div>
      )}
    </>
  );
}
