export function RoomScreen() {
  return (
    <>
      <section id={'roomScreen'} className={'screen setup-screen room-screen hidden'}>
        <div className={'setup-card room-wait-card'}>
          <span id="throneLobbyBack" style={{ display: 'contents' }} />
          <div className={'crest'}>♛</div>
          <small className={'eyebrow'}>SALA SELECIONADA</small>
          <h1 id="selectedRoomName" />
          <p className={'intro'}>
            Aguarde outros jogadores, marque Pronto e inicie a partida. Com 2 ou 3 jogadores, as
            vagas restantes serão preenchidas por IAs.
          </p>
          <div id={'roomSeats'} className={'room-seats'}></div>
          <div className="online-room-actions" id="throneRoomActions" />
          <p id="roomOnlineStatus" className="online-room-status" />
          <details className={'local-test-fold'}>
            <summary>Opções locais de desenvolvimento</summary>
            <div className={'setup-actions'}>
              <button id={'startHumanBtn'} className={'royal-btn'}>
                Preencher vagas com IAs e jogar local
              </button>
              <button id={'startDemoBtn'} className={'royal-btn'}>
                Simular 4 IAs
              </button>
            </div>
          </details>
          <p className={'setup-note'}>
            Alpha multiplayer: o servidor agora controla o baralho, as mãos privadas, os turnos e as
            principais regras da partida. As opções abaixo permanecem apenas para testes locais.
          </p>
          <input id={'p0Name'} defaultValue={'Jogador'} className={'hidden'} />
          <input id={'p1Name'} defaultValue={'Bonifácio'} className={'hidden'} />
          <input id={'p2Name'} defaultValue={'Epaminondas'} className={'hidden'} />
          <input id={'p3Name'} defaultValue={'Cícero'} className={'hidden'} />
        </div>
      </section>
    </>
  );
}
