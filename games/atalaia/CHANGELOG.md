# Changelog — Atalaia: Guardiões do Cristal

Todas as modificações notáveis de **Atalaia: Guardiões do Cristal** na evolução da **Operação Renascimento 1.0**.

---

## [1.0.0-renascimento] — 2026-11-11

### Conteúdo e Modos de Jogo
- **A Crônica (5 Atos / 30 Fases):** Criação da campanha narrativa completa estruturada em 5 atos com 6 fases cada em `data/chronicle-phases.json`, com objetivos de integridade do Cristal, mapas e recompensas progressivas.
- **6 Novas Torretas Avançadas:** Implementação do Obelisco Solar, Guardião de Raízes, Canhão Sísmico, Farol Espectral, Forja de Cinzas e Arpão do Abismo, cada uma com mecânica tática própria, glyphs dedicados e custo balanceado.
- **Modo Sobrevivência Infinita:** Modo de resistência progressiva com registro isolado de recorde.

### Inimigos e Mecânicas de Combate
- **Catálogo de Inimigos Expandido:** Integração de 12 tipos de invasores com velocidades anatômicas e armaduras balanceadas.
- **Segundas Fases dos 5 Chefes:**
  - Onda 6: Convocação de matilha de lobos velozes pelo Guardião das Raízes.
  - Onda 12: Ninhada de tecelãs e divisão em filhotes pela Matriarca.
  - Onda 18: Escolta de golem e armadura rúnica de 33% pela Sentinela da Cidadela.
  - Onda 24: Proteção mútua de escoltas pelo Guardião da Escória.
  - Confronto Final: Pulso periódico anunciado de interferência com contagem regressiva legível.
- **Unidades Especiais:** Arauto com aura de marcha (aceleração de 20%) e Sabotador com interferência direcional de 1,2s.

### Economia e Progressão Estratégica
- **Árvores de Especialização:** Árvores de Engenharia, Proteção e Conhecimento com limiares em 5 e 10 ondas, gravadas com resiliência atômica (.tmp, .bak e .invalid.bak).
- **Cartas Estratégicas e Doutrinas:** 12 cartas catalogadas com paridade econômica e rerolls validados em 36 campanhas simuladas.
- **8 Conquistas Locais:** Conquistas derivadas puramente de fatos de progresso e sobrevivência.

### Audiovisual e Acessibilidade
- **Refinamento de Animações:** Ciclo de caminhada a 8 FPS, passada por espécie, bobbing vertical, flutuação senoidal de espíritos e animação suave de morte.
- **Efeitos Visuais Modernos:** Feixe de chamas em 3 camadas, raios procedurais ramificados com 3 passadas de luz, poças de ácido isométricas e dispersão física de explosões de morteiros e Canhão Sísmico com fumaça volumétrica.
- **Áudio de Fantasia:** Arquitetura de barramentos em Godot com Compressor dinâmico anti-clipping no Master e Reverb de estúdio no bus de efeitos, 19 amostras OGG gravadas em alta resolução e jitter estocástico de afinação (pitch shifting).
- **Remapeamento e Acessibilidade:** 11 comandos remapeáveis e modo de efeitos visuais reduzidos (`reduced_effects`).

---

## [0.2.0] — Versão Pré-Renascimento

- Projeto Godot inicial com 3 territórios básicos e 15 ondas determinísticas.
- 6 torretas básicas sem especializações avançadas.
- Ausência de campanha narrativa ou modo Crônica.
- Árvores de progressão e conquistas inexistentes.
