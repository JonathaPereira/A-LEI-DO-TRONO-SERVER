# Arquivo — primeira etapa da apresentação 3D

**A apresentação principal voltou ao 2D na Alpha 0.10.** Esta página documenta a etapa anterior, preservada como estudo. Abra o Vesper em **Extras → Arquivo 3D**; a arena 3D pode ser exercitada pelos testes e pela captura `tests/capture_3d.gd`. [Direção 2D atual](TWO-D.md).

**Estudo dedicado posterior:** Vesper recebeu um modelo próprio com esqueleto e seis animações; o ateliê pode ser aberto pelo menu. Os demais personagens preservam a apresentação desta primeira etapa. [Vesper — direção de arte e controles](VESPER.md).

O combate principal passa a usar uma arena 3D e personagens volumétricos no Godot. Esta é a primeira implementação jogável da direção visual aprovada: três integrantes em formação triangular de cada lado, profundidade real, iluminação e efeitos de ataque, com vida, energia e escudo independentes no HUD.

Os modelos desta etapa são construídos com malhas e articulações procedurais. Eles permitem jogar, testar silhuetas, enquadramento, movimento e leitura dos golpes sem depender de modelos externos. Ainda será necessário produzir modelos e animações de maior detalhe para alcançar o acabamento da arte conceitual. A arte conceitual continua sendo a referência de qualidade desejada.

## Experimentar

Abra `project.godot` no Godot 4.6 ou superior, aguarde a importação e pressione **F5**. Entre em **Combate livre** ou inicie uma missão de **História**. Escolha habilidade e alvo e execute o golpe. A janela flutuante mostra os valores resolvidos pelo motor: dano à vida, dano ao escudo, crítico, cura, energia e efeitos positivos ou negativos com duração. O **Registro** preserva os detalhes após a janela desaparecer.

Os ataques têm preparação, ação, contato e recuperação. O contato dispara uma única atualização dos valores exibidos; a próxima ação permanece bloqueada durante a recuperação. **Reduzir animações** mantém a resolução do combate e encurta a apresentação. Reiniciar ou sair da batalha cancela a sequência anterior.

As fichas, ilustrações de habilidades e retratos continuam disponíveis. A galeria **Golpes** mantém a apresentação ilustrada anterior para comparação. A campanha, as gemas e as regras de combate continuam usando os mesmos dados de referência; esta etapa não implementa PvP online nem novos capítulos de história.

## Arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `scripts/battle_stage_3d.gd` | Arena, câmera, iluminação, posições, projeção para o HUD e sequência dos ataques |
| `scripts/hero_model_3d.gd` | Modelos e movimentos dos personagens |
| `scripts/combat_vfx_3d.gd` | Impactos por afinidade: chamas, raízes, campos técnicos, órbitas e sombras |
| `scripts/main.gd` e `scripts/combat_ui.gd` | Integração entre combate, cena 3D, fichas laterais e controles |
| `scripts/animation_director.gd` | Callback do contato, recibos e apresentação dos efeitos de turno |
| `scripts/damage_receipt.gd` | Janela flutuante de resultado, com valores e estados por alvo |

O motor calcula o resultado antes da apresentação, em uma cópia da partida. A cena 3D recebe somente os dados necessários para apresentar a ação. O callback no contato atualiza o HUD; a conclusão da recuperação libera a ação seguinte. Essa divisão permite refinar modelos, animações e câmeras sem duplicar as fórmulas de dano ou alterar o balanceamento.

## Validar

Na raiz do repositório, com Godot no `PATH`:

```bash
npm test
npm run test:godot
godot --headless --audio-driver Dummy --path godot --script res://tests/damage_receipt.gd
godot --headless --audio-driver Dummy --path godot --script res://tests/stage_3d.gd
```

Os testes de paridade comparam o motor Godot com o JavaScript, incluindo regras, efeitos de turno, campanha e partidas completas. Os testes adicionais verificam a construção dos personagens 3D, as posições e a projeção, callbacks únicos, cancelamento e a precisão das janelas flutuantes. A validação visual precisa de uma janela com renderização; o modo `--headless` verifica lógica e geometria, mas não comprova qualidade de imagem nem desempenho em uma GPU real.

Para gerar as capturas de revisão em uma máquina com display:

```bash
mkdir -p artifacts/3d-review
godot --audio-driver Dummy --path godot --script res://tests/capture_3d.gd -- "$PWD/artifacts/3d-review"
```

Em ambientes com diretório pessoal somente para leitura, defina `XDG_DATA_HOME`, `XDG_CONFIG_HOME` e `XDG_CACHE_HOME` para pastas graváveis antes de executar Godot. As preferências e o progresso dos testes devem usar pastas isoladas, preservando os arquivos do jogador.

## Próximas entregas de arte

Refinar uma arena e um personagem com modelo, materiais, esqueleto e animações finalizados continua sendo o caminho para validar o acabamento desejado. Depois dessa validação, o mesmo padrão pode ser aplicado ao restante do elenco e aos inimigos da história. Animações próprias, cenários adicionais e direção de câmera podem evoluir sobre a integração desta etapa. Progressão adicional e PvP online exigem entregas específicas de sistemas e conteúdo.
