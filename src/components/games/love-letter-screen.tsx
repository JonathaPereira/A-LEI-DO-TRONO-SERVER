import { GameAction } from './library-controls';
export function LoveLetterScreen() {
  return (
    <>
      <section
        id={'loveLetterScreen'}
        className={'screen hidden mn-games-screen ll-screen'}
        aria-label={'Love Letter, segunda edição'}
      >
        <header className={'ll-heading'}>
          <div className={'ll-brand'}>
            <GameAction
              destination="library"
              id={'loveLetterBack'}
              type={'button'}
              className={'ll-button'}
              aria-label={'Voltar aos jogos'}
            >
              ‹ Jogos
            </GameAction>
            <h1>
              LOVE LETTER<small>2ª EDIÇÃO · INTRIGA NA CORTE</small>
            </h1>
          </div>
          <div className={'ll-heading-actions'}>
            <strong id={'loveLetterStatus'} role={'status'}></strong>
            <button
              id={'loveLetterFullscreen'}
              type={'button'}
              className={'ll-button'}
              aria-pressed={'false'}
            >
              Tela cheia
            </button>
            <button id={'loveLetterRulesButton'} type={'button'} className={'ll-button'}>
              Como jogar
            </button>
          </div>
        </header>
        <p id={'loveLetterNotice'} className={'ll-notice'} role={'status'} aria-live={'polite'}></p>
        <div id={'loveLetterContent'}></div>
        <footer className={'ll-footnote'}>
          Love Letter · Seiji Kanai / Z-Man Games · Regras da segunda edição (2019). Implementação
          de fã para M&amp;N, com ilustrações próprias. As mesas ficam no servidor durante a
          partida; a chamada permanece independente.
        </footer>
        <dialog id={'loveLetterPlayDialog'} className={'ll-dialog'} aria-label={'Jogar carta'}>
          <button data-close={''} type={'button'} aria-label={'Voltar'}>
            ×
          </button>
          <div id={'loveLetterPlayContent'} className={'ll-play-content'}></div>
        </dialog>
        <dialog
          id={'loveLetterPrivateDialog'}
          className={'ll-dialog'}
          aria-label={'Informação secreta'}
        >
          <button data-close={''} type={'button'} aria-label={'Fechar informação secreta'}>
            ×
          </button>
          <div id={'loveLetterPrivateContent'} className={'ll-private-content'}></div>
        </dialog>
        <dialog
          id={'loveLetterRulesDialog'}
          className={'ll-dialog'}
          aria-labelledby={'loveLetterRulesTitle'}
        >
          <button data-close={''} type={'button'} aria-label={'Fechar regras'}>
            ×
          </button>
          <span className={'ll-eyebrow'}>O LIVRO DA CORTE</span>
          <h2 id={'loveLetterRulesTitle'}>Love Letter · 2ª edição</h2>
          <p>
            De 2 a 6 pessoas disputam rodadas para conquistar fichas de favor. O baralho tem 21
            cartas. Só você vê sua mão; os descartes ficam públicos. O aplicativo sorteia a primeira
            pessoa da partida.
          </p>
          <h3>Preparação e turno</h3>
          <p>
            Uma carta é separada, oculta. Com duas pessoas, outras três são removidas de face para
            cima. Cada pessoa recebe uma carta. Na sua vez, compre uma e jogue uma das duas,
            resolvendo o efeito. O app compra automaticamente no início do seu turno.
          </p>
          <h3>As dez personagens</h3>
          <ol start={0}>
            <li>
              <b>Espiã (2):</b> no fim da rodada, se só você, entre os sobreviventes, jogou ou
              descartou Espiã, ganhe 1 favor extra. Não conta como vitória da rodada e no máximo uma
              ficha é recebida, mesmo com duas Espiãs.
            </li>
            <li>
              <b>Guarda (6):</b> escolha outra pessoa e adivinhe sua carta, exceto Guarda. Se
              acertar, ela sai da rodada.
            </li>
            <li>
              <b>Padre (2):</b> veja, em segredo, a carta de outra pessoa.
            </li>
            <li>
              <b>Barão (2):</b> compare sua carta restante com a de outra pessoa. Quem tem valor
              menor sai. No empate, ninguém sai.
            </li>
            <li>
              <b>Aia (2):</b> protege você dos efeitos das outras pessoas até o início do seu
              próximo turno.
            </li>
            <li>
              <b>Príncipe (2):</b> escolha uma pessoa, inclusive você, para descartar a mão e
              comprar outra. Se descartar Princesa, ela sai. Se o baralho estiver vazio, use a carta
              separada.
            </li>
            <li>
              <b>Chanceler (2):</b> compre até duas cartas, guarde uma e coloque as demais no fundo
              do baralho na ordem escolhida. Se só houver uma carta, compre uma. Se não houver
              nenhuma, apenas descarte o Chanceler.
            </li>
            <li>
              <b>Rei (1):</b> troque sua carta restante com a de outra pessoa.
            </li>
            <li>
              <b>Condessa (1):</b> se estiver com Príncipe ou Rei, obrigatoriamente jogue a
              Condessa. Você pode jogá-la voluntariamente em qualquer outro caso.
            </li>
            <li>
              <b>Princesa (1):</b> se jogá-la ou descartá-la, você sai imediatamente da rodada.
            </li>
          </ol>
          <h3>Alvos e proteção</h3>
          <p>
            Você não pode escolher alguém eliminado ou protegido por Aia. Só o Príncipe permite
            escolher a si mesmo; se todos os demais estiverem protegidos, o Príncipe precisa
            escolher você. Se não houver alvo válido para Guarda, Padre, Barão ou Rei, a carta é
            descartada sem efeito.
          </p>
          <h3>Fim da rodada</h3>
          <p>
            A rodada termina quando só resta uma pessoa ou, depois de resolver todos os efeitos, o
            baralho está vazio. Entre os sobreviventes, a maior carta vence; pessoas empatadas
            vencem juntas e cada uma recebe 1 favor. Não se soma o descarte para desempatar nesta
            edição. A Espiã pode conceder mais 1 favor. O vencedor começa a próxima rodada; em
            empate, o app sorteia entre os vencedores.
          </p>
          <h3>Vitória da partida</h3>
          <p>
            Com 2 pessoas: 6 favores. Com 3: 5 favores. Com 4: 4 favores. Com 5 ou 6: 3 favores. Ao
            fim de uma rodada, quem alcançar a meta vence; se mais de uma pessoa alcançar,
            compartilham a vitória.
          </p>
          <h3>Conexão e privacidade</h3>
          <p>
            O servidor valida cartas, alvos, efeitos e favores. As mãos adversárias, o baralho, a
            carta separada e as escolhas do Chanceler permanecem secretos. Informações do Padre só
            são enviadas a quem jogou. Você tem 90 segundos para reconectar; se sair ou não voltar,
            um bot assume. Mesas ao vivo não sobrevivem ao reinício do backend.
          </p>
        </dialog>
      </section>
    </>
  );
}
