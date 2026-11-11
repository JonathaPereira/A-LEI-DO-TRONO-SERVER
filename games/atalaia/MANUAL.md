# Manual do Jogador — Atalaia: Guardiões do Cristal

Bem-vindo a **Atalaia: Guardiões do Cristal**, um tower defense de fantasia com sistemas táticos profundos, árvores de especialização, campanha narrativa em 5 atos e combate contra chefes em fases, desenvolvido em Godot 4.

---

## 1. O Objetivo da Defesa

Sua missão é proteger o **Cristal de Atalaia** posicionado no final das rotas de invasão.
- O Cristal possui integridade inicial de **30 pontos**.
- A cada criatura que alcança o Cristal, sua integridade é reduzida pelo dano da criatura (1 para criaturas menores, até 8 para chefes).
- Se a integridade chegar a zero, a campanha ou a onda é derrotada.
- O ouro é conquistado derrotando invasores e concluindo fases, sendo usado para construir, evoluir e mover torretas.

---

## 2. As Doze Torretas de Defesa

O arsenal de Atalaia conta com 6 torretas fundamentais e 6 torretas especializadas avançadas:

### Torretas Básicas

| Torreta | Custo | Tipo / Dano | Alcance | Cadência | Função Tática |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Balista** | 70g | 17.0 | 166 | 0.60s | Ataques perfurantes com cadência alta contra corredores |
| **Morteiro** | 110g | 44.0 | 194 | 1.70s | Artilharia explosiva em área (raio de 64) contra grupos |
| **Lança-chamas** | 90g | 5.0 | 120 | 0.22s | Jato contínuo com queimadura em cone de curto alcance |
| **Tesla** | 120g | 18.0 | 150 | 1.00s | Descargas elétricas em cadeia saltando em até 3 alvos |
| **Obelisco Glacial** | 80g | 9.0 | 148 | 1.00s | Dano mágico que aplica 55% de lentidão contínua |
| **Alquimista** | 95g | 7.0 | 155 | 1.10s | Lança frascos de veneno criando poças persistentes no chão |

### Torretas Especializadas Avançadas (Operação Renascimento)

| Torreta | Custo | Família | Função Exclusiva e Diferencial Tático |
| :--- | :---: | :---: | :--- |
| **Guardião de Raízes** (`roots`) | 112g | Gelo | Aprisiona por 0,55s com raízes mágicas e aplica lentidão pesada (78%). |
| **Arpão do Abismo** (`harpoon`) | 132g | Balista | Disparo único de 41 de dano que ignora totalmente a armadura inimiga. |
| **Canhão Sísmico** (`seismic`) | 153g | Morteiro | Onda de impacto sísmico colossal em área ampliada (raio de 92) com baixa cadência. |
| **Farol Espectral** (`spectral`) | 136g | Tesla | Revela espíritos invisíveis e reduz permanentemente a armadura de alvos atingidos. |
| **Forja de Cinzas** (`ash_forge`) | 168g | Fogo | Jato térmico devastador de 15 de dano por pulso com queimadura prolongada de 10s. |
| **Obelisco Solar** (`solar`) | 158g | Balista | Raio solar concentrado que causa +60% de dano bônus contra espíritos e espectros. |

---

## 3. Árvores Estratégicas de Longo Prazo

No menu principal, você pode alocar o perfil estratégico permanente entre 3 ramificações:

1. **Engenharia:**
   - *Limiar 5 Ondas:* Fundo de Obras (+35 de ouro inicial na partida).
   - *Limiar 10 Ondas:* Arsenal Antecipado (+65 de ouro inicial na partida).
2. **Proteção:**
   - *Limiar 5 Ondas:* Manutenção Rúnica (repara 1 de integridade do Cristal a cada 3 ondas).
   - *Limiar 10 Ondas:* Reparo Reforçado (repara 2 de integridade do Cristal a cada 3 ondas).
3. **Conhecimento:**
   - *Limiar 5 Ondas:* Leitura do Cristal (oferece Tributo bônus na onda 3).
   - *Limiar 10 Ondas:* Arquivo de Cartas (oferece Tributos bônus nas ondas 3 e 8).

---

## 4. Inimigos e Segundas Fases dos Chefes

Os invasores possuem características singulares que exigem contrajogos coordenados:

- **Esqueleto:** Rápido, frágil, vulnerável a balistas.
- **Lobo:** Corredor veloz que tenta escapar pelas brechas da defesa.
- **Aranha:** Criatura ágil com armadura leve (6%).
- **Cogumelo:** Robusto com regeneração e armadura de 12%.
- **Golem:** Colosso de pedra com 260 HP e 23% de armadura.
- **Espírito:** Flutuante e resistente a ataques físicos, fraco contra Tesla e Obelisco Solar.
- **Sabotador (`sapper`):** Canaliza interferência a 140 de distância para desativar torretas por 1,2s.
- **Arauto (`herald`):** Projeta aura de marcha de 120 de raio acelerando tropas próximas em 20%.

### Segundas Fases Dedicadas dos Chefes

Ao caírem abaixo de 50% de integridade sem morrer, os chefes ativam sua segunda fase:
1. **Guardião das Raízes (Onda 6 da Crônica):** Convoca uma matilha de 2 lobos velozes.
   *Contrajogo:* Controle de movimento (gelo) e cadência de balistas.
2. **Matriarca das Raízes (Onda 12 da Crônica):** Convoca ninhada de 2 tecelãs que se dividem em filhotes ao morrer.
   *Contrajogo:* Dano em área pesado (morteiro / canhão sísmico).
3. **Sentinela da Cidadela (Onda 18 da Crônica):** Convoca golem de escolta e eleva sua armadura rúnica para 33%.
   *Contrajogo:* Perfuração (Arpão do Abismo) e dano contínuo (fogo/veneno).
4. **Guardião da Escória (Onda 24 da Crônica):** Concede proteção próxima a aliados impedindo foco fácil.
   *Contrajogo:* Caçador de Colossos e foco sustentado.
5. **Chefe Final da Coroa:** Emite pulso periódico com aviso na tela e contagem regressiva que desativa torretas na área.
   *Contrajogo:* Posicionamento espaçado de torretas nas elevações.

---

## 5. Modos de Jogo

- **A Crônica:** Campanha narrativa de 5 Atos com 6 fases cada (totalizando 30 fases progressivas).
- **Campanha Clássica:** 15 ondas determinísticas de cerco com três territórios.
- **Sobrevivência Infinita:** Enfrente ondas crescentes ilimitadas e registre seu recorde no perfil estratégico.

---

## 6. Atalhos e Controles

Remapeie os 11 comandos no menu **Opções → Teclado**:
- Construções rápidas para as 6 famílias de torretas.
- Iniciar onda / Acelerar tempo (`1x`, `2x`).
- Evoluir seleção (`U`).
- Pausar combate (`Escape` ou `P`).
- Alternar áudio e efeitos reduzidos.
