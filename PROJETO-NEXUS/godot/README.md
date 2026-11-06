> **Checkpoint Renascimento:** estado atual em [ROADMAP.md](ROADMAP.md), [CAMPAIGN.md](CAMPAIGN.md) e [PROGRESSION.md](PROGRESSION.md). 24 heróis, seis afinidades, nove missões, regras 0.16.0 e save 8. As capturas e notas de alpha abaixo registram etapas anteriores.

> **Alpha 0.14:** [PvP com servidor correto, vozes em português e efeitos otimizados](POLISH-0.14.md).

> **Alpha 0.13:** [Como jogar PvP, publicar e integrar](PVP.md).

# NEXUS em Godot — Alpha 0.12 / menu, estados e impacto 2D

[Novidades da Alpha 0.12 e capturas reais](POLISH-0.12.md). [Classes, retornos e oficina de gemas](CLASSES.md).

Godot 4.6 Standard / GDScript, gratuito e sem addons pagos. Validado com Godot 4.6.3 em Linux.

A apresentação principal usa **2D**, com as ilustrações e poses preservadas, cenários animados, golpes refeitos, efeitos de tela e janelas de resultado. A campanha tem **três capítulos e nove missões**. O botão **Automático · A** permite que sua equipe escolha alvos e habilidades. [Guia da nova apresentação e controles](TWO-D.md).

O menu se divide em **Início**, **Modo História**, **Coleção**, **Jogar** e **Extras**. Heróis e gemas ficam nos submenus de Coleção; galeria, treinos, laboratório e estudo 3D do Vesper ficam em Extras. [Arquivo editável do Vesper](VESPER.md).

## Atualizar e abrir no Windows

1. Feche o Godot. Use a pasta desta revisão do projeto, que contém `godot/scripts/impact_modern.gd`. Branches anteriores e a versão web não incluem esta etapa.
2. Se baixar as fontes pelo GitHub, selecione a revisão com esta etapa, use **Code → Download ZIP** e depois **Extrair tudo**, em uma pasta nova.
3. No gerenciador do Godot, clique em **Importar** e selecione `godot/project.godot` dentro da pasta extraída.
4. Aguarde a importação, pressione **F5** e entre em **Combate livre** para abrir o campo 2D. Use Automático para delegar o controle da sua equipe.
5. Abra **Heróis** para ver fichas e equipar gemas. Para jogar, clique em **Começar história → Jogar próxima missão → Iniciar missão**. **Combate livre** mantém os modos anteriores.

Sua cópia anterior não atualiza automaticamente. Quem usa Git pode atualizar a branch com `git pull --ff-only`, preservando alterações locais.

## Menu, história e gemas

O menu inicial agrupa **Modo História**, **Coleção**, **Jogar** e **Extras**, com submenus para heróis, gemas, treinos, galeria e laboratório. O Sanctum tem arte própria, linhas de energia, painéis azul-escuros, acentos ciano e títulos em Space Grotesk, com Manrope nos textos. As fontes são gratuitas sob SIL Open Font License; as licenças ficam em `assets/`. **Menu**, durante uma luta, permite voltar; uma confirmação evita descartar a batalha por engano. Batalhas em andamento não são salvas.

**Heróis** reúne o elenco de 24 personagens. A ficha exibe afinidade, função e atributos base, além das abas **Habilidades**, **História** e **Engastes**. As três habilidades têm imagens, nome, descrição, custo e recarga; a sinergia explica como o kit prepara ou aproveita ações de aliados. A história inclui origem, motivação, uma fala e a relação do personagem com o Farol. Os atributos base da ficha continuam distintos dos bônus de campanha mostrados no painel de engastes.

**A jornada do Farol** tem três capítulos: **O Farol Partido**, **Marés da Memória** e **A Última Fornalha**, cada um com três missões, relatos, dicas e um chefe. A seleção mostra avanço, bloqueios e a próxima etapa. A equipe de história é independente do combate livre; os personagens restauram vida e energia entre missões. O primeiro capítulo continua compatível com o progresso anterior. [Campanha e salvamento](CAMPAIGN.md).

Cada herói tem **três engastes**, disponíveis tanto em **Heróis → Engastes** quanto em **Gemas**. Você começa com **três cópias de cada gema**: **Brasa lapidada (+4% ATQ)**, **Seiva cristalizada (+5% VIDA)** e **Pulso de éter (+8 energia inicial)**. Gemas repetidas são permitidas: três iguais somam +12% ataque, +15% vida ou +24 energia inicial, começando a missão com 64 em vez de 40. Os percentuais somam sobre o atributo base antes de um único arredondamento; não são multiplicações sucessivas.

Escolha um dos três espaços e a gema disponível. Equipar, trocar e remover é gratuito, entre missões; cada espaço ocupado consome uma cópia real do estoque compartilhado. Cada primeira vitória concede mais uma gema: Brasa, Seiva e Pulso se repetem nas três missões de cada capítulo. Repetir missões não repete a gema; uma nova vitória concede dois fragmentos. O painel mostra estoque livre, donos das cópias e atributos antes/depois.

**Gemas valem somente na história.** Combate livre, duelo local, treinos, galeria e laboratório usam os kits base das regras 0.16.0, sem bônus de gemas. Partidas de campanha não entram na tabela de balanço. Progresso, trio e engastes são salvos em `user://campaign-0.7.json`, agora no formato `schemaVersion: 8`. O progresso antigo é lido automaticamente, mantendo o engaste anterior no primeiro espaço; antes da próxima gravação, o original é preservado em `campaign-0.7.json.v1.bak` ou `.v2.bak`. Não há conta nem sincronização entre dispositivos. [Regras e missões da campanha](CAMPAIGN.md).

![Menu inicial](../docs/2d-preview/menu.png)

[Missões](preview/story.png) · [Heróis](preview/heroes.png) · [História de um herói](preview/hero-lore.png) · [Engastes do herói](preview/hero-gems.png) · [Gemas](preview/gems.png) · [Minions](preview/minions.png)

## Seis afinidades, especialidades e três funções gerais

O ciclo é **Ígneo → Natural → Técnico → Arcano → Sombrio → Lumi → Ígneo**. Vantagem: +25%; resistência na direção inversa: −15%; demais relações neutras. Classe define afinidade, enquanto tanque, suporte e dano são funções do kit. Você pode combinar livremente três personagens distintos, sem obrigação de levar um de cada função.

Há **24 personagens ativos em seis afinidades**. Auren, Elyra, Solen e Zaya retornaram com os índices originais, kits, fichas e vozes. As regras 0.16.0 fecham o ciclo Sombrio → Lumi → Ígneo; os vinte kits anteriores foram preservados. [Kits e sinergias](KITS.md).

| Classe | Tanque | Suporte | Dano | Retorno / especialidade |
| --- | --- | --- | --- | --- |
| Ígneo | Rhazen | Cindra | Veyra | Torv / crítico |
| Natural | Oren | Sylva | Nima | Brin / purificação |
| Técnico | Axion | Vektor | Kira | Bast / interceptação |
| Arcano | Elun | Saira | Astra | Ivo / aflições |
| Sombrio | Vesper | Maura | Riven | Noct / execução |

## Leitura do combate

Escolha habilidade, alvo e **Usar em…**. **1–4**, setas e **Enter** também funcionam. Ataques recuperam 24 de energia; defesa recupera 25, concede escudo e reduz dano até o próximo turno; técnica custa 30 e tem dois turnos pessoais de recarga; supremo custa 80, com alcance próprio de cada kit.

O banner mostra a **prévia normal e crítica**, separando dano à vida e ao escudo. Passe o mouse para ver os recibos por alvo, reações e estados. A prévia não altera energia, turnos ou aleatoriedade e exclui os efeitos do início do próximo turno. Críticos têm 10% de chance e +40% de dano. Ao executar, a prévia dá lugar ao resultado real; selecionar outra ação ou alvo volta a mostrar a previsão.

Vida é verde; escudo, azul; energia, violeta. O novo HUD de dano apresenta **recibos por alvo**, com números maiores para vida e escudo em linhas separadas, valor de escudo restante, quebra ou expiração e destaque dourado para **CRÍTICO**. Se o golpe inteiro for absorvido, aparece **VIDA PROTEGIDA**. Queimadura, sangramento, Fratura, duração e cura reduzida têm rótulos próprios. Os recibos procuram espaço fora das barras para facilitar a leitura; **Registro** conserva os detalhes. Combo, contra-ataque, protetor e cura da Semente mantêm identificação própria. Estados mostram duração e explicação no tooltip; muitos estados aparecem como `+N estados` para caber na ficha.

Os cards de habilidades usam imagem maior, nome em até duas linhas, tipo de alvo, energia e recarga. A seleção tem contorno luminoso; falta de energia e recarga mostram o motivo da indisponibilidade. Passe o mouse para ler a descrição completa.

Queimadura e sangramento causam 6,5% da vida máxima em dois inícios de turno, ignorando escudos; regeneração cura 4%. **Sangramento também reduz toda cura recebida em 35%**, inclusive regeneração, Semente, dreno e curas secundárias. Purificação remove efeitos negativos. Uma habilidade que cura e purifica aplica a cura antes da limpeza; a prévia mostra o valor já reduzido. Aplicar novamente renova a duração sem duplicar. Provocação limita ataques individuais, mas não ataques em área. Proteção de Oren desvia 25% de um ataque individual para ele enquanto estiver vivo; escolher o próprio Oren concede escudo, sem desvio para si.

**Fratura** começa na rodada 12: dano direto de 4% da vida máxima antes de cada ação pessoal, aumentando 2,5 pontos percentuais por rodada, até 85%. Ignora escudos. Também reduz **toda cura recebida em 10 pontos percentuais por rodada**: −10% na rodada 12, −20% na 13, até −100% na 21. Essa redução não pode ser purificada e multiplica a redução do sangramento. O HUD mostra dano e redução de cura atuais; prévia, números flutuantes e registro explicam curas reduzidas. É uma garantia contra impasses, sem obrigar funções na montagem da equipe.

## Tela cheia e Full HD

Abra **Tela** e escolha **Tela cheia Full HD 1920×1080**, depois **Aplicar**. **F11** alterna entre janela e tela cheia; **Esc** volta à janela quando não há um painel aberto. Há opções de janela 1280×720, 1600×900 e 1920×1080. O desenho usa base 1600×900 e acompanha o tamanho da tela, preservando a disposição. O modo efetivo de tela cheia segue as resoluções suportadas pelo monitor e pelo sistema. Preferências de tela ficam salvas junto das equipes. Se o jogo estiver embutido no editor, execute-o em uma janela separada para ocupar o monitor inteiro.

## Sinergias para experimentar

- **Rhazen + Cindra + Veyra:** Rhazen provoca e devolve queimadura; Cindra também prepara brasas. Veyra consome o efeito para amplificar a técnica. Como Veyra costuma agir antes de Cindra, a preparação normalmente vem da rodada anterior.
- **Axion + Vektor + Kira:** Axion e Vektor expõem a defesa; Vektor fornece energia a Kira. Sua técnica recebe bônus contra exposição, e seus disparos atravessam parte do escudo.
- **Oren + Maura + Riven:** Riven abre sangramento, reduzindo a cura recebida pelo inimigo. Maura aproveita a ferida para curar mais o aliado com menor porcentagem de vida; Oren protege esse aliado. Riven pode finalizar alvos abaixo de 35% da vida.
- **Nima + Vektor + Kira:** dois personagens de dano e um suporte, sem tanque. Sangramento atrapalha a cura adversária; exposição prepara os disparos de Kira, e Vektor entrega energia ou purifica. O trio abre mão de Provocação e proteção para pressionar um alvo.
- **Elun + Sylva + Astra:** Elun expõe a defesa e converte seu escudo em dano; Sylva semeia recuperação para quem atacar; Astra marca o próximo golpe e amplia seu supremo contra exposição.

Estas são combinações para testar, sem garantia de vitória. [Kits completos](KITS.md) detalham condições, custo e duração.

## Treinos e laboratório

**Aprender** oferece três batalhas com objetivos acompanhados no HUD: turnos/energia/defesa, afinidade/combo e escudos/dano contínuo. Os trios são fixos nesse modo; ao sair pelo botão **Voltar ao treino livre**, as equipes e opções anteriores voltam. Os treinos não entram nas estatísticas de partidas jogadas e são separados da nova campanha.

O laboratório abre por **Simulações / logs** no menu ou **Balanço** no combate. Mostra aparições e vitórias por herói, dano direto à vida, dano a escudos, cura direta, proteção efetiva, energia e combos. Danos e curas periódicos ainda não entram nos totais individuais. A duração média e a frequência da Fratura ajudam a identificar combates arrastados. Escudo concedido sem ser consumido não conta como proteção útil; a absorção é atribuída ao dono do escudo, e o dano à vida desviado, ao protetor.

As partidas jogadas ficam separadas das **simulações IA × IA**. O botão simula **216 partidas** com sementes fixas. O filtro **formações variadas** mantém 60 partidas com três funções, classes únicas e mistas, em pares espelhados. O filtro **Sustentação e retornos** separa outras 156, incluindo sessenta com os cinco retornos: Vesper/Kira/Oren, Saira/Maura/Sylva, trios de suporte, trios de tanque e espelhos que priorizam cura e substituem ataques sem cura por defesa. Assim, a amostra defensiva não distorce as médias da amostra variada. As amostras são limitadas e dependem de composição, dificuldade e decisões; a taxa de vitória não comprova equilíbrio competitivo. Guarda até 500 partidas em `user://balance-0.11.json`; apagar esse arquivo reinicia o histórico. As regras 0.11 usam arquivos separados; os dados da Alpha 0.5 permanecem no arquivo anterior. O histórico da Alpha 0.4 permanece no arquivo anterior. Equipes e preferências ficam em `user://preferences.cfg`. Batalhas em andamento não são salvas.

## Exportar simulações

1. Abra **Simulações / logs** no menu ou **Balanço** no combate e clique em **Simular 216 partidas**.
2. Escolha **formações variadas** ou **testes de sustentação**.
3. Clique em **Exportar logs JSON**, escolha a pasta e salve. O painel mostra o caminho salvo.
4. Use **Exportar tabela CSV** para abrir os resultados em uma planilha. O CSV usa UTF-8, separador `;` e vírgula decimal.

O JSON é formatado com quebras de linha e inclui versão das regras, filtro, sementes, equipes, estado inicial, alvo e recibos de cada ação, efeitos do próximo turno, vida/energia/escudo/estados após cada ação, vencedor e estatísticas finais. O log completo é do **último lote simulado**, no filtro escolhido. O mesmo arquivo também traz os resumos históricos que compõem a tabela visível. Partidas antigas têm somente resumo; não inventamos ações que não foram armazenadas.

O último lote fica salvo em `user://simulations-0.6.json` e continua exportável depois de fechar o jogo. Simular outro lote substitui esse log detalhado, preservando o histórico compacto até seu limite de 500 partidas. Os JSONs exportados em outra pasta permanecem disponíveis.

A coluna de vitórias agora exibe **vitórias/aparições e porcentagem**; amostras menores que 30 aparições recebem destaque. Os testes dirigidos podem produzir extremos como 100% porque repetem adversários específicos. Compare composição, adversário e N antes de concluir que um tanque está forte ou fraco.

O [relatório das simulações](SIMULATIONS.md) separa os resultados das 60 formações variadas e dos 96 testes de sustentação, incluindo os extremos por herói e como enviar seus logs. Essas amostras usam os atributos base, sem gemas.

## Referência da apresentação 2D anterior

A Alpha 0.10 usa novamente esta base ilustrada, com novos cenários, efeitos e organização dos medidores. As capturas antigas abaixo documentam a origem das poses e coreografias; veja as [prévias atuais](TWO-D.md) para a apresentação principal. O [estudo 3D](GRAPHICS-3D.md) permanece arquivado.

O chão é reenquadrado pela borda inferior para aparecer sob todos os pés. Silhuetas ficam ancoradas ao chão, com sombras de contato; a distância altera escala e altura. É uma apresentação 2.5D com artes em perspectiva, sem modelos 3D. A referência de disposição é o Marvel Avengers Alliance: **um personagem mais próximo do adversário, no centro, e dois atrás, um acima e outro abaixo**. As fichas ficam em colunas laterais estáveis para cada integrante, com **VIDA**, **ENERGIA** e **ESCUDO** em barras independentes, valores exatos e duração do escudo. O trio padrão novo leva Axion à frente; equipes já salvas são preservadas. Em **Equipes**, use o seletor **Personagem na FRENTE** para ordenar seu trio sem remover integrantes.

**Ataque básico acerta somente UM alvo escolhido**, que pode estar na frente ou atrás. A posição, por si só, não bloqueia ataques nem reduz dano. **Provocação** de Rhazen/Vesper restringe golpes individuais ao provocador enquanto estiver ativa; ataques em área continuam atingindo todos os rivais vivos. Esses avisos aparecem ao selecionar uma ação.

**Escudos somam em camadas até 25% da vida máxima.** Cada aplicação dura duas rodadas globais e expira separadamente; golpes consomem a mais antiga primeiro. A defesa comum fornece 6%. Expiração, absorção e quebra têm recibos distintos. Oren protege um aliado com desvio de 25%; o dreno Sombrio passou a 15%, e a regeneração, a 4% por ativação. Na Alpha 0.5, cura, escudos e atributos dos kits foram revistos; veja a [comparação das simulações](BALANCE.md). Os dez ativos que dependiam do atlas antigo receberam recortes novos em três folhas com células separadas, preservando as identidades. O atlas anterior continua arquivado. Os 24 ativos usam as 72 imagens de habilidades. Seis representantes (Veyra, Sylva, Axion, Astra, Vesper e Auren) têm quatro poses desenhadas; os outros dezoito usam ilustração e movimento procedural. Artes anteriores continuam no projeto.

Supremos combinam texturas pintadas com brilho aditivo e distorção animada, junto de uma sequência visual própria: preparação com sigilo no chão, partículas convergentes, condução até os alvos e impacto prolongado. Ígneo usa chuva de brasas e fissuras; Natural, raízes e folhas; Técnico, feixes orbitais e campos hexagonais; Arcano, constelações e portais; Sombrio, eclipse e vórtices. Curas e proteção usam auras restauradoras. Os efeitos respeitam **Reduzir animações** e não alteram dano, recargas ou TTK.

Cada um dos 24 personagens tem coreografia identificada por seu golpe, com preparação, disparo ou avanço, contato, reação e retorno. Há saltos de martelo, cortes duplos, flechas, trilhos de energia, drones, prismas, runas, órbitas e fios. A Alpha 0.8 adiciona rastros de silhueta e pausas no contato, com tempos distintos: **1,44 s no ataque básico, 1,94 s na técnica e 2,80 s no supremo** para a sequência principal. Recibos e partículas podem permanecer durante a recuperação. As animações mais lentas detalham a ação sem mudar seu dano nem o TTK em rodadas.

A derrota tem reação própria. As seis artes com quatro poses e os dezoito movimentos sobre ilustração continuam distintos: esta atualização não adiciona animação esquelética nem novas poses desenhadas para todos os heróis. Suportes não avançam sobre o inimigo ao conjurar; escudo e crítico possuem sons próprios. A opção **Reduzir animações** mantém as regras e remove a coreografia.

**Golpes** abre a galeria isolada com seletor para **todos os 24 personagens** e seis atalhos de classe. Há cenários normal, escudo com crítico demonstrativo e queimadura/sangramento. A técnica de Veyra consome a queimadura para seu combo; use o ataque básico nesse cenário para observar os dois efeitos contínuos. A galeria calcula ações somente para o par exibido, evitando dreno ou cura derivados de figurantes invisíveis. Passe o mouse sobre o resultado para ler todos os recibos. A galeria não altera a partida.

![HUD nativo](preview/hud.png)

[Artes dos 15](preview/roster-art.png) · [Supremo](preview/ultimate.png) · [Escolher a frente](preview/formation.png) · [Galeria](preview/gallery.png) · [Crítico em escudo](preview/shield-critical.png) · [Estados](preview/debuffs.png) · [Cura reduzida](preview/healing.png) · [Laboratório](preview/balance.png) · [Testes de sustentação](preview/balance-stress.png) · [Treino guiado](preview/lesson.png)

## Código e validação

O **[guia de balanceamento](BALANCING.md)** indica onde mudar cada número e explica as fórmulas. A divisão principal é:

| Arquivo editável | Responsabilidade |
| --- | --- |
| `src/kits.js` | Atributos nomeados `hp`, `attack`, `defense`, `speed`; habilidades, combos e sinergias dos 24 heróis |
| `src/balance.json` | Parâmetros globais de dano, crítico, energia, escudos, estados, Fratura e IA |
| `src/data.js` | Identidade, afinidade, elenco e custos/recargas padrão |
| `scripts/combat.gd` e `src/engine.js` | Sequência das fórmulas e resolução equivalente nos dois motores |
| `scripts/campaign.gd` | Missões, inimigos, gemas e salvamento |
| `scripts/hero_codex.gd` | História do Farol, relatos das missões, origem e motivação dos heróis |
| `scripts/hub.gd` e `scripts/ui_theme.gd` | Menu, fichas, engastes e tema visual |
| `scripts/combat_ui.gd` e `scripts/skill_card.gd` | HUD, prévias e cards de habilidades |
| `scripts/animation_director.gd` e `scripts/damage_receipt.gd` | Coreografias, pausas, rastros e apresentação dos recibos |
| `scripts/lab.gd` e `scripts/simulation_log.gd` | Amostras, estatísticas e logs exportáveis |

Os caminhos `src/` são relativos à raiz do repositório; `scripts/` nesta tabela é relativo a `godot/`. `npm run sync:godot` gera `data/catalog.json` e `data/combat-rules.json`, sem sobrescrever os recortes e poses refinados. Edite as fontes, não esses JSONs gerados. As regras **0.11.0** são compartilhadas pelos dois motores, com os reworks e identidades desta revisão. O motor JavaScript continua sendo a referência de paridade do combate livre e sustenta o protótipo web.

Na raiz do repositório:

```bash
npm test
npm run test:godot
npm run test:browser
npm run test:site
node scripts/balance-report.mjs
```

Godot deve estar no PATH (ou `GODOT_EXECUTABLE`). Os testes verificam kits, sinergias, recursos, estados, término de partidas, paridade entre os motores e interface nativa. Também exportam os dois filtros e reproduzem todas as ações dos JSONs no motor JavaScript, conferindo recibos e estados; verificam o CSV, caminhos de salvamento e erros de destino. Artefatos e preferências de teste ficam isolados em `artifacts/`.

A campanha tem verificações das nove missões completas, bloqueios, chefe, primeira vitória e repetição sem duplicar recompensas, derrota e nova tentativa, estoque e troca de gemas, reabertura do progresso, dados inválidos e falha de gravação. Os testes confirmam que o modo história preserva os trios livres e não altera os atributos nem as estatísticas do laboratório.

A versão Godot é aberta no editor nesta etapa. **GitHub Pages continua com o protótipo web anterior**; exportar Godot para navegador será outra entrega. A primeira campanha e os engastes estão implementados; treinamento de skills, obtenção de heróis, multiplayer online e integração com A Lei do Trono permanecem no [roteiro de progressão](ROADMAP.md).
