## Checkpoint para continuidade em outro chat

Checkout de continuidade: `codex/renascimento-save-recovery`. Estado atual: 24 heróis/seis afinidades, nove missões, save 8, equipamento/gemas, nível/maestria, 72 treinamentos, portador, ondas e campo de energia. **Fases dos chefes ainda não foram implementadas.**

Prompt, diretriz original e checklist completa ficam no repositório `A-LEI-DO-TRONO-SERVER`, em `docs/RENASCIMENTO_CHECKPOINT.md`, também incluído no pacote de transferência. O usuário autorizou explicitamente commit e push do checkpoint. Branches e revisões estão registradas no manifesto do ZIP consolidado. Não depende de logs locais ou do histórico do chat. Pacotes são reconstruíveis; não houve deploy ou homologação 1.0.

## Renascimento — fundações em desenvolvimento

Incremento tático: objetivos de ritual com prazo, defesa do trio,
comandante, portador escolhido, ondas e campo em seis encontros existentes, com preparação/HUD/resultado e IA de
campanha orientada ao objetivo. [Regras e controles](CAMPAIGN.md#objetivos-táticos--incremento-renascimento).
Mantém nove missões; a revisão Lumi amplia o elenco para 24 ativos. O incremento de equipamentos iniciou no save 5; fabricação/fusão usam o save 6. Não altera o combate livre
ou o protocolo PvP. Expansão, vínculos, variantes com mecânicas exclusivas e audiovisual continuam pendentes.

Novo incremento: **Coleção → Oficina** com três peças, patamares I–III, três especializações alternativas, fragmentos de primeira vitória/repetição, prévias e troca gratuita entre heróis. Migração dos formatos 1–4 para 5, conservação de gemas e investimento, recuperação conjunta e rollback de edições em falhas de disco. [Regras entregues e próximas etapas](PROGRESSION.md). As alternativas de habilidade foram entregues no save 8; vínculos permanecem pendentes.

Incremento seguinte: **fabricação escolhida e fusão de gemas até III**, estoque por nível, confirmação e proteção das cópias equipadas. Save 6 migra 1–5 com backup exato e recupera receitas/peças/gemas/fragmentos juntos. Economia validada em campanha e teto opcional do trio; equilíbrio amplo ainda pendente.

Incremento de evolução: **nível comum 1–6 e maestria I–III por participação**, bônus limitados por função, tela Evolução, HUD e recibos reais. Save 7 migra 1–6; histórico concede nível comum e não inventa trios antigos. [Regras e curvas](PROGRESSION.md#nível-comum-e-maestria-entregues).

Incremento de habilidades: **Ímpeto, Economia e Ritmo** para técnica, supremo e básico dos 24 heróis, desbloqueados por maestria. Prévia, escolha gratuita e cartões com custos reais; save 8 migra 1–7. [Regras e limites](PROGRESSION.md#habilidades-treináveis-entregues).

Primeiro incremento: backup rotativo e recuperação de saves de campanha
ilegíveis/ausentes, com aviso e preservação do arquivo danificado. Manual em
[CAMPAIGN.md](CAMPAIGN.md); testes em `tests/save_recovery.gd`, incluídos em
`npm run test:godot`. O incremento seguinte migra formatos 1/2/3 para o formato 4,
com IDs e recompensas históricas por missão, pré-requisitos/agrupamento explícitos,
proteção contra dados desconhecidos e UI que conserva a identidade ao reordenar.
Regressões de migração e da interface real em `tests/mission_progress.gd`.
Permanecem as nove missões; a revisão Lumi disponibiliza os 24 heróis originais.
O escopo completo está em [DESIGN.md](../docs/DESIGN.md); seis capítulos/48
missões continuam metas pendentes, não uma versão 1.0 entregue.

Ondas entregues na escadaria das marés: dois grupos, conservação do trio e recompensa apenas após o último; estado e saves preservados. Campo de energia entregue na guardiã da memória; fases de chefes seguem pendentes.

## Revisão Lumi — regras 0.16.0

Auren (tanque purificador), Elyra (cura com barreiras), Solen (dano que consome enfraquecimento) e Zaya (cura/energia de equipe) completam os 24 ativos/seis afinidades. Ciclo Sombrio → Lumi → Ígneo; os vinte kits anteriores permanecem. Fichas, 16 falas sintéticas adicionais, arte isolada e assinaturas de efeitos integradas; 72 alternativas de treino. Arte/animação/voz final e aceite humano continuam pendentes. Laboratório com 282 partidas e arquivos 0.16 próprios, preservando os registros 0.15. Servidor PvP publicado precisa acompanhar o catálogo antes de aceitar o pacote novo; validação local usa cliente e servidor da mesma versão. Nenhuma publicação realizada.

## Alpha 0.13 · PvP experimental

Salas online por convite, preparação com gemas livres e três engastes por herói, servidor autoritativo, registros próprios, painel administrativo e exportação Web. [Publicação e integração](PVP.md). Ranking, contas e login do A Lei do Trono continuam como próximos passos.

# Estado atual — Alpha 0.12

Menu inicial com jornada e trio, estados com ícones próprios e inspeção acessível, impactos pintados e áudio em camadas. [O que mudou](POLISH-0.12.md). A progressão segue [o estado entregue e as propostas](PROGRESSION.md), equilibrando campanha/domínio e equipamentos/gemas. As regras de combate continuam em 0.11.0.

# Estado atual — Alpha 0.11

A direção principal é **2D**, com nove missões, automático, vinte heróis, identidades de classe e oficina de engastes. [Implementação e capturas](CLASSES.md). PvP online e evolução futura para 3D continuam no roteiro.

O registro abaixo descreve as etapas anteriores; números e regras atuais estão em [KITS.md](KITS.md) e [SIMULATIONS-0.11.md](SIMULATIONS-0.11.md).

# Progressão e próximas etapas

**Etapa 3D (Alpha 0.9):** a batalha principal usa arena, iluminação e personagens volumétricos com articulações procedurais, ataques com contato sincronizado e janelas de resultado detalhadas. Esta é a base jogável para evoluir o conceito visual; modelos e animações de arte final, novos capítulos e PvP online continuam sendo entregas futuras. [Escopo e validação](GRAPHICS-3D.md).

Pedidos do jogador em 18 e 19/10/2026, com a primeira etapa na Alpha 0.7 e os refinamentos da **Alpha 0.8**.

Implementado:

- Menu com Sanctum hi-tech, painéis modernos, fontes Space Grotesk/Manrope e acesso à história, heróis, engastes, combate livre, treinos, galeria e laboratório.
- **Heróis:** os 15 personagens têm fichas com atributos, três habilidades ilustradas, descrições, custos, sinergias, origem, motivação e história própria.
- **O Farol Partido:** três missões, três tipos de minions, Vesper como chefe, introduções, dicas e desfechos em texto, desbloqueio e progresso local. A Alpha 0.8 amplia o contexto da queda do Farol e a relação do elenco com a âncora do eclipse.
- **Engastes:** três espaços por personagem, com gemas repetidas; três cópias iniciais de cada tipo e recompensa única por missão; bônus aditivos só na história; troca e remoção gratuitas. Migração do progresso anterior com backup. [Regras completas](CAMPAIGN.md).
- **Combate:** cards de habilidades mais legíveis; recibos por alvo distinguem vida, escudo, valor restante, crítico e estados; coreografias com rastros, antecipação e pausas no impacto em Full HD. São ilustrações 2D: cinco heróis têm quatro poses desenhadas, e os demais usam movimento procedural.
- **Balanceamento:** atributos dos heróis com campos nomeados, parâmetros globais em `src/balance.json` e sincronização para Godot. [Guia das fórmulas](BALANCING.md) e [interpretação das simulações](SIMULATIONS.md).

Próximas etapas:

- **Treinamento de habilidades:** desenvolver skills ao longo do jogo. Custos, limites e tipos de evolução ainda serão definidos.
- Expandir história, objetivos e inimigos depois dos testes deste capítulo.
- Refinar obtenção e efeitos de gemas, antes de adicionar raridades ou melhorias acumulativas.
- Ampliar poses desenhadas e variedade de animações após validar a leitura dos ataques e o ritmo desta apresentação.
- Investigar os extremos das simulações com substituições controladas de heróis, diferentes adversários e partidas jogadas. A amostra atual não comprova equilíbrio competitivo.
- Definir obtenção dos heróis, multiplayer e a relação de progressão com futuros confrontos entre jogadores. O combate livre atual usa atributos normalizados.

O jogador gostou do TTK atual. Preservar esse ritmo em rodadas como referência: sem sustentação infinita e com oportunidade de resposta. A Alpha 0.8 mantém as regras de referência **0.5.0** no combate livre e nas 156 simulações; a reorganização das fórmulas não muda seus valores. Animações mais detalhadas alteram a duração visual, enquanto campanha e gemas não contaminam os dados de balanço.

A montagem de equipes segue livre. A integração futura com **A Lei do Trono** permanece planejada, sem mudanças naquele repositório nesta etapa.
