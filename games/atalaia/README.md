# Atalaia: Guardiões do Cristal — Godot 0.2

Projeto 2D em GDScript, com exportação atual em **Godot 4.6.3 Standard** (não exige .NET), renderer Compatibility e Web sem threads. A versão 0.2 melhora a apresentação do projeto Godot 0.1 enviado: HUD nomeado, campo sem esticar, fundos das três regiões e animações. Campanhas Godot existentes continuam compatíveis.

A versão web 0.6.1 compartilhada como referência tem seis regiões, 30 ondas,
cristais e oficina. O Godot conserva a campanha de três regiões e 15 ondas do
ZIP; essa referência não foi apresentada como equivalência de conteúdo.

## Abrir e jogar

1. Extraia o ZIP inteiro.
2. No gerenciador do Godot, escolha **Importar** e selecione `project.godot`.
3. Aguarde a importação das texturas, fontes e áudios.
4. Pressione **F5** e clique em **Iniciar campanha**.

Para a versão pronta de Windows, extraia o pacote de Windows e abra `Atalaia.exe`. O arquivo `Atalaia.pck` precisa continuar na mesma pasta. No Linux, dê permissão de execução a `Atalaia.x86_64` e execute-o ao lado do PCK. A compilação de Linux foi executada neste ambiente; a de Windows foi exportada, mas não testada em um computador Windows.

## Árvores estratégicas

O título abre as árvores de **Engenharia**, **Proteção** e **Conhecimento**.
Vencer a onda 5 desbloqueia o primeiro nó de cada árvore. Vencer a onda 10
desbloqueia o segundo. Escolha uma árvore para a próxima campanha ou jogue
sem especialização. O save em andamento conserva a escolha e o patamar com
que foi iniciado. Um save antigo válido conta até a última onda já vencida.

| Árvore | Onda 5 | Onda 10 |
| --- | --- | --- |
| Engenharia | +35 de ouro inicial | +65 de ouro inicial |
| Proteção | Repara 1 de integridade a cada três ondas | Repara 2 a cada três ondas |
| Conhecimento | Oferece Tributo na onda 3 | Oferece Tributo nas ondas 3 e 8 |

O perfil fica em `user://atalaia_strategy_v1.json`. A campanha continua em
`user://atalaia_campaign_v1.json`. Dano, recompensas e doutrinas das campanhas
em andamento continuam seguindo o próprio snapshot.

O perfil também mantém uma cópia anterior validada em `.bak`. Se o arquivo
principal faltar ou estiver danificado, as árvores e os recordes são recuperados
da cópia, com aviso no título. A última gravação pode ter sido perdida. Abrir o
jogo conserva o original; a próxima alteração guarda seus bytes em
`.invalid.bak` antes de gravar. Arquivos de versão incompatível ficam
preservados, inclusive quando são introduzidos durante uma sessão já aberta.

## Atalhos de teclado

Em **Opções → Teclado**, escolha uma ação e pressione uma letra, número ou
Espaço. As seis construções, próxima onda, evolução, pausa, velocidade e áudio
podem ser remapeados. Uma tecla ocupada troca de lugar com a anterior da ação;
**Restaurar padrões** recupera todos os atalhos originais. Esc cancela a captura
ou retorna às opções. Enter, Tab, setas e combinações com modificadores ficam
reservados à navegação. A defesa permanece pausada durante a edição.

As dicas das armas e dos comandos mostram a escolha atual. Fechar as opções
guarda os atalhos junto dos volumes e efeitos reduzidos em
`user://atalaia_settings_v1.json`; configurações anteriores usam os padrões.
Os 31 checks nativos incluem comandos reais, conflitos, cancelamento,
preferências inválidas, retomada e persistência em arquivo próprio de teste.

## Conquistas locais

**Conquistas**, no título, mostra oito feitos com requisitos e progresso:
cinco/dez ondas das árvores, atos I/II/III e conclusão da Crônica, além dos
recordes de 10/30 ondas da Sobrevivência. Os feitos usam as marcas já salvas;
a consulta conserva o perfil e não concede recompensas extras. Jogar sem
especialização não revoga conquistas. Um perfil clássico antigo conta apenas
os fatos que já registrava, sem presumir vitórias nos modos posteriores.
Avisos de recuperação e arquivo ilegível também aparecem nessa tela.

## Crônica do Cristal

No título, **Crônica · 30 fases** alterna para a campanha de cinco atos.
O Primeiro Cerco, Fronteiras Corrompidas, A Ruptura, A Queda dos Guardiões e
O Último Bastião têm seis fases e um chefe cada. As receitas mudam entradas
ativas, composição e ritmo dos inimigos. Cumprir a meta de integridade
concede ouro extra. O save `user://atalaia_chronicle_v1.json` tem cópia e
retomada próprias. A Campanha Clássica conserva seu arquivo. **Opções**, no título ou na defesa,
inclui **Efeitos reduzidos**, que desliga o shader atmosférico e reduz fumaça
e partículas. A escolha é guardada junto aos volumes.

O **Arsenal regional** oferece Guardião de Raízes, Arpão do Abismo, Canhão
Sísmico, Farol Espectral, Forja de Cinzas e Obelisco Solar nos atos
correspondentes. Cada torreta tem três níveis. O Farol revela espíritos
velados e o Obelisco causa mais dano contra espíritos. Os chefes aceleram e
interrompem as torres próximas ao cruzar metade da vida. Na Fundição, o
Vigia de Escória protege os aliados próximos e resiste à queimadura. A
Tecelã se divide em duas crias que continuam pela mesma via. Uma vez por oferta,
**Renovar oferta** custa 30 de ouro e substitui as três cartas sem repetir a
oferta rejeitada. Conhecimento garante o Tributo na oferta inicial de seus
marcos; se você renovar essa oferta, também abre mão do Tributo. Essa decisão
é retomada junto ao save. A Crônica também oferece Contrapeso
de Escória, que troca alcance por dano, e Vigília em Dupla, que acelera a
torre quando há outra próxima.

**Desafios e sobrevivência** abre dois desafios de integridade, a repetição
de fases já vencidas e a Sobrevivência sem onda final. Essas sessões
preservam os dois checkpoints. O perfil estratégico guarda a melhor onda
de Sobrevivência. Na rotação de mapas, torretas sem terreno correspondente
vão para espaços livres. Se todos estiverem ocupados, o investimento retorna
integralmente ao jogador.

## Campanha Clássica e sistemas compartilhados

- **3 fases / 15 ondas**: Floresta ancestral (1 via), Pântano das bifurcações (2 vias) e Cidadela das três vias (3 vias reais), com chefe a cada cinco ondas.
- **6 armas**: Balista, Morteiro, Lança-chamas, Tesla, Obelisco glacial e Alquimista. Três níveis por torreta.
- **12 cartas individuais**, até três por torreta, e **18 doutrinas possíveis** (três de cada tipo). As doutrinas são uma etapa adicional após os chefes das ondas 5 e 10, afetam armas atuais e futuras e não ocupam espaços individuais.
- Escolhas com entrada escalonada, escala/realce no hover, partículas gráficas nos emblemas e animação de confirmação. O recebedor precisa ser confirmado pelo ID/nome/nível da torreta.
- Caminhada de quatro quadros por distância para esqueletos, lobos, aranhas e golens; fungos e chefes usam duas poses, espíritos flutuam intencionalmente. Sombras e alinhamento pela base dos pés.
- Cabeças mecânicas com giro, recuo, projéteis na boca da arma, arco balístico e fumaça de morteiro, jato contínuo de fogo, raios em cadeia, congelamento e poças animadas de veneno.
- Terrenos detalhados, movimento discreto da água/neblina por shader, partículas ambientais e cristal com levitação, halo e fragmentos orbitais.
- HUD de núcleo, ouro e onda com ícones vetoriais, números separados e barras de avanço. Ouro conta suavemente e mostra ganhos sobre os inimigos derrotados.
- Campo com escala uniforme e recorte nas bordas; novos terrenos de floresta, pântano e cidadela, preservando as estradas e os espaços das regras. Construção, movimento e evolução animados.
- Evolução e detalhes da torre na lateral; relatório por torreta ou tipo, campanha/onda, dano efetivo, DPS e exportação CSV.
- Construção e reposicionamento grátis entre ondas; mover para um local ocupado troca as torretas. IDs, níveis e cartas acompanham cada unidade nas mudanças de mapa. Os 48 espaços foram validados junto às estradas.
- Pausa, velocidade 1×/2×, mixer separado e salvamento automático da campanha, inclusive durante uma onda ou escolha de carta.

## Controles

| Ação | Controle |
| --- | --- |
| Escolher arma | Botões inferiores ou 1–6 |
| Construir | Escolha a arma e clique em um círculo livre |
| Selecionar torreta | Clique nela ou na linha do relatório |
| Evoluir | Painel da torre na lateral ou U |
| Próxima onda | Botão lateral ou Espaço |
| Mover/trocar | Selecione a torreta, clique em Mover e no destino |
| Pausar/retomar | P, Esc ou botão Ⅱ |
| Velocidade | F ou botão 1×/2× |
| Silenciar | M |
| Ajustar volumes | Engrenagem superior |

Durante a onda, é possível evoluir. Construir, vender e mover ficam disponíveis na preparação. Esc também cancela uma construção ou mudança de posição. A campanha não começa uma onda automaticamente após uma escolha.

## Áudio

Paleta original de **19 arquivos estéreo a 48 kHz**: ambiência úmida de floresta, trilha harmônica suave, ruído filtrado de fogo contínuo, madeira/metal da balista, impacto grave e detritos do morteiro, descarga elétrica, vidro glacial, líquido alquímico, interface e resultados. Áudio pré-renderizado em Vorbis; não usa ondas quadradas, timbres de 8 bits ou arquivos de terceiros. Mixer com compressor geral, reverberação sutil e limites de simultaneidade. O gerador offline reproduzível está em `tools/create_audio.py`; só exige numpy/scipy/ffmpeg para **recriar** os sons.

## Estrutura editável

- `scenes/main.tscn`: entrada do jogo.
- `scenes/tower.tscn`: base, gimbal e cabeça, com script de animação visual.
- `scenes/enemy.tscn`: AnimatedSprite2D e caminhada.
- `scripts/run.gd`: regras de combate, cartas, progressão, autoria de dano, serialização. Sem dependência do HUD.
- `scripts/catalog.gd`: números das armas, monstros e cartas.
- `data/maps.json`: estradas e espaços dos três mapas clássicos.
- `data/chronicle-maps.json` e `data/chronicle-phases.json`: mapas adicionais e receitas das 30 fases da Crônica.
- `scripts/board.gd`, `terrain.gd`, `effects.gd`, `smoke.gd`, `core.gd`: cenário, estradas, efeitos e cristal.
- `scripts/main.gd`, `ui.gd`, `hud_icon.gd`, `card_view.gd`, `card_art.gd`: interface construída com Controls nativos, ícones vetoriais e animações por Tween.
- `scripts/sound.gd`: reprodução, espacialização e mixer.
- `assets/`: arte, fontes, shader e áudio, sem downloads em execução.

A interface é montada por código; os elementos visuais das torretas e criaturas estão em cenas separadas. A arte é 2D pré-renderizada. Este projeto inicia a direção do conceito; não é uma reprodução 3D nem uma equivalência quadro a quadro da ilustração. Animações mais longas, mais ataques dos chefes e polimento de efeitos continuam como próximas etapas de produção.

## Progresso

O Godot guarda a campanha em `user://atalaia_campaign_v1.json` e os volumes em `user://atalaia_settings_v1.json`. A gravação usa arquivo temporário antes da substituição. **Este save é separado da versão web anterior**; a migração dos saves do navegador ainda não está implementada. Uma nova campanha pelo menu pede confirmação antes de substituir o progresso atual.

Na fundação Renascimento, o título informa quando o progresso não pode ser lido.
Cada substituição saudável mantém a gravação anterior em `.bak`, com cópia
verificada e troca por temporário. Se o principal desaparecer, deixar de ser JSON
legível ou falhar na validação de jogo, **Continuar** pode recuperar a cópia
anterior validada. O aviso **Progresso recuperado** informa que a última gravação
pode ter sido perdida. Uma versão numérica incompatível não provoca retorno
silencioso a um save mais antigo.

A recuperação restaura o snapshot completo, incluindo RNG, torretas, ondas e
escolhas. Ler não altera arquivos. Ao salvar depois, os bytes do principal
corrompido vão para `.invalid.bak`; uma origem diferente recebe sufixo numérico,
sem apagar as cópias anteriores. Um principal inválido não substitui a `.bak`
saudável. Backup inválido não oferece Continuar. Arquivos `.tmp` incompletos não
são recuperados automaticamente.

A gravação verifica escrita, flush, preservação e substituição. Falhas aparecem
na tela, mantêm o original e não atualizam o snapshot de Continuar. **Salvar e
voltar ao título** e o fechamento permanecem na partida se a gravação falhar.
Também não há substituição quando não é possível atualizar a cópia anterior.
O incremento foi validado com **32 checks de armazenamento**, **194 de schema**,
regras/interface e integração Web; não representa homologação Windows.

Os testes de armazenamento usam arquivos reais e dados de usuário isolados:

```sh
godot --headless --path . --script res://tests/save_store.gd
```

Os CSVs são escritos em `user://atalaia-dano-onda-NN.csv`; a opção de exportação abre a pasta correspondente. O relatório preserva a autoria de veneno mesmo após venda da torreta. DPS usa o tempo de combate decorrido, com pausas/preparação excluídas. Poças do mesmo dono usam o maior DPS; poças de donos diferentes somam.

## Validação

Executado com Godot **4.5.2.stable.official.6ce3de25a**:

```sh
godot --headless --path . --script res://tests/verify.gd
godot --headless --path . --script res://tests/campaign.gd
godot --headless --path . --script res://tests/campaign.gd -- --fixed-policy
godot --headless --path . --script res://tests/chronicle.gd -- --qa
godot --headless --path . --script res://tests/economy_offers.gd
godot --headless --path . --script res://tests/campaign.gd -- --chronicle
godot --path . --script res://tests/runtime_verify.gd -- --qa
```

- 24 verificações de regras: preços, evolução, ocupação, movimentos, slow/resistência, poças/autoria, dano efetivo, cartas/doutrinas, save durante onda e 48 espaços de construção.
- 15 verificações de interface em execução: construção, evolução, onda, pausa, mixer, entrada das cartas, recebedor, seleção, relatório, doutrina e salvar/continuar.
- Política determinística adaptativa, semente 78, usando ouro real e reposicionamento gratuito: completa as 15 ondas com **22/30** de integridade. Política que fica com as quatro torretas iniciais perde na **onda 8**. São verificações de viabilidade, não estimativas de taxa de vitória ou balanceamento definitivo.
- Capturas e vídeo produzidos pela renderização do próprio Godot. `--showcase` é uma **cena demonstrativa com estado preparado** no pântano, não uma partida começando do zero; não lê nem escreve o save do jogador. `tests/capture.gd` também prepara a escolha de cartas para verificar sua animação.

A verificação da Crônica em Godot 4.6.3 exercita 285 comportamentos. O teste
de geometria mede os 86 terrenos. A simulação determinística da semente 78
completou as 30 fases com 22/30 de integridade e 718 abates. O script
`tests/coverage.gd` mede a janela geométrica do melhor terreno por rota e
torreta nos níveis 1 e 3 contra o lobo em velocidade plena. As 188 combinações
tiveram cobertura de 2,27 a 10,13 segundos. O CSV sai em
`user://atalaia-coverage.csv`. Essa janela mede alcance e cadência em uma
passagem, sem concorrência por alvo ou cartas.

A matriz de ofertas exercita 36 sessões de recompensas com três sementes,
três políticas e as três árvores/ausência de árvore. São 1.392 ofertas,
348 renovações e 8.422 verificações: três opções distintas, todo o catálogo,
ouro de construção/evolução/recompensa, limite de modificadores e retomada
da oferta/RNG. As ondas são resolvidas sem combate nessa fixture para isolar
os contratos econômicos; não mede taxa de vitória ou equilíbrio entre builds.

`tests/campaign.gd -- --chronicle --seed=78 --card-policy=resources` executa
combate real priorizando Tributo/ouro. `--card-policy=renew` renova a oferta
antes da escolha adaptativa; sem essa opção, a política histórica permanece.
`--strategy=engineering`, `protection` ou `knowledge` ativa o segundo nó.
Uma matriz com sementes 78/1847/90210 e essas árvores ou nenhuma completou
36/36 campanhas: integridade 19–30 na adaptativa e renovação, 4–12 priorizando
recursos. O JSON de verificação registra escolhas e custos aceitos. São
simulações legais com o mesmo defensor automatizado, sem recursos grátis;
não estimam dificuldade humana ou equilíbrio de todas as construções.

## Exportar

Instale os templates de exportação da mesma versão do Godot. Os presets `Windows` e `Linux` estão prontos:

```sh
godot --headless --path . --export-release Windows ../builds/windows/Atalaia.exe
godot --headless --path . --export-release Linux ../builds/linux/Atalaia.x86_64
```

As builds não são assinadas. Os scripts de teste e o gerador de áudio ficam fora do PCK. Uma janela menor mantém o enquadramento 16:9, sem rolagem da página. O foco desta versão é desktop com mouse e teclado; controles de toque e exportação mobile ainda não foram preparados.

## Créditos

O botão **Créditos** no título apresenta as atribuições e os avisos completos
de fontes e motor em abas roláveis. **Voltar ao título** e Esc conservam a
campanha. Os presets incluem os avisos consultados, além das cópias externas
do pacote Web.

Arte original do projeto enviado e novos fundos da edição 0.2 gerados com imagegen. Código, ícones vetoriais e áudio criados para este projeto. Caladea e Carlito sob SIL Open Font License; avisos em `FONT-LICENSES.txt`. Godot é distribuído sob MIT; o motor e bibliotecas incluídas estão documentados em `GODOT-LICENSE.txt` e `GODOT-COPYRIGHT.txt`. Nenhum asset de Nexus ou Cinzas do Abismo foi copiado.


## Integração ao Trono

O projeto enviado foi preservado em `games/atalaia`, com exportação Web adicional
validada em Godot 4.6.3, Compatibility e sem threads. O relatório CSV da Web usa
o download do navegador; Windows/Linux nativos continuam abrindo a pasta local.
Os testes originais de regras permanecem em `tests/`.

Na raiz do repositório do Trono:

```sh
node scripts/prepare-godot.cjs
node scripts/build-atalaia.cjs
npm run build
node --test tests/atalaia.cjs tests/atalaia-browser.cjs
```

O primeiro comando baixa o editor e os templates oficiais com SHA-512 fixado.
O build executa as verificações de regras e de interface Godot antes da exportação.
Quem já tem o Godot 4.6.3 e seus templates pode usar `GODOT_BIN=godot` no segundo.
A saída fica em `artifacts/atalaia/web`, separada do frontend principal. O teste
browser usa esse jogo real e contas/mídia descartáveis; o acesso remoto é servido
localmente pela fixture. Não é uma página simulando o jogo.

**Windows full app** exporta e valida o jogo antes do empacotamento. A mesma
release contém `Atalaia-Web-<versão desktop>.zip` e seus hashes. Ao publicar a
entrega aprovada, **Publish approved frontend** verifica esse ZIP, publica
`atalaia-mn.surge.sh`, confere `version.json` e só então atualiza o catálogo do
Trono. O secret existente `SURGE_TOKEN` é usado para ambos os domínios.

O motor e os recursos de Atalaia ficam nesse domínio separado para preservar o
limite de 190 MiB do pacote principal, sem retirar jogos nem o instalador.
No site, Jogar abre outra aba com `noopener`; no aplicativo, uma janela sem
preload usa `persist:mn-atalaia`, separada do Nexus e da conta do Trono. O jogo
salva via armazenamento próprio do navegador/Windows; não há sincronização de
campanha entre dispositivos. A chamada e seus dispositivos continuam no Trono.

Na publicação manual, extraia `Atalaia-Web-<versão>.zip` em uma pasta nova e
publique-a com `npx --yes surge@0.46.0 . atalaia-mn.surge.sh` antes de enviar a
pasta `frontend/` da mesma release. A URL pública única fica em
`electron/atalaia-config.cjs`. Para abrir o jogo fora do catálogo, use
https://atalaia-mn.surge.sh/. O projeto mantém foco em mouse e teclado.

### Névoa dos juncos

Na fase 9 da Crônica, o alcance das torretas cai 20% durante seis segundos,
a partir de oito segundos e a cada vinte. O HUD avisa três segundos antes;
a preparação explica a regra. O Farol Espectral conserva seu alcance,
inclusive quando trazido de um ciclo anterior da Sobrevivência. Os projéteis
já disparados continuam sua trajetória. A névoa muda a aquisição de novos
alvos e o círculo de alcance. Reabrir conserva o relógio da onda, sem
reiniciar o evento. Efeitos reduzidos mantêm o aviso e usam uma camada estática.
A campanha clássica conserva o comportamento anterior. O ensaio de 30 fases
com a política adaptativa da semente 78 venceu com 22 de integridade após
esse incremento; a suíte da Crônica passou 275 checks.

### Terrenos elevados

A Fundição tem os terrenos 4 e 10 elevados; o Bastião, 4 e 20, contando a
partir de um. O anel duplo identifica +18 de alcance antes de cartas e
doutrinas. O painel da torreta mostra o bônus e a prévia de construção usa
a mesma composição do combate. O benefício acompanha o terreno: mover para
uma posição comum o remove. A posição do checkpoint restaura a elevação,
sem um contador ou formato de save adicional. A campanha clássica conserva
seus terrenos. As 285 verificações da Crônica e 188 combinações de cobertura
passaram; 12 simulações das 30 fases terminaram com 22–30 de integridade.

### Sabotador da patrulha

A fase 23 da Crônica inclui o Sabotador de Fuligem, identificado pela insígnia
azul. Ao alcançar uma torreta a até 140 unidades, anuncia o alvo por 0,65 s.
Se continuar vivo e no alcance, bloqueia seus disparos por 1,2 s e aguarda
oito segundos antes de anunciar outra interferência. Eliminar o sabotador
ou deixá-lo perder o alcance durante o aviso cancela a preparação. Uma
interferência já aplicada dura o tempo restante mesmo após sua morte.

A linha indica o alvo e o painel da torreta mostra o bloqueio com duração.
Um sinal sobre a torre continua visível com efeitos reduzidos. Projéteis já
disparados seguem seu curso. O efeito não soma durações e é removido ao fim
da onda. O save conserva o aviso, o alvo e o tempo restante, validando os
IDs e limites antes de carregar; a campanha clássica conserva seu elenco.
A arte reutiliza a família do fungo com uma insígnia própria; não representa
arte final homologada. Os 16 checks específicos e os builds das duas
campanhas passaram. A política da semente 78 venceu a clássica com 22 de
integridade/419 abates e a Crônica com 22/718 após esta inclusão.

### Falha ao guardar recorde de Sobrevivência

O título, a repetição e o fechamento nativo só descartam a sessão quando o
recorde já foi preservado. Se o arquivo estiver bloqueado, o aviso mantém a
partida aberta; libere o caminho e tente novamente. A recuperação do erro
conserva os checkpoints da clássica e da Crônica. As 25 verificações de
progressão incluem essas saídas e a conservação do resultado.

As 16 verificações de recuperação do perfil cobrem a cópia saudável,
conservação dos bytes danificados, obstrução de gravação, aviso no título e
proteção contra versões futuras. O build executa essa suíte junto às
validações dos saves das duas campanhas.

### Arauto da marcha

A fase 20 da Crônica envia Arautos junto dos corredores. O anel violeta de
raio 120 e a insígnia de duas setas identificam a aura: aliados comuns
próximos avançam 20% mais rápido. Auras sobrepostas não somam o bônus;
Arautos e chefes não o recebem. Lentidão multiplica a velocidade normalmente,
e raízes ainda interrompem o movimento. Derrubar a fonte retira o bônus
no próximo passo da simulação. A preparação explica alcance e respostas.

A aura é calculada por posições e fontes vivas no início de cada passo,
sem temporizadores persistidos. O save versão 1 reabre o mesmo confronto e
recalcula o efeito. A campanha clássica conserva seu elenco e rejeita um
Arauto introduzido por save inválido. A apresentação reutiliza os esqueletos
originais com cor, insígnia e alcance próprios; não é arte final homologada.

Passaram 16 verificações específicas, validações de save/perfil/controle,
285 verificações da Crônica e 8.422 de ofertas. A matriz de três políticas,
três sementes e quatro condições de árvore venceu 36/36 campanhas de 30
ondas, com 4–30 de integridade. Clássica 15/22 e Crônica 30/22 também passaram.
Build Godot/Next, 1.481 testes core, typecheck/format e um fluxo Chrome com
combate real, save, CSV e preservação da chamada passaram. A captura nativa
Godot/llvmpipe é uma fixture pausada com três inimigos, sem aceite humano.

### Pulso da Coroa do Bastião

Na fase 30 da Crônica, a segunda fase da Coroa conserva o avanço e a
interrupção inicial e acrescenta um pulso a cada sete segundos. Um círculo
real de raio 144 e o contador anunciam o disparo por um segundo; torretas
próximas ficam sem novos disparos por 0,8 s. A preparação explica como
espalhar a defesa. Derrubar o chefe durante o aviso cancela o pulso; o
movimento do chefe também pode deixar uma torre fora do alcance. Queimaduras,
poças e projéteis já lançados continuam. Durações não somam e o efeito não
encurta uma interferência maior. Aviso e contador permanecem com efeitos
reduzidos; o HUD troca o anúncio pela resolução após o disparo.

O comportamento vale também na repetição/desafio dessa fase, preservando a
clássica, os outros chefes e a Sobrevivência. O save versão 1 aceita o
relógio opcional do pulso apenas no chefe final em segunda fase, com tempo
finito e dentro do relógio da onda. Saves antigos continuam legíveis e
iniciam um período seguro. Um passo de simulação que atravessa ou entra
tarde no aviso ainda concede um segundo completo antes de interromper.

As 38 verificações dirigidas cobrem alcance, cancelamento, repetição,
retomada, entradas inválidas, disparos reais e interface. Build e suítes do
Atalaia, 1.483 core, tipos, formato, Next e fluxo Chrome passaram. A matriz
legal de três sementes/três políticas/quatro condições de árvore venceu
36/36, com 4–30 de integridade. Em três campanhas adicionais instrumentadas,
duas eliminaram o chefe antes do aviso e uma venceu após um pulso; a matriz
não comprova pressão uniforme. Inspeções Godot/Wayland/llvmpipe e Chrome em
1600×900/1280×720 usam chefe congelado, recargas altas e saves descartáveis;
áudio Dummy/mutado. Não representam playtest nem aceite humano de arte,
áudio ou equilíbrio.

### Escolta do Guardião da escória

Na fase 24 da Crônica, o Guardião convoca uma vez um golem e um cogumelo
quando chega a 50% de vida ou menos sem morrer. Eles entram atrás dele na
mesma rota. A aura de raio 105 reduz em 25% os impactos sem perfuração contra
aliados próximos; não protege a própria fonte, não acumula com Vigias e não
protege esses Vigias. Queimadura, veneno e perfuração atravessam a proteção.
Derrotar o Guardião remove a aura, mas as escoltas continuam no confronto.
O avanço de segunda fase e a interrupção inicial das torretas permanecem.

Preparação e anúncio explicam o padrão. O círculo corresponde ao alcance
real e permanece com efeitos reduzidos. Ao morrer, a fonte invalida o desenho
imediatamente, antes do fade. O padrão vale também na repetição/desafio;
clássica, Sobrevivência e outros chefes conservam suas regras. O save v1
preserva as escoltas como inimigos normais e usa o estado de segunda fase já
existente para impedir nova convocação. Saves antigos já nessa fase não
recebem escoltas ao carregar ou no próximo acerto. Ataques em área e a
iteração de movimento mantêm seus participantes: os recém-convocados não
recebem retroativamente a explosão/jato/cadeia que os fez aparecer.

Passaram 35 casos dirigidos, incluindo retomada, fontes mortas, alcance,
contrajogos e interface. A matriz final venceu 36/36 campanhas simuladas;
três repetições instrumentadas registraram 51/64/27 impactos protegidos,
com resultados idênticos aos casos correspondentes sem observador. A versão
inicial sem convocação não protegeu aliados nessas três campanhas; a
composição foi completada antes dessa medição final. Fixtures nativas/Web
usam pausa, chefe congelado, recargas altas e áudio Dummy/mutado. Não é
playtest ou aceite humano de arte, som ou equilíbrio.
