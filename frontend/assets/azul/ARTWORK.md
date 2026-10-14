# Arte de Azul aplicada

- tiles-and-factories.png: prancha aprovada na conversa, preservada sem alteração. Inclui peças, expositor vazio, primeiro jogador, cubos de pontuação e placa de nome.
- mural.png: cartão mural aprovado, preservado sem alteração. Fornece moldura, papel, encaixes, chão de sete espaços e painel de bônus.
- box-cover.png: capa preparada a partir da foto enviada pelo usuário, com transparência externa.
- wood-table.png: textura de madeira gerada para a mesa.

azul-art.css compõe as regiões dessas imagens com background-size/background-position. A grade continua no DOM para preservar cliques, acessibilidade, seleção e animações. As cores e a quantidade de casas vêm de azul-rules.js; os valores e as jogadas são validados pelo servidor. As imagens não contêm estado do jogo.

As matrizes têm 1536×1024 pixels; a capa tem 1230×1278. Os arquivos aprovados não foram recortados ou regravados: o navegador seleciona as regiões durante a renderização.
