# Produção das artes — Cinzas do Abismo 0.2

Método: geração integrada de imagens; quatro solicitações, incluindo uma edição para retirar as armas do herói. As imagens finais foram convertidas para WebP. As três faixas do atlas de cenários foram recortadas em arquivos independentes. Transparência original preservada nos personagens.

Arquivos utilizados:

- `dist/assets/forest.webp`: floresta esquecida com árvores monumentais, musgo, cascatas, névoa verde e luz da lua.
- `dist/assets/ruins.webp`: ruínas de catedral gótica sob um eclipse violeta, pedra antiga e névoa.
- `dist/assets/forge.webp`: forja vulcânica com ferro, lava, fumaça e luz laranja.
- `dist/assets/creatures.webp`: atlas 4×2 com criatura de musgo, morcego, feiticeiro, guardião das raízes, sentinela espectral, rei da forja e duas plataformas.
- `dist/assets/hero.webp`: atlas 4×2 com quatro fases de corrida, repouso, salto, golpe e esquiva. Armas são desenhadas separadamente para acompanhar as cartas escolhidas.

## Prompt de cenário

Production environment atlas for a 2D side-scrolling dark fantasy game called Cinzas do Abismo. One wide image, divided into three perfectly equal horizontal strips stacked vertically, each strip a seamless wide landscape. No borders, words, UI or characters. Side-on orthographic camera; atmospheric realistic game concept art, photographic materials, volumetric light, smooth textures; not pixel art. Top: moonlit forgotten forest, gnarled trees, moss, stone shrine, emerald fog, silver moonlight, fireflies. Middle: ancient gothic cathedral ruins during purple eclipse, broken arches, wet stone, mountains, lavender fog, moon halo. Bottom: volcanic forge, black iron arches, molten lava, slag, sparks, charcoal smoke, radiant light. Horizontal dark rocky ground at bottom, clear playable space.

## Prompt de inimigos

Production enemy sprite atlas, transparent background, exact 4-column 2-row equal grid. Eight full-body assets, centered with margins, no text or grid. Consistent realistic dark fantasy 3D render; photographic bark, stone, leather and metal; not pixel art. Facing left in side/three-quarter profile. Top: moss goblin, bat with leathery wings, hooded skeletal sorcerer, tree golem with branch antlers and green crystal. Bottom: spectral eclipse knight, armored forge king with lava cracks and hammer, moss rock platform, dark stone platform. Full body within cells, moonlight rim illumination.

## Prompt do herói

Eight-frame character sprite sheet, transparent background, exact 4×2 grid. Same full-body adult Black male wanderer, dark teal leather hood and cloak, copper-orange scarf, layered leather armor, steel shoulder plate, boots. Facing right in side profile. Realistic detailed 3D render, smooth contours, no pixels. Same size and registration. Top: four walking/running phases. Bottom: idle, jumping, forward attack, low dash. Preserve identity and clothing across frames.

## Prompt da edição final

Preserve the exact eight-cell 4×2 grid, framing, identity, every pose, lighting, detailed realistic 3D style, clothes, boots, scarf, hood and transparent background. Remove every sword/blade completely from all eight characters. Leave arms and hands in the same positions, empty, suitable for compositing different weapons. No other changes, grid lines or labels. Keep exact dimensions and registration.


## Edição 0.3

Novas imagens geradas com a ferramenta integrada de imagens. Prompts completos em `ARTES_0.3.json`. Recursos usados em `dist/assets/v3/`: três cenários, atlas de 12 poses de movimento e 16 de combate, retrato, seis peças de terreno e oito ilustrações de cartas. Cenários agora têm imagens independentes com maior altura útil. As células dos sprites foram recortadas e alinhadas pela base do personagem para reduzir saltos de posição, com transparência preservada. Terrenos foram recortados e posicionados pelo topo de colisão. Arquivos finais em WebP.


## Edição 0.4

Ferramenta integrada de geração de imagens, com referências do herói e das criaturas anteriores. Prompts completos em `ARTES_0.4.json`. Arquivos de produção em `dist/assets/v4/`: 76 poses de herói, 52 poses de inimigos, dois cenários adicionais e 12 ilustrações de cartas. As armas fazem parte de cada pose do herói; não há espada desenhada separadamente da mão.

Os atlas foram separados por componentes conectados do canal alfa, preservando poses que ultrapassaram os limites nominais de uma célula. A escala do corpo do herói é comum entre armas e combos; pés registrados numa linha fixa. Atlas de chefes com poses sobrepostas foram substituídos por arquivos independentes com oito poses por chefe. Transparência mantida no WebP. As variantes descartadas não são usadas pelo jogo.

## Edição 0.5

Oito gerações integradas: corte giratório/golpes aéreos, arco baixo/aéreo/especial, cajado baixo/aéreo/especial, quatro novos mobs, espectro, oito materiais, fundo subterrâneo e nova floresta. Prompts completos em `ARTES_0.5.json`. Atlas alinhados em células de 512 pixels com pés em y=480, preservando os componentes alfa completos. O ponto de disparo é calibrado nos recursos de produção e compartilhado entre física e desenho. Materiais opacos preenchem polígonos que seguem a colisão, com padrões em coordenadas do mundo. Novos fundos usam panorama contínuo sem repetir bordas visíveis e transição gradual por zona.
