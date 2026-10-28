# Similo no Trono

Dedução cooperativa online para 2–8 contas confirmadas: um informante e até sete
adivinhadores. O catálogo abre a mesa sem encerrar chamadas, câmera ou tela.

## Mesa e capitão

O anfitrião escolhe o informante e os baralhos no lobby. “12 cartas da mesa”
seleciona a origem das cartas abertas; “Baralho do informante” seleciona a origem
das pistas. Cada grupo tem um tema principal e uma mistura opcional, sem repetir
o tema principal. Mesa e pistas têm
seleções independentes de um ou dois temas: Animais, História, Contos, Monstros
e Mitos. São 24 cartas por tema, com ilustrações originais aprovadas no protótipo.
Cartas da mesa são retiradas do baralho de pistas quando os temas coincidem.

O servidor sorteia 12 cartas e um segredo. O informante recebe cinco pistas e
joga uma por rodada, indicando semelhança (vertical) ou diferença (horizontal),
sem explicar a conexão. As pistas anteriores continuam visíveis. Reposição de
uma carta após as quatro primeiras pistas.

Os adivinhadores confirmam conjuntos de 1, 2, 3, 4 e 1 cartas nas cinco rodadas.
O capitão alterna na ordem dos adivinhadores, começando pelo primeiro. Quando
todos votaram, ele confirma o conjunto unânime ou escolhe um conjunto final
válido se houver divergência. Votos são consultivos nessa segunda situação;
não há votação majoritária automática. Somente o capitão pode eliminar, e
somente depois dos votos confirmados. Essa é a variante de capitão solicitada.

A revelação dura 2,2 segundos e é concluída pelo servidor. Eliminar o segredo
encerra a partida; deixá-lo como última carta vence. O anfitrião pode iniciar
outra partida após o resultado. A ordem de capitães reinicia na nova partida.

Reconexão conserva cadeira e voto por 90 segundos. Enquanto alguém está offline,
novas jogadas ficam pausadas. Sair explicitamente ou esgotar esse prazo encerra
uma partida ativa para todos; no lobby, somente libera a cadeira e transfere o
anfitrião/informante quando necessário. Salas são voláteis e expiram por inatividade;
não há ranking individual nem migração de banco.

## Interface e informação

A mesa usa fundo escuro, controles no cabeçalho e pistas numa faixa própria.
Telas pequenas permitem rolagem vertical; fullscreen usa o controlador comum.
A lista de membros conserva a abertura padrão e pode ser recolhida pelo próprio
controle da Corte, integrado ao cabeçalho do Similo.

A relação de uma pista jogada é a enviada pelo servidor. A faixa de pistas e
a janela de ampliação preservam sua orientação e identificam “Vertical · Parece
com” ou “Horizontal · É diferente”. Cartas ainda não jogadas e cartas da mesa
continuam em pé. O layout reserva a área horizontal da pista sem depender de uma
animação; reflow e movimento reduzido não alteram sua relação.

Mouse e teclado abrem informações flutuantes; o “i” também amplia por toque.
Todas as 120 cartas têm contexto, resumo e três características. Animais indicam
uma espécie de referência e sua alimentação/classificação; o nome comum e a
ilustração podem representar outras espécies. Datas incertas estão aproximadas.
Contos identificam uma versão publicada e um resumo, sem assumir uma única versão
oral. Mitos e monstros indicam a tradição correspondente. Essas informações são
públicas e iguais para todos, sem referências ao segredo sorteado.

Votos e eliminações têm animações; movimento reduzido remove as transições.
Após os três primeiros votos numa carta, os demais aparecem num marcador com
contagem, nomes acessíveis e título, preservando a área da ilustração e do nome.
Efeitos procedurais usam o dono de áudio do Trono, seu mute global e ganho
independente do Similo. O botão da mesa pode silenciar só essa apresentação.

## Fontes e publicação

- `src/lib/games/similo/`: catálogo, informações, regras, projeção e controlador.
- `server/similo-*`: comandos, autorização, salas e prazos.
- `src/components/games/similo-*`: React, HUD e adaptação aos donos existentes.
- `art/v1/`: cinco folhas WebP sem perda, com pixels iguais aos PNGs do protótipo.

O segredo e a mão ficam no servidor e são enviados somente ao informante.
Nenhum cliente recebe a pilha de compra. O serviço deriva o ator da conta no
socket, valida revisão e ignora papéis enviados pelo usuário. Não existe seletor
local para assumir o papel de outra pessoa.

`node scripts/build-similo-art.cjs` prepara as folhas e os hashes em
`artifacts/similo-art`. Windows full app distribui `Similo-Art-<versão>.zip`,
valida o mesmo commit e publica em `https://similo-mn.surge.sh/` antes do frontend.
O publicador confere o download completo de cada folha por SHA-256. Os arquivos
`v1/*.webp` preservam esta edição das cartas; alterações futuras da arte devem
usar outro prefixo. A fonte Manrope e sua licença ficam no frontend.

Arte remota mantém frontend + instalador dentro do limite preventivo de 190 MiB.
O Similo precisa de rede para a partida e as imagens; não é um jogo offline.
Atualize o backend com este código e confira `GET /health`: `features.similo`
precisa ser `true`. Um backend antigo recebe uma mensagem de indisponibilidade
no cliente, sem substituir ou simular a partida.

Validação pelo dispatcher existente: `npm test -- --filter similo` (core) e,
após `npm run build`, `npm test -- --suite browser --filter similo`.
Os cenários de navegador usam três contas e WebSocket reais em backend descartável,
com provedores de conta e mídia de teste. As folhas são espelhadas com os bytes
reais da distribuição, sem depender de produção. Não comprovam hardware físico.
