# Nexus: Ecos do Crepúsculo — proposta de jogo

## Renascimento — direção e limites da primeira entrega

A expansão preserva o lore do Farol, os trios livres e o motor existente. A meta
é seis capítulos com oito missões variadas, progressão individual/de equipe e
24 personagens em seis afinidades. A revisão atual tem nove missões e **24 ativos em seis afinidades**;
Auren, Elyra, Solen e Zaya voltaram com kits, fichas e vozes. A campanha de
48 missões, vínculos e aquisição ainda não estão entregues.

Antes da expansão, a fundação prioriza recuperação de progresso: trio, missões e
gemas devem ser restaurados juntos, sem inventar recompensas ou alterar os kits
livres/PvP. Uma recuperação deve avisar que a gravação mais recente pode ter sido
perdida. O primeiro incremento acrescenta backup rotativo e recuperação; não
altera combate, campanhas, arte ou balanceamento. A fundação seguinte substitui o
prefixo numérico de vitórias por um registro de IDs e recompensas históricas,
com migração dos formatos antigos, pré-requisitos explícitos e seleção de próxima
missão independente da posição na lista. [Regras e manual](../godot/CAMPAIGN.md).

O incremento tático dá objetivos próprios a quatro encontros: interromper um ritual
até a rodada 4, defender o trio por três rodadas e derrotar o Guardião do relé até
a rodada 6, e proteger o portador escolhido na estrada das cinzas. Preparação, HUD e resultado mostram as condições reais. O automático
considera o alvo, a preparação de supremos e aliados em risco; parâmetros ficam
fora da lógica em `godot/data/campaign-tactics.json`. O combate livre e o PvP não
usam esses parâmetros. As nove missões e o elenco atual permanecem.

A oficina acrescenta Arma, Proteção e Relíquia por herói, com três patamares, especializações e fragmentos previsíveis de primeira vitória/repetição. Peças são transferíveis e conservam investimento; gemas são devolvidas ao trocar. O save 5 migra os formatos 1–4 com backup. [Estado e parâmetros](../godot/PROGRESSION.md). Fabricação e fusão até III foram acrescentadas com estoque por nível e save 6. O incremento seguinte entrega nível comum 1–6 e maestria I–III por participação, com tela Evolução, bônus limitados e save 7. Save 8 acrescenta três alternativas de habilidade por herói ativo, ligadas à maestria e com contrapartidas explícitas. Vínculos e variantes com mecânicas exclusivas continuam pendentes.

Próximos marcos: ampliar objetivos e cenas; refinar núcleo e IA; completar progressão;
capítulos; audiovisual; balanceamento; homologação.
Continuam exigidos campanhas concluíveis, saves confiáveis e builds testados
antes de chamar a entrega de 1.0. Não houve aprovação humana desta atualização.

## Universo

O Nexus mantém seis forças em equilíbrio. Depois da Fratura, cidades inteiras ficaram suspensas entre diferentes momentos da história. Asterion é uma delas: o eclipse nunca termina, suas torres guardam máquinas esquecidas e suas florestas crescem através dos palácios.

O jogador é um **Vinculador**, capaz de reunir três ecos de pessoas que atravessaram a Fratura. Eles mantêm desejos, identidades e afinidades; não são versões do mesmo personagem com elementos intercambiáveis.

## Pilares

1. **Uma decisão legível por turno.** Iniciativa, energia, recarga, estados e vantagem ficam visíveis. Não há velocidade de clique ou tempo limite neste modelo.
2. **Identidade antes de quantidade.** 24 heróis, quatro por classe, com kits e assinaturas reconhecíveis. Obtenção não limita os experimentos do protótipo.
3. **Composição importa.** Dano em área pressiona grupos; dano concentrado elimina antes do próximo turno; guardiões absorvem pressão; suportes prolongam a presença da equipe. A afinidade favorece uma resposta sem determinar automaticamente o resultado.
4. **Batalhas com desfecho.** A Fratura do Nexus impede que combinações de cura e barreiras sustentem um impasse permanente.

## Elenco inicial

| Herói  | Classe  | Técnica              | Supremo                | Assinatura de animação           |
| ------ | ------- | -------------------- | ---------------------- | -------------------------------- |
| Veyra  | Ígneo   | Dança das brasas     | Sol partido            | Arcos de lâminas incandescentes  |
| Rhazen | Ígneo   | Coração de ferro     | Queda da fornalha      | Cratera e fragmentos de fornalha |
| Cindra | Ígneo   | Chuva escarlate      | Constelação ardente    | Rajada de flechas de brasa       |
| Torv   | Ígneo   | Fissura tectônica    | Erupção primordial     | Pilares de magma                 |
| Sylva  | Natural | Jardim suspenso      | Primavera eterna       | Pétalas em florescimento         |
| Oren   | Natural | Casca ancestral      | Despertar da floresta  | Anéis de raízes                  |
| Nima   | Natural | Laço das raízes      | Mil espinhos           | Agulhas triangulares             |
| Brin   | Natural | Sopro verdejante     | Canção do mundo        | Espiral de seiva                 |
| Axion  | Técnico | Campo de contenção   | Protocolo zero         | Contenção hexagonal              |
| Kira   | Técnico | Sobrecarga           | Órbita de aço          | Feixe vetorial                   |
| Bast   | Técnico | Placa reativa        | Bastião magnético      | Placas geométricas               |
| Vektor | Técnico | Enxame de cobalto    | Singularidade mecânica | Drones orbitais                  |
| Astra  | Arcano  | Órbita fragmentada   | Colapso celeste        | Elipses e estrelas               |
| Elun   | Arcano  | Trama impossível     | Paradoxo               | Prismas diagonais                |
| Saira  | Arcano  | Maré de éter         | Coro das constelações  | Runas circulares                 |
| Ivo    | Arcano  | Passo entre mundos   | Horizonte quebrado     | Fenda dimensional                |
| Vesper | Sombrio | Passo da penumbra    | Eclipse absoluto       | Foice crescente                  |
| Maura  | Sombrio | Pacto silencioso     | Réquiem das sombras    | Fios espectrais                  |
| Noct   | Sombrio | Armadura do vazio    | Noite sem fim          | Garras oblíquas                  |
| Riven  | Sombrio | Dívida de sangue     | Última lembrança       | Adagas em rotação                |
| Auren  | Lumi    | Aurora protetora     | Julgamento da aurora   | Lança de luz                     |
| Elyra  | Lumi    | Luz que acolhe       | Segundo amanhecer      | Halo de renovação                |
| Solen  | Lumi    | Selo do horizonte    | Mil sóis               | Raios radiais                    |
| Zaya   | Lumi    | Bênção do crepúsculo | Asas da eternidade     | Leque de penas                   |

Os atributos e descrições executados pelo jogo estão em `src/data.js`. Os nomes são narrativos; tipo e descrição deixam explícito se a habilidade causa dano, cura ou protege.

## Hipóteses para balancear

- Medir duração, taxa de vitória por composição, primeiro supremo, dano absorvido e recuperação. Não existe telemetria de usuários nesta versão; a evidência atual vem de testes locais.
- Começar com atributos iguais e três heróis distintos por equipe. Uma formação pode espelhar escolhas do rival.
- Observar suportes múltiplos, barreiras com regeneração e a vulnerabilidade durante a recarga.
- Confirmar se +25%/−15% oferece vantagem relevante sem anular os papéis da equipe.
- Ajustar a Fratura após medir partidas: deve encerrar impasses sem dominar um combate normal.
- Antes de ranking, medir o impacto de críticos e da iniciativa. Sementes reproduzíveis permitem repetir simulações com as mesmas decisões.

## Decisões ainda em aberto

**Obtenção:** sem decisão sobre campanha, desbloqueio, moeda ou outro sistema. Todos os iniciais permanecem disponíveis.

**Progressão:** equipamentos limitados foram implementados apenas na campanha; raridades, níveis e domínio ainda precisam de validação. Combate livre/PvP mantém atributos de referência.

**Multiplayer pela internet:** exigirá servidor autoritativo, validação, sessões e reconexão. O duelo implementado é local, no mesmo dispositivo.

**Animação final:** a versão atual valida enquadramento, ritmo e identidade usando ilustrações, transformações e partículas. Uma etapa posterior pode incluir rig ou frames de ataque/reação e som individual, preservando a separação entre regras e apresentação.

**Conteúdo:** campanha e arenas adicionais podem explorar as seis forças. A interface atual apresenta somente os modos implementados.
