# Fontes de arte

`vesper.blend` contém o modelo original do Vesper, materiais, pesos de skin, 32 ossos e seis ações de animação. Abra com Blender 4.3 ou superior. O repouso é a trilha NLA inicialmente ativa; para editar outra ação, selecione sua trilha e isole-a.

O arquivo foi criado pelo script `scripts/art/build_vesper.py` na raiz do repositório. A versão pronta para o Godot está em `godot/assets/models/vesper/vesper.glb`; não é preciso ter Blender instalado para jogar. As fontes ficam fora de `godot/` para evitar importação automática do `.blend` e dependência de Blender durante a importação do jogo.
