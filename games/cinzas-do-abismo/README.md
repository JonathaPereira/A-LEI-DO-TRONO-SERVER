# @men-games/cinzas-do-abismo

**Cinzas do Abismo** — Roguelite de cartas, exploração tática e progressão por capítulos da MeNCorp.

## Arquitetura do Pacote

Este pacote faz parte da infraestrutura independente **MeN Games**. Ele é totalmente desacoplado da aplicação de comunicação MeN Trono.

### Estrutura de Pastas

```text
games/cinzas-do-abismo/
├── package.json              # Metadados do pacote autônomo
├── README.md                 # Documentação técnica e guia do jogo
├── manifest.json             # Inventário de assets e verificação de integridade
├── core/                     # Motor lógico do jogo (DOM-free e testável)
│   ├── core.js               # Engine de combate, cartas, capítulos e monstros
│   ├── levels.js             # Definição procedural de andares e salas
│   ├── persistence.js        # Ledger de progresso, saves e backups
│   ├── controller.js         # Controlador de input e fluxo de rodadas
│   ├── rig.js                # Animações esqueléticas e transições
│   ├── audio.js              # Sintetizador e gerenciador de áudio Web Audio API
│   ├── renderer.js           # Renderizador Canvas / 2D
│   └── game.js               # Orquestrador de inicialização e ciclo de vida
├── frontend/                 # Camada de apresentação e interface web
│   ├── index.html            # Entrypoint visual com canvas e HUD
│   ├── style.css             # Folha de estilos principal
│   ├── embedded.css          # Estilos de embutimento em iframe
│   └── icon.svg              # Ícone vetorial do jogo
└── tests/                    # Suíte de testes automatizados do jogo
    └── package.test.cjs      # Verificações de integridade, engine e persistência
```

## Como Executar os Testes

```bash
node --test games/cinzas-do-abismo/tests/package.test.cjs
```
