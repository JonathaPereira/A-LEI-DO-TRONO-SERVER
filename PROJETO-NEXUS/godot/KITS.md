# Kits ativos — Renascimento em desenvolvimento

24 heróis em seis afinidades; regras 0.16.0. [Classes e sinergias](CLASSES.md). Valores antes de defesa, afinidade, crítico e estados. Cura precede purificação. Escudos somam até 25% da vida em camadas com expiração independente após duas rodadas globais. Fonte editável: src/kits.js. As [alternativas de maestria](PROGRESSION.md#habilidades-treináveis-entregues) valem apenas na campanha.

## Ígneo

Queimadura e crítico (+5 pontos de chance). Tanques e suportes refletem 10% do dano direto à vida.

### Veyra · Dano · Detonadora

Duelista que detona brasas. Cindra e Rhazen preparam queimadura; Nima oferece sangramento. Veyra consome uma dessas aberturas para antecipar dano.

PV 1015 · ATQ 251 · DEF 78 · VEL 112.

- **Lâminas do alvorecer** (0 EN): Golpe direto de 100% do ataque. Recupera 24 de energia.
- **Dança das brasas** (30 EN, recarga 2): 155% do ataque. Contra queimadura ou sangramento: +40% e consome apenas uma dessas aflições.
- **Sol partido** (80 EN): 175% do ataque a todos. Contra queimadura: +30% e consome o efeito.

### Rhazen · Tanque · Retaliação ígnea

Fornalha que pune quem atravessa sua defesa. Reflete parte do dano à vida e devolve queimadura; Veyra e Torv aproveitam as brasas.

PV 1390 · ATQ 194 · DEF 116 · VEL 69.

- **Martelo da fornalha** (0 EN): 80% do ataque e ganha escudo de 2% da própria vida máxima. Recupera 24 de energia. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.
- **Coração de ferro** (30 EN, recarga 2): Escudo próprio de 16%, Espelho e Brasa reativa por 2 turnos. Reflete 30% do dano à vida (10% ígneo +20% do Espelho) e queima quem o atingir. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.
- **Queda da fornalha** (80 EN): 110% do ataque em área, queimadura por 2 turnos e escudo próprio de 8%. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.

### Cindra · Suporte · Artilharia de apoio

Artilheira que abastece o trio. Prepara queimadura para Veyra e fortalece atacantes de qualquer afinidade.

PV 1100 · ATQ 189 · DEF 86 · VEL 102.

- **Agulhas de brasa** (0 EN): 70% do ataque e queimadura por 2 turnos. Recupera 24 de energia.
- **Sinal escarlate** (30 EN, recarga 2): Escudo de 8% da vida máxima e ataque +20% para a equipe por 2 turnos. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.
- **Constelação ardente** (80 EN): 95% do ataque em área, queimadura por 2 turnos e +20 de energia para cada aliado.

### Torv · Dano · Demolidor crítico

Demolidor que procura golpes críticos. Queimadura de Cindra ou Rhazen abre sua janela de crítico; Exposição de aliados facilita a ruptura.

PV 1062 · ATQ 235 · DEF 86 · VEL 88.

- **Punho de magma** (0 EN): 90% do ataque e queimadura por 2 turnos. Recupera 24 de energia.
- **Ponto de fusão** (30 EN, recarga 2): 140% do ataque, +35 pontos de chance crítica. Contra queimadura: +15% de dano, sem consumir.
- **Ruptura vulcânica** (80 EN): 235% do ataque em um alvo, +25 pontos de chance crítica e defesa exposta por 2 turnos.

## Natural

Cura, sangramento e controle de estados. Sementes sustentam atacantes de qualquer afinidade.

### Sylva · Suporte · Cura por agressão

Semeadora de cura por agressão. Sua Semente cura o próximo aliado que atingir o alvo; combina com tanques e finalizadores.

PV 1180 · ATQ 188 · DEF 103 · VEL 94.

- **Lança de espinhos** (0 EN): 70% do ataque e Semente por 2 turnos. O próximo aliado a atingir o alvo se cura em 10% da própria vida máxima e consome a Semente. Recupera 24 de energia.
- **Jardim suspenso** (30 EN, recarga 2): Cura 20% da vida máxima de um aliado e concede regeneração por 2 turnos.
- **Primavera eterna** (80 EN): Cura 22% da vida máxima da equipe; depois remove todos os efeitos negativos.

### Oren · Tanque · Guardião de raízes

Colosso que divide o peso do golpe. Cobre um aliado frágil; escudo e regeneração sustentam essa proteção.

PV 1380 · ATQ 193 · DEF 118 · VEL 66.

- **Âncora de carvalho** (0 EN): 80% do ataque e ataque inimigo −20% por 2 turnos. Recupera 24 de energia.
- **Raízes entrelaçadas** (30 EN, recarga 2): Escudo de 14% em um aliado. Oren recebe 25% dos golpes individuais desse aliado por 2 turnos. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.
- **Despertar da floresta** (80 EN): Escudo de 10% e regeneração para todos os aliados por 2 turnos. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.

### Nima · Dano · Caçadora de feridas

Caçadora que abre feridas e armaduras. Sangramento de Nima ou Riven prepara o disparo que expõe a defesa para outros atacantes.

PV 987 · ATQ 252 · DEF 75 · VEL 114.

- **Flecha silvestre** (0 EN): 80% do ataque e sangramento por 2 turnos. Recupera 24 de energia. Sangramento reduz toda cura recebida em 35% enquanto durar.
- **Espinho perfurante** (30 EN, recarga 2): 150% do ataque; contra sangramento: +35% e consome o efeito. Reduz defesa em 25% por 2 turnos.
- **Mil espinhos** (80 EN): 165% do ataque em área e sangramento por 2 turnos. Sangramento reduz toda cura recebida em 35% enquanto durar.

### Brin · Suporte · Purificador

Oráculo que limpa feridas persistentes. Purifica sangramento e marcas; a Semente deixa a cura chegar também aos atacantes de outras classes.

PV 1140 · ATQ 177 · DEF 98 · VEL 99.

- **Orbe de seiva** (0 EN): 65% do ataque e Semente por 2 turnos. O próximo atacante se cura em 10% da própria vida máxima. Recupera 24 de energia.
- **Sopro verdejante** (30 EN, recarga 1): Cura 18% da vida de um aliado e depois purifica efeitos negativos. Recarga de 1 ação.
- **Canção do mundo** (80 EN): Cura 20% da vida da equipe e concede regeneração por 2 turnos.

## Técnico

Escudos, ataque e defesa fortalecidos. Protege aliados e expõe as defesas do rival.

### Axion · Tanque · Supressão defensiva

Sentinela que fortifica a equipe. Barreiras e redução de dano protegem suportes; seus golpes expõem alvos para Kira e Astra.

PV 1340 · ATQ 201 · DEF 114 · VEL 80.

- **Lâmina de pulso** (0 EN): 80% do ataque e defesa inimiga −25% por 2 turnos. Recupera 24 de energia.
- **Campo de contenção** (30 EN, recarga 2): Escudo de 8%, Fortificação (−15% dano) e Sentinela para a equipe por 2 turnos. Um agressor direto recebe ataque −20% após o golpe. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.
- **Protocolo zero** (80 EN): Escudo de 16%, Fortificação e Sentinela por 2 turnos; +10 de energia para cada aliado. Sentinela enfraquece o agressor após o golpe. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.

### Kira · Dano · Atiradora perfurante

Atiradora que atravessa barreiras. Axion, Vektor ou Nima expõem o alvo. Kira concentra dano e penetra escudos.

PV 968 · ATQ 265 · DEF 73 · VEL 108.

- **Disparo vetorial** (0 EN): Disparo direto de 100% do ataque. Recupera 24 de energia.
- **Sobrecarga** (30 EN, recarga 2): 165% do ataque; contra defesa exposta: +35%. 30% do dano atravessa o escudo.
- **Disparo orbital** (80 EN): 280% do ataque em um alvo; metade do dano atravessa escudos.

### Bast · Tanque · Interceptador

Muralha que intercepta por um aliado. Divide o golpe individual recebido pelo aliado protegido; barreiras de outros técnicos ajudam Bast a suportar essa carga.

PV 1450 · ATQ 184 · DEF 126 · VEL 63.

- **Impacto hidráulico** (0 EN): 75% do ataque e ataque inimigo −20% por 2 turnos. Recupera 24 de energia.
- **Linha de interceptação** (30 EN, recarga 2): Escudo de 18% em um aliado. Bast recebe 25% de seus golpes individuais por 2 turnos; golpes em área atingem normalmente. O aliado recebe 15% menos dano por 2 turnos. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.
- **Bastião magnético** (80 EN): Escudo de 14% e redução de dano de 15% para a equipe por 2 turnos. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.

### Vektor · Suporte · Engenheiro de energia

Engenheiro que acelera os aliados. Entrega energia a um aliado para antecipar técnicas e supremos; remove debuffs sem precisar curar.

PV 1120 · ATQ 188 · DEF 96 · VEL 98.

- **Drone cortante** (0 EN): 75% do ataque e defesa inimiga −25% por 2 turnos. Recupera 24 de energia.
- **Drone de manutenção** (30 EN, recarga 2): Purifica um aliado, concede ataque +20% por 2 turnos e entrega até 30 de energia.
- **Rede de cobalto** (80 EN): Escudo de 10% e ataque +20% para a equipe por 2 turnos. Entrega até 20 de energia por aliado. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.

## Arcano

Área, manipulação de aflições e égides elementais. Ignora 25% da defesa nos golpes diretos.

### Astra · Dano · Explosão em área

Cartógrafa que abre uma janela de explosão. Seu Selo aumenta o próximo golpe de qualquer aliado. Defesa exposta fortalece seu supremo.

PV 978 · ATQ 276 · DEF 70 · VEL 104.

- **Estilhaço astral** (0 EN): Estilhaço direto de 100% do ataque. Recupera 24 de energia.
- **Selo da órbita** (30 EN, recarga 2): 125% do ataque e Selo astral por 2 turnos. O próximo golpe aliado causa +25% de dano e consome o Selo.
- **Colapso celeste** (80 EN): 185% do ataque em área; contra defesa exposta: +30% de dano.

### Elun · Tanque · Espelho elemental

Espelho que transforma defesa em ataque. Protege um aliado com escudo, Espelho e Égide. Escudos recebidos de outros aliados abastecem seu supremo.

PV 1340 · ATQ 198 · DEF 110 · VEL 78.

- **Corte prismático** (0 EN): 80% do ataque e defesa inimiga −25% por 2 turnos. Recupera 24 de energia.
- **Trama impossível** (30 EN, recarga 2): Escudo de 18% em um aliado, Espelho (reflete 20% do dano à vida) e Égide elemental por 2 turnos: −20% do dano direto que tenha vantagem de afinidade. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.
- **Paradoxo** (80 EN): 100% do ataque em área, mais 45% do escudo armazenado. Consome o escudo e expõe a defesa por 2 turnos. Concede escudo de 8% à equipe após a conversão. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.

### Saira · Suporte · Amparo elemental

Voz que purifica e prepara ofensivas. Remove queimadura, sangramento e marcas. Seu supremo fortalece aliados já preparados para atacar.

PV 1140 · ATQ 181 · DEF 100 · VEL 101.

- **Runa cintilante** (0 EN): 70% do ataque e ataque inimigo −20% por 2 turnos. Recupera 24 de energia.
- **Maré de éter** (30 EN, recarga 2): Cura 12% da vida máxima de toda a equipe; depois remove efeitos negativos.
- **Coro das constelações** (80 EN): Cura 22% da vida da equipe e concede Égide elemental por 2 turnos: −20% do dano direto com vantagem de afinidade.

### Ivo · Dano · Manipulador de aflições

Peregrino que espalha aflições existentes. Transmite uma queimadura, sangramento ou marca obscura já aplicada, mantendo a duração restante e a origem da marca.

PV 1006 · ATQ 241 · DEF 78 · VEL 110.

- **Dardo de fenda** (0 EN): 80% do ataque e defesa exposta por 2 turnos. Recupera 24 de energia.
- **Eco entre mundos** (30 EN, recarga 2): 115% do ataque. Copia uma queimadura, sangramento ou marca do alvo para outro inimigo vivo, com a duração restante. Não cria nem acumula aflições.
- **Horizonte quebrado** (80 EN): 150% do ataque em área e ataque inimigo −20% por 2 turnos. Concede escudo de 6% à equipe. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.

## Sombrio

Roubo de vida (15% do dano direto à vida), marcas que drenam e explosão em um alvo.

### Vesper · Tanque · Provocador de duelo

Duelista que protege por contra-ataques. Atrai golpes individuais, enfraquece rivais e responde com uma riposta enquanto mantém escudo.

PV 1320 · ATQ 211 · DEF 108 · VEL 76.

- **Corte do ocaso** (0 EN): 80% do ataque e ataque inimigo −20% por 2 turnos. Recupera 24 de energia.
- **Guarda do eclipse** (30 EN, recarga 2): Escudo próprio de 14%. Provocação e Riposta por 2 turnos pessoais: atrai golpes individuais e responde com 30% do ataque, mas a defesa de Vesper cai 25% enquanto provoca. Área continua atingindo todos. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.
- **Eclipse absoluto** (80 EN): 110% do ataque em área, ataque inimigo −20% por 2 turnos e cura própria de 8%.

### Maura · Suporte · Drenagem vital

Tecelã que transforma feridas em sustento. Nima abre sangramento e Noct aplica marcas; qualquer uma dessas aflições aumenta a cura do Pacto.

PV 1190 · ATQ 188 · DEF 101 · VEL 93.

- **Fio espectral** (0 EN): 70% do ataque e Marca obscura por 2 turnos: 3,5% da vida por ativação; o autor recupera 60% do dano periódico real. Recupera 24 de energia.
- **Pacto silencioso** (30 EN, recarga 2): 90% do ataque e enfraquecimento por 2 turnos. Cura o aliado mais ferido em 14%; contra sangramento ou marca obscura, cura 21%.
- **Réquiem das sombras** (80 EN): Purifica a equipe e entrega até +20 de energia a cada aliado.

### Noct · Dano · Executor de marcas

Vigia que executa uma presa marcada. Maura prepara marcas, Nima fornece sangramento e Ivo espalha a aflição. Noct converte uma dessas aberturas em dano concentrado.

PV 1072 · ATQ 240 · DEF 88 · VEL 82.

- **Garra noturna** (0 EN): 80% do ataque e Marca obscura por 2 turnos: drena 3,5% da vida por ativação; o autor recupera 60% do dano periódico real. Recupera 24 de energia.
- **Cobrança do vazio** (30 EN, recarga 2): 145% do ataque. Contra marca obscura ou sangramento: +25%, consumindo apenas uma dessas aflições.
- **Noite sem fim** (80 EN): 240% do ataque em uma presa. Contra marca ou sangramento: +20%. Abaixo de 35% da vida: mais +20%.

### Riven · Dano · Duelista de feridas

Executor que prepara a própria oportunidade. Sangramento aliado habilita seu combo. Alvos abaixo de 35% da vida ficam mais expostos à finalização.

PV 996 · ATQ 263 · DEF 76 · VEL 107.

- **Adaga de obsidiana** (0 EN): 80% do ataque e sangramento por 2 turnos. Recupera 24 de energia. Sangramento reduz toda cura recebida em 35% enquanto durar.
- **Dívida de sangue** (30 EN, recarga 2): 160% do ataque; contra sangramento: +35%. Contra alvos abaixo de 35% da vida: mais +30%.
- **Última lembrança** (80 EN): 265% do ataque em um alvo. Contra sangramento: +25%, consumindo a ferida.

## Lumi

Proteção e renovação. Dissipa efeitos negativos e cura a equipe.

### Auren · Tanque · Juramento purificador

Juramento que protege e purifica um aliado. Remove aflições de quem precisa continuar agindo; sua égide resiste à vantagem de afinidade. Solen aproveita o enfraquecimento do julgamento.

PV 1410 · ATQ 180 · DEF 120 · VEL 78.

- **Lança radiante** (0 EN): 75% do ataque e escudo próprio de 2% da vida máxima. Recupera 24 de energia. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.
- **Aurora protetora** (30 EN, recarga 2): Escudo de 18% da vida máxima em um aliado, purifica efeitos negativos e concede Égide elemental por 2 turnos: −20% do dano direto com vantagem de afinidade. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.
- **Julgamento da aurora** (80 EN): 105% do ataque em todos os rivais e ataque inimigo −20% por 2 turnos. Concede escudo de 6% da vida máxima a cada aliado. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.

### Elyra · Suporte · Renovação protegida

Faroleira que acolhe feridas antes da próxima travessia. Cura antes de purificar, preservando a regra do sangramento. Barreiras pequenas dão tempo para aliados frágeis responderem.

PV 1100 · ATQ 159 · DEF 100 · VEL 98.

- **Raio de alvorada** (0 EN): 65% do ataque. Recupera 24 de energia.
- **Luz que acolhe** (30 EN, recarga 2): Cura 20% da vida máxima de um aliado, depois purifica efeitos negativos e concede escudo de 4%. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.
- **Segundo amanhecer** (80 EN): Cura 16% da vida máxima da equipe, depois purifica efeitos negativos e concede escudo de 6% a cada aliado vivo. Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.

### Solen · Dano · Horizonte vulnerável

Monge que abre e consome janelas de enfraquecimento. Seu selo reduz o ataque rival. Mil sóis consome essa abertura, inclusive quando criada por Oren, Saira ou Auren.

PV 1040 · ATQ 249 · DEF 84 · VEL 106.

- **Palma luminosa** (0 EN): 100% do ataque. Recupera 24 de energia.
- **Selo do horizonte** (30 EN, recarga 2): 90% do ataque em todos os rivais e ataque inimigo −20% por 2 turnos.
- **Mil sóis** (80 EN): 165% do ataque em todos os rivais. Contra enfraquecimento: +20% e consome apenas esse efeito.

### Zaya · Suporte · Mensageira de energia

Mensageira que devolve o ritmo à equipe. Pequenas curas e energia distribuída ajudam aliados de qualquer afinidade a alcançar suas técnicas; a renovação continua limitada pela Fratura.

PV 1010 · ATQ 182 · DEF 78 · VEL 113.

- **Flecha do poente** (0 EN): 70% do ataque. Recupera 24 de energia.
- **Bênção do crepúsculo** (30 EN, recarga 2): Cura 10% da vida máxima da equipe e entrega até 6 de energia por aliado vivo.
- **Asas da eternidade** (80 EN): Cura 18% da vida máxima da equipe, depois purifica efeitos negativos e entrega até 10 de energia por aliado vivo. Não ressuscita.
