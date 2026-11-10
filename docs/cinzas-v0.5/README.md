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

## Campanha Renascimento

Os 15 capítulos originais continuam na mesma ordem. Após a Forja, a expedição
segue pelas Geleiras do Silêncio e pelo Bastião do Alvorecer. São cinco regiões,
25 capítulos e cinco guardiões ao todo. Os dois guardiões novos mudam de padrão
com a vida baixa. O checkpoint antigo da Forja ainda abre o caminho ao capítulo
16. Os fundos das Geleiras e do Bastião são novos panoramas gerados pela
ferramenta integrada, com prompts no registro de artes. As três sentinelas das Geleiras controlam o portal do capítulo 16.
Em As torres que cantam, o Sino da Vigília dá uma ficha de reroll junto à
carta após limpar o entorno. A Horda mantém suas arenas e sua rotação.

### Ponte do Sino da Vigília

No capítulo 22, **As torres que cantam**, ativar o Sino da Vigília também
ergue duas passarelas elevadas com uma relíquia opcional. O prompt anuncia
essa função. A rota usa o mesmo registro do santuário; um checkpoint que
já o registrou conserva a abertura e a relíquia consumida. A recompensa fica
indisponível antes do sino. A continuação aceita o máximo acumulado de dez
relíquias até esse capítulo, sem duplicar pontos ou coleta.

## Legado da expedição

A melhor marca de capítulos limpos fica no perfil local. Os capítulos 3, 5,
10 e 15 liberam a escolha da Lâmina, do Arco, do Martelo e do Cajado como
preferência para novas expedições. A arma escolhida sempre aparece entre as
três cartas iniciais, inclusive após reroll. As outras cartas continuam
sorteadas. O mesmo seletor oferece quatro variantes permanentes nos marcos 5/10/15/20.

| Variante | Condição | Escolha tática |
| --- | --- | --- |
| Lâmina de guarda | Capítulo 5 | Dano básico −15%, recebe 20% menos dano durante a preparação do corte |
| Arco do eco | Capítulo 10 | Duas flechas de 65% em leque e recarga base de 0,48 s |
| Martelo de ruptura | Capítulo 15 | Golpe básico de 180% atravessa a guarda do escudeiro, ante 215% da versão ancestral |
| Cajado das geadas | Capítulo 20 | Orbes de 75% aplicam gelo por 2 s, ante 95% do Cajado das Marés |

A build, a variante e a preferência da tentativa são restauradas pelo checkpoint. O Legado não altera o sorteio da Horda.

Um checkpoint de campanha válido já existente conta para a melhor marca.
O capítulo 20 libera a Runa das Geleiras para aplicar gelo no especial neutro.
O capítulo 25 libera a Runa do Alvorecer para causar queimadura. A runa é
opcional e pertence à expedição. Elementos adquiridos e selecionados durante
a partida têm prioridade. O backup v3 leva o Legado junto aos dois
checkpoints e aos recordes. Importar
backups v1 e v2 continua possível e nunca reduz a melhor marca local.

## Treinar região

No menu da Expedição, escolha **Treinar região desbloqueada** e **Treinar
região**. A Floresta fica disponível desde o início; as outras regiões são
liberadas ao concluir o capítulo 5, 10, 15 ou 20. O treino cobre cinco
capítulos e termina no guardião da região. Não concede Legado, recordes ou
checkpoints. Você pode sair pela pausa e retomar a campanha normal depois.

O preparo de treino soma +20 vida, +20% dano base, +8% cadência e +3%
resistência por região anterior. Esses valores estão separados das cartas e
dos bônus da expedição normal. A oferta inicial escolhe a arma; variantes e
runas já adquiridas funcionam no treino. Repetir conserva a região escolhida.

## Conquistas locais

**Conquistas**, no menu, lista oito feitos derivados do Legado e dos recordes:
capítulos 1/5/10/15/20/25 da Expedição e ondas 5/20 da Horda na edição 0.5.
A tela mostra os requisitos e o avanço e atualiza as marcas ao abrir. Não
concede recompensas extras nem regrava progresso. Alterar a arma preferida
conserva os feitos; o backup existente leva as marcas que os comprovam.
Recordes de edições anteriores permanecem preservados, sem contar nas metas
da Horda atual. O diálogo segue a pausa e a navegação por teclado/controle.

## Controles

**Créditos**, no menu, apresenta as atribuições do projeto. O diálogo também
é acessível pela navegação do controle; abrir durante a partida pausa e
fechar retoma a sessão, conservando o progresso.

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

**Reduzir tremor de tela**, em Controles, remove a agitação da câmera e guarda
a escolha. Sem preferência salva, segue a configuração de movimento reduzido
do sistema. A opção conserva impactos, avisos e animações de combate.

**Controles → Remapear teclado** altera 11 ações: mover à esquerda/direita,
descer, pular, esquivar, atacar, interagir, especial, pausa, elemento e reroll.
Escolha uma ação e pressione letra, Espaço, Shift ou número 0/5–9. Uma tecla
ocupada troca de lugar, inclusive quando era um atalho alternativo; os demais
atalhos continuam visíveis. Shift sozinho confirma na liberação, enquanto
combinações com modificadores são rejeitadas. Esc cancela a captura; Tab,
setas e números 1–4 mantêm navegação e seleção. **Restaurar teclas padrão**
recupera os atalhos originais. As dicas e a descrição do canvas acompanham a
preferência salva; o guia de movimentos documenta os padrões.

**Mostrar comandos de** permite consultar teclado, Xbox, PlayStation e genérico antes de conectar o controle. **Controles** oferece diagrama, teste dos botões, remapeamento, gráficos e áudio. Botões duplicados trocam de ação; menus mantêm confirmação A/× e retorno B/○. Nos volumes, direcional esquerdo/direito ajusta o nível. Desconectar um controle usado pausa a run. Touch disponível no celular.

## Progresso

O salvamento é local a este navegador e endereço do jogo. Não há ranking compartilhado entre computadores. **Exportar backup** e **Importar backup** abaixo do ranking permitem transferir o progresso; não limpam os recordes antigos. O quadro da 0.5 considera apenas essa edição para comparar as mesmas regras. Na integração atual, **Continuar campanha** restaura o último marco de capítulo: entrada com a build adquirida, área limpa ou escolha de saída pendente. A horda tem seu próprio save. Ações, danos, abates e recompensas de santuário posteriores ao marco de entrada são descartados ao retomar; concluir a área guarda a build e os objetos consumidos. Não é um save do frame exato. Nova expedição pede confirmação antes de substituir a campanha; a morte ou a vitória encerram o save da run, mantendo a horda e os recordes separados. A build da horda continua reconstruída das cartas adquiridas, sem preservar danos ou abates posteriores ao checkpoint.

O backup atual usa formato 3 e leva campanha, Horda, Legado e recordes.
Backups dos formatos 1 e 2 continuam importáveis. Um checkpoint inválido rejeita
a importação inteira. O jogo informa quando o armazenamento recusa a gravação.

Falhas de quota mantêm o checkpoint nesta sessão e uma gravação posterior
repete a tentativa. Quando outra aba atualiza o mesmo save, a tentativa local
permanece jogável e exportável sem substituir a mais recente no disco. Fechar
ou recarregar perde dados que ainda estão apenas na sessão. Preferências e
recordes conservam os saves das outras abas. A confirmação de nova expedição
é refeita se o checkpoint mudar enquanto o diálogo está aberto.

Um documento local ilegível é preservado. A sessão nova pode ser exportada;
importar um backup válido arquiva primeiro os bytes originais em
`cinzas-demo-v1.invalid.bak`, com sufixo se necessário.

## Jogar e publicar

Abra `dist/index.html` localmente ou publique o conteúdo de `dist/`. Para atualizar seu domínio Surge, extraia o pacote e execute `PUBLICAR_SURGE.cmd` no Windows, ou:

```bash
npx --yes surge ./dist cinzas-do-abismo.surge.sh
```

Use sua conta Surge quando solicitado. O pacote não publica automaticamente naquele domínio.

## Inventário e continuação

A regressão de coleta máxima cobre os 25 capítulos em três sementes e reabre
cada marco, incluindo a rota do Sino. Conserva santuários, relíquias, pontos e
rerolls; a expedição com todos os opcionais registra 11 relíquias. O ensaio
remove inimigos da fixture para isolar persistência e não substitui o teste de
combate ou o playtest humano.

## Verificação

```bash
node check-game.cjs
node check-balance.cjs caminho-do-resultado.json
node check-exploration.cjs
node check-regressions.cjs
node check-controller.cjs
node check-ui.cjs
node check-v5.cjs
node check-audio.cjs
```

Cobertura: campanha até vitória, IA das áreas, três sementes nos 20 percursos de exploração, colisões em rampas/tetos, cartas/reroll/níveis, origem compartilhada dos disparos, especiais por arma, sete arenas, progressão e desbloqueio, saves em três estados, backup, recordes, áudio com dublês e fluxos de interface/controle simulados.

`check-render.cjs` usa `@napi-rs/canvas` para desenhar os recursos WebP reais nas três resoluções, conferir as áreas, túneis, arenas e poses de herói/monstros. `ABYSS_QA_DIR` escolhe a pasta de imagens. A dependência é só para esse teste, não para jogar. Áudios MP3 foram decodificados para conferir duração, nível e ausência de clipping.

A edição 0.5 teve simulação, renderização nativa e inspeção dos disparos, túneis e criaturas. No Renascimento, os testes dos 25 capítulos exercitam os marcos com combate resolvido por fixture. Joystick físico, fluidez e balanço final ainda dependem de sessões de jogo.

## Arquivos

`levels.js`: capítulos e arenas; `rig.js`: poses e pontos de disparo; `core.js`: simulação e checkpoints; `controller.js`: controles; `renderer.js`: desenho; `audio.js`: trilhas e efeitos; `persistence.js`: recordes e backups; `game.js`: interface.

Recursos novos em `dist/assets/v5/`. Artes geradas pela ferramenta integrada; prompts e integração em `ARTES_0.5.json`. Música e reações de dor foram compostas/sintetizadas proceduralmente por `produce-audio.py`; detalhes em `AUDIO.md`. Não há projeto Unreal/Unity, multiplayer ou serviço de ranking online neste pacote.

### Amostra de chefes e variantes

`node tests/cinzas/check-balance.cjs artifacts/duelos.json --variants` roda
cinco chefes × quatro variantes × três sementes × duas políticas automáticas.
O ensaio parte da arena com Vida, Resistência, Poder e Cadência equipados por
região; pula a campanha anterior. Não concede progresso persistente. As armas
base venceram 66/120 duelos e as variantes 65/120 no mesmo preparo. São
amostras de políticas simples, sem prova de equilíbrio humano ou travessia
completa. Os JSONs detalham vida, tempo, arma, variante e resultado em
`artifacts/renascimento-final-checks/`.

## Urna do Degelo — Renascimento

Em **O espelho sem céu** (capítulo 18), uma plataforma opcional guarda uma
Urna do Degelo. Suba com os saltos normais e ataque: espada, martelo, arco,
cajado e seus especiais podem quebrá-la. A urna tem 40 de resistência e
concede uma renovação de cartas, até 12% da vida máxima e 40 pontos. O
conteúdo só sai uma vez; a destruição não conta como abate. Projéteis inimigos
não a abrem. O rótulo, os fragmentos e a mensagem mostram o resultado.

O salvamento continua por marcos. Antes de limpar a área, retomar devolve
urna e conteúdo ao marco de entrada, junto com o restante da exploração.
Após limpar a área, o checkpoint conserva a urna consumida e os recursos,
inclusive se ela for quebrada depois da limpeza. Saves antigos continuam
válidos; IDs consumidos inválidos ou de Horda são rejeitados sem substituir
o progresso saudável. A Horda conserva seus sete layouts e não recebe urnas.

Passaram 22 verificações de exploração, incluindo sete casos novos, ataques
e especiais das quatro armas, alcance em três sementes e retomada. Core
1.481, typecheck/format/build e oito testes Web passaram. O agente inspecionou
urna intacta/quebrada e retomada pelo Chrome em 1600/1280, com fixture de
área limpa e posição próxima. O chime existente foi reutilizado; o navegador
de inspeção estava mutado, portanto não houve aceite auditivo ou humano.

Toques curtos de ataque por teclado, mouse ou botão de toque são preservados
até o próximo quadro. O pressionamento é consumido uma vez; manter o botão
continua atacando. Pausa e perda de foco descartam comandos pendentes. A
regressão dirigida usa DOM/canvas dublês e um quadro lento; Chrome confirmou
toques curtos reais em 1600/1280. Core atual: 1.482; os oito testes Web passaram.

## Condutor do Alvorecer — Renascimento

Na primeira plataforma de **O sol sob a pedra** há um condutor com 70 de
resistência. O cristal e o rótulo indicam que ataques podem quebrá-lo.
Enquanto está intacto, a arena anuncia uma coluna elétrica a cada 5 s, com
1,2 s para sair da marca. Destruí-lo cancela esse ciclo ambiental; os ataques
do Arauto do Primeiro Sol continuam. Não há cura, renovação ou pontuação.
O acesso é opcional e pode ser feito com saltos normais e qualquer arma.

Retomar o marco de combate restaura arena, chefe e condutor intactos. O save
continua no mesmo formato; IDs consumidos desconhecidos/duplicados ou de outro
capítulo são rejeitados antes de substituir a run. Urna e Horda preservadas.

Passaram 27 casos de exploração, 1.483 core, tipos/formato/build, oito Web e fluxo
DOM de teclado/aviso. O agente inspecionou objeto/aviso/destruição e retomada
em 1600/1280, com posição/invulnerabilidade/inimigos removidos em fixture e
áudio mutado. A amostra de variantes teve 66/120 vitórias; o chefe final 12/24
com condutor intacto e 11/24 inicialmente quebrado, sem simular seu custo.
As políticas saltam em função dos avisos; isso não comprova equilíbrio humano.
Revisões Standards/Spec concluídas sem achados, com repetição dos 27 casos e
fluxo DOM. Acabamento/áudio/aceite humano continuam abertos.

## Resolução da derrota — Renascimento

Uma derrota durante a simulação interrompe o combate restante daquele quadro.
Um projétil, queimadura ou campo posterior não pode conceder abate, pontos ou
cura de Pacto vital ao jogador já derrotado. O tratamento cobre contato,
projétil inimigo, campo hostil, lava e queda durante a preparação de um golpe.
Acertos resolvidos antes do dano fatal mantêm seu crédito; sofrer dano não
fatal permite continuar o quadro, com golpes e cura normais. A tela final e
o recorde da Horda refletem esse resultado, sem checkpoint da tentativa morta.

Passaram 28 verificações de gameplay, incluindo os sete casos novos, fluxo
DOM com armazenamento e 1.484 core, tipos/formato/build e oito Chrome. Os
cinco erros foram reproduzidos também com um único nível legal de Pacto vital
antes da correção; o ensaio inicial usava uma cura artificial de 10. A inspeção
Chrome em 1600/1280 confirmou zero abates/pontos posteriores à derrota, remoção
do save morto e recarga sem Continuação. A fixture prepara vida baixa,
contato e flecha pendente; não é uma campanha jogada ou aceite humano.
A matriz de variantes manteve 66/120 vitórias (8/18/5/23/12 por guardião),
com vida zero nas derrotas, sem mudar números de combate ou formato de save.
Revisões finais Standards/Spec concluídas sem achados restantes; ambas
reexecutaram os 28 casos e conferiram os documentos donos.
Áudio mutado e renderização por software, sem prova de desempenho físico.
