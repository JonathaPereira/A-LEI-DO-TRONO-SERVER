'use client';
import { useModel, useServices, type ApplicationServices } from '../application/services';
import styles from './atalaia-screen.module.css';

function Player({ runtime }: { runtime: ApplicationServices }) {
  const game = runtime.TronoAtalaia;
  const state = useModel(game);
  return (
    <>
      <header className={styles.header}>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void runtime.TronoGameLibrary.open('library')}
        >
          ‹ Jogos
        </button>
        <h1>
          Atalaia <small>· Guardiões do Cristal</small>
        </h1>
      </header>
      {
        <div className={styles.intro}>
          <img
            src="assets/games/atalaia-cover.jpg"
            width="640"
            height="400"
            alt="Campo de defesa do cristal de Atalaia"
          />
          <div>
            <p className={styles.tag}>TOWER DEFENSE · SOLO</p>
            <h2>Três territórios. Quinze ondas. Um cristal.</h2>
            <p>
              Construa sua defesa com seis armas, evolua as torretas e combine cartas para resistir
              às hordas.
            </p>
            <button
              type="button"
              className="primary-button"
              disabled={state.busy}
              onClick={() => void game.launch()}
            >
              Jogar Atalaia
            </button>
            <p>
              Mouse e teclado: 1–6 escolhem a arma, Espaço inicia a onda, U evolui e P pausa.
              Recomendado para computador.
            </p>
            <p>
              O jogo abre em uma aba ou janela própria. Sua chamada continua no Trono. A campanha é
              salva neste dispositivo, separada da conta do Trono.
            </p>
          </div>
        </div>
      }
      <p role="status" aria-live="polite">
        {state.status}
      </p>
    </>
  );
}
export function AtalaiaScreen() {
  const runtime = useServices();
  return (
    <section
      id="atalaiaScreen"
      className="screen hidden mn-games-screen"
      aria-label="Atalaia · Guardiões do Cristal"
    >
      {runtime && <Player runtime={runtime} />}
    </section>
  );
}
