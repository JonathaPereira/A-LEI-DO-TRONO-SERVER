> **Alpha 0.15:** [Escudos por rodada, proteção dos tanques, provocação com custo e correção do áudio web](godot/BALANCE-0.15.md).

> **Alpha 0.14:** [PvP com servidor correto, vozes em português e efeitos otimizados](godot/POLISH-0.14.md).

> **Alpha 0.13:** [PvP online, publicação e integração ao A Lei do Trono](godot/PVP.md).

# NEXUS — Ecos do Crepúsculo

Protótipo jogável de RPG tático original: equipes de três, cinco afinidades permanentes, turnos por iniciativa e 20 personagens ativos. A referência é a legibilidade do combate de jogos como Marvel Avengers Alliance; universo, personagens, ilustrações, habilidades e identidade visual são próprios.

## Jogar

### Nova base em Godot

**Alpha 0.12 — menu e impacto 2D:** nova tela inicial com jornada e trio, ícones verdes/vermelhos de estados, impactos pintados, propagação em área e áudio estéreo em camadas. [Guia e capturas reais](godot/POLISH-0.12.md). [Proposta de progressão](godot/PROGRESSION.md).

**Alpha 0.11 — classes e oficina de gemas:** identidades e combos entre classes, habilidades revistas, cinco heróis de volta e inventário com personagem, engastes e transferências. [Guia e capturas desta revisão](godot/CLASSES.md).

**Direção 2D preservada:** combate ilustrado, cenários animados, três capítulos com nove missões, menus com submenus e modo automático. [Novidades e como experimentar](godot/TWO-D.md).

O projeto Godot está em **[godot/](godot/README.md)**. Use **Godot 4.6 Standard**, gratuito, sem a edição .NET. Importe [godot/project.godot](godot/project.godot), aguarde a importação dos recursos e pressione **F5**.

O combate em Godot usa personagens e coreografias 2D, com vida, energia e escudo separados e janelas de resultado por alvo. Ative **Automático · A** para deixar sua equipe escolher habilidades e alvos. O estudo 3D do Vesper continua disponível em **Extras**, preservado para uma futura evolução visual.

A base visual da **Alpha 0.8** foi preservada e aprimorada: o menu e o combate usam com a ambientação hi-tech do Sanctum, painéis azul-escuros, acentos ciano e a fonte Space Grotesk. A aba **Heróis** reúne os 20 personagens, suas três habilidades ilustradas, custos, efeitos, sinergias, origem, motivação e história. **O Farol Partido** abre a campanha; **Marés da Memória** e **A Última Fornalha** completam os nove confrontos e a jornada do trio.

Cada herói pode carregar **três engastes**, inclusive gemas repetidas. Você começa com **três cópias de cada tipo**: ataque +4%, vida +5% ou energia inicial +8 por cópia. Bônus iguais somam: três dão +12% ataque, +15% vida ou energia inicial de 40 para 64. Trocas são gratuitas; primeiras vitórias concedem uma cópia extra da gema da missão. Trio, engastes e avanço ficam salvos localmente, com leitura automática do progresso anterior. [Como jogar a campanha](godot/CAMPAIGN.md).

O combate livre mantém **20 kits distintos, com tanque, suporte e dano em cada uma das cinco classes**, composição livre, três treinos guiados, laboratório e exportação de logs JSON/CSV. A apresentação tem cards de habilidades maiores, impactos com pausa, rastros e recibos separados de dano à vida, escudo, escudo restante, crítico e estados. As regras de classe e proteção passam à versão 0.15; a tela cheia Full HD usa **F11**. **A campanha tem seu próprio inventário de gemas**; o PvP usa engastes e estoque experimental separados, com registros exclusivos de balanceamento. [Resultados e interpretação das simulações](godot/SIMULATIONS.md). Treinamento de habilidades e integração com A Lei do Trono continuam no [roteiro](godot/ROADMAP.md).

O GitHub Pages continua executando o protótipo JavaScript. O jogo Godot 2D está publicado em [Nexus no itch.io](https://semchakra10.itch.io/nexus-mn), com acesso pelo Trono. A [branch downloads](https://github.com/JonathaPereira/PROJETO-NEXUS/tree/downloads) contém o ZIP HTML5 preparado. Veja [godot/README.md](godot/README.md) para instruções, estrutura e testes.

### Protótipo web existente

O download anterior foi retirado após o relato **“Vírus detectado”**. A causa permanece inconclusiva. Não execute o pacote antigo nem desative a proteção. O [registro do alerta](docs/ALERTA-DO-DOWNLOAD.md) documenta o arquivo e as medidas tomadas.

### Versão web

O jogo usa HTML, CSS, módulos JavaScript, imagens e fontes separados. A pasta `docs/` contém a versão preparada para GitHub Pages, sem ZIP ou HTML com código e imagens empacotados. **Preparar os arquivos não ativa a hospedagem.**

Para o proprietário ativar o site pelo GitHub:

1. Abra **Settings → Pages** neste repositório.
2. Em **Build and deployment**, escolha **Deploy from a branch**.
3. Selecione a branch **codex/nexus-jogavel** e a pasta **/docs**, depois **Save**.
4. Aguarde a publicação e abra o endereço mostrado pelo próprio GitHub.

Isso publica um site acessível pela internet, conforme a visibilidade e o plano do repositório. O GitHub pode exigir tornar o repositório público ou um plano compatível; avalie essa escolha nas configurações. A ativação não foi feita por este ambiente: o acesso à API do GitHub está bloqueado pelo proxy de rede.

Para preparar os arquivos a partir do código-fonte:

```bash
npm run build         # arquivos em dist/ para hospedagem estática
npm run build:pages   # atualiza a cópia em docs/ para GitHub Pages
```

O gerador usa apenas bibliotecas do Node e copia uma lista explícita de arquivos públicos. Após mudar o código ou os recursos, execute `npm run build:pages` e envie também as alterações de `docs/`.

### Executar o código-fonte

Requer Node.js 24 ou superior e npm.

```bash
cd PROJETO-NEXUS
npm ci
npm run dev
```

O servidor usa a porta **5173**. Quando executado na sua própria máquina, abra `http://localhost:5173`. Esta interface de configuração na nuvem não oferece uma prévia pública dessa porta; para jogar sem instalação, use a hospedagem web após sua ativação. Para alterar a porta: `PORT=3000 npm start`. O jogo roda no navegador, sem banco, conta, chave de API ou serviços externos. As dependências npm são usadas somente para testes de navegador.

1. Abra **Personagens** ou **Montar equipe**. Escolha três heróis distintos; a formação rival também pode ser editada.
2. Em **Treino tático**, enfrente a IA. Em **Duelo local**, duas pessoas controlam suas equipes no mesmo dispositivo. Multiplayer pela internet ainda não foi implementado.
3. Clique em **Iniciar combate**. A velocidade determina a ordem de iniciativa da rodada.
4. Escolha uma ação, clique em um alvo válido na arena ou no painel e confirme em **Usar em…**. Ataques atingem rivais; curas e barreiras escolhem aliados.
5. Derrote os três rivais. O resultado mostra rodadas, ações e dano da equipe vencedora e permite jogar novamente ou mudar a formação.

As equipes e preferências ficam salvas neste navegador; uma batalha em andamento não é restaurada ao atualizar. Todos os personagens estão liberados. Obtenção, economia e progressão permanecem em aberto.

## Classes e elenco

**Ígneo → Natural → Técnico → Arcano → Sombrio → Ígneo.** Cada classe supera a próxima (+25% de dano); a relação inversa recebe resistência (−15%). Outras relações são neutras. A afinidade é fixa; a função depende do kit. Não é obrigatório escolher um personagem de cada função.

| Classe | Tanque | Suporte | Dano |
| --- | --- | --- | --- |
| Ígneo | Rhazen | Cindra | Veyra |
| Natural | Oren | Sylva | Nima |
| Técnico | Axion | Vektor | Kira |
| Arcano | Elun | Saira | Astra |
| Sombrio | Vesper | Maura | Riven |

Os nove restantes estão em `ARCHIVED_HEROES`, sem entrar na seleção ou nas simulações atuais. Kits e exemplos de sinergia: [godot/KITS.md](godot/KITS.md).

## Regras do modelo inicial

- **Energia:** começa em 40/100. Ataque básico recupera 24; defesa recupera 25; técnica custa 30 e fica indisponível por dois turnos pessoais; supremo custa 80.
- **Defesa:** escudo de 6% da vida máxima e redução de 35% do dano até o próximo turno. Escudos não somam: mantém o maior, até 25% da vida máxima, por duas ações seguintes do protegido.
- **Estados:** queimadura e sangramento tiram 6,5% da vida máxima por turno e atravessam escudos; sangramento também reduz toda cura recebida em 35%; regeneração cura 4%; exposição reduz defesa em 25%; enfraquecimento reduz ataque em 20%. Duram dois turnos do alvo; aplicações renovam a duração, sem acumular duplicatas. Cura não excede a vida máxima nem ressuscita.
- **Crítico:** chance base de 10%, com +5 pontos para Ígneo e bônus próprios nas técnicas de Torv; dano multiplicado por 1,4. O motor usa aleatoriedade com semente para permitir simulações reproduzíveis.
- **Fratura do Nexus:** a partir da rodada 12, cada herói sofre dano direto antes de agir. Começa em 4% da vida máxima e sobe 2,5 pontos percentuais por rodada, até 85%. Ignora barreiras e reduz toda cura recebida em 10 pontos percentuais por rodada (−10% na 12, até −100% na 21), multiplicando a redução do sangramento. Impede impasses de cura/defesa. Cada ocorrência aparece no registro.
- **Dificuldade:** Iniciante usa 82% da vida/ataque da IA; Desafiador usa 115%. Normal e Duelo local usam atributos iguais nos dois lados.

```text
dano = ataque × poder × 100 / (100 + defesa efetiva × 0,5)
       × afinidade × crítico × postura defensiva
```

Enfraquecimento modifica o ataque; exposição e Arcano modificam a defesa efetiva. O dano é arredondado antes da absorção pela barreira. Roubo de vida considera apenas o dano realmente causado à vida.

## Apresentação e controles

No Godot, o Sanctum e a arena combinam arte 2D com interfaces hi-tech, fontes modernas e formação em perspectiva. Os 20 heróis têm coreografias próprias com antecipação, deslocamento, projéteis, rastros, pausa no impacto e retorno; cinco representantes têm quatro poses desenhadas. Os demais usam movimento procedural sobre uma ilustração. Supremos têm preparação e efeitos prolongados; o combate principal usa ilustrações 2D; o modelo e as animações esqueléticas do Vesper ficam preservados no arquivo em Extras.

O protótipo web anterior preserva ruínas sob eclipse e o HUD de obsidiana e ouro. Sua apresentação e seus controles seguem abaixo; a interface nativa está descrita em [godot/README.md](godot/README.md).

O som é sintetizado localmente e ativado no topo. O guia oferece **Reduzir animações** e respeita inicialmente a preferência do sistema. No celular, **Ver ficha** abre atributos, história e habilidades.

| Tecla | Ação                                                 |
| ----- | ---------------------------------------------------- |
| 1–4   | Selecionar ataque, técnica, supremo ou defesa        |
| ← / → | Alternar alvo válido                                 |
| Enter | Confirmar ação quando o foco não está em outro botão |
| Esc   | Fechar painel                                        |

## Desenvolvimento e balanceamento

| Arquivo                        | Responsabilidade                                        |
| ------------------------------ | ------------------------------------------------------- |
| [src/kits.js](src/kits.js)     | Atributos nomeados, habilidades e sinergias dos 20 heróis |
| [src/balance.json](src/balance.json) | Parâmetros globais de dano, energia, crítico, estados, escudos e Fratura |
| [src/data.js](src/data.js)     | Identidade, afinidades, elenco e montagem dos kits       |
| [src/engine.js](src/engine.js) | Motor de combate independente da interface e IA         |
| [godot/scripts/combat.gd](godot/scripts/combat.gd) | Motor nativo equivalente, lendo os parâmetros sincronizados |
| [godot/scripts/campaign.gd](godot/scripts/campaign.gd) | Missões, minions, chefe, gemas e progresso local |
| [src/app.js](src/app.js)       | Formação, HUD, diálogos, som e coreografias             |
| [src/art.js](src/art.js)       | Ícones e recortes do atlas de personagens               |
| [styles.css](styles.css)       | Identidade visual, responsividade e efeitos individuais |
| [server.mjs](server.mjs)       | Servidor estático sem dependências de produção          |

Para ajustar um herói ou uma fórmula, comece pelo **[guia de balanceamento](godot/BALANCING.md)**. Os atributos de `KITS.<id>.stats` têm campos `hp`, `attack`, `defense` e `speed`; `src/balance.json` concentra os parâmetros globais. `npm run sync:godot` gera `godot/data/catalog.json` e `godot/data/combat-rules.json`. Não edite essas cópias geradas. As regras **0.11.0** são compartilhadas pelos dois motores, com paridade verificada em partidas e logs completos.

Os números são uma **base inicial para balancear**, não uma alegação de equilíbrio competitivo. A IA respeita os mesmos custos, alvos e recargas. Consulte [as simulações](godot/SIMULATIONS.md) antes de interpretar uma taxa de vitória isolada e [docs/DESIGN.md](docs/DESIGN.md) para o conceito original.

## Verificar

```bash
npm run check
npm test
npm run test:browser
npm run test:site
```

Os testes do motor cobrem regras, estados, término e simulações que exercitam todos os 20 heróis ativos. Os testes de navegador verificam formações persistentes, filtros, guias, animação, IA, partida local completa, resultado, replay e celular. `test:site` verifica a versão construída em uma subpasta de URL, incluindo fontes, imagens, combate e celular. São testes funcionais, não uma análise antivírus. Capturas ficam em `artifacts/`, ignorada pelo Git.

O teste de navegador inicia e encerra seu servidor na porta 5199. Usa `CHROMIUM_EXECUTABLE_PATH`, `/usr/bin/chromium` quando disponível ou o Chromium do Playwright. Se necessário: `npx playwright install chromium`; para dependências de sistema Linux, `npx playwright install --with-deps chromium`. Para usar um servidor já aberto, defina `NEXUS_TEST_BASE_URL`.

## Recursos

Arena, Sanctum, Observatório das Marés, Última Fornalha e atlas de personagens foram gerados para este protótipo. Cinzel, Manrope e Space Grotesk são fontes sob SIL Open Font License; as licenças acompanham os recursos em `assets/` e `godot/assets/`. Todos os recursos são servidos localmente.
