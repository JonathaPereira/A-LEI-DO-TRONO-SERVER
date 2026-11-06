import { MusicControlHost } from '../audio/music-controls';
export function SetupScreen() {
  return (
    <>
      <section id={'setupScreen'} className={'screen setup-screen lobby-screen hidden'}>
        <div className={'setup-card lobby-card'}>
          <button id={'backFromLobbyBtn'} className={'back-lobby portal-back-btn'} type={'button'}>
            ← Voltar à Corte
          </button>
          <div className={'crest'}>♛</div>
          <h1>A LEI DO TRONO</h1>
          <p className={'subtitle'}>Protótipo digital v0.8.0-alpha • Playtest Online</p>
          <p className={'intro'}>
            Identifique-se, escolha um salão e prepare sua Casa. Cada sala comporta até 4 jogadores.
          </p>

          <div className={'identity-row'}>
            <label className={'identity-name-field'}>
              <span>Seu nome na Corte</span>
              <input
                id={'playerIdentity'}
                defaultValue={'Jogador'}
                maxLength={20}
                autoComplete={'nickname'}
                aria-describedby={'nameAvailability'}
              />
              <small
                id={'nameAvailability'}
                className={'name-availability'}
                aria-live={'polite'}
              ></small>
            </label>
            <span id="throneManualHost" style={{ display: 'contents' }} />
          </div>

          <div className="room-grid" id="roomGrid" />
          <article className={'chat-only-entry'}>
            <div className={'chat-only-glyph'}>◫</div>
            <div className={'chat-only-copy'}>
              <small>FORA DA MESA</small>
              <h3>Somente chat</h3>
              <p>
                Salão livre para texto, áudio, câmera e compartilhamento de tela. Sem limite fixo de
                participantes imposto pelo servidor e sem iniciar uma partida.
              </p>
            </div>
            <span id="communityEnterHost" style={{ display: 'contents' }} />
          </article>
          <div className="lobby-status" id="throneNetworkStatus" />
          <MusicControlHost id="lobby" />
        </div>
      </section>
    </>
  );
}
