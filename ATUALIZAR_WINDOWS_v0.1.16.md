# M&N · Windows 0.1.16 — Splendor e novas capas

O catálogo agora reúne **A Lei do Trono, Azul, Cinzas do Abismo e Splendor**. Trono tem nova capa oficial com o trono, a Coroa, cetro, chave, máscara e lâmina. Azul mantém a caixa aprovada, inteira e centralizada. Splendor recebe capa, ilustrações de minas/comércio/palácios e dez retratos de nobres próprios. Títulos são texto da interface, sem cortes em telas menores. As imagens de produção usam WebP, preservando os originais para revisão e evitando duplicatas no frontend.

## Ordem de publicação

1. No Supabase, abra **SQL Editor → New query**, cole o conteúdo completo de **supabase/upgrade-splendor.sql** e clique em **Run**. Também há uma cópia `upgrade-splendor.sql` na raiz do ZIP de publicação. Essa migração cria apenas o ranking do novo jogo; pode ser repetida. Se você já aplicou `upgrade-azul.sql`, não precisa aplicá-lo novamente.
2. Faça merge do PR com o workflow **Windows full app** aprovado. O backend passa a **0.11.0-alpha** e precisa ser publicado no Render, pela branch `main`. Se não houver deploy automático, use **Manual Deploy → Deploy latest commit**. Aguarde o serviço ficar **Live**.
3. Abra `/health` do backend e confira `features.splendor: true`. Uma partida não depende do ranking estar disponível, mas recordes permanentes precisam do SQL e das credenciais do Supabase já utilizadas pelo servidor.
4. Aguarde o build do merge terminar. Nas [Releases privadas](https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases), conectado à sua conta, baixe **MN-Trono-Frontend-0.1.16.zip** da entrega mais recente. Extraia em uma **pasta nova**.
5. No Git Bash, entre na pasta `frontend` extraída e publique a pasta inteira:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

6. Confira `https://a-lei-do-trono.surge.sh/downloads/latest.yml`: deve mostrar `version: 0.1.16`. No app instalado, clique na versão no rodapé e busque a atualização. Não é necessário baixar outro EXE manualmente; reinicie para instalar quando for conveniente encerrar a chamada.

O ZIP inclui **somente o instalador atual**, seu `latest.yml`, os jogos e as duas últimas instruções de atualização. Os downloads privados mantêm somente as versões atual e anterior. **TAMANHO-E-DOWNLOAD.json** informa o tamanho exato do frontend e do EXE. A proteção de 190 MiB do empacotador continua ativa.

## Splendor clássico

- 2–4 participantes, mesas online com estado privado aos participantes e bots opcionais.
- As 90 cartas originais em três níveis (40/30/20), com seus custos, bônus e pontos; dez nobres de 3 pontos, dos quais são sorteados jogadores + 1.
- Banco com 4/5/7 fichas por cor para 2/3/4 pessoas e sempre 5 ouros. Até três cores diferentes, ou duas iguais de uma pilha com ao menos quatro. Ouro vem de reservas.
- Até três reservas por pessoa, do mercado ou ocultas de um baralho; reservas adversárias não revelam seus conteúdos. Reservar dá ouro se houver e não compra a carta.
- Compra com bônus permanentes e pagamento em cores/ouro. A janela mostra o custo descontado, o pagamento e permite escolher substituições por ouro. Reservas também precisam ser compradas.
- Limite de dez fichas: o jogador escolhe quais devolver antes de confirmar a ação. Pode devolver as recém-obtidas.
- Uma visita de nobre ao fim do turno; quando mais de um se qualifica, o jogador escolhe um. Requisitos usam somente bônus, nunca fichas. A visita não custa uma ação.
- Ao terminar um turno com 15 ou mais pontos, completa-se a rodada para todos terem o mesmo número de turnos. Vence o maior prestígio; empate pelo menor número de cartas compradas; persistindo, vitória compartilhada.
- Animações de cartas/fichas, efeitos de carteado, gemas e pontuação; os números e totais vêm do servidor. Movimento reduzido é respeitado. A animação é interrompida ao navegar, sem desconectar a voz.
- Tela cheia, manual integrado, histórico, inspeção de cartas/coleções e layout para monitores menores e verticais. Em telas baixas, os três níveis do mercado ficam compactos acima dos controles da chamada.

O primeiro jogador é sorteado, pois o app não coleta idades. Não há expansões nem regras de Splendor Duel.

## Contas, partidas e recordes

Voz, texto, jogo do Trono, Azul e Splendor usam participações independentes. Trocar de tela não encerra a chamada nem abandona uma mesa. Sair da mesa é uma ação explícita.

Uma queda curta permite retomar a cadeira por 90 segundos. Depois, ou ao sair voluntariamente, um bot assume; quem abandonou não recebe recorde dessa partida. O Top 5 guarda o melhor resultado por conta confirmada, com nome atual e indicação de bots. Em empate de pontos, menos cartas e data do recorde ordenam o ranking. Somente o backend pode registrar resultados; o cliente não envia pontuação.

**Recordes já salvos persistem no Supabase após deploys. Mesas em andamento ficam na memória do servidor e não sobrevivem a reinícios do backend.** O progresso e backups locais de Cinzas do Abismo permanecem como antes. O cache do roguelite continua verificado e seu código permanece instalado localmente. Clipes continuam suspensos; permissões, temas, contas e configurações do app são preservados.
