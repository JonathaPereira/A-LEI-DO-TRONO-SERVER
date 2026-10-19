import type { Portal } from '../../lib/navigation/portal';
import { GameDialog } from '../games/game-dialog';
export function PortalCredits({ controller, visible }: { controller: Portal; visible: boolean }) {
  return (
    <GameDialog
      id="portalCreditsDialog"
      className="portal-credits-dialog"
      visible={visible}
      onDismiss={() => controller.setCredits(false)}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          controller.setCredits(false);
        }}
      >
        <button className="portal-dialog-close" aria-label="Fechar">
          ×
        </button>
        <span className="portal-kicker">
          <i /> TRILHA SONORA
        </span>
        <h2>Música moderna em CC0</h2>
        <p>
          As faixas externas abaixo foram publicadas pelos próprios autores em CC0/Public Domain. Se
          a origem ficar indisponível, o site usa automaticamente as composições locais originais do
          protótipo.
        </p>
        <div className="portal-credit-list">
          <article>
            <b>Lo-fi</b>
            <strong>Lofi again</strong>
            <span>omfgdude • CC0</span>
          </article>
          <article>
            <b>EDM</b>
            <strong>Joyfully</strong>
            <span>MintoDog • CC0</span>
          </article>
          <article>
            <b>Rock</b>
            <strong>Codename Granny II</strong>
            <span>Kistol • CC0</span>
          </article>
          <article>
            <b>Eletrônica</b>
            <strong>Claimed by the Void</strong>
            <span>vitalezzz • CC0</span>
          </article>
        </div>
        <small>Fontes e URLs estão documentadas em assets/audio/TRILHAS_CC0.md.</small>
      </form>
    </GameDialog>
  );
}
