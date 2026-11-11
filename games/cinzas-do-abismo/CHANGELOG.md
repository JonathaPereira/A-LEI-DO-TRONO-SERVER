# Changelog — Cinzas do Abismo

Todas as modificações notáveis de **Cinzas do Abismo** na evolução da **Operação Renascimento 1.0**.

---

## [1.0.0-renascimento] — 2026-11-11

### Expansão da Campanha e Níveis
- **25 Capítulos em 5 Regiões:** A campanha foi expandida dos 15 capítulos originais (3 regiões) para 25 capítulos completos distribuídos uniformemente em 5 regiões temáticas: Profundezas, Catacumbas Suspensas, Forja Vulcânica, Caverna de Gelo e Alvorecer Sombrio.
- **Marcos de Exploração e Segredos Destrutíveis:**
  - Adicionado o **Relicário do Eclipse** (`eclipse-cache`) no Capítulo 8 (estágio 7), concedendo bônus de vida máxima e rerolls.
  - Adicionada a **Urna do Degelo** (`thaw-urn`) no Capítulo 18 (estágio 17), concedendo purificação e atributos de vida permanente.
  - Adicionado o **Sino da Vigília** no Capítulo 22 (estágio 21), abrindo rotas elevadas secretas.
  - Adicionado o **Condutor do Alvorecer** (`dawn-conductor`) no confronto do Capítulo 25 (estágio 24), desativando as colunas defensivas do chefe final.
- **Continuação e Checkpoints Atômicos:** Implementada continuação de expedição em marcos de capítulos com restauração de vida, cartas e inventário, mantendo independência estrita do modo Horda.

### Sistema de Combate e Legado
- **6 Pilares de Combate Revisados:** Dano, cadência de tiro, caixas de colisão AABB, esquiva com frames de invulnerabilidade (`invincibleTimer`), resistências a dano base e estados alterados (queimadura e congelamento rúnico).
- **Variantes Táticas do Legado:** Implementadas quatro variantes avançadas desbloqueadas por progressão permanente (Lâmina Vorpal no cap. 5, Arco Fraturado no cap. 10, Rompe-Mundos no cap. 15 e Báculo de Zero Absoluto no cap. 20).
- **Runas Permanentes:** Desbloqueio da Runa de Gelo (capítulo 20) e Runa de Fogo (capítulo 25).
- **Mitigação de Combate Pós-Derrota:** O loop de atualização encerra imediatamente o processamento de dano ao detectar a morte do jogador no mesmo quadro, garantindo telas de derrota coerentes sem mortes fantasmas após o fim da partida.

### Interface, Menus e Acessibilidade
- **7 Fluxos de Navegação Contratuais:** Continuar, Nova Campanha, Seleção de Regiões, Legado/Progressão, Configurações, Créditos e Sair.
- **Proteção Contra Substituição Acidental:** Diálogo de confirmação com foco acessível antes de sobrescrever campanhas em andamento.
- **Acessibilidade Visual e Sonora:** Opção explícita para redução de tremor de tela (`reducedShake`), atalhos com remapeamento completo de 11 teclas e controle independente de volume por barramento.

### Persistência e Resiliência
- **Formato Unificado v3 (`cinzas-save`):** Agrega recordes de Horda, checkpoint de Horda, checkpoint de Campanha e perfil do Legado.
- **Compatibilidade Retroativa:** Importação e suporte completo a formatos legados v1 e v2.
- **Rejeição Estrita de Corrupção:** Rejeição atômica de payloads com mais de 2MB, chaves desconhecidas ou integridade violada.

---

## [0.2.0] — Versão Pré-Renascimento

- Implementação inicial de 15 capítulos distribuídos em 3 regiões básicas.
- Modo Horda experimental sem separação de dados de campanha.
- Ausência de sistema de continuação por marcos.
- 4 armas básicas sem variantes de Legado.
