export function RulesDrawer() {
  return (
    <>
      <div id={'rulesDrawer'} className={'rules-drawer hidden'}>
        <div className={'rules-card'}>
          <button id={'rulesClose'} aria-label={'Fechar regras'}>
            ×
          </button>
          <h2>Regras da Corte · 0.9.0</h2>
          <button id={'rulesManualBtn'} className={'royal-btn manual-btn'} type={'button'}>
            📜 Abrir manual temático completo
          </button>
          <div className={'rules-columns'}>
            <div>
              <h3>Fluxo da partida</h3>
              <p>
                4 Casas · 3 rodadas · 10 vazas por rodada · 10 cartas por jogador. A primeira vaza
                usa Ordem. A Coroa abre a próxima vaza; a Sombra escolhe a próxima Lei. Cada Lei tem
                dois usos e não pode se repetir consecutivamente. Um Decreto fica fixo por toda a
                rodada.
              </p>
              <h3>Influência</h3>
              <p>
                Sem Coroa nem Sombra: ganhe 1 Influência, até 2. Sigilo custa 1 e oculta a carta.
                Manobra custa 2 e oculta com +3 ou −3, limitado a 1–12. O gasto e o modificador são
                públicos; ao abrir oculta, anuncie o naipe real. Corte Aberta protege sua carta.
                Silêncio bloqueia todos nas vazas 1–3; Peso da Coroa bloqueia a Coroa anterior na
                vaza seguinte.
              </p>
              <h3>Prestígio</h3>
              <p>
                Coroas + Sombras + 2 por par acumulado ao longo das três rodadas. Desempate: pares,
                Coroas, Sombras; empate completo divide o Trono. Em empates de cartas, prevalece
                quem jogou primeiro. Coroa e Sombra nunca são a mesma pessoa.
              </p>
            </div>
            <div id={'rulesLaws'}></div>
            <div id={'rulesDecrees'}></div>
          </div>
        </div>
      </div>
    </>
  );
}
