# Impactos pintados 2D

`elemental-impact.png` foi criado com geração de imagem para esta revisão. Contém quatro etapas por efeito e cinco famílias: fogo, água, natureza, energia arcana e sombra. É uma folha de sprites, não uma captura de gameplay.

As regiões estão em `godot/data/impact-frames.json`. `impact_bloom.gd` combina etapas adjacentes e as posiciona no contato; `area_wave.gd` desenha a propagação conjunta. Ambos usam somente os alvos e eventos reais da ação e não calculam dano.

As capturas em `docs/polish-preview/` e o vídeo dessa pasta são produzidos pelo Godot com `tests/capture_012.gd`, incluindo áudio real do jogo. As artes, poses e efeitos anteriores permanecem disponíveis no projeto.
