import { useSyncExternalStore } from 'react';
import type { ThronePrivate } from '../../lib/games/throne-private';
import type { ThroneCard } from '../../types/throne-choices';
import { GameDialog } from './game-dialog';
import './throne-choices.css';
import './throne-private.css';

const suits = { cetro: 'Cetro', chave: 'Chave', lamina: 'Lâmina', mascara: 'Máscara' };
function Card({ card }: { card: ThroneCard }) {
  return (
    <>
      <img
        src={`assets/cards/${card.suit}_${String(card.value).padStart(2, '0')}.webp`}
        alt={`${suits[card.suit]} ${card.value}`}
      />
      <strong>
        {suits[card.suit]} {card.value}
      </strong>
    </>
  );
}
export function ThronePrivateDialog({ controller }: { controller: ThronePrivate }) {
  const s = useSyncExternalStore(
      controller.subscribe,
      controller.getSnapshot,
      controller.getSnapshot,
    ),
    d = s.dialog,
    data = d?.data;
  return (
    <GameDialog
      id="thronePrivateDialog"
      className="throne-choice-dialog"
      aria-labelledby="thronePrivateTitle"
      visible={s.open}
      onDismiss={() => {
        if (d && !d.required) controller.confirm(d);
      }}
    >
      <div className="modal-card">
        <h2 id="thronePrivateTitle">
          {data?.kind === 'usurpation'
            ? 'Usurpação — informação privada'
            : 'Espionagem — informação privada'}
        </h2>
        {data?.kind === 'intelligence' && (
          <div className="intelligence-reveal">
            <small>UMA CARTA DE {data.clue.name}</small>
            <Card card={data.clue.card} />
            <p>
              A carta permanece na mão do adversário e pode ser jogada ou trocada depois. Somente
              você vê esta informação.
            </p>
            <small>Consulte novamente clicando no Decreto Espionagem.</small>
          </div>
        )}
        {data?.kind === 'usurpation' && (
          <div className="private-exchange-reveal">
            <div className="private-exchange-role">
              VOCÊ É {data.role === 'shadow' ? 'SOMBRA' : 'A CASA ESCOLHIDA'}
            </div>
            <div className="private-exchange-cards">
              <div className="private-exchange-card outgoing">
                <small>SAIU DA SUA MÃO</small>
                <Card card={data.outgoing} />
              </div>
              <div className="private-exchange-arrow">⇄</div>
              <div className="private-exchange-card incoming">
                <small>ENTROU NA SUA MÃO</small>
                <Card card={data.incoming} />
              </div>
            </div>
            <div className="private-exchange-note">
              <strong>Informação privada</strong>
              <span>
                Somente você e {data.otherName} recebem estas duas cartas. A carta separada nunca
                pode retornar à Sombra.
              </span>
            </div>
          </div>
        )}
        {s.notice && <p role="status">{s.notice}</p>}
        <button
          id="thronePrivateContinue"
          className="royal-btn primary"
          disabled={s.pending}
          onClick={() => d && controller.confirm(d)}
        >
          Ocultar e continuar
        </button>
      </div>
    </GameDialog>
  );
}
