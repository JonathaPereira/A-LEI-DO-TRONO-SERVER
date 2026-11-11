# Manual do Jogador — Cinzas do Abismo

Bem-vindo a **Cinzas do Abismo**, um roguelite de ação, combate tático, construção de baralhos e exploração por capítulos desenvolvido pela MeNCorp.

---

## 1. Controles e Atalhos

O jogo suporta teclado completo e controles mapeáveis com resolução atômica de conflitos:

| Ação | Tecla Padrão | Descrição |
| :--- | :---: | :--- |
| **Mover para a Esquerda** | `A` ou `Seta Esquerda` | Desloca o herói para a esquerda |
| **Mover para a Direita** | `D` ou `Seta Direita` | Desloca o herói para a direita |
| **Pular** | `W`, `Espaço` ou `Seta Cima` | Salto vertical (permite pulo duplo com upgrade) |
| **Abaixar / Descer Plataforma** | `S` ou `Seta Baixo` | Agacha ou atravessa plataformas permeáveis |
| **Ataque Principal** | `J` ou `Clique Esquerdo` | Dispara o ataque primário da arma equipada |
| **Esquiva (Dash)** | `K` ou `Shift` | Deslocamento rápido com frames de invulnerabilidade |
| **Interagir / Usar Santuário** | `E` | Interage com baús, relicários, santuários e portais |
| **Pausar Jogo** | `Escape` ou `P` | Abre o menu de pausa e suspende a simulação |
| **Alternar Tela Cheia** | `F11` | Alterna modo de janela e tela cheia |
| **Acessibilidade: Tremor Reduzido** | Menu de Opções | Atenua vibrações de tela causadas por impactos |

---

## 2. As Quatro Armas Fundamentais e Variantes do Legado

Ao longo da expedição, você desbloqueará variantes táticas no **Legado Permanente**:

### 1. Espada das Cinzas (`ash_blade`)
- **Papel:** Combate corpo a corpo equilibrado, alta cadência e corte em arco.
- **Variante do Legado — Lâmina Vorpal (Capítulo 5):** Aumenta a chance e o dano crítico em troca de uma leve redução no alcance do corte.

### 2. Arco do Eco (`echo_bow`)
- **Papel:** Ataque à distância com flechas perfurantes e precisão linear.
- **Variante do Legado — Arco Fraturado (Capítulo 10):** Dispara flechas adicionais em leque que ricocheteiam no ambiente, com recarga ligeiramente maior.

### 3. Martelo da Fenda (`rift_hammer`)
- **Papel:** Impacto pesado, dano concentrado e onda de choque em área.
- **Variante do Legado — Rompe-Mundos (Capítulo 15):** Amplia a área da onda de choque em 50% e atordoa inimigos frágeis, com animação de golpe mais lenta.

### 4. Cajado da Geada (`frost_staff`)
- **Papel:** Projéteis mágicos que aplicam lentidão e congelamento contínuo.
- **Variante do Legado — Báculo de Zero Absoluto (Capítulo 20):** Congela alvos instantaneamente ao aplicar 3 cargas, reduzindo a velocidade de ataque base.

---

## 3. Runas Permanentes do Legado

Conquistar marcos profundos no Abismo desbloqueia runas que modificam todas as futuras expedições:

- **Runa de Gelo (Desbloqueada no Capítulo 20):** Seus ataques aplicam lentidão passiva (`frozenTimer`), desacelerando o movimento e a cadência de projéteis inimigos em 30%.
- **Runa de Fogo (Desbloqueada no Capítulo 25):** Golpes críticos inflamam os inimigos (`burningTimer`), causando dano contínuo proporcional à vida máxima por 3 segundos.

---

## 4. Estrutura da Campanha: 5 Regiões e 25 Capítulos

A campanha principal é dividida em 5 biomas com 5 capítulos cada (totalizando 25 estágios):

1. **Região I — As Profundezas (Capítulos 1 a 5):** Terrenos escavados, morcegos abissais, rastejantes e o chefe Arconte das Profundezas.
2. **Região II — As Catacumbas Suspensas (Capítulos 6 a 10):** Ruínas góticas, plataformas móveis, aparições e o Relicário do Eclipse.
3. **Região III — A Forja Vulcânica (Capítulos 11 a 15):** Rios de lava, golens de escória, armaduras pesadas e altas temperaturas.
4. **Região IV — A Caverna de Gelo (Capítulos 16 a 20):** Pisos escorregadios, estalactites gélidas, a Urna do Degelo e o Sino da Vigília.
5. **Região V — O Alvorecer Sombrio (Capítulos 21 a 25):** Cidadela ancestral, tempestades temporais, o Condutor do Alvorecer e o Chefe Final do Abismo.

---

## 5. Marcos de Exploração e Segredos Destrutíveis

Não se limite ao caminho direto! As salas contêm segredos vitais:

- **Relicário do Eclipse (Capítulo 8 / Estágio 7):** Localizado numa plataforma superior acessível com salto duplo. Destruí-lo concede +10% de vida máxima, +1 reroll de cartas e 50 pontos bônus.
- **Urna do Degelo (Capítulo 18 / Estágio 17):** Oculta sob um teto de gelo frágil. Ao ser quebrada, concede purificação imediata de debuffs e +15 de vida permanente.
- **Sino da Vigília (Capítulo 22 / Estágio 21):** Santuário rúnico que abre uma rota elevada secreta permitindo contornar emboscadas de elites.
- **Condutor do Alvorecer (Capítulo 25 / Estágio 24):** No confronto final, quebrar este monolito elétrico desativa as colunas ambientais mortais, deixando o chefe vulnerável a dano direto.

> **Regra de Continuidade:** A destruição de objetos e relicários só é gravada de forma definitiva após a vitória na sala (`cleared = true`), impedindo duplicação de vantagens.

---

## 6. As 36 Cartas de Melhoria

A cada sala limpa ou marco conquistado, você seleciona melhorias distribuídas entre:
- **Ataque e Dano:** Afiação, Fúria, Golpe Mortal, Fio Fantasma, Ruptura de Guarda.
- **Defesa e Vitalidade:** Pele de Pedra, Bênção da Vitalidade, Égide Rúnica, Esquiva Ágil.
- **Sinergias Elementais:** Centelha Viva, Geada Cortante, Veneno Alquímico, Explosão Ressoante.
- **Utilidade e Economia:** Magnetismo de Essências, Segundo Fôlego, Visão de Caçador.

---

## 7. Modo Horda e Sobrevivência

Para além da Campanha, o modo **Horda** desafia o jogador a sobreviver contra ondas intermináveis de monstros em arena fechada:
- Dificuldade progressiva por minuto.
- Recorde registrado e preservado separadamente da campanha.
- Nenhum marco de checkpoint: derrota encerra a corrida.

---

## 8. Persistência, Backups e Salvamento Atômico

O jogo utiliza o formato unificado de salvamento **v3** (`cinzas-save`):
- Seus dados de Campanha, Horda, Legado e Configurações ficam protegidos contra travamentos através de gravações atômicas e validação de integridade.
- Backups podem ser exportados e restaurados a qualquer momento pelo menu de opções, garantindo total segurança do seu progresso histórico.
