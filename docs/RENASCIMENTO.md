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

## Décimo segundo incremento — duas fases no Arconte

Em **O último juramento** (`forge-heart`), o Arconte troca Coração de ferro por
Erupção do núcleo ao terminar uma ação ou um início de turno vivo com 50% de
vida ou menos. A segunda técnica acerta a equipe em área. Vida, energia,
recargas, efeitos e escudos ativos conservam suas regras. Derrota tem
precedência e dano letal ignora a transição. O registro, o objetivo na
preparação, o HUD e o resultado identificam a fase. O save 8 e o catálogo de
livre/PvP continuam compatíveis.

22 verificações do Arconte passaram, incluindo golpe que cruza o limiar, dano
periódico, novo padrão ofensivo, derrota simultânea, reinício e combinação com
ondas, campo e treino. Na matriz de 294 cenários deste incremento, foram
132/147 e 135/147 vitórias, sem erros. Os trios venceram o Arconte nos 42
cenários desse encontro. O prazo do Guardião do relé concentrou as derrotas.

## Décimo terceiro incremento — O Colapso no Nexus

O capítulo IV começa após a Fornalha, com **oito missões principais inéditas**.
A campanha tem **17 missões em quatro capítulos**. A sequência segue Zaya e
o trio da evacuação do Poente ao Custódio da dobra. Combina prazos, proteção do
trio, escolta, dois campos de energia, ondas e um segundo chefe em duas fases.
Usa artes existentes e novos perfis de rivais exclusivos da campanha.

Saves com as nove vitórias originais seguem para A carta de amanhã, com o
mesmo trio e as mesmas recompensas. Os oito IDs novos têm progressão e
recompensa por vitória real. As cartas do mapa quebram em múltiplas linhas,
com ambiente selecionado pelo capítulo em vez da posição da missão.

As 96 verificações de O Colapso incluem o percurso da primeira à 17ª missão,
recompensa única por tentativa e reabertura do save. Passaram 55 testes
JavaScript, a suíte Godot completa com 1.301 verificações integradas, a
paridade de 36 partidas/2.018 ações e a reprodução de 282 logs/17.730 ações.
O PvP foi verificado com servidor local em clientes Godot e Web.

A matriz de **630
cenários** teve **288/315** vitórias com peças básicas e **298/315** com assalto
III, gemas I e treino, sem erros. O Contrasselo concentrou derrotas por prazo
entre as novas missões (12/21 e 16/21 vitórias). O abrigo registrou três derrotas
do trio sem equipamentos avançados. Os trios venceram o Custódio em 21/21 com
cada preparo.

No Chrome local, um perfil descartável preparado com save 8 completou o Arconte
em **7 rodadas/27 ações**, com fase 2/2 em 1600×900, e outro completou A carta
de amanhã em **6 rodadas/26 ações**, em 1280×720. IndexedDB e reabertura
confirmaram a gema da primeira vitória e +10 de maestria para os três
participantes. Inspeção técnica e simulações não equivalem a aceite humano.
O ZIP Web local foi recompilado e teve a integridade conferida. Evidências
temporárias em `PROJETO-NEXUS/artifacts/renascimento-boss` e
`PROJETO-NEXUS/artifacts/renascimento-collapse`.

O próximo incremento amplia a jornada em direção às 48 missões. Vínculos,
aquisição e jornadas individuais, progressão permanente de Cinzas, árvores do
Atalaia e homologação permanecem pendentes.

## Décimo quarto incremento — campanha principal de Nexus

Seis capítulos com oito missões cada e três secundárias estão jogáveis. As
Seis Verdades e Nexus concluem a história. As quinze contraprovas reunidas
nos três capítulos originais abrem durante o quinto capítulo. O mapa separa
os arcos originais, os retornos e as secundárias. IDs, recompensas já salvas
e o modo livre foram preservados.

O percurso das 48 missões e das três secundárias passou com gravação e
reabertura. A matriz simulou 2.058 cenários, 964/1.029 vitórias no preparo
básico e 1.003/1.029 no preparo avançado, sem erros. O build Web passou.
Desafios adicionais, vínculos, aquisição e jornadas dos heróis permanecem
em desenvolvimento.

## Décimo quinto incremento — Legado de Cinzas e árvores do Atalaia

Cinzas registra o melhor avanço da expedição e libera preferências de arma
nos marcos 3/5/10/15. Elas se aplicam à primeira oferta de novas expedições e
a seus rerolls. O backup v3 leva esse perfil e importa os backups anteriores.
Atalaia usa as ondas 5 e 10 para desbloquear dois nós por árvore de Engenharia,
Proteção e Conhecimento. Cada nova campanha pode começar com uma especialização,
e retomar um save preserva a especialização que ele já tinha.

## Décimo sexto incremento — vínculos, jornadas e desafios do Nexus

Vínculos registram os pares do trio que iniciou a batalha. Três vitórias
juntas liberam +2 EN inicial por parceiro ativo, até +4. O save 9 preserva
os formatos anteriores com backup. Após o prólogo, cada um dos 24 heróis
tem uma jornada pessoal e um pacto de campanha. A preparação é dedicada e
os seis confrontos finais trazem diálogos no briefing. As três secundárias, as
jornadas e os três desafios dos capítulos IV–VI são opcionais.

O motor completou as 48 missões, as três secundárias e os três desafios
com reabertura do save (171 verificações). As 24 jornadas tiveram vitórias
legais e gravação (54 verificações), incluindo trocar o trio antes do
resgate. Vínculos tiveram 12 verificações próprias. Todos os 24 continuam
disponíveis no modo livre. Aquisição além dos pactos continua pendente.
A matriz atual de sete trios e três sementes por encontro somou 2.184
simulações, com 999/1.092 vitórias no preparo básico e 1.052/1.092 com
assalto, gemas, treino e vínculos. Não houve erros de resolução.

## Décimo sétimo incremento — cinco regiões de Cinzas e Crônica do Atalaia

Cinzas preserva os 15 capítulos originais e segue por dez capítulos de
Geleiras do Silêncio e Bastião do Alvorecer, com rotas, formações próprias e
dois guardiões em duas fases. O teste de continuação usa combate previamente
resolvido. A travessia do motor foi exercitada em três sementes nos 20
mapas de exploração, e os ataques das duas fases nos cinco chefes. As
sentinelas guardam o portal das Geleiras, e o Sino da Vigília no Bastião
concede um reroll. As runas dos capítulos 20 e 25 alteram o especial neutro
de novas expedições.

A Crônica é uma segunda campanha do Atalaia, com cinco atos, 30 fases, seis
torretas regionais e dois mapas adicionais. Há bônus por integridade, chefes
com transição de fase, espíritos velados e renovação de cartas por ouro.
A Fundição tem um vigia que protege aliados e resiste ao fogo e uma tecelã
que se divide em duas crias. Duas cartas novas usam troca de alcance por dano
e aumento de cadência por proximidade entre torres.
Desafios, repetição e Sobrevivência usam sessões independentes dos dois
checkpoints. A Sobrevivência transfere as torretas para terrenos livres na
volta à Floresta e restitui o investimento quando falta espaço.

Atalaia teve 264 verificações da Crônica, incluindo a retomada entre atos,
a volta da Sobrevivência ao primeiro mapa e a passagem da onda 114.
A geometria dos 86 espaços passou pelo critério de 45–105 px da via mais
próxima. As 188 combinações de torreta, nível e rota têm pelo menos um
terreno alcançável, com janelas de 2,27 a 10,13 s contra um lobo. A política adaptativa da semente 78 completou as 30 fases com 22/30 de
integridade e 718 abates. As sete combinações executadas com sementes 78,
83 e 157 e especializações de rank 2 terminaram com 13–24 de integridade.
O equilíbrio abrangente e o aceite humano continuam pendentes.

### Aceite humano da continuidade

Use um perfil separado ou guarde um backup antes dos ensaios de substituição
de saves. Registre navegador, hardware, resolução, perfil gráfico, controle
utilizado e o ponto do jogo observado.

- **Cinzas:** abrir a Forja por continuação, avançar às Geleiras e conferir
  o marcador e a abertura do portal após as três sentinelas. Em uma
  expedição com as runas liberadas, testar os dois especiais e o retorno
  pela Horda. Conferir pulo, esquiva, especial, menu e remapeamento no
  controle físico, inclusive desconectar e reconectar durante o combate.
- **Atalaia:** abrir o título clássico e a Crônica em sequência. Construir
  pelo arsenal regional, trocar torretas, renovar uma oferta, retomar uma
  onda e conferir a transição de ato. Na Fundição, observar aura do vigia,
  tecelã, crias, estados e sinal da segunda fase do chefe.
- **Nexus:** trocar o trio na preparação, confirmar que o Livre mantém a
  outra composição, vencer com o trio de campanha e reabrir o arquivo.
  Jogar uma jornada com o protagonista fora da primeira posição, ler os
  vínculos e testar um desafio de prazo. Conferir animações, vozes e efeitos
  com aceleração, volume alterado e movimento reduzido.

A inspeção automatizada do Chrome usou saves e mídia descartáveis. Testou
as duas novas regiões de Cinzas em 1440 e 420 px, a Crônica com Guardião de
Raízes salvo e reaberto e o Arconte no Nexus, com briefing, vitória e
recibo da gema, maestria e pares no save 9. Esses resultados distinguem
fluxos técnicos de avaliação física e aprovação visual.

## Décimo oitavo incremento — técnicas adquiridas e variantes

As jornadas dos 24 heróis do Nexus liberam uma técnica pessoal cada. A escolha
fica em Coleção → Evolução, ao lado das alternativas de maestria. Cada técnica
tem uma mudança de alvo, proteção, aflição, recursos ou execução e uma
contrapartida. O save 10 guarda a escolha e preserva cópia exata do save 9.
As 109 verificações novas incluem aquisição, prévia, execução, reabertura,
bloqueio de técnicas não conquistadas, mudança na interface e custo em campo.

Cinzas ganhou quatro variantes permanentes de arma nos marcos 5/10/15/20.
A mesma preferência de Legado garante a família na oferta inicial, com a
variante aplicada à tentativa. As fontes preservam as quatro famílias
originais e suas artes. Os dois panoramas novos ficam em assets/renascimento,
com prompts registrados no documento de artes e hashes no manifesto.

As revisões adicionais reproduziram perdas por quota de armazenamento, abas
desatualizadas e eventos de área limpa seguidos de morte no mesmo frame.
Os testes de interface agora exercitam essas condições e a preservação do
documento ilegível original. A tentativa pendente pode ser exportada quando
o armazenamento recusa uma gravação.

A rodada geral aprovou 1.479 testes core e quatro testes de navegador de Cinzas. Os avisos distinguem checkpoint
persistido de tentativa apenas na sessão, inclusive quando outra aba atualiza
o disco. As novas variantes reutilizam a arte de cada família; os panoramas
foram gerados pela ferramenta integrada de imagens e convertidos para WebP.

O ensaio de desempenho mediu 60 segundos por jogo no Chrome com SwiftShader:
7,77 callbacks/s no Cinzas, 20,67 no Atalaia e 24,25 no Nexus, em 1600×900.
O heap JavaScript ficou em 3,4/80,6/102,5 MiB, respectivamente; não inclui
memória WebAssembly ou GPU. Um recorte de quatro segundos isolou o custo do
fundo do Cinzas: cache de fundos dimensionados elevou a amostra de alta
qualidade de 4,9 para 12,5 callbacks/s. São medidas em renderização por
software, sem validação de 60 FPS, sessão prolongada ou hardware de destino.

## Décimo nono incremento — névoa tática e revisão de persistência

O chamado dos juncos, fase 9 da Crônica do Atalaia, recebe uma névoa
periódica: alcance −20% por seis segundos, começando em oito segundos e
repetindo a cada vinte. O HUD antecipa três segundos e mostra a duração;
a preparação explica a condição. O Farol Espectral conserva seu alcance.
O relógio já persistido conserva a condição ao reabrir; o perfil de efeitos
reduzidos mantém o aviso. A campanha clássica preserva seu alcance.

A suíte da Crônica passou 275 checks. O ensaio adaptativo da semente 78
completou novamente as 30 fases com 22 de integridade e 718 abates. A
comparação de técnicas do Nexus cobriu mais 2.496 cenários, incluindo todos
os 24 heróis: 1.219 vitórias com maestria e 1.202 com as técnicas pessoais,
zero erros e 4.516 usos das técnicas adquiridas. São simulações com preparo
definido; detalhes e limites estão em `godot/BALANCING.md` do Nexus.

A revisão do Cinzas encontrou e corrigiu o checkpoint pendente que podia
voltar após a morte quando a quota recuperava. A remoção agora acompanha o
fim da tentativa e conserva o save de outra aba. Outra regressão impede que
a tentativa antiga sobrescreva um backup recém-importado. Os testes de
interface cobrem os dois casos, e a importação de um original ilegível foi
verificada preservando os bytes exatos na cópia de segurança.

## Vigésimo incremento — treino de regiões de Cinzas

O menu permite treinar cada região após concluir a anterior, usando a melhor
marca permanente do Legado. A sessão cobre os cinco capítulos dessa região e
termina no guardião. Não cria checkpoint, recompensa permanente ou recorde;
campanha e Horda conservam seus saves e podem ser retomadas ao sair do treino.

O preparo fixo é mostrado antes de entrar: +20 vida, +20% dano base, +8%
cadência e +3% resistência por região anterior. Não são cartas adquiridas ou
bônus da expedição normal. A arma é escolhida na oferta inicial; preferências
de arma, variante e runa já conquistadas continuam utilizáveis no treino.
A pausa permite encerrar o treino e repetir mantém o modo escolhido.

O teste do motor percorreu os cinco capítulos de treino por fronteiras
resolvidas, sem simular uma vitória manual de combate. A interface simulada
conferiu o Legado e a continuação da campanha preservados. O Chrome aprovou
o bloqueio do Bastião, entrada nas Geleiras e retorno à campanha original.
Tipos, formato, build, 1.480 testes gerais e cinco testes de navegador passaram.
A amostra de chefes comparou mais 120 duelos com as quatro variantes:
65 vitórias, ante 66 nas famílias base, com o mesmo preparo simulado.

## Vigésimo primeiro incremento — posições elevadas do Atalaia

A Fundição e o Bastião recebem dois terrenos elevados cada, identificados por
anel duplo. Cada posição acrescenta 18 de alcance antes de cartas e doutrinas.
O painel identifica o bônus; a prévia de construção e o combate consultam o
mesmo cálculo. Mover a torreta para o chão comum remove o bônus. A posição já
salva basta para restaurá-lo, sem novo formato de checkpoint.

As 285 verificações da Crônica passaram. A cobertura voltou a medir as 188
combinações de arma, nível e rota, agora calculando o alcance em cada terreno:
nenhuma combinação ficou sem posição útil. As 12 combinações de sementes
78/83/157 com nenhuma especialização ou rank 2 de cada árvore concluíram
as 30 fases com 22–30 de integridade. Esses resultados usam uma política
adaptativa automatizada e não representam equilíbrio ou aprovação humana.

A inspeção de foco do Cinzas em 420 px reproduziu uma ação recortada pelo
quadro; a navegação por controle simulado passou a rolar o item focado para
a área visível. A regressão Chromium verifica esse comportamento sem criar
snapshots visuais permanentes.

## Vigésimo segundo incremento — conquistas locais do Nexus

Extras apresenta oito conquistas de missão principal inicial, campanha completa,
nível da equipe, jornadas, vínculos, maestria e desafios. Cada cartão identifica
o requisito, a contagem e o estado por texto. Os marcos derivam dos registros
validados do save 10; a consulta não grava dados ou concede recompensas.

As 15 verificações específicas passaram, incluindo catálogo parcial sem meta zero e primeira missão registrada,
reabertura, arquivo preservado byte a byte e perfil antigo sem vínculos,
maestria ou jornadas presumidos. Um perfil completo de teste exibe 8/8. Esse
perfil foi montado para verificar a apresentação; não comprova campanha
manual zero→fim. As metas e os limites ficam em `godot/PROGRESSION.md` do Nexus.

## Vigésimo terceiro incremento — campanha contínua e apoio ofensivo

O novo ensaio do Nexus parte de um save vazio e usa somente vitórias,
fragmentos, peças, gemas e treinamentos conquistados por comandos públicos.
O save é reaberto após cada recompensa. Quatro de nove trios chegaram a
48/48 sem farmar; cinco pararam no Guardião do relé. Variações de preparo e
jornadas pessoais foram registradas separadamente. Esses resultados são
simulações da política e não campanhas humanas concluídas.

A investigação encontrou apoio ofensivo descartado pela IA de prazo.
Transferências de energia e fortalecimento agora são avaliadas pelo ataque
que habilitam no próximo turno aliado. O dono do combate projeta recarga,
efeitos periódicos e escudos. Uma finalização imediata tem prioridade sobre
benefícios futuros. Doze checks específicos cobrem a execução real dessas
decisões, estado/RNG preservados e um aliado sem turno restante.

A busca diagnóstica de sequências demonstrou vitórias legais com trios que
a política inicial não completava; ela não foi integrada ao jogo. A escolha
de auxiliares e a avaliação ampla de táticas continuam abertas. Detalhes e
reprodução ficam em `godot/BALANCING.md` do Nexus. Não foram alterados chefes,
prazos, recompensas ou os kits normalizados.

## Vigésimo quarto incremento — sabotagem de torretas no Atalaia

A patrulha da fase 23 inclui um sabotador que anuncia seu alvo por 0,65 s,
exige distância de até 140 e interrompe os disparos por 1,2 s, com intervalo
de oito segundos entre preparações. Morte ou perda de alcance cancelam o
aviso. A interferência não soma duração e termina entre ondas. O estado de
aviso, alvo e tempo restante é salvo e validado antes de restaurar a partida.

A criatura tem insígnia azul; a torre, sinal em primeiro plano e identificação
no painel. A arte-base do fungo e o som glacial foram reutilizados. Os sinais
são estáticos no perfil reduzido. Os 16 checks específicos passaram, incluindo
cancelamento, disparos após retomada, HUD real e rejeição atômica de dados
inválidos. A clássica e a Crônica venceram os ensaios completos da semente 78
com 22 de integridade; o Web foi recompilado e seis testes de integração
passaram. A inspeção usa save descartável, não aceite humano de arte/áudio.

## Vigésimo quinto incremento — recordes de Sobrevivência sem descarte

A revisão integral identificou que uma falha ao gravar o recorde da
Sobrevivência exibia aviso, mas ainda permitia abandonar sua única sessão.
Agora o retorno ao título, a repetição, uma nova campanha e o fechamento
nativo conservam a sessão quando a gravação falha. Resolver a obstrução e
repetir a ação grava o recorde antes de continuar. Os checkpoints das duas
campanhas permanecem independentes.

As 25 verificações de progressão passaram, incluindo a falha de arquivo e
as rotas de saída. O executor Godot exige o resultado final de cada suíte,
impedindo que um encerramento prematuro com código zero conte como aprovação.
Essa proteção também recebeu teste vermelho→verde. O build passou pelos
194 checks de save, 32 de arquivo, 285 da Crônica, 16 de interferência e pelas
campanhas completas; host: 1.481 testes gerais e sete de integração do Atalaia.
A revisão também concentrou a geometria de mira e boca das armas no catálogo.

## Vigésimo sexto incremento — recuperação do perfil estratégico

O perfil de árvores e recordes do Atalaia passa a usar a mesma gravação
atômica e recuperação de arquivos das campanhas, com validador próprio e
formato v1 preservado. Uma cópia saudável anterior recupera o perfil ausente
ou ilegível. O título identifica a recuperação; abrir o menu não regrava a
fonte. Avisos simultâneos da campanha e do perfil aparecem juntos, sem cobrir
a continuação. A próxima alteração conserva os bytes danificados antes de substituir
o arquivo. Falhas de cópia preservam o estado em memória e no disco.

Uma versão incompatível bloqueia a substituição, inclusive se o arquivo mais
novo surgir depois de carregar a sessão. Os testes reproduziram os dois
defeitos antes das correções. As 16 verificações específicas passaram; o build
Web também passou pelos 194 checks de schema, 32 de armazenamento, 25 de
progressão, 285 da Crônica, 16 de interferência, UI e campanhas completas de
15/30 fases. A suíte Nexus atualizada passou por 48/48 na campanha contínua,
12 checks de apoio ofensivo, 1.301 integrados/1.272 de UI, paridade de 36
partidas e reprodução de 282 logs. São testes automatizados e simulações,
sem aceite humano ou publicação.

## Vigésimo sétimo incremento — teclado configurável no Atalaia

Opções → Teclado permite remapear os 11 comandos existentes para letras,
números e Espaço. Teclas ocupadas trocam de lugar; Esc cancela, a navegação
dos menus conserva suas teclas e a restauração recupera os padrões. A defesa
fica pausada durante a edição. Os atalhos persistem nas configurações e
atualizam as dicas das armas, evolução, onda e pausa.

As 31 verificações nativas passaram, incluindo comandos reais, conflitos,
cancelamento e rejeição atômica de configurações inválidas. O teste de
persistência usa arquivo próprio mesmo com `GODOT_BIN` externo. Build Web,
typecheck, formatação, build do host e sete testes de integração passaram.
Chrome em 1600×900/1280×720 confirmou a preferência no IndexedDB e uma onda
iniciada pela tecla remapeada. Os dois eixos de revisão ficaram sem pendências.
São testes de software; controles físicos e aceite humano continuam abertos.

## Vigésimo oitavo incremento — créditos acessíveis nos três jogos

Cinzas oferece Créditos no menu e na navegação pelo controle, usando o mesmo
protocolo de diálogos: pausa a sessão e retoma ao fechar. O título do Atalaia
abre créditos com os avisos completos de fontes e motor. Nexus reúne em
Extras os avisos de fontes, Godot e síntese de voz. Os filtros dos exports
incluem as licenças consultadas; as atribuições seguem os documentos existentes.
O selo antigo de 15 áreas/três guardiões no menu de Cinzas foi atualizado para
25 capítulos/cinco guardiões.

Inspeções nativas descartáveis confirmaram retornos sem alterar saves/trios.
Chrome confirmou pausa, conservação de progresso e retorno em Cinzas
1600×900/420×900, e licenças legíveis em Atalaia/Nexus 1600×900/1280×720.
Typecheck, formatação, builds, 1.481 core, cinco testes browser Cinzas e sete
Atalaia passaram. Nexus manteve a suíte completa, 1.301 checks integrados,
paridade e logs; seu pacote Web local tem 89,1 MiB. Os dois eixos de revisão
ficaram sem achados. Não houve publicação nem aceite humano de apresentação.

## Vigésimo nono incremento — conquistas locais do Atalaia

O título abre oito conquistas derivadas do perfil: marcos estratégicos de
cinco/dez ondas, atos I/II/III e conclusão da Crônica, e Sobrevivência de
10/30 ondas. Não há campos novos no save, recompensas adicionais ou gravação
ao consultar. A escolha de jogar sem árvore conserva os feitos; perfis
clássicos antigos não recebem vitórias presumidas nos modos posteriores.
A tela conserva avisos de recuperação ou perfil ilegível.

Os testes reproduziram a perda de conquista por deseleção antes de usar
somente fatos permanentes. As 15 verificações passaram, com leitura sem
escrita, legado e apresentação real. Build Web, validações das campanhas,
typecheck, formatação, build do host e sete integrações passaram. A inspeção
Chrome em 1600×900/1280×720 usa perfil descartável completo, sem representar
vitórias humanas. Os dois eixos de revisão ficaram sem achados.

## Trigésimo incremento — conquistas locais de Cinzas

O menu de Cinzas mostra oito conquistas: capítulos 1/5/10/15/20/25 do
Legado e recordes de 5/20 ondas da Horda na edição atual. A consulta é pura,
usa apenas dados já registrados e não altera o backup v3 ou concede extras.
Trocar a arma preferida conserva os feitos. Ao abrir, o diálogo atualiza as
marcas do dispositivo e apresenta aviso se a fonte estiver ilegível.
Pausa, teclado e controle seguem o protocolo existente de diálogos.

O teste Chrome falhou pela ausência do acesso antes da implementação e passou
com a leitura 4/8→8/8 sem regravação. Os 14 grupos de continuação, 1.481 core,
seis testes browser, typecheck, formatação e build passaram. A inspeção em
1600×900/420×900 confirmou a lista e o fechamento alcançável por rolagem.
Os dois eixos de revisão ficaram sem achados. Os três jogos agora possuem
conquistas locais; a tela com todos os feitos usa fixture, não playtest humano.

## Trigésimo primeiro incremento — ensaios de reinicialização

Ensaios locais adicionais exercitaram saída e retorno repetidos, com perfis
isolados. São medições temporárias em `artifacts/renascimento-final-checks`,
sem novos snapshots visuais permanentes ou mudanças nas regras.

| Jogo | Ensaio concluído | Observação |
| --- | --- | --- |
| Cinzas | 30 partidas curtas de Horda em 181,4 s, com ataque, pausa, encerramento e título | Após GC a cada cinco ciclos: 1.584 nós DOM/198 listeners constantes; heap JS 2,89→3,17 MiB; zero erros JS |
| Atalaia | 100 ciclos nativos de iniciar/construir/lançar/voltar, 13,1 s | 154 nós nas dez amostras; memória estática 69,78→69,90 MiB; zero falhas |
| Nexus | 75 batalhas nativas com ataque iniciado e cancelado pelo retorno, 48,5 s | 576 nós/3.250 objetos constantes; memória estática 183,45→184,34 MiB; zero ações tardias ou efeitos restantes |

Cinzas usou Chrome headless/SwiftShader em 1600×900, com cerca de 10–13
callbacks de apresentação por segundo; isso mantém aberta a validação de
FPS no hardware de destino. Heap JS exclui parte da memória Wasm/GPU. Os
ensaios Godot sem janela medem ciclo de vida e memória estática do motor,
não desempenho visual. Não comprovam ausência de vazamentos em sessões de
horas, mídia/Electron nativo ou homologação final.

## Trigésimo segundo incremento — teclado configurável de Cinzas

Controles agora remapeia 11 ações de teclado, incluindo movimento, combate,
interação, pausa e reroll. A escolha troca conflitos primários ou alternativos,
conserva os demais atalhos e atualiza HUD, instruções e descrição acessível do
canvas. Esc, Tab, setas e números 1–4 mantêm seus papéis de navegação/seleção.
As teclas persistem como preferência opcional no armazenamento existente;
campanhas, Horda e remapeamento de controle permanecem separados.

A revisão identificou Shift+letra sendo salvo como Shift sozinho. Chrome
reproduziu o erro antes da correção: Shift agora só confirma ao ser liberado
sem outra tecla. O teste também cobre cancelamento, conflito, recarga,
restauração e uso real de H no especial, com recarga exibida. Os grupos de
controle/modelo, 1.481 core, sete testes browser, typecheck, formatação e build
passaram. A inspeção em 1440×900/420×900 confirmou os controles roláveis.
Os dois eixos de revisão ficaram sem pendências; controle físico segue aberto.

## Trigésimo terceiro incremento — redução explícita do tremor de tela

Controles de Cinzas oferece **Reduzir tremor de tela**. Sem escolha salva,
segue a preferência de movimento reduzido do sistema. Um booleano explícito
prevalece e persiste; a alteração remove imediatamente a agitação corrente.
O ajuste atinge apenas deslocamento de câmera, preservando combate,
telegráfos, animações e checkpoints.

O teste Chrome falhou pela ausência da opção antes de implementá-la. Passou
com preferência do sistema, restauração de escolha falsa e eventos reais de
tremor: a apresentação recebeu deslocamento positivo no modo normal e zero
no reduzido. Typecheck, formatação, build, 1.481 core e oito testes browser
passaram. A inspeção em 1440×900/420×900 confirmou o ajuste legível; os dois
eixos de revisão ficaram sem achados. Isso não conclui toda a acessibilidade.

## Trigésimo quarto incremento — a ponte do Sino da Vigília

No capítulo 22, o Sino da Vigília abre duas passarelas elevadas e uma
relíquia opcional. O terreno e a recompensa ficam indisponíveis antes de
ativar o santuário. A abertura deriva do mesmo registro de santuários usados,
sem campo ou versão nova de checkpoint. A recompensa consumida é retomada
sem duplicação; uma relíquia oculta declarada sem ativação é rejeitada
atomicamente. O prompt e a escolha de carta explicam a rota; o minimapa
mostra apenas as passarelas disponíveis.

A revisão encontrou um teto antigo que rejeitava uma campanha com todas as
relíquias anteriores e as duas do capítulo. O teste reproduziu o checkpoint
legítimo de dez relíquias antes da correção e agora restaura dez/2.000 pontos.
Os 15 grupos de exploração/combate/Horda passaram, incluindo travessia pelas
duas plataformas e coleta com movimento/pulo em três sementes. Typecheck,
formatação, build, 1.481 core e oito testes browser passaram. Chrome confirmou
sinalização e abertura no cenário real com fixture de área limpa e posição
próxima do Sino. Os dois eixos de revisão ficaram sem pendências; não é
playtest humano nem conclusão de toda a expansão de terrenos.

## Trigésimo quinto incremento — materiais coerentes nas novas regiões

A inspeção do Sino mostrou o Bastião pintado com a textura de gelo: o renderer
usava o índice da região como material, embora os índices 3/4 do atlas sejam
raízes/gelo. Pisos e tetos normais das duas regiões novas agora usam a pedra
existente. Gelo explícito, água, lama, esteiras e pontes conservam seus
materiais; as três regiões originais permanecem iguais. Nenhuma arte ou regra
de terreno foi substituída.

A alteração de apresentação recebeu inspeção Chrome no cenário do Bastião,
com a rota do Sino, e revisão sem achados nos dois eixos. Typecheck,
formatação, build, 1.481 core e oito testes browser passaram. Não há snapshot
visual permanente novo nem aceite humano atribuído a essa correção.

## Trigésimo sexto incremento — checkpoint local verificável

O checkpoint local atualizado reúne fontes completas dos dois checkouts,
incluindo WIP e arquivos novos, com bases exatas e hashes no manifesto. Não
inclui segredos, dependências ou exports reconstruíveis. O pacote histórico
não foi substituído. A documentação de recuperação permanece em
`RENASCIMENTO_CHECKPOINT.md`; o estado continua de desenvolvimento, com
commit/push bloqueados e homologação 1.0 pendente.

## Trigésimo sétimo incremento — inventário máximo ao longo da expedição

A regressão de economia/continuação percorre os 25 capítulos em três
sementes, ativa todos os santuários, coleta todas as relíquias disponíveis e
reabre cada marco. São 75 checkpoints com conservação de pontos, rerolls e
objetos consumidos. Cada trajetória termina com 11 relíquias e 2.200 pontos
de coleta; o Sino participa do orçamento e da retomada.

Os 15 grupos de continuação e as 13 suítes upstream de Cinzas passaram.
Esta é uma simulação de coleta/persistência com inimigos removidos na
fixture para isolar o inventário. Não é vitória de combate, navegação humana
completa ou balanceamento de campanha. Não houve alteração de produção;
o build e os oito fluxos browser do incremento 35 continuam correspondendo
às fontes do jogo. O pacote do incremento 36 conserva o corte anterior.

## Trigésimo oitavo incremento — pular a apresentação do turno no Nexus

O botão `Pular animação` aparece durante ações locais e de campanha. Conclui
o resultado já calculado, incluindo efeitos periódicos, sem sortear outra ação
ou avançar um turno extra. O mesmo fechamento atende o fim normal e o salto;
callbacks antigos são invalidados. A fila autoritativa do PvP permanece com
sua apresentação normal e não oferece o salto.

Dezoito verificações nativas cobrem antes/depois do impacto, efeitos de turno,
clique repetido, reinício, IA e recompensa única de campanha. A suíte completa
passou com 1.301 verificações integradas, 48/48 missões contínuas, paridade de
36 partidas/2.018 ações e 282 logs/17.730 ações. O teste novo tinha 14 casos
nessa execução completa; os quatro casos adicionais passaram na execução
direcionada. Passaram também 55 testes JS/PvP, 317 verificações/72 ações de
PvP nativo, export Web local, dois clientes Chrome e áudio direto/iframe.
Inspeção do agente em 1600×900 e 1280×720 confirmou o botão e a passagem ao
próximo ator sem erros. Não constitui aceite humano ou publicação. A revisão
de padrões e de especificação não encontrou pendências nesta fatia.

## Trigésimo nono incremento — teclado configurável do Nexus

Nove comandos podem ser remapeados em `Teclado`, no menu principal ou nas
Opções da batalha: quatro ações, dois sentidos de alvo, confirmação,
automático e pular animação local. Conflitos trocam as teclas; Esc cancela
a captura, Tab/F11 ficam reservados e há restauração dos padrões. Enter
numérico conserva o alias de Enter. Um único mapa valida captura/entrada,
alimenta cartões, rodapé e dicas, e usa o arquivo de preferências existente.
Janelas bloqueiam comandos de combate; os limites do PvP continuam valendo.

TDD reproduziu a ausência do controle. Passaram 25 verificações com input
real nos viewports, recarga, conflitos, rejeições atômicas, configuração
antiga, preservação de áudio/modo/movimento e tentativa de pular PvP ativo.
Passaram 18 verificações de pulo, a suíte Godot completa (1.301 integradas,
1.272 de interface), campanha contínua 48/48, paridade de 36 partidas/2.018
ações e 282 logs/17.730 ações. Os 55 testes JS/PvP e a checagem JS passaram.
O Web local de 89,1 MiB foi inspecionado em 1600×900 e 1280×720; dois clientes
Chrome executaram uma ação online. Revisão de padrões e especificação sem
achados após corrigir a fixture PvP e centralizar a normalização do evento.
Inspeção do agente e simulações não equivalem a aceite humano. Sem publicação.

## Quadragésimo incremento — renovação de Conhecimento e matriz de ofertas

Corrigido um conflito entre a árvore Conhecimento e Renovar oferta: o Tributo
garantido podia reaparecer na oferta paga que acabara de rejeitá-lo. A primeira
oferta dos marcos continua garantida; a renovação substitui as três cartas,
respeitando o filtro já existente. O teste reproduziu três verificações com
uma falha antes da correção e passou depois. Não mudou formato de save,
recompensa, preço ou regra da Campanha Clássica.

A matriz adicionada cobre 36 sessões: três sementes, três políticas de
recompensa e Engenharia/Proteção/Conhecimento/sem árvore. Passaram 8.422
verificações em 1.392 ofertas e 348 renovações, alcançando as 14 cartas.
Verifica preços de construção/evolução, ouro de recompensas, três escolhas
distintas, limite de modificadores, retomada das ofertas e rejeição de nova
renovação após reabrir. As ondas são resolvidas sem inimigos na fixture para
isolar a economia. Não são vitórias de combate ou prova de equilíbrio geral.

O build Atalaia executou a nova suíte e as regressões nativas antes do export
Web. Tipos, formato, build Next e 1.481 contratos core passaram. O fluxo Chrome
abriu o export real, salvou combate, baixou CSV e preservou a chamada. Revisão de
padrões e de especificação sem achados. Os artefatos continuam locais, sem
homologação ou publicação.

## Quadragésimo primeiro incremento — cartas em campanhas com combate

O simulador da campanha aceita três políticas explícitas: a adaptativa
histórica; recursos, que prefere Tributo e troca o restante por ouro; e
renovação, que paga 30 antes de escolher na nova oferta. O relatório registra
cartas, descartes e renovações aceitos. O defensor, posicionamento, upgrades
e escolha de doutrina são os mesmos; nenhum ouro, vida ou dano é injetado.

Trinta e seis campanhas completas cruzaram três sementes, três políticas e
as três árvores/ausência de árvore. Todas venceram as 30 fases. A adaptativa
terminou com integridade 19–30 e ouro 2.879–3.284; recursos, com integridade
4–12 e ouro 4.008–4.249; renovação, com integridade 19–30 e ouro 2.096–2.304,
incluindo 348 compras legais de nova oferta. A acumulação de ouro tem uma
contrapartida observável na defesa. Os resultados complementam a matriz de
ofertas; não são taxa de vitória humana ou equilíbrio de todas as construções.

O padrão Crônica/78 conservou vitória, 22 de integridade e 718 abates.
A Clássica conservou vitória/22 de integridade/419 abates; a política que
mantém quatro torretas iniciais continuou perdendo na onda 8.
A revisão de padrões e de especificação não encontrou achados. Só o código
do simulador mudou; os builds e o fluxo Chrome do incremento 40 continuam
correspondendo às fontes do jogo. Evidências detalhadas ficam em artifacts.

## Quadragésimo segundo incremento — continuidade da derrota no Nexus

Corrigido o cancelamento que devolvia a pose em pé a um personagem derrotado
ao começar outra ação. Fighter conserva a pose final inclinada/esmaecida e
a restaura ao receber um estado vivo. O movimento fatal usa o Tween que o
diretor cria/rastreia/cancela; o mesmo estado final atende pulo, movimento
reduzido, snapshots e dano periódico. Main e galeria distinguem impacto
animado da atualização imediata. Não houve alteração de lógica, RNG ou save.

TDD reproduziu separadamente a falha entre ações e a de movimento reduzido.
Passaram 110 verificações direcionadas: morte normal, pulo, callback antigo,
efeito de turno, reflexão fatal, reinício e snapshots dos 24 heróis em ambos
os lados. A execução completa passou com 106 casos dessa suíte e 1.301
verificações integradas/1.272 de interface; os quatro casos adicionais de
reflexão passaram depois na execução direcionada. Campanha contínua 48/48,
paridade de 36 partidas/2.018 ações e 282 logs/17.730 ações passaram.

Build Web local de 89,1 MiB, checagem JS, dois Chrome e PvP nativo com
313 verificações/71 ações passaram. O agente inspecionou capturas do viewport
Godot/Wayland, renderizadas em Mesa/llvmpipe, após impacto, na ação seguinte
e com movimento reduzido. Não mede GPU física ou aceite humano. Revisão de
padrões e especificação sem achados; galeria fatal específica permanece
sem teste direcionado. Animações completas próprias de todo o elenco
continuam abertas.

## Quadragésimo terceiro incremento — preservação do corte até 42

Novo pacote local completo conserva os incrementos de teclado, pulo,
continuidade da derrota, correção/matrizes de cartas e todos os WIP anteriores.
O manifesto registra as mesmas bases exatas, branches, estado sem commit e
hashes individuais. Há SHA-256 externo e verificação de CRC/todas as entradas.
O pacote do incremento 36 permanece intacto no seu corte anterior. Recuperação
e nomes em `RENASCIMENTO_CHECKPOINT.md`. Não é release, publicação ou homologação;
commit/push continuam exigindo confirmação explícita.

## Quadragésimo quarto incremento — coreografia corporal do Rhazen

Uma folha RGBA adicional de oito desenhos preserva a armadura, fornalha e
martelo do Rhazen. A geração nativa image_gen usou a arte original como
referência; uma edição corrigiu o recorte da arma antes da seleção final.
Arquivo, prompts completos, dimensões e SHA-256 constam no manifesto de arte
Nexus. O repouso original e os seis atlas anteriores continuam preservados.

Fighter resolve regiões, âncoras, sequências por fase e tempos opcionais.
O diretor usa seus próprios Tweens para percorrer preparação, golpe, contato
e recuperação. Ataque/supremo exibem seis desenhos em sequência; Coração de
Ferro/Defesa usam a postura defensiva, e a derrota tem desenho ajoelhado.
O efeito de contato do martelo foi reduzido para melhorar a leitura corporal.
Pulo, reinício e movimento reduzido continuam usando o resultado lógico único.
O fallback mantém as poses do restante do elenco.

Três falhas semânticas foram reproduzidas em TDD antes de ligar preparação,
sequência e derrota. Passaram 14 verificações dirigidas, incluindo o lado
espelhado, suporte, golpe fatal e retomada da pose; 12 casos anteriores
também passaram com a execução limitada a 12 FPS, sem inversão das etapas.
A suíte completa passou com 110 verificações de derrota, 25 de teclado,
18 de pulo, 1.301 integradas/1.272 de interface, campanha contínua 48/48,
paridade de 36 partidas/2.018 ações e 282 logs/17.730 ações.

Build Web local de 90,1 MiB e checagem JS passaram. O agente inspecionou seis
etapas, defesa e derrota no Godot/Wayland com Mesa/llvmpipe, e o golpe na
galeria Chrome em 1600×900 e 1280×720 sem erros. São fixtures de apresentação,
não playtest ou aceite artístico humano. Revisões de padrões/especificação
sem pendências funcionais. Este piloto não encerra as animações completas
dos 24 personagens. O ZIP do incremento 43 mantém seu corte até 42.

## Quadragésimo quinto incremento — coreografia de arco da Cindra

Cindra recebeu uma folha adicional de oito desenhos, com a arte original
como referência e correção de margem para manter o arco inteiro. Preparação,
tensionamento, disparo, acompanhamento e recuperação usam o controlador
existente, apenas com novos metadados e tempos. Sinal Escarlate mantém
escudos/fortalecimento do trio e usa a postura protetora; Defesa e derrota
ajoelhada têm desenhos próprios. O repouso, kit, trios livres e saves foram
preservados. Prompts e hash constam em `godot/data/animation-art.json` do Nexus.

O teste reproduziu a ausência da sequência corporal antes da integração.
Passaram 24 verificações de coreografia (Rhazen e Cindra) e 110 de derrota
do elenco: resultado integral do motor, básico, suporte, supremo espelhado,
morte real, ação seguinte, pulo e movimento reduzido. Sinal Escarlate conserva
a proteção de equipe definida no catálogo original.

Export Web local de 91,0 MiB, checagem JS e inspeção no Godot/Wayland com
Mesa/llvmpipe passaram. O agente conferiu o golpe/retorno na galeria Chrome
em 1600×900 e 1280×720, sem erros. Revisões de padrões/especificação sem
achados. Não se repetiu a matriz de combate do incremento 44: este recorte
acrescenta arte/metadados e testes, sem mudança de motor/diretor/Fighter.
Inspeção do agente não equivale a aceite artístico humano. A animação completa
dos 24 permanece aberta, e o ZIP do incremento 43 conserva seu corte até 42.

## Quadragésimo sexto incremento — peso e arco de Oren e Nima

Oren e Nima receberam oito desenhos corporais cada, usando a arte original
como referência. As edições selecionadas corrigem margens e transparência;
prompts, bytes e SHA-256 ficam no manifesto de arte Nexus. Oren mantém pedra,
raízes e punhos; Nima mantém arco, aljava e folhas. As novas regiões, âncoras,
fases e tempos reutilizam o controlador existente, sem nova lógica no motor,
diretor ou Fighter. Repousos, habilidades, trios livres e saves permanecem.

Âncora de Carvalho percorre o golpe pesado. As duas habilidades protetoras
de Oren usam sua postura de proteção. Flecha Silvestre, Espinho Perfurante e
Mil Espinhos percorrem o disparo de Nima. Ambos têm guarda e derrota ajoelhada.
TDD reproduziu duas falhas em 26 verificações antes da integração; a mesma
execução passou depois. A expansão final passou com 44 verificações de
coreografia e 110 de derrota, incluindo kit, espelhamento, resultado do motor,
pulo, morte real, ação seguinte, restauração e movimento reduzido.

Export Web local de 93,1 MiB, checagem JS e diff sem erros. O agente conferiu
as etapas e a derrota no Godot/Wayland com Mesa/llvmpipe, e disparo/retorno
nas galerias Chrome em 1600×900 e 1280×720. O alfa de Nima foi verificado no
renderizador; não apareceu matte externo visível no cenário. Revisões de
padrões/especificação sem achados. São fixtures de apresentação e inspeção do
agente, não aceite humano. O motor não mudou desde a regressão integrada do
incremento 44; não se repetiram suas matrizes de combate nesta entrega de dados.
Animações completas do elenco e homologação continuam abertas.

## Quadragésimo sétimo incremento — preservação do corte até 46

O checkpoint local de 09/11 conserva as fontes WIP completas até 46 e esta
documentação de corte, incluindo os quatro novos atlas corporais, prompts,
metadados, controlador e regressões. Manifesto, SHA-256 externo e verificação
de CRC/todas as entradas acompanham o pacote. As bases Git continuam exatas
e os dois ZIPs anteriores permanecem intactos. O pacote distingue testes
atuais de apresentação das regressões integradas anteriores; não é publicação
ou homologação. Recuperação em `RENASCIMENTO_CHECKPOINT.md`.

## Quadragésimo oitavo incremento — rifle, drones e continuidade das fases

Kira e Vektor receberam oito desenhos corporais cada, referenciados nas
artes originais. Kira conserva cabelo curto e rifle; Vektor conserva máscara
e três drones. As folhas selecionadas, prompts integrais, bytes e hashes
estão no manifesto de arte Nexus. Seus kits, repousos, trios e saves permanecem.
Kira usa preparação/disparo/recuperação nos três ataques; as duas habilidades
de Vektor conservam suporte. Ambos têm guarda e derrota ajoelhada próprias.

Fighter resolve pontos opcionais de emissão por quadro e seu espelhamento;
o diretor usa o ponto no lançamento, mantendo os próprios Tweens. Uma versão
por comando invalida interpolações antigas. TDD reproduziu a ausência das
sequências e a emissão pelo centro do corpo; três regressões adicionais
reproduziram sobrescrita da pose por fases antigas. Quinze repetições normais
e quinze limitadas a 8 FPS mantiveram seis quadros, impacto único e estado
esperado após a proteção. Isso não é medição de desempenho em hardware.

Inspeção encontrou recorte no topo da galeria e dupla atenuação dos corpos
derrotados. Os testes reproduziram quatro falhas de enquadramento e 56 em
110 verificações de derrota. A galeria agora reserva espaço superior; Fighter
mantém a cor de derrota e uma única redução de opacidade. Passaram os quatro
casos de enquadramento, 110 de derrota, três de transição e 68 de coreografia.

A suíte integrada passou com 1.301 verificações/1.272 de interface, campanha
contínua 48/48, paridade de 36 partidas/2.018 ações e 282 logs/17.730 ações.
As correções finais de enquadramento/opacidade receberam novamente os testes
direcionados e 56 verificações 2D. Build Web local de 95,7 MiB, checagem JS e
diff passaram. O agente inspecionou Godot/Wayland com Mesa/llvmpipe e galerias
Chrome em 1600×900 e 1280×720. Revisões de padrões e especificação sem achados.
Não houve aceite humano, Git mutável ou homologação. O ZIP do incremento 47
conserva seu corte até 46; estas mudanças posteriores estão nos checkouts.

## Quadragésimo nono incremento — contra-jogo nas fases finais

Arquivista e Primeira Arquiteta receberam pressões distintas na segunda fase.
Rebote da Ata aplica Exposição ao trio por dois turnos pessoais, removível por
Purificação. Colapso das Margens atravessa escudos com 35% do dano; o restante
ainda é absorvido e Defesa reduz o golpe inteiro. Potências, limiares, custos
efetivos, recargas, vida e recursos da transição continuam os existentes.
Os capítulos possuem os parâmetros; BossPhases valida e aplica overrides
locais usando capacidades do motor, sem alterar combate livre/PvP ou saves.

Preparação, descrição da técnica e Registro explicam os efeitos e respostas;
o HUD identifica a pressão ativa. TDD reproduziu quatro falhas em sete casos
de Exposição, quatro em 13 de passagem parcial e três em 25 de validação/HUD.
Depois passaram os 25 casos, além de 22 de fases, 171 de capítulos finais,
96 de Colapso e 168 de campos: 482 verificações pertinentes no total.

Quatro campanhas contínuas do zero concluíram 48/48 com progresso adquirido
e reabertura: Veyra/Axion/Astra, Veyra/Rhazen/Cindra, Astra/Elun/Saira e
Riven/Solen/Zaya. Os pares de chefes consumiram 28/34, 25/35, 40/69 e 24/30
ações. São simulações legais automatizadas, sem injetar recompensas, e não
aceite humano ou validação de todos os trios. Build Web local de 95,7 MiB,
checagem JS e inspeção Godot/Wayland/llvmpipe da preparação/HUD passaram.
Revisões de padrões e especificação sem achados de código; documentos donos
atualizados. A regressão integrada/paridade do incremento 48 permanece a
referência anterior; não foi repetida integralmente neste recorte de campanha.
O pacote do corte 46 permanece intacto, sem commit, push ou homologação.

## Quinquagésimo incremento — preservação do corte até 49

Novo pacote local de 09/11 conserva fontes WIP completas até 49 e esta
documentação de corte: seis perfis corporais, prompts, emissão alinhada,
proteção das fases, enquadramento/derrota e padrões distintos de chefes.
Manifesto separa a regressão integrada do incremento 48 das verificações
pertinentes de campanha do 49 e mantém aceite humano falso. SHA-256 externo,
CRC e hashes individuais são conferidos. Os três ZIPs anteriores e as bases
Git são preservados. Não é release; recuperação no checkpoint dono.

## Quinquagésimo primeiro incremento — aura de marcha no Atalaia

A fase 20 da Crônica envia o Arauto, que acelera aliados comuns próximos em
20% dentro de raio 120. O bônus não acumula nem alcança Arautos/chefes.
Lentidão e raízes continuam eficazes; morte da fonte encerra o efeito no
próximo passo. Run calcula o pertencimento no início de cada passo, evitando
dependência da ordem dos inimigos. O save não ganha buffs/temporizadores:
a retomada recalcula a aura. Clássica, recursos originais e saves permanecem.

Anel violeta e insígnia distinguem o inimigo, reutilizando a arte original;
a preparação explica alcance e respostas. A revisão identificou um anel
inicial achatado que não correspondia à distância do combate. O desenho foi
corrigido para o círculo real e inspecionado no Godot/llvmpipe. A fixture
nativa pausa três inimigos em posições de revisão. O descarte de áudio foi
aguardado antes de encerrar a fixture; execução final sem avisos de recursos.

TDD reproduziu a ausência do inimigo e depois três falhas em oito casos de
movimento/controle. Passaram 16 verificações finais: alcance, fontes mortas,
acúmulo, exclusões, lentidão/raízes, retomada, reordenação, save inválido e
interface. Um comparador estrito de floats na fixture foi corrigido para a
representação JSON persistida; não foi classificado como falha de produção.
O build passou com 194 verificações de save, 32 de armazenamento, 25 de
progressão, 16 de recuperação, 31 de teclado, 15 de conquistas, 285 da Crônica,
8.422 de ofertas e 16 de sabotagem, além dos 16 casos novos e runtime UI.
Clássica venceu 15 ondas com 22 de integridade/419 abates; Crônica, 30/22/718.

A matriz de três políticas/três sementes/quatro condições de árvore venceu
36/36 campanhas de 30 ondas. Adaptativa: integridade 19–30, ouro 2.915–3.425;
recursos: 4–12, ouro 4.044–4.304; renovação: 19–30, ouro 2.067–2.340.
São simulações de combate, sem aceite humano ou cobertura de todas as builds.
Passaram 1.481 testes core, typecheck, format, Godot/Next e um fluxo Chrome
com jogo real, save, CSV e chamada preservada. Padrões sem achados; o achado
visual da especificação foi corrigido. Audiovisual final, variedade ampla
e homologação continuam abertos. O ZIP do corte 49 permanece intacto.

## Quinquagésimo segundo incremento — urna destrutível em Cinzas

O espelho sem céu recebeu a Urna do Degelo numa plataforma opcional existente.
Ela tem 40 de resistência e concede uma renovação, até 12% da vida máxima
e 40 pontos uma única vez. Básicos/especiais das quatro armas a atingem;
projéteis inimigos não. A urna não bloqueia o caminho principal nem conta
como abate. Não consome RNG da geração do cenário ou das cartas. O desenho
por código, fragmentos, partículas, rótulo e mensagem reutilizam a apresentação
existente, sem substituir artes ou adicionar dependências.

`brokenObjects` é opcional no checkpoint versão 1. Saves antigos continuam
válidos. Marco de entrada reverte a urna e os recursos junto com a exploração;
marco de área limpa conserva consumo/recompensas, inclusive ao quebrá-la depois
da limpeza. IDs desconhecidos, duplicados ou de Horda são rejeitados no probe
antes de substituir o estado. A Horda conserva seus layouts.

TDD reproduziu ausência da urna, falta de dano por básico/especial e retorno
indevido do objeto consumido. Passaram 22 verificações de exploração, com
sete casos novos, quatro armas, pulo duplo em três sementes e compatibilidade/
rejeição atômica. Passaram 1.481 core, typecheck, format, build e oito testes
Web. O agente inspecionou intacta/quebrada, aviso e save recarregado no Chrome
em 1600/1280. Fixture de área limpa/posição próxima; som mutado. O chime foi
integrado sem alegar escuta ou aceite humano. Revisões de padrões e
especificação sem achados. Isso inicia os destrutíveis de exploração; eventos,
segredos e refinamento amplo do combate continuam pendentes.

## Quinquagésimo terceiro incremento — ataque curto entre quadros

Cinzas registrava o pressionamento de ataque, mas montava a entrada do
quadro só com o botão ainda sustentado. Um toque completo antes do quadro
seguinte podia desaparecer. A entrada inicial agora considera o pressionamento
registrado; os demais subpassos recebem apenas o estado sustentado. Teclado,
clique do mouse e botão de toque compartilham a correção. Dano, ritmo,
remapeamento, pausa e persistência conservam os donos e regras existentes.

TDD reproduziu o toque perdido no fluxo DOM real com dublês de canvas.
Passou a regressão dirigida: soltura antes do quadro, consumo único em quadro
lento, clique/toque e descarte em pausa/perda de foco. A fixture de rapidez
20 é artificial para revelar repetição entre subpassos; não é build de jogador
ou teste de desempenho. Passaram 1.482 core, typecheck, format, build e oito
Web. Chrome inspecionado em 1600/1280 confirmou toques curtos, quebra da urna,
recompensa única e retomada. Som mutado, sem aceite humano. Revisões de
padrões e especificação sem achados; nenhum Git mutável ou publicação.

## Quinquagésimo quarto incremento — preservação do corte até 53

Novo checkpoint local conserva fontes WIP completas até 53 e a documentação
deste corte. Inclui Arauto, urna e correção de ataque curto, além dos seis
perfis corporais e padrões de chefes Nexus. Manifesto distingue regressões
atuais de cada jogo, testes/simulações e ausência de aceite humano. SHA-256,
CRC e hashes individuais são verificados. Os quatro ZIPs anteriores e as
bases Git permanecem preservados. Não é release ou autorização de commit/push.

## Quinquagésimo quinto incremento — lâmina e órbitas de Axion e Astra

Axion e Astra receberam oito desenhos corporais cada, usando suas artes
individuais originais como referência. As edições selecionadas corrigem
margens da espada, capa e esferas. Prompts integrais, correções, bytes e
hashes estão no manifesto Nexus. Elmo fechado, traje e armas/esferas foram
preservados, assim como repousos, kits, trios e saves. Não houve alteração
no motor, Fighter ou diretor nesta fatia de dados/arte.

Lâmina de Pulso percorre a sequência desenhada de Axion; Campo de Contenção
e Protocolo Zero conservam proteção. Astra reúne e libera suas esferas nos
três ataques. Guarda e derrota têm desenhos próprios; emissão e espelhamento
usam a interface existente. TDD reproduziu duas falhas em 70 casos antes da
integração; os 70 passaram depois. A expansão final passou com 92 verificações
de coreografia e 110 de derrota, incluindo resultado do motor, suporte,
espelhamento, pulo, morte real, restauração e movimento reduzido.

Export Web local de 97,8 MiB, checagem JS e diff passaram. O agente inspecionou
as fases no Godot/Wayland com Mesa/llvmpipe e as galerias Chrome em 1600×900
e 1280×720. Conferência local do diff, manifesto e margens de alfa sem
problemas encontrados. As duas revisões independentes retornaram limite
de uso e não concluíram; ficam pendentes nesta fatia. Não se repetiu a
regressão integrada/paridade do 48 nem as campanhas do 49. Sem aceite humano
ou homologação; o ZIP do corte 53 permanece intacto.

## Quinquagésimo sexto incremento — corte e cura de Elun e Saira

Elun e Saira receberam oito desenhos cada, usando a arte original de
`cutouts-b.png`. Foram selecionadas as primeiras folhas, sem edição corretiva.
Prompts completos, bytes e hashes estão no manifesto. Elun conserva cabelo,
traje e espada; Saira conserva cabelo, vestido e cajado. Repousos, kits, trios
e saves permanecem. Esta entrega modifica arte/metadados, sem nova lógica
no motor, Fighter ou diretor.

Corte Prismático e Paradoxo usam a sequência de Elun; Trama Impossível usa
proteção. Saira lança o básico e conserva cura nas duas habilidades. Ambos
têm guarda e derrota ajoelhada; âncoras de emissão/espelhamento reutilizam
a interface existente. TDD reproduziu duas falhas em 94 verificações antes
da integração. A expansão final passou com 116 casos de coreografia e 110
de derrota, incluindo kit, resultado do motor, cancelamento e estado reduzido.

Build Web local de 99,9 MiB, checagem JS e diff passaram. Godot/Wayland com
Mesa/llvmpipe e galerias Chrome em 1600×900/1280×720 foram inspecionados pelo
agente. Conferência local de fontes, dados, hashes e margens realizada; a
revisão independente permanece pendente pela indisponibilidade de uso já
registrada no 55. Não houve aceite humano, repetição integral da paridade
do 48 ou homologação. Há dez perfis corporais expandidos; os 14 restantes
e o acabamento dos supremos continuam abertos. O pacote do corte 53 permanece.

## Quinquagésimo sétimo incremento — cancelamento do elenco e corte até 56

Ensaio limitado do Nexus alternou dez perfis corporais em 100 batalhas,
forçando o ator para iniciar um ataque e cancelando na preparação ao voltar
ao menu. Foram 64,71 s com dez amostras após o aquecimento: 617 nós e 3.475
objetos constantes, memória estática de 229,11–229,94 MiB e nenhum efeito ou
callback tardio atravessando o retorno. São fixtures headless descartáveis,
sem prova de FPS em GPU, captura física ou estabilidade por horas.

Novo checkpoint local conserva fontes WIP completas até 56 e esta documentação
de corte, com as dez folhas corporais, prompts, dados e regressões. Manifesto
registra as revisões independentes pendentes de 55/56, sem convertê-las em
aprovação. Hash externo, CRC e hashes individuais são conferidos; cinco
pacotes anteriores e bases Git preservados. Não é release ou homologação.

## Quinquagésimo oitavo incremento — lâminas, natureza, eclipse e aurora

Veyra, Sylva, Vesper e Auren receberam oito desenhos corporais cada, com as
artes individuais originais como referência. Identidades, repousos, kits,
trios livres e saves permanecem. A seleção corrige a margem da foice de
Vesper e o halo branco observado em Sylva no Godot. A folha rejeitada de
Sylva foi preservada em evidências; a fonte selecionada é a versão 2.
Prompts completos, correções, bytes e hashes constam no manifesto Nexus.
Não houve nova lógica de motor, Fighter ou diretor.

Veyra usa suas duas lâminas nos três ataques; Sylva mantém curas, Vesper
mantém proteção e Auren mantém escudo/purificação nas técnicas de suporte.
Todos têm preparação, lançamento, contato, recuperação, guarda e derrota
próprios. TDD reproduziu quatro falhas em 120 casos antes da integração.
Passaram 164 verificações de coreografia. Depois da correção de transparência,
passaram novamente os 36 casos selecionados de Sylva (incluindo a base
Rhazen/Cindra) e 110 de derrota do elenco. A seleção opcional da suíte permite
repetir um personagem sem retirar a execução completa padrão; IDs inválidos
são rejeitados. Conferência local de dados, hashes, testes e diff realizada.

Export Web final de 104,4 MiB, checagem JS e diff passaram. O agente inspecionou
as fases nativas em Godot/Wayland com Mesa/llvmpipe e as galerias Chrome dos
quatro em 1600×900/1280×720. São fixtures, com áudio Dummy, sem aceite humano
ou avaliação de GPU física. A revisão independente permanece pendente pelo
limite já registrado. Há 14 perfis expandidos; dez e o acabamento dos supremos
continuam abertos. O pacote do corte 56 permanece intacto e não inclui esta fatia.

## Quinquagésimo nono incremento — punhos, seiva e fendas dos retornados

Torv, Brin, Bast e Ivo receberam oito desenhos próprios cada, tomando a
folha preservada `returned-five.png` como referência. As seleções corrigem
margens de punhos/cajado/lâminas e removem a névoa da primeira candidata de
Torv. Prompts integrais, correções, hashes e bytes constam no manifesto.
Repousos, identidades, kits, trios livres e saves permanecem.

Punhos de magma e hidráulicos têm antecipação e seguimento corporal; Brin
lança seiva e mantém suas duas curas na postura de suporte; Ivo prepara e
executa cortes para seus três ataques. Bast conserva as duas proteções.
Guarda, recuperação e derrota ajoelhada são próprias. Quatro verificações
falharam antes da integração; passaram 72 casos dirigidos (quatro perfis mais
base Rhazen/Cindra), 110 de derrota, checagens JS e diff. O padrão da suíte
continua cobrindo todos; seu prazo passou a 600 s para acomodar o elenco,
sem mudar os limites das demais suítes.

Build Web local de 107,3 MiB e inspeção nativa Godot/Wayland com Mesa/llvmpipe
concluídos; galerias Chrome em 1600×900/1280×720 conferidas pelo agente.
São fixtures com áudio Dummy, sem aceite humano ou medição de GPU física.
Há 18 perfis corporais expandidos; seis e o acabamento dos supremos continuam
abertos. Revisões independentes Standards/Spec das fatias 55/56/58/59 concluídas,
ambas sem achados acionáveis. Conferiram fontes, manifestos, metadados,
folhas/capturas selecionadas e logs, sem reexecutar Godot ou homologar arte.
Isso encerra as pendências de revisão registradas nas fatias anteriores.
O pacote do corte 56 permanece intacto, sem as fatias 58/59.

## Sexagésimo incremento — garras, pacto e adagas do eclipse

Noct, Maura e Riven receberam oito desenhos próprios cada. Noct usa
`returned-five.png`; Maura/Riven usam `cutouts-c.png` como referência. As
seleções corrigem halos das primeiras candidatas, conservadas no diretório
de geração. Prompts, correções, bytes e hashes ficam no manifesto.
Repousos, máscaras/coroas, armas, kits, trios livres e saves preservados.

Garras e adagas percorrem antecipação, lançamento, contato e recuperação.
Maura mantém Pacto silencioso ofensivo com cura secundária e Réquiem como
suporte; Noct e Riven mantêm seus ataques. Todos têm guarda e derrota próprias.
TDD reproduziu três falhas antes da integração; passaram 60 casos dirigidos
(com base Rhazen/Cindra), 110 de derrota, checagens JS e diff. Build Web de
109,5 MiB e inspeção nativa Godot/llvmpipe concluídos. No Chrome, os três
foram conferidos em 1600×900/1280×720 pelo agente.
Revisões independentes Standards/Spec de 60/61 concluídas sem achados,
incluindo documentos; não reexecutaram as suítes. Há 21 perfis expandidos; três e o
acabamento dos supremos continuam abertos. Sem aceite humano ou homologação.
O corte 56 permanece intacto, sem esta fatia.

## Sexagésimo primeiro incremento — cajado, palma e arco Lumi

Elyra, Solen e Zaya receberam oito desenhos próprios cada, usando
`lumi-three.png` como referência. A seleção remove fundos/auras e corrige
margens do cajado, vestido e arco; Elyra precisou de três correções sucessivas,
registradas integralmente no manifesto. Hashes, bytes e fontes estão juntos
aos prompts. As candidatas permanecem no diretório de geração. Nada remove
repousos, identidade, lore, kits, trios livres ou saves.

Elyra lança seu raio e mantém curas/barreiras em suporte; Solen prepara a
palma luminosa em seus ataques; Zaya tensiona/dispara o arco e mantém cura/
energia em suporte. Todos têm recuperação, defesa e derrota próprias. TDD
reproduziu três falhas antes da integração. Checagens JS/diff, 55 testes JS,
import e build Web de 111,9 MiB passaram. O agente conferiu fases/derrota
no Godot/Wayland com Mesa/llvmpipe e galerias Chrome em 1600×900/1280×720. A suíte
Godot completa e o ensaio de cancelamento dos 24 estão em execução; resultados
serão registrados no incremento seguinte. Revisões independentes Standards/Spec
de 60/61 e sua documentação concluídas, ambas sem achados acionáveis.

Há 24 perfis corporais expandidos, com oito desenhos cada (192 desenhos),
sem nova lógica no motor, Fighter ou diretor. Isso conclui a cobertura corporal
desta etapa, não as animações/supremos finais ou o aceite humano. O pacote do
corte 56 permanece intacto e não contém os incrementos 58–61.

## Sexagésimo segundo incremento — validação do elenco e corte até 61

A cobertura corporal dos 24 passou pela suíte completa de coreografia:
284 verificações sem falhas, incluindo ações, suportes, emissão nos dois
lados, resultado único, pulo, morte real, restauração e movimento reduzido.
Passaram também derrota (110), teclado (25), pulo (18), transições (3),
enquadramento (4) e todas as demais suítes específicas do runner. A etapa
final passou com 1.301 verificações nativas/1.272 de interface; 36 partidas
em paridade JavaScript (2.018 ações) e 282 logs reproduzidos (17.730 ações).
A simulação contínua concluiu 48/48 missões, sem erros. Os 55 testes
JavaScript, checagens JS/diff e export local de 111,9 MiB passaram.

PvP local nativo passou com dois clientes, 305 verificações e 69 ações:
servidor WebSocket e registro persistido concordaram com a partida. Dois
clientes Chrome carregaram o export, criaram sala, confirmaram trios e
executaram ação pelo teclado em 1600×900, sem erros. A galeria dos últimos
seis personagens também foi inspecionada em 1600×900/1280×720. Fixtures e
servidores locais; não houve acesso ao PvP publicado ou captura física.

Ensaio headless com 240 entradas/ataques cancelados/retornos alternou os
24 heróis dez vezes. Concluiu em 155,19 s, com dez amostras de 617 nós e
3.690 objetos constantes; memória estática de 334,64–336,29 MiB. A primeira
execução terminou com sinal 143 após 48 ciclos e não gerou relatório final;
a repetição local autorizada concluiu. É ensaio limitado, sem prova de
sessões por horas, ausência geral de vazamentos ou FPS em GPU física.

Revisões independentes Standards/Spec de 55/56/58/59 e 60/61/documentos
concluíram sem achados acionáveis; não reexecutaram as suítes nem homologaram
arte. O novo ZIP preserva o corte de fontes 61 e documentação 62,
sem sobrescrever pacotes anteriores. Commit/push seguem bloqueados pela
autorização vigente. Supremos finais, metas abertas e aceite humano permanecem.

## Sexagésimo terceiro incremento — condutor destrutível na arena final de Cinzas

Cinzas ganhou o Condutor do Alvorecer em **O sol sob a pedra**, na primeira
plataforma da arena final. Tem 70 de resistência e pode ser quebrado pelos
básicos das quatro armas; não concede cura, renovação, pontuação ou abate.
Introduz um ciclo ambiental de colunas elétricas com cinco segundos entre
avisos e 1,2 s de antecipação. Quebrá-lo cancela apenas as colunas desse ciclo
e impede novas emissões. Os ataques solares, saltos e investidas do guardião
continuam. O mecanismo da Horda foi reutilizado no Core, preservando seu
comportamento e separando a origem das colunas ambientais das outras habilidades.

Rótulo contextual, cristal/estrutura/fraturas e fragmentos mostram o objeto;
o aviso diz **Eclipse contido · ataques do guardião continuam**, sem anunciar
itens inexistentes. O combate continua salvo por marcos: retomar antes da
vitória restaura o condutor intacto junto com o confronto. O campo opcional
`brokenObjects` continua no formato 1, com IDs conhecidos e validação atômica;
saves antigos permanecem válidos. Urna, Sino, terrenos e sete layouts da Horda
foram preservados.

TDD reproduziu ausência do objeto, falha de cancelamento do aviso ambiental e
mensagem incorreta. Passaram 27 casos de exploração (cinco novos), incluindo
quatro armas, ataque solar real, alcance em três sementes, retomada e rejeição
de IDs inválidos, mais o fluxo DOM de teclado/aviso. Passaram 1.483 core,
typecheck, format check, build e oito regressões Web. O agente inspecionou
Chrome em 1600/1280 com fixture de posição próxima, inimigos removidos e
invulnerabilidade; áudio mutado, sem aceite auditivo ou humano.

A amostra existente de variantes/chefes foi repetida: 66/120 vitórias; o
confronto final teve 12/24, mantendo os demais chefes em 8/18/5/23 vitórias.
Uma contraprova com condutor inicialmente quebrado teve 11/24; não inclui custo
de acesso/ataques e não estabelece vantagem ou equilíbrio geral. Essas políticas
usam a presença de colunas para decidir saltos, limitando a comparação com jogo
humano. Matrizes amplas e playtests continuam pendentes. Revisões independentes Standards/Spec concluídas sem achados; ambas repetiram
os 27 casos e o fluxo DOM do condutor. O ZIP do corte 61/documentação 62 permanece intacto, sem esta fatia.

## Sexagésimo quarto incremento — corte preservado até 63

Novo pacote local conserva os dois projetos completos/WIP até 63 e documentação
64, incluindo 24 perfis corporais Nexus e o condutor de Cinzas. Manifesto registra
fontes novas, bases exatas, branches, hashes e evidências: Cinzas 1.483 core/27
exploração/oito Web, Nexus integrada do 62 e revisões independentes concluídas.
Distingue matrizes, fixtures, inspeção e ensaio limitado; não concede aceite
humano. CRC e cada hash são verificados, com SHA-256 externo. Sete ZIPs
anteriores permanecem intactos. Não é release, deploy ou autorização Git.

## Sexagésimo quinto incremento — lições avançadas e lista acessível no Nexus

O Nexus ampliou **Aprender** de três para cinco batalhas guiadas. As três
originais permanecem; as novas ensinam purificação/Égide com Auren/Elyra/Vektor
e transmissão de aflições/interceptação com Ivo/Maura/Bast. Condições iniciais
são próprias do treino, visíveis no combate. Os objetivos são reconhecidos
pelos recibos reais: remoções efetivas, aplicação de Égide, status transmitido
e proteção escolhida. Proteger um aliado saudável não finge purificação;
atacar sem aflição não finge transmissão. Três sementes de cada lição
concluíram objetivos em seis ações, na ordem natural, com energia/recargas
normais e IA existente. São seis simulações, sem vitória ou aceite humano.

A lista passou a usar rolagem, quebra de texto e acompanhamento do foco;
a quinta opção foi verificada em 1280×720/1600×900. Durante o PvP, as escolhas
ficam desabilitadas com explicação, preservando a sessão. Os marcadores sem
glifos no Web foram trocados por **Pendente/Feito**, e a descrição de Bast
explica proteção de um aliado. Ao sair, voltam trios livres, modo e dificuldade.
Treinos não alteram o perfil da campanha nem entram nos registros livres;
a vitória desse teste usa inimigos com vida baixa, separada da simulação legal.
Não houve mudança de kit, motor, equipamento ou formato de save.

TDD reproduziu ausência das lições, falta de reconhecimento das ações e
escolhas oferecidas indisponíveis no PvP. Passaram 33 casos dirigidos finais;
a execução integrada havia rodado a versão anterior com 27, antes de acrescentar
os seis casos de ordem natural. Uma
checagem de foco inicialmente consultava o viewport pai e foi corrigida após
medição mostrar o foco correto no diálogo. A integrada passou em todas as
suítes, incluindo 284 de coreografia, 110 de derrota, campanha 48/48 e 1.301
verificações nativas/1.272 UI, 36 partidas em paridade (2.018 ações) e 282 logs
reproduzidos (17.730 ações). Checagens JS/diff e export local de 111,9 MiB passaram.
O agente inspecionou os fluxos no Godot/Wayland com Mesa/llvmpipe e entradas
Web em duas resoluções. A quinta lição chegou a 2/2 objetivos pelo teclado,
com ordem/energia normais e Reduzir animações escolhido pela interface.
Revisões Standards/Spec concluídas sem achados, com leitura de fontes, docs
e evidências; não reexecutaram as suítes. Fixtures nativas forçam ator/energia
e movimento reduzido;
áudio Dummy/mutado, sem aceite humano ou prova de GPU física. O corte 63
permanece intacto e não inclui esta fatia; acessibilidade ampla continua aberta.

## Sexagésimo sexto incremento — corte preservado até 65

Novo pacote local conserva fontes completas/WIP até 65 e documentação 66,
incluindo cinco lições Nexus e o condutor de Cinzas, sem substituir os oito
ZIPs anteriores. Manifesto distingue 33 casos dirigidos finais da versão 27
executada inicialmente na integrada, além das seis simulações legais e da
conclusão Web 2/2 com movimento reduzido. Revisões independentes concluídas,
CRC e todos os hashes conferidos, SHA-256 externo e bases Git preservadas.
Limites de fixtures/inspeção e ausência de aceite humano seguem explícitos.
Não é release, homologação ou autorização de commit/push.

## Sexagésimo sétimo incremento — pulso anunciado da Coroa do Bastião

O chefe final da Crônica do Atalaia ganhou uma pressão própria na segunda
fase: pulso a cada sete segundos, aviso de um segundo, alcance real 144 e
interrupção de novos disparos por 0,8 s. A transição anterior foi preservada.
O círculo/contador continuam no perfil reduzido; preparação explica a
necessidade de distribuir a defesa e o HUD substitui o aviso pela resolução.
Derrubar o chefe durante o aviso cancela o efeito; torretas fora do alcance
escapam. Durações não acumulam nem encurtam sabotagens maiores. Queimaduras,
poças e projéteis existentes continuam. Clássica, outros chefes e
Sobrevivência conservam o comportamento anterior; repetição/desafio da fase
30 recebem a mesma mecânica.

Run possui regra/relógio e Board apenas apresenta o snapshot. O save v1
aceita um timestamp opcional validado no chefe final; saves antigos recebem
um período seguro. TDD reproduziu falta de aviso, interrupção, retomada e
substituição do texto. A fixture inicial posicionava o chefe em rota distinta
da escolhida pelo surgimento; foi corrigida e o red de aplicação repetido
com geometria válida. Comparações de retomada usam tolerância numérica para
os valores serializados, em vez de exigir igualdade de tipos int/float.
A revisão Spec encontrou entrada parcial no aviso com menos de um segundo;
três regressões reproduziram o caso, e a janela foi corrigida também nesse
caminho. A tolerância de fronteira impede reanunciar o mesmo ciclo por erro
de ponto flutuante; o timestamp permanece não negativo.

Passaram 38 verificações específicas, 194 de schema, 32 de armazenamento,
16 de perfil, controles/conquistas/árvores, 285 da Crônica, 8.422 de ofertas,
16 de sabotagem e 16 de Arauto, além das campanhas de 15 e 30 ondas e UI
nativa. Tipos, formato, Next, 1.483 core e fluxo Chrome passaram; core foi
repetido com sockets locais autorizados após EPERM no sandbox padrão.
A matriz final venceu 36/36: adaptativa 19–24, recursos 4–12 e renovação
19–30 de integridade. Três campanhas legais adicionais instrumentadas
mostram duas vitórias antes do aviso e uma após um pulso; não provam
equilíbrio abrangente. Godot/Wayland/llvmpipe e Chrome em duas resoluções
foram inspecionados com fixture de chefe congelado/recargas altas e save
isolado. Áudio Dummy/mutado, sem aceite humano ou prova de GPU física.
Rechecagens independentes Standards e Spec concluídas sem achados restantes;
ambas reexecutaram os 38 casos e Spec repetiu a reprodução parcial corrigida.
O corte 65 permanece intacto e não contém esta fatia.

## Sexagésimo oitavo incremento — continuidade por teclado na Coleção Nexus

Oficina e Evolução agora preservam foco lógico, seleção e posição de leitura
ao atualizar os valores após melhorar, especializar, trocar peças e aplicar
habilidades. Uma ação que passa a ficar desabilitada devolve o foco ao
seletor da mesma peça/habilidade; o treinamento conserva a aba. A troca
mantém o herói destinatário, impedindo que uma segunda confirmação atinja
a primeira opção da lista. Falha de gravação conserva prévia solicitada,
botão de nova tentativa, rollback e arquivo saudável; liberar o caminho
permite aplicar a escolha preservada. Selecionar herói na grade, Oficina,
Evolução e Gemas conserva o novo controle focado e os trios.

Hub continua dono da apresentação e Campaign das transações, atributos e
saves. A restauração aguarda o layout, mantém a leitura quando o controle
está visível e respeita uma navegação ou foco mais recente. TDD reproduziu
perda de foco, troca do destinatário, descarte de prévia no erro e perda
após treinar/selecionar herói. A inspeção de geometria localizou rolagem
indevida ao focar antes de os containers atualizarem suas posições; o
cálculo da posição restaurada considera esse deslocamento pendente.
Passaram 30 casos dirigidos com Enter real, 55 testes JS, checagens e export
local de 111,9 MiB. A integrada passou: 284 coreografia, 110 derrota, 33 de
lições, campanha contínua 48/48, 1.301 nativos/1.272 UI, 36 partidas/2.018
ações em paridade e 282 logs/17.730 ações reproduzidas. Godot nativo
Wayland/llvmpipe e Chrome em 1600×900/1280×720 foram inspecionados. No Chrome,
melhorias sucessivas, especialização e Ritmo foram aplicados por comandos
reais; o primeiro roteiro de treinamento não aplicou a variante e suas
capturas foram preservadas como tentativa incompleta, sem contá-la como
conclusão. O roteiro corrigido usa Tab/Enter e mostra seleção e confirmação.
Revisões Standards/Spec não encontraram problemas de código. Uma precisão
documental sobre fallback foi corrigida: o seletor recebe foco quando o
botão fica desabilitado, enquanto ações repetíveis mantêm o botão.

Fixtures usam vitórias antigas e maestria predefinidas apenas para acessar
controles, sem representar campanha conquistada ou aceite humano. Não houve
mudança de kit, arte, regras livres/PvP ou formato de save. A documentação
corrige referências desatualizadas a vínculos futuros e export Web ainda
não disponível; publicação e homologação continuam pendentes. O corte 65
permanece intacto e não contém os incrementos 67/68.

## Sexagésimo nono incremento — corte preservado até 68

Novo pacote local conserva os dois projetos completos/WIP até 68, documentação
69, pulso da Coroa e continuidade de teclado da Coleção. Inclui seus testes,
metadados, evidências selecionadas e revisões independentes sem achados
restantes. Registra as reproduções corrigidas e distingue a primeira tentativa
Web incompleta da aplicação confirmada. A integrada Nexus inclui 30 casos de
Coleção e 33 de lições; a matriz Atalaia conserva as 36 vitórias e a amostra
instrumentada com um pulso realmente enfrentado. Nove ZIPs anteriores têm
seus hashes novamente conferidos e permanecem intactos. CRC e hashes de
todas as entradas são verificados, com SHA-256 externo e bases Git exatas.
Não inclui saves reais, dependências ou exports reconstruíveis. O ensaio
Nexus de 30 minutos iniciou após 68 e ainda não é evidência concluída deste
corte. Sem homologação, publicação ou autorização de commit/push.

## Septuagésimo incremento — derrota terminal coerente em Cinzas

A auditoria reproduziu resolução após o fim da tentativa: contato fatal era
seguido por uma flecha que concedia abate, 40 pontos e cura ao jogador já
derrotado. O mesmo padrão ocorria com projétil inimigo, campo hostil, lava e
queda durante a preparação de um golpe. Engine.update agora interrompe o
restante do combate nos pontos de dano fatal. Vida e contadores terminais
permanecem coerentes; acertos anteriores ao dano letal conservam seu crédito
e dano não fatal continua permitindo o golpe seguinte e a cura normal.
Não houve mudança de arte, mapa, parâmetros de kit ou formato de save.

TDD reproduziu cada fonte antes de corrigir. O primeiro ensaio usava cura
artificial de 10; as cinco reproduções foram repetidas no código anterior
com um único nível legal de Pacto vital, todas produzindo 1 de vida após a
derrota. Passaram 28 verificações de gameplay, com sete casos novos; o fluxo
DOM/canvas dublê executou o frame de game.js e confirmou tela final, recorde
Horda sem abates/pontos posteriores e ausência de checkpoint morto. Esse
fluxo também falhou com o código anterior e cura legal. Tipos, formato,
build, 1.484 core e oito regressões Chrome passaram. A matriz de variantes
manteve 66/120 vitórias, com 8/18/5/23/12 por guardião e vida zero em todas
as derrotas; são políticas simples com builds predefinidas, sem playtest.

Chrome em 1600/1280 confirmou resultado terminal, recorde e recarga sem
Continuação. Screenshots foram inspecionados; a fixture usa 1 de vida,
contato e projétil pendente, áudio mutado e renderização por software.
As revisões Standards/Spec de código passaram, reexecutando os 27 casos
então existentes e o fluxo DOM; uma regressão adicional preserva o crédito
anterior ao dano letal, elevando a 28 antes do fechamento. A rechecagem
final passou sem achados restantes, com os 28 casos reexecutados por ambos
e documentos donos conferidos. Sem aceite humano ou
alteração Git; o corte 68 permanece intacto e não inclui esta fatia.

## Septuagésimo primeiro incremento — ensaios prolongados e diagnóstico de memória

Atalaia concluiu 195 campanhas clássicas/Crônica simuladas em 901,928 s,
com 195 vitórias, 11.971 gravações/retomadas por SaveStore e 4.359.150 passos.
São políticas legais sem árvores, alternando modos/sementes/cartas; não é
renderização ou playtest. As 15 amostras entre campanhas registraram um nó,
1.466 objetos e 21,8559–21,8694 MiB de memória estática.
Cinzas executou 43 sessões/reinícios no Chrome em 913,749 s, com cerca de
20 s de comandos reais por sessão, sem atributos forçados e sem erros JS.
Nas oito amostras após coleta, DOM de 1.671 nós, 208–211 listeners e heap
3,1774–3,5185 MiB. O fluxo registra ondas/abates naturais; não é uma única
campanha de 15 minutos. RAF 8,97–12,19 callbacks/s no SwiftShader, com
verificações concorrentes, não mede a meta de 60 FPS no hardware físico.

O primeiro Nexus completou 1.320 ciclos em 1.800,643 s: 440 cancelamentos,
880 caminhos concluídos/pulados, 440 pulos e 55 reaberturas de save. Usa ator
forçado/100 EN, quatro ações e navegação entre telas, sem aceite humano.
A memória estática registrada cresceu em degraus de 343,94 para 373,46 MiB;
não comprova ausência de vazamentos. Ao encerrar, houve aviso de ObjectDB e
um recurso ainda em uso. A reprodução mínima foi um supremo de Zaya pulado.
Aguardar após liberar Main manteve o aviso; aguardar antes de liberar o
dono eliminou-o. A primeira comparação pretendida antes da liberação não
alterou essa ordem no roteiro e foi descartada como diagnóstico inválido.
Nenhuma fonte do jogo foi alterada para esse aviso.

O roteiro corrigido acompanha o retorno do comando de turno, valida
cancelamento sem commit e conclusão/pulo com um commit e só libera Main
após as ações retornarem. A reprodução confirmou uma ação pendente antes,
zero ao liberar o dono e 0,413 s de espera, saída 0 sem avisos. A repetição
completa terminou em 1.801,028 s, com saída 0 sem erros/avisos de recursos:
1.325 ciclos, 442 cancelamentos, 883 conclusões, 441 pulos e 55 reaberturas.
Nos 30 registros, 615–628 nós, 3.847–3.895 objetos e memória estática de
343,9530 para 373,5109 MiB. Até duas apresentações antigas aguardaram retorno
simultaneamente; zero estava pendente ao liberar Main. O ensaio anterior e
seus avisos permanecem preservados. A verificação funcional prolongada passou;
memória, renderização física e aceite humano continuam pendentes.

A primeira política de campanha nova de Cinzas perdeu nos 12 cenários,
alcançando capítulos 1–11 conforme arma/semente, sem erros de simulação.
A política usa somente entradas, ofertas reais e atributos conquistados;
valida o checkpoint sem substituir a partida. Isso não prova impossibilidade
nem autoriza rebalancear por dificuldade do bot. Limites de tática e
posicionamento estão sendo investigados antes de mudanças no produto.

Quatro variantes adicionais da mesma matriz mantiveram 0/12 vitórias cada:
direção da esquiva mantida (capítulos 2–11), maior distância corpo a corpo
(2–11), esquiva nos últimos 0,03 s do preparo (1–12) e regeneração legal após
limpar o capítulo (2–13). A instrumentação reproduziu exatamente a política
inicial e encontrou 27–89 inversões durante esquivas por caso; manter a direção
eliminou todas. O ganho de alcance de campanha pertence à política, sem mudar
armas, inimigos, dano ou atributos do jogo. São 60 cenários de cinco políticas,
mais a repetição instrumentada; nenhuma vitória zero→fim foi demonstrada.

A memória do Nexus foi investigada separadamente: mil ciclos acelerados com
movimento reduzido continuaram crescendo sem reabrir saves; retirar as telas
extras da Coleção reduziu o crescimento, sem eliminá-lo. Mil reconstruções
somente da Coleção também cresceram. Uma reprodução sem carregar o jogo,
criando/liberando 100 Controls por ciclo, reproduziu os degraus em headless.
Wayland/llvmpipe permaneceu em 27,408–27,416 MiB; a leitura inicial do valor
absoluto foi corrigida ao comparar todas as amostras. Nodes, Node2D e Controls
fora da árvore também permaneceram quase constantes. O Massif confirmou
alocações crescentes em headless, mas o binário oficial
sem símbolos não identifica seus métodos; não é evidência independente do
nome da alocação.
Reutilizar os mesmos 100 Controls por mil ciclos manteve 21,219–21,227 MiB,
sem os degraus, com contagem constante e saída 0 limpa. Os sete controles
comparáveis concluíram com saída 0 e sem erros/avisos de recursos; a síntese
está em `engine-accessibility-memory-diagnosis.json` no Nexus.

O comportamento corresponde ao defeito upstream
[Godot #124439](https://github.com/godotengine/godot/issues/124439): a fila de
acessibilidade guarda IDs de Controls quando o suporte está indisponível.
O [fonte 4.6.3](https://github.com/godotengine/godot/blob/4.6.3-stable/scene/main/node.cpp#L3508)
enfileira a atualização sem verificar esse suporte; a
[correção upstream #124453](https://github.com/godotengine/godot/pull/124453)
acrescenta a condição. Essa identificação combina reprodução local, controles
e fonte primário; não demonstra que todo crescimento do jogo tem uma única
origem. O motor não foi trocado, compilado ou instalado; a meta de memória
continua aberta. A primeira tentativa nativa usou nome de classe inexistente,
foi interrompida e descartada; apenas a execução Control válida é comparável.
As revisões independentes Standards/Spec concluíram sem achados, conferindo
documentos, roteiros, logs/JSON/sidecars e fontes primárias; não repetiram os
ensaios longos. `soak-evidence71-verified.json` distingue a saída 0 recuperada
do Nexus dos processos antigos Atalaia/Cinzas, cujos logs/completude foram
conferidos, mas o exitcode independente não foi recuperado após trocar ambiente.

## Septuagésimo segundo incremento — preservação do corte 71

O pacote local `RENASCIMENTO-CONTINUIDADE-2026-11-09-INCREMENTO-71.zip`
conserva fontes completas/WIP até 71, incluindo a correção terminal de Cinzas
do 70 e os ensaios/diagnóstico do 71, com documentação 72. As revisões 70/71
estão concluídas; tentativas inválidas/avisos anteriores permanecem rotulados
nas evidências. Inclui bases exatas, branches, novos arquivos e exclusões,
com manifesto por arquivo, CRC e SHA-256 externo. Dez ZIPs anteriores tiveram
seus hashes reconferidos e permanecem intactos. Não contém saves reais,
dependências ou exports reconstruíveis. Memória do jogo nativo, audiovisual,
matrizes amplas, hardware e aceite humano seguem abertos; não é homologação
ou release. Commit/push continuam exigindo confirmação explícita.

## Septuagésimo terceiro incremento — ensaio nativo do Nexus

O roteiro misto de 30 minutos foi repetido no Godot nativo Wayland/llvmpipe,
com diretórios temporários, áudio Dummy desativado e os mesmos comandos/
verificações funcionais do ensaio headless. Nenhuma fonte do Nexus foi
alterada. Concluiu 1.316 ciclos em 1.802,790 s, com 439 cancelamentos, 877
conclusões (438 puladas), 54 reaberturas e zero ações pendentes ao liberar
Main. Completude, saída 0 e ausência de erros/avisos de recursos conferidas.
As 30 amostras registraram 617–640 nós, 3.718–3.830 objetos e memória estática
70,0303–71,0801 MiB; primeira/última 70,0303/70,8857. A alternância mantém
as categorias de cancelamento/pulo associadas a heróis como no roteiro 71;
não demonstra cada herói em cada categoria. É fixture de ator/100 EN,
com comandos reais do controlador e verificações concorrentes, sem áudio
ou aceite humano. Memória estática do Godot não representa RSS ou memória
de driver/GPU; não comparar os valores absolutos com headless como economia
total de RAM. O ensaio não fecha hardware, FPS físico ou homologação.

## Septuagésimo quarto incremento — escolta do Guardião da escória

Na fase 24 da Crônica/repetição/desafio, o Guardião chama uma vez um golem e
um cogumelo ao cruzar 50% de vida sem morrer. Entram atrás dele na mesma rota;
a aura de raio 105 reduz em 25% os impactos sem perfuração contra aliados.
Não protege a própria fonte ou Vigias nem acumula com a proteção existente.
Queimaduras, veneno e perfuração atravessam; as escoltas continuam quando
o chefe cai. O avanço de 13% e a interrupção inicial permanecem. Clássica,
Sobrevivência e outros chefes conservam suas regras. Sem campo novo de save:
o recibo `enraged` existente evita nova convocação, e saves antigos já na
segunda fase não ganham escoltas ao carregar ou no próximo acerto.

Run possui convocação/proteção; Board/Enemy apresentam o mesmo alcance,
inclusive com efeitos reduzidos. Preparação/anúncio comunicam limiar e
contrajogos. A iteração de movimento e cada ataque em área capturam seus
participantes: explosão, jato e cadeia não atingem retroativamente quem
nasceu daquela resolução. Passaram 35 casos dirigidos; build completo do
Atalaia, clássica 15/22/419 abates e Crônica 30/22/720. Tipos, formato,
Next, 1.484 core e o fluxo Chrome final passaram.

A matriz final venceu 36/36, com 1–30 de integridade. Nas três repetições
instrumentadas de recursos/sementes 78/1847/90210, houve 51/64/27 impactos
protegidos somente pelo chefe. Resultados de campanha coincidiram com os
casos correspondentes sem observador. A primeira versão só com aura registrou
zero impactos protegidos nesses três casos; a convocação completou a função
real do encontro antes da matriz final. Não é aceitação geral de equilíbrio.

As revisões iniciais identificaram o mesmo problema de desenho: zerar o raio
sem invalidar o CanvasItem conservava o círculo durante o fade. A reprodução
nativa observou zero redesenhos após morrer; adicionar `queue_redraw()`
produziu um redesenho enquanto o ator ainda desvanecia, saída 0. Não foi
criado golden visual permanente. Standards/Spec reexaminaram a correção,
reprodução, código, documentos e evidências finais, sem achados restantes;
não repetiram build ou ensaio prolongado.
Inspeções nativa/Web usam fixture pausada com chefe/escolta congelados e
recargas altas, áudio Dummy/mutado e software. A primeira captura Web 1600
não confirmou o quadro da aura; a repetição com 1,5 s de assentamento mostrou
o círculo. O primeiro red ambiental não iniciou Godot por XDG; outro roteiro
usou Arpão indisponível no ato e foi descartado, antes do red válido com
Metal do abismo. Não contam como reprodução de comportamento. Sem aceite
humano ou mudança Git; estas fontes ainda não estão no ZIP 71.

## Septuagésimo quinto incremento — preservação do corte 74

`RENASCIMENTO-CONTINUIDADE-2026-11-09-INCREMENTO-74.zip` conserva fontes/WIP
até 74 e documentação/evidências 75: escolta do Guardião com 35 dirigidos,
build completo, 1.484 core/Chrome e matriz 36/36; ensaio Nexus nativo de
30 minutos/1.316 ciclos/saída 0; correção terminal Cinzas e diagnósticos
anteriores. Revisões 73/74 concluídas sem achados restantes, com a reprodução
e correção do desenho cacheado preservadas. Onze ZIPs anteriores intactos,
com hashes reconferidos. Manifesto por arquivo, CRC e SHA-256 externo;
sem saves reais, dependências ou exports. Continua sendo desenvolvimento,
sem homologação humana, publicação ou autorização de commit/push.

## Septuagésimo sexto incremento — Refluxo das marés

O Executor da comporta conserva limiar de 55%, potência 0,80, custo/recarga
e acrescenta Enfraquecimento ao Refluxo na segunda fase. Usa a redução de
ataque existente de 20% por dois turnos pessoais, removível por purificação.
O Eco pode curar o chefe sem reverter a fase. O efeito fica no ator do
encontro; Oren, kits livres/PvP, IDs, recompensas, trios e save 10 conservados.
Preparação, descrição comum e HUD comunicam a pressão e sua resposta.

TDD: nove falhas corretas no roteiro de 38 casos antes dos dois campos de
conteúdo; depois, 38/38. Inclui recibo/impacto, redução real na prévia, ausência
de mutação, purificação escolhida, cura do chefe e catálogo conservado.
Passaram 55 JS, check, export Web 111,9 MiB e integrada: 1.301 nativos/1.272
UI, 36 partidas/2.018 ações em paridade e 282 logs/17.730 ações reproduzidas.
Veyra/Axion/Astra, Veyra/Rhazen/Cindra, Astra/Elun/Saira e Riven/Solen/Zaya
concluíram 48/48 com progresso adquirido; Executor em 24/17/38/25 ações.
Não demonstra todas as equipes/estratégias ou exposição uniforme à técnica.

A inspeção nativa em duas resoluções mostrou preparação, aplicação real e
purificação. Usa desbloqueios, vida/ator/100 EN forçados, movimento reduzido
e IA suspensa entre capturas; software/áudio Dummy, sem aceite humano.
A primeira navegação Chrome ficou na lista por clicar abaixo do botão após
rolar; logs sem erros JS não a validam. Foi marcada inválida e preservada.
A repetição abriu preparação e arena por controles reais, com perfil de
fixture e automático normal. Em 1600×900 e 1280×720, confirmou preparação,
arena, fase 2 e vitória em 17 rodadas/76 ações; sem forçar vida/ator no Web.
Os ícones isolados não distinguem a origem do status: já há Enfraquecimento
em outros kits. Aplicação específica e purificação foram conferidas no
modelo e na fixture nativa. Chrome/SwiftShader mudo e movimento reduzido
não constituem aceite audiovisual humano. Standards/Spec terminaram sem
achados; Standards reexecutou os 38 padrões, saída 0.
Essas fontes posteriores ainda não integram o corte 74 e permanecem no checkout.

## Septuagésimo sétimo incremento — táticas legais no relé

Vinte e cinco campanhas descartáveis, sem mudar o produto, compararam foco
na curadora e no protetor do relé. A política atual reproduziu as cinco
derrotas após sete missões. Focar a curadora por duas rodadas permitiu
Kira/Bast/Vektor e Ivo/Vesper/Maura concluírem 48/48 com recursos conquistados,
RNG normal e reabertura após cada vitória; os demais encontros usam IA pública.
Torv/Oren/Sylva, Nima/Axion/Brin e Noct/Auren/Elyra continuaram perdendo por
prazo, inclusive em quinze comparações adicionais. Zero erros de resolução;
saída 1 nesses casos registra derrota. A regra temporária não entrou na IA.

Somam-se seis composições com percurso completo por políticas distintas,
quatro delas pela IA atual. Isso não conclui a matriz ampla nem o balanço
humano; detalhes em BALANCING e evidências relay77. Sem build novo, pois
apenas roteiros descartáveis/documentos foram alterados.

## Septuagésimo oitavo incremento — Queda da fornalha

Rhazen recebeu uma folha adicional de oito desenhos próprios para o supremo,
com preparação baixa, elevação, golpe pesado, contato e recuperação. O básico,
a defesa, a derrota, os demais heróis e os repousos conservam suas artes.
Fighter interpreta folha/escala por quadro e sequência por habilidade, usando
o cache existente; Director/Combat conservados, inclusive um único impacto.

TDD reproduziu a reutilização do básico: 24 casos/uma falha correta. Depois,
26/26 e cinco transições, com espelhamento, arquivo adicional realmente
renderizado, básico posterior, pulo/reinício e derrota prioritária. A candidata
com margem estreita foi preservada; selecionada RGBA 1774×887/1.006.280 bytes,
com oito células e margens verificadas, prompts/correção/hash no manifesto.
Nativo conferiu oito quadros/duas resoluções/ambos os lados e estado final igual
ao motor, usando ator/100 EN forçados, Wayland/llvmpipe e áudio Dummy mudo.
Passaram 55 JS/check e a integrada: 286 coreografias, cinco transições, 110
derrotas, 1.301 nativos/1.272 UI, 36 partidas/2.018 ações em paridade e
282 logs/17.730 ações reproduzidas. Export local: 112,6 MiB. Chrome confirmou
preparação própria, golpe/recibos, recuperação e básico posterior em duas
resoluções, com movimento normal e a fixture existente da galeria. A primeira
seleção por teclas ficou em Veyra: invalidada/preservada, repetida por mouse
e conferida nas imagens. Tempos solicitados das capturas não são tempos
reais de cada quadro; o relatório guarda ambos. Os oito desenhos individuais
foram observados pelo roteiro nativo; não por cada captura Web.

Standards/Spec do delta sem achados. Integridade conferiu os 23 perfis
restantes, oito quadros/fases/tempos básicos de Rhazen e os hashes/bytes das
25 folhas. Sem aceite humano ou conclusão das animações completas/supremos
dos 24. Fontes locais posteriores ao ZIP 74.

## Septuagésimo nono incremento — conferência do seletor por teclado

A tentativa Web78 não revelou um defeito do jogo: o roteiro abriu a lista
pelo mouse, presumiu foco de abertura por teclado e enviou Home/uma seta.
Reprodução mínima Web 4.6.3, sem fontes Nexus, registrou foco −1; Home não
alterou esse estado e a primeira seta focou o item 0. Duas setas/Enter
selecionaram o item 1; Tab/Espaço/uma seta/Enter também passou. O
[código do motor](https://github.com/godotengine/godot/blob/4.6.3-stable/scene/gui/option_button.cpp#L488)
distingue abertura por mouse/teclado. Na galeria real, os dois percursos de
seleção conferiram Rhazen em 1600×900/1280×720, sem erros JS.

O primeiro probe nativo usou push_input sem rotear o evento de janela e não
vale como falha do produto; repetição com Input.parse_input_event passou.
Tentativas e logs originais preservados. Produto/motor inalterados; export78
reutilizado e export diagnóstico mínimo separado em artifacts. Isso não é
aceite humano nem conclusão da acessibilidade ampla.

## Octogésimo incremento — Constelação ardente

Cindra acrescenta oito desenhos próprios de mira elevada, soltura e
recuperação do supremo; básico, suporte, defesa, derrota e repouso conservados.
Usa folha irmã RGBA 1774×887/1.239.834 bytes, com referência/prompt/correção/
hash e aceite humano falso no manifesto. Margens foram corrigidas; alfa
residual baixo continua filtrado pelo shader existente.

TDD: 26 casos/uma falha correta; ampliado para 28/três falhas de sequência,
folha e emissão elevada. Depois, 28/28. Standards/Spec encontraram o mesmo
P2: emissão ainda usava escala básica, deslocando-se do desenho ampliado.
O problema foi reproduzido em sete casos/duas falhas e corrigido em uma linha
do Fighter. Nove casos de transição/geometria passaram, nos dois lados e
com Kira em escala padrão; 62 verificações reais de coreografia nos perfis de
projéteis, com base Rhazen, passaram. 55 JS/check e export local 113,4 MiB.
A integrada ampla do 78 permanece histórica; não é nova execução no 80.

Nativo final mostrou oito quadros/ambos os lados/duas resoluções, com estado
igual ao motor, impacto único e repouso original. Primeira tentativa expirou
sem imagens; a instrumentada encontrou janela sem desenho e perdeu um
quadro. Ambas preservadas/inválidas. A repetição restaurou a visibilidade da
janela de fixture e concluiu quatro casos. Usa ator/100 EN forçados,
Wayland/llvmpipe/áudio Dummy, sem inferência de FPS físico. Chrome conferiu
seleção, preparo, golpe e recibos em duas resoluções. Captura inicial de
retorno ainda tinha queimadura em apresentação; complemento aguardou seis
segundos após cada ação e confirmou repouso/controles habilitados no supremo
e básico posterior. Standards/Spec reexaminaram a correção do P2 e terminaram
sem achados restantes. Sem aceite humano.
WIP após ZIP 74.

## Octogésimo primeiro incremento — corte local até o 80

O pacote `RENASCIMENTO-CONTINUIDADE-2026-11-10-INCREMENTO-80-R2.zip` reúne
2.310 fontes/WIP dos dois checkouts e 1.333 evidências, mais o manifesto.
Inclui 76–80, os dois supremos corporais e o P2 de emissão reproduzido e
corrigido, sem perder as artes básicas. A última integrada ampla é a do
78; os 62 dirigidos/nove de geometria, build 113,4 MiB e inspeções do 80
ficam separados. SHA-256 e conferência acompanham o pacote; a restauração
continua nas bases exatas documentadas. Os 12 anteriores foram rechecados
e preservados. Isso conserva a continuidade; não homologa Renascimento
1.0, não publica nem muda a autorização Git. A R2 corrige a contagem inicial
das lições no manifesto (27; posteriores 33), preservando o ZIP inicial e
as fontes de produto.

## Octogésimo segundo incremento — supremo de Nima e balanceamento de prazo no relé

Avanço em duas frentes de alta prioridade da Operação Renascimento no Project Nexus:

1. **Balanceamento tático sob pressão de prazo no relé (`forge-relay`):**
   A política tática de campanha em `godot/scripts/campaign.gd` foi refinada para encontros com prazo de alvo iminente (`state.round >= goal.rounds - 1`), reduzindo o limiar de emergência de vida aliada para 45% do valor original (`threshold = tactics.endangeredHealthRatio * 0.45`). Com isso, heróis ofensivos priorizam eliminar o alvo da missão no turno decisivo em vez de entrar em loop protetivo/cura infrutífero na penúltima ou última rodada. As três composições de campanha que antes paravam no relé (`Torv/Oren/Sylva`, `Nima/Axion/Brin` e `Noct/Auren/Elyra`) vencem na rodada 5 antes do estouro do prazo, completando a campanha 48/48 com persistência de save e progressão legal. Regras livres/PvP em `src/kits.js`, `src/data.js` e `src/balance.json` permanecem intactas. Verificações: `mission_support_ai.gd` (13 checks, 0 falhas) e `objective_matrix.gd` (624 cenários, 600 vitórias, 0 erros).

2. **Supremo dedicado de Nima (*Mil Espinhos*):**
   Criação e integração da folha dedicada de 8 poses corporais (`godot/assets/poses/nima-supreme-renascimento-v1.png`, 1774x887 RGBA com canal alpha real), metadados registrados em `godot/data/animation-art.json` com escala `0.6006006006006006` e mapeamento em `godot/data/pose-regions.json` com quadros 8..15 (`charge: [8, 9, 10]`, `travel: [11]`, `impact: [12]`, `recover: [13, 14, 15, 0]`). O teste `hero_choreography.gd` cobriu 50 checks (0 falhas) garantindo a troca de folha exclusiva no supremo, retorno à arte base preservada, limpeza em pulo/skip, proteção do snapshot e conservação da pose de derrota.

## Continuidade autorizada durante a ausência do usuário

O usuário autorizou concluir o trabalho atual e prosseguir pelos itens pendentes,
sem depender de novos prompts. A execução segue entregas verificáveis, sem
publicar ou declarar aceites humanos que não ocorreram. Fabricação/fusão,
recuperação, níveis, maestria, Lumi, expansão de campanha, Legado e árvores
estratégicas já atravessaram os incrementos descritos acima. A continuidade
segue os itens abertos: profundidade de combate e conteúdo, menus e
acessibilidade, audiovisual, matrizes e campanhas contínuas, desempenho e
homologação. Cada entrega atualiza as evidências e os itens abaixo antes de
iniciar a seguinte.
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
- [x] Expor créditos e atribuições nos menus dos três jogos, com retorno que preserva progresso.
- [x] Consultar conquistas locais nos três jogos, derivadas dos respectivos fatos de progressão.
- [ ] Completar perfis, conquistas locais, tutoriais contextuais e remapeamento de controles onde aplicável.
- [x] Remapear os 11 atalhos do Atalaia, com conflitos, restauração e dicas coerentes.
- [x] Remapear 11 ações de teclado de Cinzas, preservando aliases, controles e teclas reservadas.
- [x] Remapear nove comandos do Nexus com conflitos, restauração, persistência e dicas coerentes.
- [x] Oferecer redução explícita de tremor de tela em Cinzas, com preferência do sistema e persistência.
- [ ] Finalizar persistência dos sistemas ainda por criar; as campanhas atuais já possuem validação, cópias e continuação/recuperação.

### Cinzas do Abismo

- [x] Preservar campanha existente de 15 capítulos/3 regiões e modo Horda.
- [x] Implementar continuação de campanha em marcos explícitos, separada da horda.
- [x] Preservar build, vida e recompensas do marco, sem duplicar relíquias/santuários.
- [x] Implementar backup compatível, importação atômica e confirmação de substituição.
- [x] Implantar Legado permanente, com desbloqueio de preferências de arma na nova expedição.
- [x] Liberar runas permanentes de Gelo e Fogo nos capítulos 20 e 25.
- [x] Ampliar o Legado com variantes de arma e seleção de regiões para treino independente.
- [ ] Revisar integralmente dano, cadência, colisão, esquiva, resistência e estados.
- [x] Interromper combate posterior à derrota no mesmo quadro, preservando créditos anteriores, resultado e persistência coerentes.
- [x] Adicionar quatro variantes táticas às famílias existentes, com marcos e contrapartidas.
- [ ] Refinar animações de herói/inimigos/chefes e sincronização dos impactos.
- [ ] Ampliar terrenos, rotas alternativas, destruição, segredos e eventos.
- [x] Abrir uma rota elevada com relíquia pelo Sino da Vigília, com coleta e retomada sem duplicação.
- [x] Entregar campanha nas cinco regiões planejadas, com começo e conclusão.
- [ ] Rebalancear campanha/Horda por cenários reproduzíveis e playtests.

- [x] Introduzir a Urna do Degelo destrutível no capítulo 18, com conteúdo único, quatro armas e retomada por marcos.
- [x] Adicionar condutor destrutível no confronto final, com desligamento das colunas ambientais, ataques do chefe preservados e retomada por marcos.
- [x] Preservar toques curtos de ataque entre quadros, sem repetição por subpasso e com descarte em pausa/perda de foco.

### Atalaia: Guardiões do Cristal

- [x] Preservar três territórios, 15 ondas, seis torretas e cartas/doutrinas existentes.
- [x] Validar saves antes de alterar a partida, incluindo RNG e donos históricos.
- [x] Preservar arquivos inválidos e impedir falso sucesso ao salvar/voltar/fechar.
- [x] Recuperar automaticamente a cópia válida anterior, com aviso e Continuação real do Atalaia.
- [x] Revalidar os 48 slots pela verificação geométrica existente e concluir a campanha determinística.
- [x] Medir alcance por arma/rota/nível e corrigir a distância de terrenos dos mapas novos.
- [x] Entregar cinco atos e 30 fases distintas, com narrativa, objetivos e recompensas.
- [x] Implementar árvores de Engenharia, Proteção e Conhecimento, com dois nós por árvore e escolha persistente.
- [x] Recuperar árvores e recordes da cópia válida anterior, com aviso e preservação de fontes incompatíveis.
- [x] Exibir oito conquistas locais derivadas das árvores, Crônica e Sobrevivência, sem regravar o perfil.
- [x] Implementar Obelisco Solar, Guardião de Raízes, Canhão Sísmico, Farol Espectral, Forja de Cinzas e Arpão do Abismo, com upgrades e limitações próprias.
- [x] Ampliar elevações e eventos ambientais: quatro posições elevadas e névoa temporária, com avisos e alcance efetivo verificados.
- [ ] Expandir elites e interferências de inimigos comuns (proteção, resistência a fogo, divisão, espíritos velados, sabotagem e segunda fase dos chefes já entregues).
- [x] Implementar sabotagem anunciada, bloqueio temporário de disparos e persistência do alvo/temporizadores.
- [x] Introduzir Arauto com aura de marcha, alcance visível, bônus sem acúmulo, contra-jogo por controle e retomada compatível.
- [x] Diferenciar o chefe final da Crônica com pulso periódico anunciado, interrupção breve, alcance legível e retomada compatível.
- [x] Diferenciar o Guardião da escória com convocação única de escoltas, proteção próxima sem acúmulo e contrajogo por perfuração/dano contínuo.
- [x] Adicionar renovação por ouro, duas cartas táticas e evolução priorizada no painel.
- [x] Validar distribuição das cartas e economia em três políticas/três sementes/quatro condições de árvore, com 36 campanhas completas simuladas.
- [x] Verificar ofertas e retomada em 36 sessões/1.392 ofertas, com três políticas econômicas, separadas do combate.
- [x] Entregar sobrevivência infinita, desafios e repetição de fases concluídas.
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
- [x] Expandir para seis capítulos e 48 missões principais variadas, mais três secundárias.
- [x] Entregar preparação dedicada por missão e diálogos nos confrontos finais dos seis capítulos.
- [x] Acrescentar três desafios especiais opcionais.
- [x] Implementar proteção de um aliado específico escolhido livremente no trio, com HUD e automático.
- [x] Implementar ondas sucessivas com conservação do trio, reagendamento e recompensa única (duas ondas em um encontro existente).
- [x] Implementar campo simétrico de energia e composição com treino/ondas (um encontro existente).
- [x] Entregar o primeiro chefe em duas fases (Arconte), com preparação, HUD, Registro e resultado.
- [x] Diferenciar fases do Arquivista e da Arquiteta com Exposição purificável e passagem parcial por escudos, avisos e contra-jogo.
- [ ] Ampliar mecânicas de elites e chefes (sete definições de fases, composição com ondas e campos; Arquivista, Arquiteta e Executor têm pressões distintas).
- [x] Implementar oficina com três peças, patamares, especializações e prévias de atributos.
- [x] Implementar fragmentos previsíveis, recompensas repetíveis e transferência conservando gemas/investimento.
- [x] Migrar equipamento/progresso ao save 5 com backup e recuperação conjunta.
- [x] Implementar nível comum da equipe e crescimento limitado para o elenco ativo.
- [x] Implementar maestria I–III por participação, com benefícios reais e tela Evolução.
- [x] Implementar três alternativas de habilidade por herói ativo, com prévia, contrapartidas e evolução por maestria.
- [x] Estender as três alternativas de maestria aos quatro Lumi (72 formas no total).
- [x] Adquirir uma técnica alternativa com mecânica própria para cada um dos 24 heróis.
- [x] Implementar fabricação escolhida/fusão até III, conservação e orçamento opcional do trio validados.
- [x] Adquirir 24 técnicas de pacto por jornada, com livre escolha do trio e prévia de cada alternativa.
- [x] Implementar vínculos por participação, com bônus e visualização de parceiros.
- [x] Completar biografias, origens, vocações, conexões narrativas, citações e maestria dos 24.
- [x] Entregar 24 jornadas individuais jogáveis e pactos persistentes.
- [ ] Produzir animações completas próprias, impactos e supremos finais para todo o elenco.
- [x] Integrar o piloto corporal de Rhazen com oito desenhos, fases/tempos próprios, defesa e derrota, preservando o restante do elenco.
- [x] Ampliar a coreografia com oito desenhos de Cindra para arco, proteção e derrota, reutilizando o controlador e conservando seu kit.
- [x] Integrar oito desenhos de Oren e oito de Nima, com fases/tempos próprios e proteção/disparos compatíveis com seus kits.
- [x] Integrar oito desenhos de Kira e oito de Vektor, com emissão no rifle/drone, proteção das fases e enquadramento da galeria.
- [x] Integrar oito desenhos de Axion e oito de Astra, com proteção/ataques próprios e emissão espelhada (revisão independente concluída no 59).
- [x] Integrar oito desenhos de Elun e oito de Saira, conservando corte, proteção e curas (revisão independente concluída no 59).
- [x] Integrar oito desenhos de Veyra, Sylva, Vesper e Auren, preservando lâminas, curas e proteções (revisão independente concluída no 59).
- [x] Integrar oito desenhos de Torv, Brin, Bast e Ivo, mantendo punhos, curas, escudos e fendas (revisão independente concluída).
- [x] Integrar oito desenhos de Noct, Maura e Riven, preservando garras, pacto e adagas (revisão independente concluída).
- [x] Integrar oito desenhos de Elyra, Solen e Zaya, completando 24 perfis corporais/192 desenhos (supremos finais e aceite humano pendentes).
- [x] Diferenciar o supremo Queda da fornalha de Rhazen com oito desenhos próprios, mantendo básico/defesa/derrota e resolução única.
- [x] Diferenciar Constelação ardente de Cindra com oito desenhos de mira elevada, emissão alinhada e preservação dos demais golpes.
- [x] Diferenciar Mil espinhos de Nima com oito desenhos próprios em folha dedicada, mantendo básico/defesa/derrota e resolução única.
- [x] Permitir pular a apresentação local/campanha, conservando resolução e recompensa únicas do turno.
- [x] Conservar a pose de derrota entre ações, pulo, movimento reduzido e snapshots, incluindo morte por reflexão.
- [x] Ampliar Aprender para cinco batalhas, incluindo purificação/Égide e transmissão/interceptação, com lista rolável e objetivos textuais.
- [x] Preservar foco, seleção, rolagem e prévia/retry nas ações da Coleção, sem alterar trios ou transações.
- [ ] Finalizar telas e acessibilidade da campanha, evolução, equipamentos e vínculos.
- [x] Validar várias equipes e estratégias ao longo da campanha ampliada (as nove composições de ensaio completaram 48/48 após o refinamento tático de prazo no relé).

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
