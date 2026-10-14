# Windows 0.1.17 · Love Letter e nova mesa do Splendor

Love Letter, segunda edição (2019), entra no catálogo para 2–6 participantes, mesas online e bots, com as regras e efeitos das 21 cartas. A mesa segue o conceito aprovado: veludo vinho, moldura de madeira, cartas em pergaminho e personagens originais. A chamada permanece conectada enquanto você joga ou navega. No Splendor, ilustrações renovadas, custos verticais, bônus evidentes, novos versos e uma mesa azul com banco e nobres reorganizados.

## Ordem de publicação

1. Se você já executou `supabase/upgrade-splendor.sql` na versão 0.1.16, **não há novo SQL nesta atualização**. Love Letter não cria tabelas no Supabase. Se pulou a 0.1.16, execute `upgrade-splendor.sql` uma vez para ativar os recordes do Splendor; Azul continua com sua própria migração anterior.
2. Faça merge do PR aprovado. Aguarde o backend do Render ficar Live com **0.12.0-alpha** e confira `/health`: `features.loveLetter` e `features.splendor` devem ser `true`.
3. Aguarde o workflow **Windows full app** do merge terminar com sucesso.
4. Entre na sua conta GitHub, abra as [Releases privadas](https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases) e baixe **MN-Trono-Frontend-0.1.17.zip** da entrega mais recente, gerada após o merge.
5. Extraia em uma pasta nova. O ZIP contém `frontend`, instruções e as migrações anteriores, caso ainda precise delas. Na pasta `frontend`, execute:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

6. Confira `https://a-lei-do-trono.surge.sh/downloads/latest.yml`: `version: 0.1.17`. O pacote leva somente `MN-Trono-0.1.17-Windows.exe` e o manifesto correspondente. Não misture com pastas antigas. Os backups privados mantêm a versão atual e a anterior.
7. Os aplicativos instalados podem buscar e instalar a 0.1.17 internamente, diretamente, mesmo se estiverem várias versões atrás. Instalações novas usam o botão de desktop no login. Mesma identidade e dados locais do aplicativo.

## Love Letter · regras desta edição

- 21 cartas: 2 Espiãs (0), 6 Guardas (1), 2 Sacerdotes (2), 2 Barões (3), 2 Aias (4), 2 Príncipes (5), 2 Chanceleres (6), 1 Rei (7), 1 Condessa (8), 1 Princesa (9).
- Uma carta separada oculta; com duas pessoas, mais três cartas removidas de face para cima. Compra automática no início do turno, escolha da carta e alvo, palpite da Guarda, informação privada do Sacerdote e ordenação privada do Chanceler.
- Condessa obrigatória com Príncipe/Rei, proteção até o próximo turno e Príncipe escolhendo a si mesmo quando necessário. Princesa jogada/descartada elimina; baralho esgotado durante o Príncipe usa a carta separada.
- Só uma pessoa sobrevivente ou baralho vazio depois dos efeitos encerra a rodada. Maior mão vence; empatados recebem um favor cada, sem soma dos descartes. Espiã dá um favor extra se só um sobrevivente a jogou/descartou.
- Metas: 6 favores (2 pessoas), 5 (3), 4 (4), 3 (5–6). Vitória compartilhada quando várias pessoas alcançam a meta no mesmo fim de rodada. Vencedor inicia a próxima rodada; em empate, sorteio entre vencedores. Convenção de preparação: o primeiro jogador da partida é sorteado.
- Regras acessíveis no jogo. Fullscreen e alternativa de tela ampliada; layouts Original e Discord, monitores verticais e pequenos; movimento reduzido respeitado.

## Dados e limites

O servidor valida toda jogada; nenhuma pontuação ou mão adversária é aceita do cliente. Mãos, baralho e cartas separadas são filtrados por participante. Descartes e revelação final são públicos; informações vistas pelo Sacerdote são históricas e podem ficar desatualizadas após trocas.

Reconexão de cadeira por 90 segundos; saída explícita ou expiração transfere para bot. O anfitrião inicia cada próxima rodada, dando tempo de ler resultados. As mesas de Love Letter ficam em memória e não sobrevivem a um reinício do backend. Não há ranking permanente de Love Letter nesta entrega. Os rankings de Azul e Splendor continuam no Supabase.

As ilustrações são próprias, inspiradas na direção visual aprovada. Não foram incluídos scans ou assets extraídos de versões comerciais. Os originais e as prévias ficam fora do frontend publicado para economizar espaço. A proteção de 190 MiB do empacotamento permanece ativa.
