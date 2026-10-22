# Artes fornecidas para Ticket to Ride

Os cinco arquivos de imagem nesta pasta são os originais de
`Ticket-to-Ride-Artes-Completas.zip`, fornecido pelo proprietário para uso no jogo.
`FONTES.md` conserva a identificação e a atribuição do tabuleiro incluídas no ZIP.

O frontend usa cópias WebP otimizadas em `frontend/assets/ticket-to-ride/` e
o JPEG original do tabuleiro. A prancha de nove cartas é apresentada por
viewports SVG, na ordem roxo, branco, azul, amarelo, laranja, preto, vermelho,
verde e locomotiva. As peças usam os quatro quadrantes da prancha de vagões;
o quinto jogador recebe a peça azul com uma rotação de matiz para roxo.
Os desenhos não são substituídos por ícones ou ilustrações vetoriais.

Os versos foram reduzidos a 512 × 768, e a prancha de peças a 768 × 512,
para os tamanhos usados na interface. As frentes mantêm 1024 × 1536 e o
tabuleiro mantém 1024 × 683. Os originais ficam fora da pasta publicada para
preservar o limite de tamanho do frontend com o instalador Windows.

`frontend/ticket-to-ride-art.js` associa os recortes, as cidades e as curvas
das rotas à imagem do tabuleiro. As coordenadas visuais são independentes
das regras e das mãos privadas mantidas pelo servidor.
