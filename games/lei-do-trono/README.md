# A Lei do Trono (Standalone / MeN Games)

**Projeto:** A Lei do Trono  
**Versão:** 0.14.0-alpha  
**Categoria:** Estratégia / Cartas / Blefe / Votação de Leis  
**Capacidade:** 2 a 4 Jogadores  
**Integração:** MeN Games (catálogo sob demanda) & MeN Trono (comunicação em segundo plano)

---

## 1. Visão Geral da Arquitetura Desacoplada

Este módulo representa a extração independente de **A Lei do Trono** para o ecossistema **MeN Games**. 

O jogo funciona de forma desacoplada da plataforma de comunicação:
1. **Frontend Independente:** Apresentação da mesa, mão de cartas, votação de leis, anúncios da Corte e histórico de vazas.
2. **Backend Autoritativo:** Motor de regras compartilhadas (`throne-rules.ts`), distribuição aleatória de cartas, validação estrita de jogadas e cálculo de pontuação/assentos (`throne-service.ts`).
3. **Comunicação WebSocket:** Mensagens serializadas sob o protocolo estrito do Trono (`throne-protocol.ts`).
4. **Identidade e Sessão:** O jogador autentica-se recebendo um ticket de sessão temporário do MeN Trono / Supabase, preservando o ranking global sem expor credenciais privadas.

---

## 2. Estrutura de Diretórios do Jogo

```text
games/lei-do-trono/
├── README.md               # Esta documentação
├── assets/                 # Ativos visuais e sonoros do jogo
│   ├── cards/              # As 48 cartas dos 4 naipes (Cetro, Chave, Lâmina, Máscara)
│   ├── laws/               # SVGs das cartas de lei (Ordem, Estandarte, Revolta, etc.)
│   └── cover.webp          # Arte oficial de capa para o catálogo
├── documentation/          # Manuais e regras do jogo
│   └── manual.pdf          # Manual completo do jogo
├── frontend/               # Lógica cliente e controladores da mesa
└── backend/                # Serviço autoritativo de partidas e protocolo WebSocket
```

---

## 3. Contratos de Rede (WebSocket)

O jogo opera por eventos assíncronos via WebSocket:

### 3.1 Mensagens do Cliente para o Servidor (`client -> server`)
* `join`: Solicita entrada em um salão com identificação e assento desejado.
* `ready`: Alterna estado de prontidão do participante na sala.
* `start`: Inicia a partida após unanimidade ou confirmação do anfitrião.
* `play-card`: Envia a jogada da carta da mão do jogador autorizado da vez.
* `choose-law`: Vota ou seleciona a lei vigente da rodada.
* `leave`: Desconecta o jogador da mesa.

### 3.2 Mensagens do Servidor para o Cliente (`server -> client`)
* `throne:lobby-state`: Lista de salões abertos, assentos e status.
* `throne:game-state`: Projeção privada da mesa para o assento do jogador (mão privada oculta aos rivais).
* `throne:trick-outcome`: Revelação de vencedor da vaza e efeitos de poder da Corte.
* `throne:match-result`: Pontuação final, ranking e encerramento.

---

## 4. Preservação de Dados e Ranking

* O ranking de vitórias e histórico de partidas é persistido de forma idempotente na tabela `game_rankings` do Supabase.
* Sessões caídas temporariamente contam com a tolerância de recuperação de até 45 segundos sobre o transporte seguro.
