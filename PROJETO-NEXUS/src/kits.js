// BALANCEAMENTO DOS 24 HERÓIS — edite os objetos abaixo.
// stats: hp = vida, attack = ataque, defense = defesa, speed = iniciativa.
// basic / skill / ultimate: nome, tipo, poder, descrição e efeitos de cada golpe.
// power em dano: 1.55 = 155% do ataque; em cura/escudo: 0.20 = 20% da vida.
// cost e cooldown podem ser adicionados à habilidade para substituir os padrões.
// Atualize a description quando mudar seu poder ou efeito.
// Afinidades/arte: data.js. Fórmulas globais: balance.json.
// Guia completo: godot/BALANCING.md. Depois de editar: npm run sync:godot.

export const KITS = {
  "veyra": {
    "role": "Dano",
    "identity": "Duelista que detona brasas",
    "synergy": "Cindra e Rhazen preparam queimadura; Nima oferece sangramento. Veyra consome uma dessas aberturas para antecipar dano.",
    "stats": {
      "hp": 1015,
      "attack": 251,
      "defense": 78,
      "speed": 112
    },
    "basic": {
      "name": "",
      "kind": "damage",
      "power": 1,
      "description": "Golpe direto de 100% do ataque. Recupera 24 de energia."
    },
    "skill": {
      "name": "Dança das brasas",
      "kind": "damage",
      "power": 1.55,
      "description": "155% do ataque. Contra queimadura ou sangramento: +40% e consome apenas uma dessas aflições.",
      "combo": {
        "statuses": [
          "burn",
          "bleed"
        ],
        "multiplier": 1.4,
        "consume": true
      }
    },
    "ultimate": {
      "name": "Sol partido",
      "kind": "aoe",
      "power": 1.75,
      "description": "175% do ataque a todos. Contra queimadura: +30% e consome o efeito.",
      "combo": {
        "status": "burn",
        "multiplier": 1.3,
        "consume": true
      }
    },
    "specialty": "Detonadora"
  },
  "rhazen": {
    "role": "Tanque",
    "identity": "Fornalha que pune quem atravessa sua defesa",
    "synergy": "Reflete parte do dano à vida e devolve queimadura; Veyra e Torv aproveitam as brasas.",
    "stats": {
      "hp": 1390,
      "attack": 194,
      "defense": 116,
      "speed": 69
    },
    "basic": {
      "name": "Martelo da fornalha",
      "kind": "damage",
      "power": 0.8,
      "description": "80% do ataque e ganha escudo de 2% da própria vida máxima. Recupera 24 de energia.",
      "secondary": {
        "kind": "shield",
        "target": "actor",
        "power": 0.02
      }
    },
    "skill": {
      "name": "Coração de ferro",
      "kind": "shield",
      "power": 0.16,
      "description": "Escudo próprio de 16%, Espelho e Brasa reativa por 2 turnos. Reflete 30% do dano à vida (10% ígneo +20% do Espelho) e queima quem o atingir.",
      "self": true,
      "effect": "mirror",
      "extraEffect": "emberguard"
    },
    "ultimate": {
      "name": "Queda da fornalha",
      "kind": "aoe",
      "power": 1.1,
      "description": "110% do ataque em área, queimadura por 2 turnos e escudo próprio de 8%.",
      "effect": "burn",
      "secondary": {
        "kind": "shield",
        "target": "actor",
        "power": 0.08
      }
    },
    "specialty": "Retaliação ígnea"
  },
  "cindra": {
    "role": "Suporte",
    "identity": "Artilheira que abastece o trio",
    "synergy": "Prepara queimadura para Veyra e fortalece atacantes de qualquer afinidade.",
    "stats": {
      "hp": 1100,
      "attack": 189,
      "defense": 86,
      "speed": 102
    },
    "basic": {
      "name": "",
      "kind": "damage",
      "power": 0.7,
      "description": "70% do ataque e queimadura por 2 turnos. Recupera 24 de energia.",
      "effect": "burn"
    },
    "skill": {
      "name": "Sinal escarlate",
      "kind": "shieldAll",
      "power": 0.08,
      "description": "Escudo de 8% da vida máxima e ataque +20% para a equipe por 2 turnos.",
      "effect": "empower"
    },
    "ultimate": {
      "name": "Constelação ardente",
      "kind": "aoe",
      "power": 0.95,
      "description": "95% do ataque em área, queimadura por 2 turnos e +20 de energia para cada aliado.",
      "effect": "burn",
      "secondary": {
        "kind": "energy",
        "target": "allies",
        "amount": 20
      }
    },
    "specialty": "Artilharia de apoio"
  },
  "oren": {
    "role": "Tanque",
    "identity": "Colosso que divide o peso do golpe",
    "synergy": "Cobre um aliado frágil; escudo e regeneração sustentam essa proteção.",
    "stats": {
      "hp": 1380,
      "attack": 193,
      "defense": 118,
      "speed": 66
    },
    "basic": {
      "name": "",
      "kind": "damage",
      "power": 0.8,
      "description": "80% do ataque e ataque inimigo −20% por 2 turnos. Recupera 24 de energia.",
      "effect": "weaken"
    },
    "skill": {
      "name": "Raízes entrelaçadas",
      "kind": "shield",
      "power": 0.14,
      "description": "Escudo de 14% em um aliado. Oren recebe 25% dos golpes individuais desse aliado por 2 turnos.",
      "effect": "cover"
    },
    "ultimate": {
      "name": "Despertar da floresta",
      "kind": "shieldAll",
      "power": 0.1,
      "description": "Escudo de 10% e regeneração para todos os aliados por 2 turnos.",
      "effect": "regen"
    },
    "specialty": "Guardião de raízes"
  },
  "sylva": {
    "role": "Suporte",
    "identity": "Semeadora de cura por agressão",
    "synergy": "Sua Semente cura o próximo aliado que atingir o alvo; combina com tanques e finalizadores.",
    "stats": {
      "hp": 1180,
      "attack": 188,
      "defense": 103,
      "speed": 94
    },
    "basic": {
      "name": "",
      "kind": "damage",
      "power": 0.7,
      "description": "70% do ataque e Semente por 2 turnos. O próximo aliado a atingir o alvo se cura em 10% da própria vida máxima e consome a Semente. Recupera 24 de energia.",
      "effect": "seed"
    },
    "skill": {
      "name": "Jardim suspenso",
      "kind": "heal",
      "power": 0.2,
      "description": "Cura 20% da vida máxima de um aliado e concede regeneração por 2 turnos.",
      "effect": "regen"
    },
    "ultimate": {
      "name": "Primavera eterna",
      "kind": "healAll",
      "power": 0.22,
      "description": "Cura 22% da vida máxima da equipe; depois remove todos os efeitos negativos.",
      "effect": "cleanse"
    },
    "specialty": "Cura por agressão"
  },
  "nima": {
    "role": "Dano",
    "identity": "Caçadora que abre feridas e armaduras",
    "synergy": "Sangramento de Nima ou Riven prepara o disparo que expõe a defesa para outros atacantes.",
    "stats": {
      "hp": 987,
      "attack": 252,
      "defense": 75,
      "speed": 114
    },
    "basic": {
      "name": "",
      "kind": "damage",
      "power": 0.8,
      "description": "80% do ataque e sangramento por 2 turnos. Recupera 24 de energia.",
      "effect": "bleed"
    },
    "skill": {
      "name": "Espinho perfurante",
      "kind": "damage",
      "power": 1.5,
      "description": "150% do ataque; contra sangramento: +35% e consome o efeito. Reduz defesa em 25% por 2 turnos.",
      "effect": "expose",
      "combo": {
        "status": "bleed",
        "multiplier": 1.35,
        "consume": true
      }
    },
    "ultimate": {
      "name": "Mil espinhos",
      "kind": "aoe",
      "power": 1.65,
      "description": "165% do ataque em área e sangramento por 2 turnos.",
      "effect": "bleed"
    },
    "specialty": "Caçadora de feridas"
  },
  "axion": {
    "role": "Tanque",
    "identity": "Sentinela que fortifica a equipe",
    "synergy": "Barreiras e redução de dano protegem suportes; seus golpes expõem alvos para Kira e Astra.",
    "stats": {
      "hp": 1340,
      "attack": 201,
      "defense": 114,
      "speed": 80
    },
    "basic": {
      "name": "",
      "kind": "damage",
      "power": 0.8,
      "description": "80% do ataque e defesa inimiga −25% por 2 turnos. Recupera 24 de energia.",
      "effect": "expose"
    },
    "skill": {
      "name": "Campo de contenção",
      "kind": "shieldAll",
      "power": 0.08,
      "description": "Escudo de 8%, Fortificação (−15% dano) e Sentinela para a equipe por 2 turnos. Um agressor direto recebe ataque −20% após o golpe.",
      "effect": "fortify",
      "extraEffect": "sentinel"
    },
    "ultimate": {
      "name": "Protocolo zero",
      "kind": "shieldAll",
      "power": 0.16,
      "description": "Escudo de 16%, Fortificação e Sentinela por 2 turnos; +10 de energia para cada aliado. Sentinela enfraquece o agressor após o golpe.",
      "effect": "fortify",
      "secondary": {
        "kind": "energy",
        "target": "allies",
        "amount": 10
      },
      "extraEffect": "sentinel"
    },
    "specialty": "Supressão defensiva"
  },
  "vektor": {
    "role": "Suporte",
    "identity": "Engenheiro que acelera os aliados",
    "synergy": "Entrega energia a um aliado para antecipar técnicas e supremos; remove debuffs sem precisar curar.",
    "stats": {
      "hp": 1120,
      "attack": 188,
      "defense": 96,
      "speed": 98
    },
    "basic": {
      "name": "",
      "kind": "damage",
      "power": 0.75,
      "description": "75% do ataque e defesa inimiga −25% por 2 turnos. Recupera 24 de energia.",
      "effect": "expose"
    },
    "skill": {
      "name": "Drone de manutenção",
      "kind": "support",
      "power": 0,
      "description": "Purifica um aliado, concede ataque +20% por 2 turnos e entrega até 30 de energia.",
      "effect": "cleanse",
      "secondary": {
        "kind": "energy",
        "target": "target",
        "amount": 30
      },
      "extraEffect": "empower"
    },
    "ultimate": {
      "name": "Rede de cobalto",
      "kind": "shieldAll",
      "power": 0.1,
      "effect": "empower",
      "description": "Escudo de 10% e ataque +20% para a equipe por 2 turnos. Entrega até 20 de energia por aliado.",
      "secondary": {
        "kind": "energy",
        "target": "allies",
        "amount": 20
      }
    },
    "specialty": "Engenheiro de energia"
  },
  "kira": {
    "role": "Dano",
    "identity": "Atiradora que atravessa barreiras",
    "synergy": "Axion, Vektor ou Nima expõem o alvo. Kira concentra dano e penetra escudos.",
    "stats": {
      "hp": 968,
      "attack": 265,
      "defense": 73,
      "speed": 108
    },
    "basic": {
      "name": "",
      "kind": "damage",
      "power": 1,
      "description": "Disparo direto de 100% do ataque. Recupera 24 de energia."
    },
    "skill": {
      "name": "Sobrecarga",
      "kind": "damage",
      "power": 1.65,
      "description": "165% do ataque; contra defesa exposta: +35%. 30% do dano atravessa o escudo.",
      "pierce": 0.3,
      "combo": {
        "status": "expose",
        "multiplier": 1.35,
        "consume": false
      }
    },
    "ultimate": {
      "name": "Disparo orbital",
      "kind": "damage",
      "power": 2.8,
      "description": "280% do ataque em um alvo; metade do dano atravessa escudos.",
      "pierce": 0.5
    },
    "specialty": "Atiradora perfurante"
  },
  "elun": {
    "role": "Tanque",
    "identity": "Espelho que transforma defesa em ataque",
    "synergy": "Protege um aliado com escudo, Espelho e Égide. Escudos recebidos de outros aliados abastecem seu supremo.",
    "stats": {
      "hp": 1340,
      "attack": 198,
      "defense": 110,
      "speed": 78
    },
    "basic": {
      "name": "",
      "kind": "damage",
      "power": 0.8,
      "description": "80% do ataque e defesa inimiga −25% por 2 turnos. Recupera 24 de energia.",
      "effect": "expose"
    },
    "skill": {
      "name": "Trama impossível",
      "kind": "shield",
      "power": 0.18,
      "description": "Escudo de 18% em um aliado, Espelho (reflete 20% do dano à vida) e Égide elemental por 2 turnos: −20% do dano direto que tenha vantagem de afinidade.",
      "effect": "mirror",
      "extraEffect": "elementalWard"
    },
    "ultimate": {
      "name": "Paradoxo",
      "kind": "aoe",
      "power": 1,
      "description": "100% do ataque em área, mais 45% do escudo armazenado. Consome o escudo e expõe a defesa por 2 turnos. Concede escudo de 8% à equipe após a conversão.",
      "shieldScale": 0.45,
      "effect": "expose",
      "secondary": {
        "kind": "shield",
        "target": "allies",
        "power": 0.08
      }
    },
    "specialty": "Espelho elemental"
  },
  "saira": {
    "role": "Suporte",
    "identity": "Voz que purifica e prepara ofensivas",
    "synergy": "Remove queimadura, sangramento e marcas. Seu supremo fortalece aliados já preparados para atacar.",
    "stats": {
      "hp": 1140,
      "attack": 181,
      "defense": 100,
      "speed": 101
    },
    "basic": {
      "name": "",
      "kind": "damage",
      "power": 0.7,
      "description": "70% do ataque e ataque inimigo −20% por 2 turnos. Recupera 24 de energia.",
      "effect": "weaken"
    },
    "skill": {
      "name": "Maré de éter",
      "kind": "healAll",
      "power": 0.12,
      "description": "Cura 12% da vida máxima de toda a equipe; depois remove efeitos negativos.",
      "effect": "cleanse"
    },
    "ultimate": {
      "name": "Coro das constelações",
      "kind": "healAll",
      "power": 0.22,
      "description": "Cura 22% da vida da equipe e concede Égide elemental por 2 turnos: −20% do dano direto com vantagem de afinidade.",
      "effect": "elementalWard"
    },
    "specialty": "Amparo elemental"
  },
  "astra": {
    "role": "Dano",
    "identity": "Cartógrafa que abre uma janela de explosão",
    "synergy": "Seu Selo aumenta o próximo golpe de qualquer aliado. Defesa exposta fortalece seu supremo.",
    "stats": {
      "hp": 978,
      "attack": 276,
      "defense": 70,
      "speed": 104
    },
    "basic": {
      "name": "",
      "kind": "damage",
      "power": 1,
      "description": "Estilhaço direto de 100% do ataque. Recupera 24 de energia."
    },
    "skill": {
      "name": "Selo da órbita",
      "kind": "damage",
      "power": 1.25,
      "description": "125% do ataque e Selo astral por 2 turnos. O próximo golpe aliado causa +25% de dano e consome o Selo.",
      "effect": "focus"
    },
    "ultimate": {
      "name": "Colapso celeste",
      "kind": "aoe",
      "power": 1.85,
      "description": "185% do ataque em área; contra defesa exposta: +30% de dano.",
      "combo": {
        "status": "expose",
        "multiplier": 1.3,
        "consume": false
      }
    },
    "specialty": "Explosão em área"
  },
  "vesper": {
    "role": "Tanque",
    "identity": "Duelista que protege por contra-ataques",
    "synergy": "Atrai golpes individuais, enfraquece rivais e responde com uma riposta enquanto mantém escudo.",
    "stats": {
      "hp": 1320,
      "attack": 211,
      "defense": 108,
      "speed": 76
    },
    "basic": {
      "name": "",
      "kind": "damage",
      "power": 0.8,
      "description": "80% do ataque e ataque inimigo −20% por 2 turnos. Recupera 24 de energia.",
      "effect": "weaken"
    },
    "skill": {
      "name": "Guarda do eclipse",
      "kind": "shield",
      "power": 0.14,
      "description": "Escudo próprio de 14%. Provocação e Riposta por 2 turnos pessoais: atrai golpes individuais e responde com 30% do ataque, mas a defesa de Vesper cai 25% enquanto provoca. Área continua atingindo todos.",
      "self": true,
      "effect": "taunt",
      "extraEffect": "riposte",
      "duration": 2
    },
    "ultimate": {
      "name": "Eclipse absoluto",
      "kind": "aoe",
      "power": 1.1,
      "description": "110% do ataque em área, ataque inimigo −20% por 2 turnos e cura própria de 8%.",
      "effect": "weaken",
      "secondary": {
        "kind": "heal",
        "target": "actor",
        "power": 0.08
      }
    },
    "specialty": "Provocador de duelo"
  },
  "maura": {
    "role": "Suporte",
    "identity": "Tecelã que transforma feridas em sustento",
    "synergy": "Nima abre sangramento e Noct aplica marcas; qualquer uma dessas aflições aumenta a cura do Pacto.",
    "stats": {
      "hp": 1190,
      "attack": 188,
      "defense": 101,
      "speed": 93
    },
    "basic": {
      "name": "",
      "kind": "damage",
      "power": 0.7,
      "description": "70% do ataque e Marca obscura por 2 turnos: 3,5% da vida por ativação; o autor recupera 60% do dano periódico real. Recupera 24 de energia.",
      "effect": "darkmark"
    },
    "skill": {
      "name": "Pacto silencioso",
      "kind": "damage",
      "power": 0.9,
      "description": "90% do ataque e enfraquecimento por 2 turnos. Cura o aliado mais ferido em 14%; contra sangramento ou marca obscura, cura 21%.",
      "effect": "weaken",
      "secondary": {
        "kind": "heal",
        "target": "lowestAlly",
        "power": 0.14,
        "multiplier": 1.5,
        "whenStatuses": [
          "bleed",
          "darkmark"
        ]
      }
    },
    "ultimate": {
      "name": "Réquiem das sombras",
      "kind": "supportAll",
      "power": 0,
      "description": "Purifica a equipe e entrega até +20 de energia a cada aliado.",
      "effect": "cleanse",
      "secondary": {
        "kind": "energy",
        "target": "allies",
        "amount": 20
      }
    },
    "specialty": "Drenagem vital"
  },
  "riven": {
    "role": "Dano",
    "identity": "Executor que prepara a própria oportunidade",
    "synergy": "Sangramento aliado habilita seu combo. Alvos abaixo de 35% da vida ficam mais expostos à finalização.",
    "stats": {
      "hp": 996,
      "attack": 263,
      "defense": 76,
      "speed": 107
    },
    "basic": {
      "name": "",
      "kind": "damage",
      "power": 0.8,
      "description": "80% do ataque e sangramento por 2 turnos. Recupera 24 de energia.",
      "effect": "bleed"
    },
    "skill": {
      "name": "Dívida de sangue",
      "kind": "damage",
      "power": 1.6,
      "description": "160% do ataque; contra sangramento: +35%. Contra alvos abaixo de 35% da vida: mais +30%.",
      "combo": {
        "status": "bleed",
        "multiplier": 1.35,
        "consume": false
      },
      "executeThreshold": 0.35,
      "executeMultiplier": 1.3
    },
    "ultimate": {
      "name": "Última lembrança",
      "kind": "damage",
      "power": 2.65,
      "description": "265% do ataque em um alvo. Contra sangramento: +25%, consumindo a ferida.",
      "combo": {
        "status": "bleed",
        "multiplier": 1.25,
        "consume": true
      }
    },
    "specialty": "Duelista de feridas"
  },
  "torv": {
    "role": "Dano",
    "identity": "Demolidor que procura golpes críticos",
    "synergy": "Queimadura de Cindra ou Rhazen abre sua janela de crítico; Exposição de aliados facilita a ruptura.",
    "stats": {
      "hp": 1062,
      "attack": 235,
      "defense": 86,
      "speed": 88
    },
    "basic": {
      "name": "Punho de magma",
      "kind": "damage",
      "power": 0.9,
      "description": "90% do ataque e queimadura por 2 turnos. Recupera 24 de energia.",
      "effect": "burn"
    },
    "skill": {
      "name": "Ponto de fusão",
      "kind": "damage",
      "power": 1.4,
      "description": "140% do ataque, +35 pontos de chance crítica. Contra queimadura: +15% de dano, sem consumir.",
      "criticalChance": 0.35,
      "combo": {
        "status": "burn",
        "multiplier": 1.15,
        "consume": false
      }
    },
    "ultimate": {
      "name": "Ruptura vulcânica",
      "kind": "damage",
      "power": 2.35,
      "description": "235% do ataque em um alvo, +25 pontos de chance crítica e defesa exposta por 2 turnos.",
      "criticalChance": 0.25,
      "effect": "expose"
    },
    "specialty": "Demolidor crítico"
  },
  "brin": {
    "role": "Suporte",
    "identity": "Oráculo que limpa feridas persistentes",
    "synergy": "Purifica sangramento e marcas; a Semente deixa a cura chegar também aos atacantes de outras classes.",
    "stats": {
      "hp": 1140,
      "attack": 177,
      "defense": 98,
      "speed": 99
    },
    "basic": {
      "name": "Orbe de seiva",
      "kind": "damage",
      "power": 0.65,
      "description": "65% do ataque e Semente por 2 turnos. O próximo atacante se cura em 10% da própria vida máxima. Recupera 24 de energia.",
      "effect": "seed"
    },
    "skill": {
      "name": "Sopro verdejante",
      "kind": "heal",
      "power": 0.18,
      "effect": "cleanse",
      "cooldown": 1,
      "description": "Cura 18% da vida de um aliado e depois purifica efeitos negativos. Recarga de 1 ação."
    },
    "ultimate": {
      "name": "Canção do mundo",
      "kind": "healAll",
      "power": 0.2,
      "effect": "regen",
      "description": "Cura 20% da vida da equipe e concede regeneração por 2 turnos."
    },
    "specialty": "Purificador"
  },
  "bast": {
    "role": "Tanque",
    "identity": "Muralha que intercepta por um aliado",
    "synergy": "Divide o golpe individual recebido pelo aliado protegido; barreiras de outros técnicos ajudam Bast a suportar essa carga.",
    "stats": {
      "hp": 1450,
      "attack": 184,
      "defense": 126,
      "speed": 63
    },
    "basic": {
      "name": "Impacto hidráulico",
      "kind": "damage",
      "power": 0.75,
      "description": "75% do ataque e ataque inimigo −20% por 2 turnos. Recupera 24 de energia.",
      "effect": "weaken"
    },
    "skill": {
      "name": "Linha de interceptação",
      "kind": "shield",
      "power": 0.18,
      "effect": "cover",
      "description": "Escudo de 18% em um aliado. Bast recebe 25% de seus golpes individuais por 2 turnos; golpes em área atingem normalmente. O aliado recebe 15% menos dano por 2 turnos.",
      "extraEffect": "fortify"
    },
    "ultimate": {
      "name": "Bastião magnético",
      "kind": "shieldAll",
      "power": 0.14,
      "effect": "fortify",
      "description": "Escudo de 14% e redução de dano de 15% para a equipe por 2 turnos."
    },
    "specialty": "Interceptador"
  },
  "ivo": {
    "role": "Dano",
    "identity": "Peregrino que espalha aflições existentes",
    "synergy": "Transmite uma queimadura, sangramento ou marca obscura já aplicada, mantendo a duração restante e a origem da marca.",
    "stats": {
      "hp": 1006,
      "attack": 241,
      "defense": 78,
      "speed": 110
    },
    "basic": {
      "name": "Dardo de fenda",
      "kind": "damage",
      "power": 0.8,
      "description": "80% do ataque e defesa exposta por 2 turnos. Recupera 24 de energia.",
      "effect": "expose"
    },
    "skill": {
      "name": "Eco entre mundos",
      "kind": "damage",
      "power": 1.15,
      "description": "115% do ataque. Copia uma queimadura, sangramento ou marca do alvo para outro inimigo vivo, com a duração restante. Não cria nem acumula aflições.",
      "spread": true
    },
    "ultimate": {
      "name": "Horizonte quebrado",
      "kind": "aoe",
      "power": 1.5,
      "effect": "weaken",
      "description": "150% do ataque em área e ataque inimigo −20% por 2 turnos. Concede escudo de 6% à equipe.",
      "secondary": {
        "kind": "shield",
        "target": "allies",
        "power": 0.06
      }
    },
    "specialty": "Manipulador de aflições"
  },
  "noct": {
    "role": "Dano",
    "identity": "Vigia que executa uma presa marcada",
    "synergy": "Maura prepara marcas, Nima fornece sangramento e Ivo espalha a aflição. Noct converte uma dessas aberturas em dano concentrado.",
    "stats": {
      "hp": 1072,
      "attack": 240,
      "defense": 88,
      "speed": 82
    },
    "basic": {
      "name": "Garra noturna",
      "kind": "damage",
      "power": 0.8,
      "description": "80% do ataque e Marca obscura por 2 turnos: drena 3,5% da vida por ativação; o autor recupera 60% do dano periódico real. Recupera 24 de energia.",
      "effect": "darkmark"
    },
    "skill": {
      "name": "Cobrança do vazio",
      "kind": "damage",
      "power": 1.45,
      "description": "145% do ataque. Contra marca obscura ou sangramento: +25%, consumindo apenas uma dessas aflições.",
      "combo": {
        "statuses": [
          "darkmark",
          "bleed"
        ],
        "multiplier": 1.25,
        "consume": true
      }
    },
    "ultimate": {
      "name": "Noite sem fim",
      "kind": "damage",
      "power": 2.4,
      "description": "240% do ataque em uma presa. Contra marca ou sangramento: +20%. Abaixo de 35% da vida: mais +20%.",
      "combo": {
        "statuses": [
          "darkmark",
          "bleed"
        ],
        "multiplier": 1.2,
        "consume": false
      },
      "executeThreshold": 0.35,
      "executeMultiplier": 1.2
    },
    "specialty": "Executor de marcas"
  },
  "auren": {
    "role": "Tanque",
    "identity": "Juramento que protege e purifica um aliado",
    "synergy": "Remove aflições de quem precisa continuar agindo; sua égide resiste à vantagem de afinidade. Solen aproveita o enfraquecimento do julgamento.",
    "specialty": "Juramento purificador",
    "stats": {
      "hp": 1410,
      "attack": 180,
      "defense": 120,
      "speed": 78
    },
    "basic": {
      "name": "Lança radiante",
      "kind": "damage",
      "power": 0.75,
      "description": "75% do ataque e escudo próprio de 2% da vida máxima. Recupera 24 de energia.",
      "secondary": {
        "kind": "shield",
        "target": "actor",
        "power": 0.02
      }
    },
    "skill": {
      "name": "Aurora protetora",
      "kind": "shield",
      "power": 0.18,
      "effect": "cleanse",
      "extraEffect": "elementalWard",
      "description": "Escudo de 18% da vida máxima em um aliado, purifica efeitos negativos e concede Égide elemental por 2 turnos: −20% do dano direto com vantagem de afinidade."
    },
    "ultimate": {
      "name": "Julgamento da aurora",
      "kind": "aoe",
      "power": 1.05,
      "effect": "weaken",
      "description": "105% do ataque em todos os rivais e ataque inimigo −20% por 2 turnos. Concede escudo de 6% da vida máxima a cada aliado.",
      "secondary": {
        "kind": "shield",
        "target": "allies",
        "power": 0.06
      }
    }
  },
  "elyra": {
    "role": "Suporte",
    "identity": "Faroleira que acolhe feridas antes da próxima travessia",
    "synergy": "Cura antes de purificar, preservando a regra do sangramento. Barreiras pequenas dão tempo para aliados frágeis responderem.",
    "specialty": "Renovação protegida",
    "stats": {
      "hp": 1100,
      "attack": 159,
      "defense": 100,
      "speed": 98
    },
    "basic": {
      "name": "Raio de alvorada",
      "kind": "damage",
      "power": 0.65,
      "description": "65% do ataque. Recupera 24 de energia."
    },
    "skill": {
      "name": "Luz que acolhe",
      "kind": "heal",
      "power": 0.2,
      "effect": "cleanse",
      "description": "Cura 20% da vida máxima de um aliado, depois purifica efeitos negativos e concede escudo de 4%.",
      "secondary": {
        "kind": "shield",
        "target": "target",
        "power": 0.04
      }
    },
    "ultimate": {
      "name": "Segundo amanhecer",
      "kind": "healAll",
      "power": 0.16,
      "effect": "cleanse",
      "description": "Cura 16% da vida máxima da equipe, depois purifica efeitos negativos e concede escudo de 6% a cada aliado vivo.",
      "secondary": {
        "kind": "shield",
        "target": "allies",
        "power": 0.06
      }
    }
  },
  "solen": {
    "role": "Dano",
    "identity": "Monge que abre e consome janelas de enfraquecimento",
    "synergy": "Seu selo reduz o ataque rival. Mil sóis consome essa abertura, inclusive quando criada por Oren, Saira ou Auren.",
    "specialty": "Horizonte vulnerável",
    "stats": {
      "hp": 1040,
      "attack": 249,
      "defense": 84,
      "speed": 106
    },
    "basic": {
      "name": "Palma luminosa",
      "kind": "damage",
      "power": 1,
      "description": "100% do ataque. Recupera 24 de energia."
    },
    "skill": {
      "name": "Selo do horizonte",
      "kind": "aoe",
      "power": 0.9,
      "effect": "weaken",
      "description": "90% do ataque em todos os rivais e ataque inimigo −20% por 2 turnos."
    },
    "ultimate": {
      "name": "Mil sóis",
      "kind": "aoe",
      "power": 1.65,
      "description": "165% do ataque em todos os rivais. Contra enfraquecimento: +20% e consome apenas esse efeito.",
      "combo": {
        "status": "weaken",
        "multiplier": 1.2,
        "consume": true
      }
    }
  },
  "zaya": {
    "role": "Suporte",
    "identity": "Mensageira que devolve o ritmo à equipe",
    "synergy": "Pequenas curas e energia distribuída ajudam aliados de qualquer afinidade a alcançar suas técnicas; a renovação continua limitada pela Fratura.",
    "specialty": "Mensageira de energia",
    "stats": {
      "hp": 1010,
      "attack": 182,
      "defense": 78,
      "speed": 113
    },
    "basic": {
      "name": "Flecha do poente",
      "kind": "damage",
      "power": 0.7,
      "description": "70% do ataque. Recupera 24 de energia."
    },
    "skill": {
      "name": "Bênção do crepúsculo",
      "kind": "healAll",
      "power": 0.1,
      "description": "Cura 10% da vida máxima da equipe e entrega até 6 de energia por aliado vivo.",
      "secondary": {
        "kind": "energy",
        "target": "allies",
        "amount": 6
      }
    },
    "ultimate": {
      "name": "Asas da eternidade",
      "kind": "healAll",
      "power": 0.18,
      "effect": "cleanse",
      "description": "Cura 18% da vida máxima da equipe, depois purifica efeitos negativos e entrega até 10 de energia por aliado vivo. Não ressuscita.",
      "secondary": {
        "kind": "energy",
        "target": "allies",
        "amount": 10
      }
    }
  }
};

export function applyKit(hero) {
  const kit = KITS[hero.id];
  const {hp,attack,defense,speed} = kit.stats;
  const result = { ...hero, role:kit.role, identity:kit.identity, synergy:kit.synergy, specialty:kit.specialty, hp,attack,defense,speed };
  for (const id of ['basic','skill','ultimate']) result[id] = {...hero[id], effect:undefined, ...kit[id], name:kit[id].name || hero[id].name};
  for (const id of ['basic','skill','ultimate']) {
    const a = result[id];
    if (a.kind.startsWith('shield') || a.secondary?.kind === 'shield') a.description += ' Cada aplicação dura 2 rodadas globais; camadas somam até 25% da vida, com expiração independente.';
    if (a.effect === 'bleed') a.description += ' Sangramento reduz toda cura recebida em 35% enquanto durar.';
  }
  // JSON and runtime must expose the same keys.
  return JSON.parse(JSON.stringify(result));
}
