import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { ThroneControls } from '../../lib/games/throne-controls';
import type { ThroneChoiceRules } from '../../types/throne-choices';
import { throneLaws as lawOrder } from '../../lib/games/throne-choice-protocol';
import { GameDialog } from './game-dialog';

export interface ThroneControlsHosts {
  speed: HTMLElement;
  rules: HTMLElement;
  restart: HTMLElement;
  manual: HTMLElement;
  version: HTMLElement;
}
export function ThroneControlsContents({
  controller,
  rules,
  hosts,
  version,
}: {
  controller: ThroneControls;
  rules: ThroneChoiceRules;
  hosts: ThroneControlsHosts;
  version: string;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const speed =
    state.mode === 'online'
      ? '⏱ Online'
      : state.scale === 1
        ? '⏱ Normal'
        : state.scale === 1.65
          ? '🐢 Lento'
          : '⚡ Rápido';
  return (
    <>
      {createPortal(
        <button
          id="speedBtn"
          className="icon-btn"
          type="button"
          title="Alternar velocidade"
          aria-label={`Velocidade: ${speed}`}
          disabled={state.mode === 'online'}
          onClick={() => controller.cycleSpeed()}
        >
          {speed}
        </button>,
        hosts.speed,
      )}
      {createPortal(
        <button
          id="rulesBtn"
          className="icon-btn"
          type="button"
          title="Resumo de regras"
          aria-haspopup="dialog"
          aria-controls="rulesDrawer"
          onClick={() => controller.rules(true)}
        >
          📜 Regras
        </button>,
        hosts.rules,
      )}
      {createPortal(
        <button
          id="restartBtn"
          className="icon-btn danger"
          type="button"
          title="Voltar ao início"
          disabled={!state.mode || state.leaving}
          onClick={() => void controller.leave()}
        >
          ↻ Início
        </button>,
        hosts.restart,
      )}
      {createPortal(
        <button
          id="manualBtn"
          className="royal-btn manual-btn"
          type="button"
          onClick={() => controller.openManual()}
        >
          📜 Manual temático
        </button>,
        hosts.manual,
      )}
      {createPortal(
        <small id="versionLabel">
          Protótipo digital v{version}
          {state.mode === 'online' ? ' • Multiplayer' : ''}
        </small>,
        hosts.version,
      )}
      <GameDialog
        id="rulesDrawer"
        className="throne-rules-dialog"
        aria-labelledby="throneRulesTitle"
        visible={state.rulesOpen}
        onDismiss={() => controller.rules(false)}
      >
        <header>
          <h2 id="throneRulesTitle">Regras da Corte</h2>
          <button
            id="rulesClose"
            type="button"
            aria-label="Fechar regras"
            onClick={() => controller.rules(false)}
          >
            ×
          </button>
        </header>
        <button
          id="rulesManualBtn"
          className="royal-btn manual-btn"
          type="button"
          onClick={() => controller.openManual()}
        >
          📜 Abrir manual temático completo
        </button>
        <div className="throne-rules-columns">
          <div>
            <h3>Fluxo da partida</h3>
            <p>
              4 Casas · 3 rodadas · 10 vazas por rodada · 10 cartas por jogador. A primeira vaza usa
              Ordem. A Coroa abre a próxima vaza; a Sombra escolhe a próxima Lei. Cada Lei tem dois
              usos e não pode se repetir consecutivamente. Um Decreto fica fixo por toda a rodada.
            </p>
            <h3>Influência</h3>
            <p>
              Sem Coroa nem Sombra: ganhe 1 Influência, até 2. Sigilo custa 1 e oculta a carta.
              Manobra custa 2 e oculta com +3 ou −3, limitado a 1–12. O gasto e o modificador são
              públicos; ao abrir oculta, anuncie o naipe real. Corte Aberta protege sua carta.
              Silêncio bloqueia todos nas vazas 1–3; Peso da Coroa bloqueia a Coroa anterior na vaza
              seguinte.
            </p>
            <h3>Prestígio</h3>
            <p>
              Coroas + Sombras + 2 por par acumulado ao longo das três rodadas. Desempate: pares,
              Coroas, Sombras; empate completo divide o Trono. Em empates de cartas, prevalece quem
              jogou primeiro. Coroa e Sombra nunca são a mesma pessoa.
            </p>
          </div>
          <div id="rulesLaws">
            <h3>As cinco Leis</h3>
            {lawOrder.map((id) => (
              <p key={id}>
                <b>{rules.laws[id].name}:</b> {rules.laws[id].description}
              </p>
            ))}
          </div>
          <div id="rulesDecrees">
            <h3>Os dez Decretos</h3>
            {rules.decrees.map((decree) => (
              <p key={decree.id}>
                <b>{decree.name}:</b> {decree.text}
              </p>
            ))}
          </div>
        </div>
      </GameDialog>
    </>
  );
}
