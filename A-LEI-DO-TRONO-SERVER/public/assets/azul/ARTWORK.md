# Arte de Azul aplicada

- tiles-and-factories.png: prancha aprovada na conversa, preservada sem alteração. Inclui peças, expositor vazio, primeiro jogador, cubos de pontuação e placa de nome.
- mural.png: cartão mural aprovado, preservado sem alteração. Fornece moldura, papel, encaixes, chão de sete espaços e painel de bônus.
- box-cover.webp: mesma capa aprovada, com transparência externa, recodificada para reduzir o pacote. PNG original preservado em docs/archive/previews/ART-AZUL-CAIXA.png.
- wood-table.png: textura de madeira gerada para a mesa.

azul-art.css compõe as regiões dessas imagens com background-size/background-position. A grade continua no DOM para preservar cliques, acessibilidade, seleção e animações. As cores e a quantidade de casas vêm de azul-rules.js; os valores e as jogadas são validados pelo servidor. As imagens não contêm estado do jogo.

As matrizes têm 1536×1024 pixels; a capa tem 1230×1278. As pranchas e a madeira não foram recortadas ou regravadas. Apenas a capa foi recodificada em WebP; o enquadramento e as regiões são selecionados pelo navegador durante a renderização.
