import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { ThroneHistory } from '../../lib/games/throne-history';
import type { ThroneResult } from '../../types/throne-history';
import { GameDialog } from './game-dialog';
import './throne-choices.css';
import './throne-history.css';

function ScoreRows({ result }: { result: ThroneResult }) {
  return (
    <>
      {result.scores.map((p, index) => (
        <div key={p.seat} className={`score-row ${result.kind === 'final' ? 'final' : ''}`}>
          <strong>
            {result.kind === 'final' ? `${index + 1}º ` : ''}
            {p.name}
          </strong>
          {p.roundScore ? (
            <>
              <span>♛ {p.roundScore.crowns}</span>
              <span>☾ {p.roundScore.shadows}</span>
              <span>Pares da rodada {p.roundScore.pairs}</span>
              <b>
                +{p.roundScore.gained} · Total {p.prestige}
              </b>
            </>
          ) : (
            <>
              <span>Pares {p.pairs}</span>
              <span>♛ {p.crowns}</span>
              <span>☾ {p.shadows}</span>
              <b>{p.prestige} Prestígio</b>
            </>
          )}
        </div>
      ))}
    </>
  );
}
export function ThroneHistoryContents({
  controller,
  toggleHost,
  resetLayout,
}: {
  controller: ThroneHistory;
  toggleHost: HTMLElement;
  resetLayout(): void;
}) {
  const s = useSyncExternalStore(
      controller.subscribe,
      controller.getSnapshot,
      controller.getSnapshot,
    ),
    result = s.dialog;
  const winners =
    result?.scores.filter((p) => result.winners.includes(p.seat)).map((p) => p.name) || [];
  return (
    <>
      {createPortal(
        <button
          id="logBtn"
          className={`icon-btn ${s.logOpen ? 'music-active' : ''}`}
          title="Abrir ou ocultar a Crônica da Corte"
          aria-expanded={s.logOpen}
          aria-controls="eventLogPanel"
          onClick={() => controller.toggleLog()}
        >
          ☷ Log
        </button>,
        toggleHost,
      )}
      <div id="eventDragHandle" className="event-head">
        <h3>Crônica da Corte</h3>
        <div className="event-head-actions">
          <button id="logResetBtn" title="Restaurar posição e tamanho" onClick={resetLayout}>
            ↺
          </button>
          <button
            id="clearLogBtn"
            title="Limpar registro"
            onClick={() => controller.clearEntries()}
          >
            ⌫
          </button>
          <button
            id="logHideBtn"
            title="Ocultar janela"
            onClick={() => controller.toggleLog(false)}
          >
            ×
          </button>
        </div>
      </div>
      <div id="eventLog" className="event-log">
        {[...s.entries].reverse().map((e) => (
          <div key={e.id} className="event-item">
            {e.message}
          </div>
        ))}
      </div>
      <div className="resize-hint">arraste pelo título • redimensione pelo canto ↘</div>
      <div id="logResizeGrip" className="log-resize-grip" title="Redimensionar" />
      {createPortal(
        <GameDialog
          id="throneResultDialog"
          className="throne-choice-dialog throne-result-dialog"
          aria-labelledby="throneResultTitle"
          visible={s.resultOpen}
          onDismiss={() => {}}
        >
          <div className="modal-card">
            <div className="modal-icon">♛</div>
            <h2 id="throneResultTitle">
              {result?.kind === 'round'
                ? `Fim da Rodada ${result.round}`
                : result?.mode === 'online'
                  ? 'Fim da Partida Online'
                  : 'Fim da Partida'}
            </h2>
            {result && (
              <>
                {result.kind === 'final' && (
                  <h3 className="winner-title">
                    {winners.length > 1
                      ? `Vitória compartilhada: ${winners.join(' e ')}`
                      : `${winners[0]} ocupa o Trono.`}
                  </h3>
                )}
                <ScoreRows result={result} />
                {result.kind === 'round' ? (
                  <p className="score-note">Influências não usadas foram perdidas.</p>
                ) : (
                  <details key={`${result.mode}:${result.round}`} className="final-log" open>
                    <summary>Crônica final da partida ({result.entries.length} registros)</summary>
                    <div className="final-log-list">
                      {result.entries.length ? (
                        result.entries.slice(-300).map((e) => (
                          <div key={e.id} className="final-log-row">
                            <span>
                              R{e.round || '-'} · V{e.trick || '-'}
                            </span>
                            <p>{e.message}</p>
                          </div>
                        ))
                      ) : (
                        <em>Sem registros.</em>
                      )}
                    </div>
                  </details>
                )}
                <button
                  id="throneResultContinue"
                  className="royal-btn primary"
                  onClick={() => controller.confirm(result)}
                >
                  {result.kind === 'round'
                    ? result.round === 3
                      ? 'Ver resultado final'
                      : 'Iniciar próxima rodada'
                    : result.mode === 'online'
                      ? 'Voltar aos salões'
                      : 'Jogar novamente'}
                </button>
              </>
            )}
          </div>
        </GameDialog>,
        toggleHost.ownerDocument.body,
      )}
    </>
  );
}
