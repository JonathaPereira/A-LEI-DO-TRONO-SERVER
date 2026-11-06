> Transferência solicitada pelo usuário: leia [o checkpoint e o prompt](RENASCIMENTO_CHECKPOINT.md). Estado funcional preservado até o incremento 11; chefes com fases ainda pendentes.

# Operação Renascimento — diagnóstico e primeiro incremento

05/11/2026 · **desenvolvimento alpha**, sem homologação 1.0.
As metas de cinco regiões para Cinzas, 30 fases para Atalaia e 48 missões para
Nexus continuam no escopo; não representam conteúdo entregue.

## Fontes reais

| Repositório/base auditada | Projeto e donos |
| --- | --- |
| `JonathaPereira/A-LEI-DO-TRONO-SERVER` · `f77449b0ad22cfb4d8f6370306138fa501f8a324` | Cinzas em `public/roguelite`; Atalaia em `games/atalaia`; integração em `src/lib/games`, `src/components/games` e `electron` |
| `JonathaPereira/PROJETO-NEXUS` · `codex/nexus-015` · `e517fc814541c7c6f1b428e87e1019e0dfbd7a9b` | Jogo Godot em `godot`; referência de combate em `src`; PvP autoritativo em `server` |

O Nexus original foi localizado pela referência em
[INTEGRAR_NEXUS.md](INTEGRAR_NEXUS.md). O Trono contém seu launcher, não seu motor.
Atualizar o launcher não atualiza o jogo do itch.io nem o servidor PvP.
Foram inspecionados donos, dados, persistência, apresentação, recursos, integração
e testes. É uma auditoria técnica inicial; não equivale a playtest humano integral
ou análise de cada combinação de conteúdo. Cada nova fatia exige auditoria própria.

## Matriz da base auditada (antes dos incrementos)

| Área | Cinzas do Abismo | Atalaia | Nexus |
| --- | --- | --- | --- |
| Tecnologia | Canvas 2D/JavaScript | Godot 4.6.3/GDScript, Compatibility | Godot 4.6.3/GDScript; motor JS para paridade |
| Regras/conteúdo | `core.js`, `levels.js` | `run.gd`, `catalog.gd`, `data/maps.json` | `combat.gd`, `src/engine.js`, `src/kits.js`, `src/balance.json`, `campaign.gd` |
| Apresentação | `renderer.js`, `rig.js`, `game.js` | Cenas de inimigo/torreta, `board`, `terrain`, `ui`, `main` | `fighter`, `animation_director`, `hero_signature`, `combat_ui`, `hub`; estudo 3D separado |
| Campanha | 15 capítulos, 3 regiões, 3 chefes | 3 territórios, 15 ondas, chefe a cada 5 | 3 capítulos, 9 missões, lore do Farol |
| Modos | Campanha e horda com 7 layouts | Campanha com preparação, combate, cartas/doutrinas e resultado | História, livre/local, treinos, galeria, laboratório, PvP experimental |
| Progressão | Build temporária por cartas; recordes/checkpoint da horda | Ouro, níveis, cartas e doutrinas durante a campanha | Missões, trio livre e 3 engastes por herói; gemas derivadas das primeiras vitórias |
| Save | LocalStorage e backup JSON; campanha ainda reinicia a run | JSON com RNG e onda em andamento; mixer separado | Formatos 1/2/3, migração com cópia, escrita temporária e rollback de trio/gemas |
| Áudio | MP3 locais/Web Audio, volumes separados | 19 Vorbis, buses/mixer, gerador offline | Áudio local e 80 falas pt-BR para os 20 ativos |
| Distribuição | Independente e iframe local do Trono | Web separado; presets Windows/Linux existentes | Godot Web/itch.io, protótipo JS separado e servidor PvP próprio |

## Inventário preservado

**Cinzas:** Lâmina do Andarilho, Arco do Crepúsculo, Martelo Ancestral, Cajado
das Marés, especiais por arma, quatro elementos e 36 cartas. Arquétipos:
`crawler`, `bat`, `caster`, `spider`, `stalker`, `brute`, `archer`, `bulwark`,
`wisp`, `hellhound`; chefes Guardião de Raízes, Sentinela do Eclipse e Rei da
Forja. Regiões Floresta esquecida, Ruínas do eclipse e Forja das cinzas. Os 15
capítulos autorais, túneis, rampas, plataformas, santuários e relíquias existem
e não devem ser substituídos por uma arena demonstrativa. Sprites/poses,
materiais v3/v4/v5 e músicas permanecem locais; hashes pertencem à integração.

**Atalaia:** Balista, Morteiro, Lança-chamas, Tesla, Obelisco glacial,
Alquimista; três níveis, 12 cartas e 18 doutrinas possíveis. Esqueleto, lobo,
aranha, cogumelo, golem, espírito e chefe. Floresta ancestral, Pântano das
bifurcações e Cidadela das três vias: 16 slots por território, uma/duas/três
rotas. Atlas de corpos/cabeças/caminhada, terrenos, cristal, shader atmosférico,
fontes e áudio estão preservados. O teste atual valida geometricamente os 48
slots. A expansão deverá medir também cobertura efetiva por arma, rota e tempo
de exposição; não foi reproduzido um slot inútil nesta configuração.

**Nexus:** trios livres, energia, recargas, ordem de turnos, estados, escudos
finitos, Fratura, IA, recibos de dano e oficina de gemas.

| Afinidade | Elenco existente |
| --- | --- |
| Ígneo | Veyra, Rhazen, Cindra, Torv |
| Natural | Sylva, Oren, Nima, Brin |
| Técnico | Axion, Kira, Bast, Vektor |
| Arcano | Astra, Elun, Saira, Ivo |
| Sombrio | Vesper, Maura, Noct, Riven |
| Lumi — arquivados | Auren, Elyra, Solen, Zaya |

Dados e recursos Lumi estão arquivados, não homologados como kits ativos.
Reativação exige rever afinidades, kits, IA, importação de equipes e paridade.
Cinco representantes ativos têm poses desenhadas; os demais usam ilustrações
com movimento procedural. Coreografias não equivalem a animação final completa.
Variantes inimigas reutilizam visuais de heróis com atributos separados.
Atlas de habilidades/estados/gemas/VFX, cenários, vozes e estudo 3D de Vesper
foram preservados.

## Diagnóstico inicial e desenho incremental

1. **P0, persistência:** Nexus não tinha cópia rotativa recuperável. Cinzas
   precisa de continuação de campanha. Atalaia precisa validar campos aninhados
   antes de mutar o modelo: `load_data` atribui chaves do JSON diretamente.
   Essa última constatação é de inspeção; reprodução e correção estão pendentes.
2. **P1, expansão:** o progresso Nexus é um prefixo numérico `cleared` da lista
   de missões. Migrar para IDs estáveis antes de reordenar ou ampliar capítulos,
   preservando recompensas e inventário. Essa migração ainda não foi feita.
3. **P1, regras:** Nexus compartilha dados entre JS, Godot e PvP. Alterar só um
   motor quebra paridade/fingerprint; JSONs gerados não são fontes editáveis.
   Campanha/gemas não podem contaminar o balanço livre ou PvP.
4. **P1, integração:** manter um dono por recurso, a chamada do Trono e sessões
   isoladas. Cinzas embutido limita FPS para compartilhar CPU com voz. Os saves
   dos três jogos continuam independentes; não há migração universal fictícia.
5. **P2, produção:** conteúdo novo precisa de objetivos/estratégias distintos,
   não só nomes e multiplicadores de vida. Identidades, lore e recursos atuais
   são a base. 60 FPS, leitura audiovisual, hardware e balanço exigem medição e
   avaliação humana; headless não demonstra esses aceites.

| Fase | Aceitação verificável | Estado |
| --- | --- | --- |
| 0 | Fontes reais, inventário, matriz e baseline | Diagnóstico inicial registrado |
| 1 | Saves válidos/corruptos/futuros, recuperação, migração, falha de disco e IDs de missão | Continuação Cinzas, validação/armazenamento Atalaia e IDs/recuperação Nexus implementados; demais fundações pendentes |
| 2 | Combate/IA reproduzíveis, colisões, cobertura de slots e identidade por kit | Pendente |
| 3 | Metaprogressão separada da build, desbloqueios táticos sem duplicação | Pendente |
| 4 | Cinco regiões Cinzas; cinco atos/seis fases Atalaia; seis capítulos/oito missões Nexus, com conclusão e objetivos variados | Pendente; conteúdo atual preservado |
| 5 | Estados/animações completos, impactos sincronizados, áudio licenciado e acessibilidade | Pendente |
| 6 | Matrizes de TTK/economia/recompensas, sessões longas e regressão de integração | Pendente |
| 7 | Zero→fim, continuar, corrupção, derrota/retry, resoluções, builds e playtest | Pendente; nenhuma 1.0 aprovada |

## Baseline executado

- Trono: instalação travada, tipos, formatação e build aprovados; **1.472/1.472**
  testes core, incluindo os sete verificadores originais de Cinzas.
- Chromium gerenciado: **2/2** testes `application-shell-browser` com backend e
  contas descartáveis. Frontend estático por HTTP com metadados esperados;
  backend `/health` responde `ok:true`. Supabase/R2/serviços externos não
  configurados, nem considerados funcionais.
- Atalaia: importação/exportação Web reais e verificações de regras/interface
  do build aprovadas. Política determinística conclui onda 15, **22/30** de
  integridade e **419** abates. Prova viabilidade dessa política, não balanço geral.
- Nexus: **48/48** testes JS/PvP; baseline Godot com **1.269** verificações
  integradas (**1.242** de interface), **29** partidas/**1.575** ações com paridade
  JS/Godot e replay de **216** simulações/**13.397** ações dos logs. Suítes
  nativas adicionais também passaram, com saves e serviços isolados.
- Logs temporários: `artifacts/cloud-setup` no Trono e `artifacts` no Nexus.
  Hardware/controle físico, Windows/Electron nativo, escuta humana, Android,
  sessões prolongadas e aprovação audiovisual permanecem **não executados**.

## Primeiro incremento da Fase 1

| Item | Antes | Depois deste incremento |
| --- | --- | --- |
| Ambiente | Dependências/Godot ausentes | Dependências travadas, editor/templates verificados, configuração reutilizável salva |
| Fontes Nexus | Launcher no checkout inicial | Projeto original localizado/obtido, sem substituir o jogo |
| Save Nexus | Temporário e substituição; sem cópia rotativa | Cópia saudável anterior em `.bak` antes da substituição |
| Principal ilegível/ausente | Sem recuperação automática | Recupera backup validado, avisa sobre possível perda da última gravação |
| Falha na cópia | Não havia esse estágio | Preserva principal e desfaz trio/gemas; mantém vitória pendente conforme contrato existente |
| Campanha, elenco e arte | Conteúdo alpha existente | Preservado; nenhuma expansão alegada |

Implementação no Nexus: `godot/scripts/campaign.gd`; regressão em
`godot/tests/save_recovery.gd`, incluída em `npm run test:godot`; manual em
`godot/CAMPAIGN.md`. O teste inicial reproduziu **9 falhas em 18 cenários**;
a primeira correção aprovou os 18. A suíte final passou com **20/20** cenários,
incluindo combate após recuperação e rejeição de inventário inválido. A suíte
Godot completa passou novamente, mantendo as 1.269 verificações integradas,
a paridade das 29 partidas e os replays das 216 simulações.

Pacote Nexus gerado em `artifacts/nexus-web.zip` no seu repositório, **87,2 MiB**,
com os arquivos Web extraídos em `artifacts/web-game`. Abertura local do pacote
real em Chromium a 1600×900: motor inicializado, menu/trio/campanha renderizados,
sem erros de página ou console. Captura e resumo em `artifacts/renascimento`.
Essa verificação não mede FPS sustentado, não conclui uma campanha manual e não
valida o servidor PvP publicado. Para executar: `npm run serve:game` no Nexus
(use `PORT=8090` se a porta 8080 estiver ocupada). Para recompilar, Godot 4.6.3
com templates Web correspondentes, `npm ci` e `npm run build:game`;
`GODOT_EXECUTABLE` seleciona o editor e `XDG_DATA_HOME` a pasta dos templates.

**Planejado:** fases 1–7 restantes e metas numéricas originais.
**Implementado:** recuperação de save Nexus e ambiente reutilizável.
**Testado:** baseline, suíte completa após correção, 20 cenários de recuperação,
exportação e abertura do pacote real no Chromium.
**Aprovado:** nenhum aceite humano do Renascimento.
**Pendente:** campanha ampliada, metaprogressão, Lumi ativo, audiovisual, balanço,
homologação e publicação. A entrega não deve ser chamada de versão 1.0.

## Segundo incremento — fundações dos três jogos

Implementação de 05/11/2026 nas branches de contribuição, sem publicação.

| Jogo | Alteração jogável | Compatibilidade e limite |
| --- | --- | --- |
| Cinzas | Continuar campanha no menu; checkpoint de entrada, área limpa e escolha de saída; guardar e voltar ao menu sem encerrar a run | Save separado da horda; backup v2 aceita v1; confirmar nova expedição; ações após o último marco não são retomadas |
| Atalaia | Carregamento validado antes de alterar a partida; mensagens reais de erro; salvar/voltar/fechar só concluem após sucesso | Formato 1 preservado, RNG int64 exato; originais inválidos guardados por bytes; timers negativos legítimos e dano de torres vendidas mantidos; sem recuperação automática de corrupção |
| Nexus | Missões e recompensas persistem por ID; menus, capítulos e próxima missão usam os novos contratos | Formato 4, migração 1/2/3 com backups; recompensa histórica independe da ordem ou recompensa atual; formato futuro/IDs desconhecidos bloqueiam escrita; nove missões e 20 ativos mantidos |

No Cinzas, o checkpoint da área é congelado. Dano, abates e recompensas parciais
não podem se somar novamente ao retomar. Os marcadores de relíquias/santuários
usados acompanham a área concluída; uma escolha pendente mantém as mesmas cartas.
Importar valida ambos os saves antes de alterar qualquer um e desfaz a operação
se o armazenamento falhar. O manifesto de mídia permaneceu intacto.

No Atalaia, `save_schema.gd` valida estruturas, números finitos, identidades,
donos históricos, rotas/slots, escolhas e coerência onda/território/fase/cristal.
`run.gd` aplica somente campos permitidos depois da validação. `save_store.gd`
confere escrita, cópia e substituição; `main.gd` não atualiza o Continue nem
abandona a partida quando salvar falha. O build roda as novas suítes e rejeita
erros de script Godot mesmo quando o motor encerra com código zero.

No Nexus, o ledger guarda `missionID → recompensa recebida`; as tabelas legadas
são congeladas. `cleared` é uma projeção de compatibilidade, sem conceder vitórias
por posição na lista. Prerequisitos e capítulo são explícitos; término, semente,
recompensa e repetição não dependem da posição de exibição. Alterar progressão
não muda atributos, kits ou protocolo PvP.

**Revisão independente:** sem bloqueadores pendentes. O bypass Atalaia de declarar
vitória na onda zero foi reproduzido durante revisão e corrigido. No Cinzas,
43 roundtrips independentes atravessaram os 15 capítulos com seis relíquias e três
santuários. A avaliação não é aceite visual humano nem playtest de balanceamento.

**Pendências da Fase 1:** recuperação automática Atalaia, demais configurações e
gerenciamento de cenas conforme necessidade dos próximos incrementos. Fases 2–7
e as metas numéricas da diretriz permanecem pendentes, sem redução de escopo.

### Verificação do segundo incremento

- Tipos, formatação, build Next e revisão de diff aprovados.
- Core completo: **1.475 aprovados, zero falhas/skips**. As regressões afetadas
  foram repetidas após a correção final do diálogo Cinzas.
- Atalaia: **194** verificações de validação, **19** de armazenamento e **24** de
  regras, sem falhas. O build executou as duas novas suítes e a interface real;
  exportação Web concluída. A campanha determinística manteve vitória na onda 15,
  **22/30** de integridade e **419** abates.
- Nexus: **48** testes JS/PvP, **37** verificações de progresso por identidade e
  **20** de recuperação, sem falhas; suíte Godot completa aprovada, mantendo
  **1.269** verificações integradas, paridade das 29 partidas/**1.575** ações e
  replay das 216 simulações/**13.397** ações. Exportação Web recompilada.
- Browser dos jogos reais: **duas rodadas consecutivas aprovadas**, mesmo build,
  **4 testes por rodada**, sem falhas/skips. Atalaia salvou combate, continuou e
  exportou CSV mantendo a chamada. Cinzas confirmou saves independentes,
  importação/exportação e confirmação/cancelamento nos dois modos de hospedagem.
  A ponte Windows é simulada; não representa Electron nativo.
- A primeira rodada encontrou `window.confirm` bloqueado pelo sandbox do iframe.
  A confirmação foi substituída por `<dialog>` dentro do jogo, mantendo o
  sandbox. Escape/Cancelar/B preservam o save; o foco inicial é a ação segura.
  Nenhuma tentativa falha foi contabilizada como aprovação.
- Transições pelos 15 capítulos do Cinzas foram verificadas por cenários de
  checkpoint; isso não constitui playtest humano de combate do início ao fim.

Pacotes de desenvolvimento: `artifacts/renascimento/cinzas-web-alpha.zip` e
`artifacts/renascimento/atalaia-web-alpha.zip` no Trono;
`artifacts/nexus-web.zip` no Nexus. Os dois primeiros incluem instruções de
execução local; todos são Web e continuam alpha. Hashes/tamanhos estão em
`artifacts/renascimento/packages.json`. Os saves dependem da origem/endereço
usado para jogar: mudar porta, navegador ou dispositivo usa outro armazenamento.
Esses pacotes não foram publicados no Surge/itch.io nem homologados no Windows.

Logs do Trono em `artifacts/renascimento`; logs Nexus em
`artifacts/renascimento-ids`. O registro de testes e correções não substitui os
aceites de arte, áudio, desempenho sustentado e campanha da Fase 7.

A confirmação Cinzas foi inspecionada em 1440×960 e 390×844: diálogo e botões
dentro do viewport, Cancelar focado, Escape preservando progresso. Capturas em
`artifacts/renascimento/confirm-*.png`. O Nexus exportado também abriu em
Chromium sem erros de página/console. Os três ZIPs passaram verificação de CRC
e presença de `index.html`; as fontes Cinzas conferem com os arquivos do build.

## Terceiro incremento — objetivos táticos do Nexus

As nove missões existentes continuam preservadas; três receberam regras próprias:

| Missão | Condição real | Prazo/derrota |
| --- | --- | --- |
| 02 — Ecos no pátio | Neutralizar o Acólito do Véu, podendo deixar os guardas vivos | Até o fim da rodada 4; o ritual completa se o prazo acabar |
| 05 — O arquivo submerso | Proteger os três integrantes por três rodadas completas, ou eliminar a ameaça antes | Qualquer integrante derrotado interrompe a transferência |
| 08 — O coração das máquinas | Derrotar o Guardião do relé; auxiliares sobreviventes recuam | Até o fim da rodada 6 |

O Guardião do relé é uma variante de encontro com atributos próprios e arte de
Rhazen reutilizada; não é um novo herói selecionável ou uma nova animação final.
Os demais encontros conservam a condição de eliminar todos os adversários.

Preparação, HUD, resultado e registro de batalha mostram o objetivo. A resolução
ocorre após impactos, após efeitos periódicos e antes dos efeitos da rodada que
ultrapassa o prazo. Vitória encerra efeitos posteriores; falha não concede gema,
e tentar novamente restaura o prazo e o trio. As recompensas continuam no ledger
de IDs já migrado, sem invalidar vitórias anteriores ou conceder novos prêmios
automaticamente por causa da atualização.

O automático da campanha considera o alvo do objetivo, reserva energia quando
um ataque básico viabiliza um supremo na rodada seguinte e preserva cura/proteção
para aliados em risco. Não reserva energia para uma rodada depois do prazo.
Parâmetros em `godot/data/campaign-tactics.json`; objetivos em `campaign.gd`;
resolução isolada em `mission_objectives.gd`, no repositório Nexus.
O motor livre/PvP recebe somente checkpoints opcionais; não carrega regras de
missão ou parâmetros da campanha.

### Evidências e limites deste incremento

- Novos testes de objetivo: **38 verificações aprovadas**, incluindo impacto,
  dano periódico, prazo antes dos efeitos seguintes, proteção do trio, comando
  inválido, derrota/retry, recompensa única, HUD real e botão de início dentro do
  viewport. O primeiro cenário red
  reproduziu nove falhas; uma segunda regressão reproduziu efeitos ocorrendo
  depois da vitória por dano periódico, também corrigida.
- A inspeção Web reproduziu corte do botão de início após inserir a faixa de
  objetivos. A faixa passou a compartilhar o espaço reservado a legendas, com
  texto compacto e instrução completa na preparação/tooltip. O teste geométrico
  falhou antes da correção e passou depois. A faixa de voz continua disponível.
- **48 testes JS/PvP** e a suíte Godot completa passaram. O runner integrado
  registrou **1.254 verificações**, incluindo **1.227** de interface. A contagem
  muda porque a missão do ritual termina antes e o loop executa menos ações;
  nenhuma asserção foi retirada para esconder falha. Foram preservadas a paridade
  das **29 partidas/1.575 ações** livres e o replay de **216 simulações/13.397 ações**.
- O trio inicial concluiu as nove missões com o motor real e sem gemas obrigatórias.
  A missão do Guardião inicialmente falhou por gastar energia sem preparar o
  supremo. A decisão tática foi corrigida sem alterar seus atributos ou o prazo.
- Matriz automática: **36 cenários**, quatro trios, três sementes em cada um dos
  três objetivos, sem gemas; **30 vitórias, seis derrotas por prazo, zero erros**.
  Axion/Veyra/Astra e Nima/Riven/Kira venceram os nove cenários de cada trio.
  Rhazen/Sylva/Riven e Oren/Kira/Saira venceram ritual/defesa, mas perderam o
  comandante nas três sementes. Isso é uma limitação observada da combinação
  equipe/política automática, não prova de inviabilidade com controle manual nem
  balanceamento final aprovado. O equilíbrio entre composições continua pendente.
- Nova exportação Web produzida; menu da campanha e preparação de batalha abertos
  no Chromium, incluindo a conferência final do botão de início totalmente
  visível após a correção. Logs, capturas e `objective-matrix.json` estão em
  `PROJETO-NEXUS/artifacts/renascimento-objectives`. As capturas não substituem
  playtest humano, áudio ou medições de FPS/memória.

O build atual do Nexus continua em `PROJETO-NEXUS/artifacts/nexus-web.zip`.
Cinzas e Atalaia não receberam alterações de gameplay neste terceiro incremento;
seus pacotes de fundações permanecem os já validados. Não houve publicação.

## Quarto incremento — equipamentos e economia do Nexus

**Coleção → Oficina** agora administra Arma, Proteção e Relíquia de cada herói
ativo, com três patamares e especializações alternativas. As peças básicas
preservam os atributos anteriores. Melhorias custam 3/5 fragmentos e conservam a
gema; especializar ou trocar peças entre heróis devolve as gemas afetadas. Trocar
conserva patamar/investimento e não custa materiais. Prévias mostram vida, ataque,
defesa e energia inicial com o conjunto completo, antes de aplicar.

Patamar II/especializações abrem no fim do capítulo I; patamar III, no fim do II.
Primeiras vitórias rendem 6 fragmentos, mais 6 nos três finais de capítulo.
Vitórias antigas recebem esse crédito pela identidade histórica. As nove missões
somam **72**, o custo exato das nove peças no patamar III para um trio. Uma nova
vitória em missão concluída rende **2** fragmentos, sem repetir gemas. Preparação
e resultado mostram os ganhos. Reexibir o mesmo resultado não concede novo prêmio.

O save **5** inclui peças e contagens de repetições; o saldo deriva de ganhos
menos investimento. Migra formatos 1–4 preservando cópia exata, inclusive
`.v4.bak`. Recuperação restaura peças, gemas e materiais juntos. Dados futuros,
peças inválidas, bloqueios violados ou gasto acima dos ganhos impedem gravação e
preservam o original. Edições são revertidas se salvar falhar; recompensas
vitoriosas ficam pendentes em memória, com aviso e proteção contra duplicação.
Parâmetros em `PROJETO-NEXUS/godot/data/equipment.json`; regras e manual em
`godot/PROGRESSION.md` e `godot/CAMPAIGN.md` daquele repositório.

### Evidências e limites deste incremento

- **51 verificações novas**: migração 4→5 com cópia exata, gemas conservadas,
  custos, bloqueios, transferência, estatísticas da próxima batalha, falha de
  gravação, recuperação conjunta, dados inválidos/futuros, tentativas estrangeiras,
  recompensa repetida e comandos da oficina real. Inclui campanha nova completa
  com melhorias graduais, terminando o trio no patamar III sem repetir missões.
- **48 testes JS/PvP**, checagem sintática e suíte Godot completa aprovados.
  Mantidas **1.254 verificações integradas**, **1.227** de interface,
  paridade de **29 partidas/1.575 ações** e replay de **216 simulações/13.397 ações**.
  Após os ajustes finais de textos/prévias, as cinco suítes afetadas foram
  reexecutadas: **211 verificações, zero falhas**, com encerramento limpo.
- Matriz de **108 cenários** sem gemas: quatro trios × três sementes × três
  objetivos, com básico, padrão III e Canalizador/Bastião/Âncora III. Resultados:
  **30/36**, **30/36** e **27/36** vitórias, respectivamente; zero erros. As derrotas
  ocorreram por prazo no Guardião do relé. Escolher as mesmas alternativas para
  todo o trio não garante vantagem; ajuste por herói/política e playtests humanos
  permanecem necessários. Não foi declarado equilíbrio final.
- Exportação Web e inspeção gráfica em Chromium: oficina acessível, peças,
  bloqueios, custos, seletores, prévias e trocas legíveis em **1600×900** e
  **1280×720**, com rolagem e sem erros de página/console. Os comandos de melhoria,
  especialização e troca com capítulos liberados foram exercitados na interface
  nativa automatizada; as capturas Web usam um perfil novo, com os bloqueios reais.
- Logs, capturas e matrizes em `PROJETO-NEXUS/artifacts/renascimento-equipment`.
  Pacote atualizado em `PROJETO-NEXUS/artifacts/nexus-web.zip`; CRC e manifesto
  SHA-256 conferidos. Cinzas/Atalaia permanecem nos pacotes anteriores.

Níveis, domínio, variantes de habilidades, vínculos, aquisição de heróis e fusão
de gemas continuam pendentes. Permanecem nove missões e vinte ativos. Esta entrega
é um incremento alpha e não conclui Renascimento 1.0. Não houve publicação.

## Quinto incremento — fabricação/fusão e recuperação do Atalaia

No Nexus, **Coleção → Engastes e gemas** agora oferece níveis I/II/III,
fabricação escolhida e fusão. Um fragmento cria três cópias I, após a primeira
vitória. Três cópias livres iguais produzem uma do próximo nível; II abre no fim
do capítulo I, III no fim do II. O diálogo informa o consumo exato e foca Cancelar.
Cópias equipadas são protegidas; troca e remoção conservam o nível. Prévias,
preenchimento por função e combate usam os bônus reais. Save 6 migra 1–5 com cópia
exata, incluindo `.v5.bak`, e recupera receitas, estoque, peças e materiais juntos.
Receitas inválidas ou falhas de gravação não consomem cópias/fragmentos.

As nove missões continuam concluíveis com as nove gemas básicas equipadas e as
nove peças III, sem fabricação obrigatória. No teto opcional, 12 vitórias extras
financiam 24 lotes e nove gemas III, preservando as antigas até cada substituição.
O sistema não exige esse teto para prosseguir na campanha atual. Comprar gemas
antes compete pelos fragmentos das peças, com custo explícito.

Evidências Nexus: **58 checks de receitas/migração/economia/UI**, **48 testes
JS/PvP**, checagem sintática, suíte Godot completa, **1.254 checks integrados**,
**1.227 de interface**, paridade de **29 partidas/1.575 ações** e replay de
**216 simulações/13.397 ações**. Matriz com peças padrão III e uma gema de cada tipo
por herói: **108 cenários**, **33/36 vitórias em cada nível**, zero erros; médias
15,03/14,92/14,81 ações para I/II/III. As três derrotas por prazo do Guardião
permanecem; não é equilíbrio final aprovado. Logs em
`PROJETO-NEXUS/artifacts/renascimento-gems`.

No Atalaia, substituições saudáveis preservam a gravação anterior em `.bak`.
Principal ausente/ilegível/inválido pode recuperar a cópia validada; o título
avisa que a última gravação pode ter sido perdida e oferece **Continuar** para o
snapshot real. RNG, combate e escolhas são restaurados juntos. Leitura não altera
arquivos; a próxima gravação preserva o principal danificado em `.invalid.bak`,
sem poluir o backup saudável. Versões numéricas incompatíveis não retornam
silenciosamente a uma versão antiga. Falha no backup bloqueia a substituição.
Aviso e ação Continuar têm áreas separadas no título.

Evidências Atalaia: **32 checks de armazenamento**, **194 de schema**, regras/UI
no build, typecheck, format check e build Next aprovados; **6 testes de integração**
com o jogo Web real e fixtures descartáveis. A suíte core também passou: **1.475 testes**. As fixtures de comunicação/Electron
são simuladas; não houve homologação nativa Windows. Logs em
`artifacts/renascimento/atalaia-recovery`. Pacotes locais atualizados, sem publicação.

Inspeção dos pacotes Web: Nexus teve cancelamento/confirmação, seleção do nível
II, engaste e persistência em IndexedDB conferidos, usando um perfil descartável
do capítulo I. Atalaia exibiu o aviso sem sobreposição e retomou a onda com a
balista e o combate do snapshot real usado como fixture. Capturas e logs nos
diretórios de evidência citados. Pacotes passaram CRC e SHA-256 foi atualizado
em `artifacts/renascimento/packages.json`. Aceite humano e Windows continuam pendentes.

## Sexto incremento — nível comum e maestria do Nexus

**Coleção → Evolução** mostra nível da equipe, EXP, próximo marco, maestria do
herói escolhido e atributos reais. O HUD identifica o nível daquela batalha;
o resultado informa EXP e pontos. Níveis 1–6 usam 0/100/250/450/700/1000 EXP,
com 100 por primeira vitória e 25 por repetição. Cada nível após o primeiro soma
2% VIDA, 1% ATQ e 1% DEF base, até +10%/+5%/+5%. Todos os heróis recebem o mesmo
nível; vitórias antigas já contam. Não há crescimento de atributos além do teto.

Cada integrante que iniciou uma missão vencida ganha igualmente 10 pontos de
maestria, sem depender de abates. Trocar o trio salvo antes de receber o resultado
não transfere crédito. Marcos em 10/30/60, com teto 60: dano até +1,5% ATQ,
tanque +3% VIDA e suporte +3 EN inicial. Parcelas somam com equipamentos/gemas
antes de um único arredondamento. Derrota preserva conquistas e não concede EXP;
um resultado não concede novamente. Bônus novos entram na próxima missão.

Save **7** migra 1–6 com cópia exata `.v6.bak`, conserva maestria junto das demais
conquistas e valida pontos/participações. Histórico antigo não revela os trios:
a migração não inventa maestria individual. Recuperação e gravação com falha
preservam os mesmos contratos, inclusive recompensas pendentes sem duplicação.
Um backup recuperado de formato antigo é arquivado antes da rotação posterior.

Evidências: **38 checks específicos**, incluindo os três papéis em uma vitória
real, troca de equipe antes do recibo, tetos, perda, recuperação e interface;
**48 testes JS/PvP**, checagem sintática e suíte Godot completa aprovados.
Mantidos **1.254 checks integrados**, **1.227 de UI**, paridade de
**29 partidas/1.575 ações** e replay de **216 simulações/13.397 ações**.
Amostra de **108 cenários** por preparo básico, peças III/gemas I e
peças III/gemas III/maestria III: **30/36, 33/36 e 33/36** vitórias, zero erros.
Não é isolamento de cada bônus nem aprovação final do equilíbrio.

Exportação Web e inspeção em **1600×900** e **1280×720** concluídas, com perfil
novo e checkpoint descartável de nível 5/maestria. Texto, atributos e marcos
conferidos; sem erros de página/console. Logs/capturas em
`PROJETO-NEXUS/artifacts/renascimento-mastery`. Pacote local atualizado e CRC/SHA
verificados. Variantes de habilidades, vínculos e demais expansões continuam
nas próximas etapas; a entrega segue alpha.

## Sétimo incremento — habilidades treináveis do Nexus

Os 20 heróis ativos têm três alternativas ligadas à maestria: Ímpeto na técnica
(fator principal +15%, custo +10 EN), Economia no supremo (fator −10%, custo
−10 EN) e Ritmo no básico (fator −10%, +4 EN recuperados). Transferências puras
de energia ajustam sua quantidade; efeitos, alvos, combos e duração permanecem.
Coleção → Evolução apresenta três abas com bloqueio, contrapartida e prévia.
Aplicar ou voltar ao original é gratuito. Cartões e automático usam os custos
e ganhos reais. Cada missão captura sua montagem; livre/PvP usam o kit original.

Save 8 guarda `abilityChoices`, migra 1–7 e conserva `.v7.bak` exata. Seleções
incompatíveis ou acima da maestria bloqueiam sobrescrita. Falhas de gravação
revertem a edição. A suíte específica passou **96 verificações**, executando as
**60 formas alternativas** e comparando os recibos com a prévia pública. Suíte
Godot completa e paridade JavaScript aprovadas; após organizar a tela em abas,
**169 verificações pertinentes** passaram. JavaScript: 48 testes aprovados.

Matriz adicional de 108 cenários: **33/36** vitórias em cada preparo (peças III /
gemas I / maestria III sem alternativas; mesmo preparo com alternativas; gemas
III com alternativas), médias 14,64 / 13,75 / 13,75 ações e zero erros. Três
falhas por prazo persistem. Não representa equilíbrio final de todo o elenco.

No Web exportado, seleção e aplicação reais persistiram no IndexedDB mantendo
maestria e inventário. Inspeção em 1600×900 e 1280×720, sem erros de página ou
console. Evidências temporárias em `PROJETO-NEXUS/artifacts/renascimento-training`.
Os três pacotes locais tiveram CRC e hashes conferidos. Nenhuma publicação.
Variantes com mecânicas exclusivas por personagem e expansão de elenco/campanha
continuam pendentes; esta entrega é a base comum das habilidades treináveis.

## Oitavo incremento — retorno dos quatro Lumi

Auren, Elyra, Solen e Zaya completam **24 heróis ativos em seis afinidades**.
Auren protege/purifica um aliado; Elyra cura e cria barreiras; Solen consome
aberturas de enfraquecimento; Zaya distribui cura e energia. Os vinte kits
anteriores ficaram idênticos. Regras **0.16.0** fecham Sombrio → Lumi → Ígneo,
tornando Sombrio/Ígneo neutro; dados e índices de arte originais permanecem.

Todos os 24 têm ficha com origem, vocação, história, conexões e citação. Auren
mantém sua arte/poses; Elyra/Solen/Zaya receberam uma folha RGBA baseada no atlas
original, conservado no projeto. Há assinaturas de efeitos para os quatro e
**16 falas sintéticas originais** adicionais: 96 no total. Os 80 arquivos e
registros de voz anteriores foram preservados exatamente. Modelos/dependências
ficam fora do jogo. Gravações decodificadas, não silenciosas e sem clipping
digital; qualidade artística e interpretação ainda aguardam aceite humano.

As alternativas de maestria agora cobrem **72 formas**, executadas em 108
verificações específicas. Restauração Lumi: **41 verificações**. JavaScript:
**55 testes**; browser original: seis testes e nova escolha/persistência de Elyra.
Suíte Godot completa aprovada: **1.301 verificações integradas**, incluindo
1.272 de interface, mais suites específicas; paridade de **36 partidas / 2.018
ações** e reprodução dos **282 logs / 17.730 ações**. Galeria, retratos, 72 ícones,
maestria, saves e o estudo 3D exercitam os 24. Laboratório 0.16 usa arquivos
próprios, preservando os registros 0.15; 282 simulações livres encerraram até a
rodada 21.

Dois clientes Godot com os quatro Lumi completaram partida PvP local (313
verificações, 71 ações). Dois clientes Web também sincronizaram sala e ação.
O hash PvP mudou: servidor publicado precisa acompanhar o novo catálogo; os
checks usaram servidor local compatível. Nenhuma publicação foi executada.

Matriz de campanha com sete trios: **48/63** vitórias no preparo básico e
**51/63** no evoluído, médias 18,76 / 17,11 ações, zero erros. Os três novos trios
venceram 6/9 cenários cada e perderam por prazo no relé. Isso mantém pendente o
balanço de objetivos e composições; não há homologação do equilíbrio geral.

Web exportado inspecionado em 1600×900 e 1280×720: evolução, três novos corpos e
retratos, preparação, início e habilidade de Zaya (+6 EN por aliado). Sem erros
de página/console. CRCs e hashes dos três pacotes locais atualizados. Evidências
em `PROJETO-NEXUS/artifacts/renascimento-lumi`. Campanha segue com nove missões;
48 principais, secundárias, vínculos, aquisição e audiovisual final aguardam as
próximas entregas. Renascimento 1.0 permanece em desenvolvimento.

## Nono incremento — proteção de um aliado escolhido

A estrada das cinzas (`forge-road`) agora transporta fragmentos: **o primeiro
integrante do trio é o portador**, independentemente de classe/função. É preciso
eliminar os rivais mantendo esse herói vivo; outras baixas são permitidas.
Preparação explica a escolha; HUD identifica o nome capturado naquela tentativa;
resultado distingue a queda do portador. A falha tem prioridade sobre eliminar
o último rival, inclusive em dano periódico. A mesma regra suporta sobrevivência.

O automático prioriza cura/escudo/purificação útil ao portador abaixo de metade
da vida. Prévias preservam RNG/estado; inimigos conservam a IA normal. Pesos em
`campaign-tactics.json`. A ação já encerrada não pode produzir outra decisão.
IDs, recompensas, save 8, liberdade do trio e regras livres/PvP permanecem.

**22 verificações específicas / 404 pertinentes** aprovadas: objetivo, falhas,
posições válidas/inválidas, prioridade defensiva, HUD, saves, itens, níveis,
maestria, habilidades e campanha real. O detector também capturou um erro de
script que saía com código zero na borda de missão encerrada; ele foi corrigido
e a suíte repetida em diretórios XDG absolutos e isolados.

Matriz de 168 cenários (sete trios × três sementes × quatro objetivos, em dois
preparos): **69/84 e 72/84** vitórias, médias **20,79 / 18,54 ações**, zero erros.
A proteção venceu **21/21 em cada preparo**; derrotas por prazo dos outros
objetivos permanecem. Web exportado inspecionado em 1600×900 e 1280×720, com
Elyra escolhida como portadora, início e ação reais, sem erros de página/console.
Pacote local atualizado; CRCs/hashes conferidos. Evidências em
`PROJETO-NEXUS/artifacts/renascimento-escort`.

Permanecem nove missões: quatro têm objetivos táticos próprios. Ondas sucessivas,
campos, chefes com fases e a expansão para 48 principais continuam pendentes.

## Décimo incremento — ondas sucessivas no Nexus

A escadaria das marés (`tidal-gate`) passa a ter **duas ondas** dos mesmos três
arquétipos, sem substituir artes ou mudar IDs/recompensas. A primeira usa
65%/90% de VIDA/ATQ do encontro base; a segunda, 75%/100%. Reforços têm recursos
próprios e abrem uma nova rodada. O trio conserva vida, energia, baixas, recargas
e condições; expiração de escudos e Fratura continuam. O motor conserva a
propriedade da ordem dos turnos, inclusive quando dano periódico termina a onda.

Preparação explica as condições, HUD conta as ondas e Registro anuncia reforços.
Só o último confronto concede vitória, gema, materiais, EXP e maestria; um
resultado marcado como terminal também precisa ter concluído todas as ondas.
Save 8 e os modos livres/PvP permanecem compatíveis.

**32 verificações específicas** aprovadas: validação atômica, duas/três ondas,
reagendamento, escudos, baixas, término simultâneo, reabertura, recompensa única e
cena real. Suíte completa aprovada: **1.301 verificações integradas** (1.272 de
interface), paridade de 36 partidas/2.018 ações e reprodução de 282 logs/17.730
ações. Caminhos reais de campanha/equipamentos/gemas das nove missões passaram.

Matriz de 210 cenários: **90/105 e 93/105** vitórias, médias 22,88 / 20,16 ações,
zero erros. Ondas venceram **21/21 em cada preparo**; os prazos dos outros
objetivos ainda causam derrotas. Web com Auren/Solen/Elyra em perfil descartável
concluiu duas ondas em 10 rodadas/41 ações. IndexedDB confirmou uma gema de
primeira vitória e +10 maestria por participante, inclusive Elyra que caiu ao
final, sem recompensa de replay. Capturas de ondas 1/2 e 2/2, resultado e inspeção
em 1600×900/1280×720 sem erros de página/console. Pacote local, CRCs e hashes
atualizados; evidências em `PROJETO-NEXUS/artifacts/renascimento-waves`.

Cinco encontros atuais têm condições próprias. Campos, fases de chefes,
expansão de conteúdo e demais metas da checklist seguem pendentes; sem aceite
humano ou publicação 1.0.

## Décimo primeiro incremento — campo de energia e transferência

A guardiã da memória (`tidal-heart`) tem a **Corrente do éter**: básicos
recuperam +4 EN e técnicas custam +5 EN para as duas equipes; supremos mantêm o
custo. Treinos combinam uma vez: Ritmo recupera 32, Ímpeto custa 45 e Economia
continua em 70. Coleção identifica prévias base; preparação/HUD/cartões mostram
as condições reais. Modificadores são validados antes de alterar qualquer ator;
catálogo livre e escolhas salvas permanecem intactos. O campo persiste em reforços.

**168 verificações específicas / 601 pertinentes** passaram: 24 heróis,
rivais, limites, custos efetivamente pagos, atomicidade, combinações com treino
e ondas, HUD, campanha completa, progressão e coleção. JavaScript final: **55
aprovados** e sintaxe válida. A última suíte completa/paridade foi a de ondas;
o campo recebeu as regressões pertinentes acima, sem alegação de nova suíte
completa após sua inclusão.

Matriz de 252 cenários: **111/126 e 114/126** vitórias, médias 25,90 / 22,60 ações,
zero erros. Campo: 21/21 em cada preparo. Condições estão registradas por cenário.
Web inspecionado em 1600×900/1280×720, mostrando básico treinado +32 EN, técnica
45 EN e supremo 70; demais integrantes usam +28/35. Evidências em
`PROJETO-NEXUS/artifacts/renascimento-field`. Pacote local atualizado.

O usuário pediu transferência para outro desenvolvedor/chat. O trabalho funcional
para neste marco. **Fases dos chefes ainda não foram iniciadas no código.**
Prompt, restauração e próximos passos em [RENASCIMENTO_CHECKPOINT.md](RENASCIMENTO_CHECKPOINT.md);
a [diretriz original integral](RENASCIMENTO_DIRETRIZ_ORIGINAL.txt) fica preservada.
Após confirmação explícita do usuário, commit/envio das duas branches foram
autorizados. A entrega final é um ZIP único com fontes completas, prompt e checklist.

## Continuidade autorizada durante a ausência do usuário

O usuário autorizou concluir o trabalho atual e prosseguir pelos itens pendentes,
sem depender de novos prompts. A execução segue entregas verificáveis, sem
publicar ou declarar aceites humanos que não ocorreram. A próxima sequência por
dependência é: concluir fabricação/fusão e recuperação do Atalaia; níveis e
maestria do Nexus; revisão dos quatro Lumi; variedade de objetivos e expansão
da campanha; progressão permanente do Cinzas e árvores estratégicas do Atalaia.
Cada entrega atualiza as evidências e os itens abaixo antes de iniciar a seguinte.
Audiovisual, balanceamento abrangente e homologação continuam nas fases previstas
no pedido original, sem substituir gameplay por conteúdo demonstrativo.

## Checklist consolidado solicitado

Itens marcados foram implementados ou verificados. Quando se trata de conteúdo
anterior preservado, isso é indicado; não conta como expansão Renascimento.
Itens abertos podem ter uma base parcial, descrita entre parênteses.

### Ambiente, arquitetura e continuidade

- [x] Localizar os dois repositórios reais e os fontes originais dos três jogos.
- [x] Preparar Node, dependências travadas, Godot e templates verificados.
- [x] Registrar auditoria inicial, matriz, inventário e riscos de regressão.
- [x] Preservar projetos, arte, áudio, licenças, trios e decisões existentes.
- [x] Produzir incrementos de código com testes de regressão e builds Web.
- [ ] Concluir auditoria aprofundada de cada subsistema e do conteúdo completo.
- [ ] Completar configurações/acessibilidade/transições e gerenciamento de cenas de todos os jogos.
- [ ] Completar em cada jogo os menus de continuar/nova campanha/seleção/progressão/configurações/créditos/sair conforme suas mecânicas.
- [ ] Completar perfis, conquistas locais, tutoriais contextuais e remapeamento de controles onde aplicável.
- [ ] Finalizar persistência dos sistemas ainda por criar; as campanhas atuais já possuem validação, cópias e continuação/recuperação.

### Cinzas do Abismo

- [x] Preservar campanha existente de 15 capítulos/3 regiões e modo Horda.
- [x] Implementar continuação de campanha em marcos explícitos, separada da horda.
- [x] Preservar build, vida e recompensas do marco, sem duplicar relíquias/santuários.
- [x] Implementar backup compatível, importação atômica e confirmação de substituição.
- [ ] Implantar progressão permanente e desbloqueios que mudem a forma de jogar.
- [ ] Revisar integralmente dano, cadência, colisão, esquiva, resistência e estados.
- [ ] Ampliar famílias/variantes de armas com identidades e sinergias próprias.
- [ ] Refinar animações de herói/inimigos/chefes e sincronização dos impactos.
- [ ] Ampliar terrenos, rotas alternativas, destruição, segredos e eventos.
- [ ] Entregar campanha nas cinco regiões planejadas, com começo e conclusão.
- [ ] Rebalancear campanha/Horda por cenários reproduzíveis e playtests.

### Atalaia: Guardiões do Cristal

- [x] Preservar três territórios, 15 ondas, seis torretas e cartas/doutrinas existentes.
- [x] Validar saves antes de alterar a partida, incluindo RNG e donos históricos.
- [x] Preservar arquivos inválidos e impedir falso sucesso ao salvar/voltar/fechar.
- [x] Recuperar automaticamente a cópia válida anterior, com aviso e Continuação real do Atalaia.
- [x] Revalidar os 48 slots pela verificação geométrica existente e concluir a campanha determinística.
- [ ] Medir cobertura útil por arma/rota/tempo e corrigir os problemas que forem reproduzidos.
- [ ] Entregar cinco atos e 30 fases distintas, com narrativa, objetivos e recompensas.
- [ ] Implementar árvores de Engenharia, Proteção e Conhecimento.
- [ ] Implementar Obelisco Solar, Guardião de Raízes, Canhão Sísmico, Farol Espectral, Forja de Cinzas e Arpão do Abismo, com upgrades e limitações próprias.
- [ ] Ampliar rotas, entradas, elevações e eventos ambientais.
- [ ] Expandir papéis de inimigos, resistências, elites e chefes com fases.
- [ ] Expandir cartas/reroll/economia e mover o acesso de upgrade ao HUD superior.
- [ ] Entregar sobrevivência infinita, desafios e repetição de fases concluídas.
- [ ] Refinar animações, efeitos e áudio com avaliação da identidade de fantasia.

### Project Nexus — prioridade principal

- [x] Obter o projeto original e preservar trios livres e elenco atual.
- [x] Preservar 20 heróis ativos e os dados/recursos dos quatro Lumi arquivados.
- [x] Recuperar saves anteriores e migrar progresso/recompensas para IDs estáveis.
- [x] Introduzir objetivos funcionais de alvo com prazo e defesa do trio em três missões existentes.
- [x] Mostrar objetivos na preparação, durante o combate e no resultado.
- [x] Adaptar o automático da campanha a alvo, energia e proteção sob prazo.
- [x] Separar parâmetros táticos de campanha das regras livres/PvP.
- [x] Reativar e revisar os quatro Lumi para totalizar 24 ativos/seis classes (balanço final e aceite audiovisual permanecem pendentes).
- [ ] Expandir para seis capítulos e 48 missões principais variadas, mais secundárias.
- [x] Implementar proteção de um aliado específico escolhido livremente no trio, com HUD e automático.
- [x] Implementar ondas sucessivas com conservação do trio, reagendamento e recompensa única (duas ondas em um encontro existente).
- [x] Implementar campo simétrico de energia e composição com treino/ondas (um encontro existente).
- [ ] Ampliar a variedade dos campos e implementar chefes com múltiplas fases na campanha ampliada.
- [x] Implementar oficina com três peças, patamares, especializações e prévias de atributos.
- [x] Implementar fragmentos previsíveis, recompensas repetíveis e transferência conservando gemas/investimento.
- [x] Migrar equipamento/progresso ao save 5 com backup e recuperação conjunta.
- [x] Implementar nível comum da equipe e crescimento limitado para o elenco ativo.
- [x] Implementar maestria I–III por participação, com benefícios reais e tela Evolução.
- [x] Implementar três alternativas de habilidade por herói ativo, com prévia, contrapartidas e evolução por maestria.
- [x] Estender as três alternativas de maestria aos quatro Lumi (72 formas no total).
- [ ] Aprofundar variantes com mecânicas exclusivas por personagem.
- [x] Implementar fabricação escolhida/fusão até III, conservação e orçamento opcional do trio validados.
- [ ] Implementar vínculos, aquisição do elenco e desbloqueios de equipe.
- [x] Completar biografias, origens, vocações, conexões narrativas, citações e maestria dos 24.
- [ ] Completar vínculos jogáveis e jornadas individuais dos 24 personagens.
- [ ] Produzir animações completas próprias, impactos e supremos finais para todo o elenco.
- [ ] Finalizar telas e acessibilidade da campanha, evolução, equipamentos e vínculos.
- [ ] Validar várias equipes e estratégias ao longo da campanha ampliada.

### Balanceamento, qualidade e entrega 1.0

- [x] Executar regressões core, Godot e browser das fundações entregues.
- [x] Testar migração/corrupção/retomada e falhas de armazenamento nas fatias implementadas.
- [x] Produzir pacotes Web locais e documentar limites da validação.
- [ ] Completar matrizes de armas, torretas, heróis, habilidades, chefes, economia e experiência.
- [ ] Medir FPS, memória, reinicialização e transições em sessões prolongadas.
- [ ] Validar controles físicos, mídia/Electron nativo, resoluções e hardware de destino.
- [ ] Realizar playtests humanos e aceite de arte, animação, áudio e balanceamento.
- [ ] Completar campanhas zero→fim, manuais, changelogs e comparação final por jogo.
- [ ] Homologar pacotes finais e ausência de bloqueadores conhecidos.
- [ ] Declarar/publicar Renascimento 1.0 somente após cumprir os critérios originais.

O checklist não transforma metas de planejamento em conteúdo entregue. As fases
de núcleo, progressão, campanha, audiovisual e homologação continuam abertas.
