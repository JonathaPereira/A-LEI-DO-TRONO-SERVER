# Cinzas do Abismo — Demo 0.5

Roguelite 2D de plataforma para navegador. `dist/` contém o jogo e todos os recursos locais; não há servidor necessário para jogar.

## Novidades

- Flechas e projéteis saem do arco e da ponta do cajado. A mesma transformação de pose define o desenho e o ponto de disparo, inclusive no ar, em ataques baixos e virados para a esquerda.
- 32 poses novas do herói: corte giratório, golpes aéreos, disparos baixos, disparos no ar e carregamento dos especiais. Armas continuam integradas às mãos no próprio sprite.
- Especial único por arma: espada, corte giratório em três impactos; arco, tiro concentrado perfurante; cajado, projétil elemental explosivo; martelo, impacto sísmico com ondas laterais. Recargas base de 6, 7, 6 e 8 segundos, respectivamente. O elemento adquirido altera reações, partículas e sons.
- Campanha preserva seus 15 capítulos distintos. Agora há somente três santuários opcionais, um por região, e seis relíquias ao longo da expedição. Relíquias dão 200 pontos, sem cura; três concedem um reroll. Santuário cura 8%; portal comum, 10%; saída de chefe, 15%. Cartas defensivas têm limites menores.
- Doze passagens subterrâneas, com descidas, teto sólido, tochas, plataformas e retorno à superfície. O cenário transita dentro da própria área. Chão e teto usam materiais contínuos alinhados às superfícies físicas, com oito texturas novas. Novo fundo de floresta e de túneis.
- Sangue com gotas e manchas temporárias, queimaduras com chamas/brasas/fumaça, gelo com cristais, descargas elétricas, veneno e rastros elementais. Impacto, carga, giro, tiro e explosão têm efeitos próprios.
- Horda com sete layouts: arena, ravina, gelo, galeria subterrânea, cisterna, esteiras e plataformas ao vento. Mantém elevadores e eventos. Dez arquétipos são desbloqueados gradualmente: criatura de musgo, morcego, feiticeiro, aranha, caçador, bruto, arqueiro, guerreiro de escudo, espectro e cão infernal. Cinco novas criaturas têm 24 poses próprias.
- Vida, dano, frequência de surgimento e quantidade de monstros aumentam progressivamente. Chefes a cada cinco ondas; após os três primeiros trios, cartas em ondas alternadas e nos chefes. Curar ao limpar uma onda recupera 4%, ou 8% nas ondas de chefe.
- Recordes por nome e dificuldade salvam ao concluir ondas e encerrar a run. A horda guarda o início da onda, a onda concluída ou a carta pendente. **Continuar horda** restaura esse checkpoint com a mesma build. Morrer encerra o save da run. Exportação/importação JSON transporta recordes e checkpoint.
- Quatro trilhas originais, por floresta, túneis/ruínas, forja e chefes; efeitos de armas, elementos, impacto, passos, esquiva e três reações sintetizadas de dor. Música e efeitos têm volumes independentes em **Controles**. Som inicia após uma interação; botão ♫ desativa/ativa.

## Controles

| Ação | Teclado | Xbox | PlayStation |
| --- | --- | --- | --- |
| Mover | A/D ou ←/→ | Analógico / direcional | Analógico / direcional |
| Pulo / pulo duplo | Espaço/W/↑ | A | × |
| Descer plataforma fina | S/↓ + pulo | ↓ + A | ↓ + × |
| Ataque contínuo / combo | J/Z/mouse esquerdo | X | □ |
| Especial da arma | K/X | RB | R1 |
| Esquiva | Shift/L | B | ○ |
| Santuário / portal | E/Enter | Y | △ |
| Trocar elemento | Q ou 1/2/3/4 | LB | L1 |
| Pausa | Esc/P | Menu | Options |
| Grimório / build | Tab | View | Share |
| Reroll nas cartas | R | RT | R2 |
| Escolher carta / menu | 1/2/3 ou mouse | Direcional + A | Direcional + × |

**Mostrar comandos de** permite consultar teclado, Xbox, PlayStation e genérico antes de conectar o controle. **Controles** oferece diagrama, teste dos botões, remapeamento, gráficos e áudio. Botões duplicados trocam de ação; menus mantêm confirmação A/× e retorno B/○. Nos volumes, direcional esquerdo/direito ajusta o nível. Desconectar um controle usado pausa a run. Touch disponível no celular.

## Progresso

O salvamento é local a este navegador e endereço do jogo. Não há ranking compartilhado entre computadores. **Exportar backup** e **Importar backup** abaixo do ranking permitem transferir o progresso; não limpam os recordes antigos. O quadro da 0.5 considera apenas essa edição para comparar as mesmas regras. A campanha ainda reinicia ao iniciar uma nova run. A build da horda é reconstruída das cartas adquiridas ao retomar, sem preservar danos ou abates posteriores ao checkpoint.

## Jogar e publicar

Abra `dist/index.html` localmente ou publique o conteúdo de `dist/`. Para atualizar seu domínio Surge, extraia o pacote e execute `PUBLICAR_SURGE.cmd` no Windows, ou:

```bash
npx --yes surge ./dist cinzas-do-abismo.surge.sh
```

Use sua conta Surge quando solicitado. O pacote não publica automaticamente naquele domínio.

## Verificação

```bash
node check-game.cjs
node check-exploration.cjs
node check-regressions.cjs
node check-controller.cjs
node check-ui.cjs
node check-v5.cjs
node check-audio.cjs
```

Cobertura: campanha até vitória, IA das 15 áreas, três sementes nos percursos, colisões em rampas/tetos, cartas/reroll/níveis, origem compartilhada dos disparos, especiais por arma, sete arenas, progressão e desbloqueio, saves em três estados, backup, recordes, áudio com dublês e fluxos de interface/controle simulados.

`check-render.cjs` usa `@napi-rs/canvas` para desenhar os recursos WebP reais nas três resoluções, conferir as áreas, túneis, arenas e poses de herói/monstros. `ABYSS_QA_DIR` escolhe a pasta de imagens. A dependência é só para esse teste, não para jogar. Áudios MP3 foram decodificados para conferir duração, nível e ausência de clipping.

Esta edição foi verificada com simulação, renderização nativa e inspeção visual dos disparos/túneis/criaturas. Não houve playtest em navegador real, joystick físico ou avaliação auditiva das trilhas; fluidez e balanceamento ainda precisam da sua experiência jogando.

## Arquivos

`levels.js`: capítulos e arenas; `rig.js`: poses e pontos de disparo; `core.js`: simulação e checkpoints; `controller.js`: controles; `renderer.js`: desenho; `audio.js`: trilhas e efeitos; `persistence.js`: recordes e backups; `game.js`: interface.

Recursos novos em `dist/assets/v5/`. Artes geradas pela ferramenta integrada; prompts e integração em `ARTES_0.5.json`. Música e reações de dor foram compostas/sintetizadas proceduralmente por `produce-audio.py`; detalhes em `AUDIO.md`. Não há projeto Unreal/Unity, multiplayer ou serviço de ranking online neste pacote.
