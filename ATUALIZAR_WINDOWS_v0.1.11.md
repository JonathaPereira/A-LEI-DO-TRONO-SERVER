# M&N · Windows 0.1.11 — catálogo de jogos e Azul

## Incluído

- A área Jogos abre um catálogo de A Lei do Trono e Azul, com cartões animados que respeitam movimento reduzido. A entrada mantém destaque para a comunidade. O roguelite não foi incluído.
- Azul: modo original do tabuleiro colorido, 2–4 participantes, mesas online e bots opcionais. Fábricas 5/7/9, 20 azulejos de cada cor, marcador de primeiro jogador, linhas de preparação, chão, pontuação por adjacência, bônus e desempate. Nesta versão digital o primeiro jogador inicial é sorteado. O manual fica em Como jogar.
- Interface própria com fábricas circulares, azulejos identificados por cor e símbolo, placares e tabuleiros de cerâmica. O servidor valida turno, seleção e revisão da mesa; os clientes não enviam pontos.
- Top 5 no Supabase: melhor resultado por conta, usando o apelido atual; partidas contra bots são identificadas. Bots e pessoas que saíram da partida não recebem recordes. Empates de ranking usam linhas completas, data e ID estável.
- A mesma conexão mantém voz, texto e assento de A Lei do Trono enquanto você navega pelo catálogo e Azul. Original e Discord continuam disponíveis. Clipes continuam suspensos.

## Publicação, nesta ordem

1. No GitHub, faça merge do PR quando o workflow Windows full app estiver verde. O Git recebe os arquivos do backend, frontend, testes e SQL; os instaladores são gerados pelo workflow.
2. No **Supabase → SQL Editor → New query**, cole todo o arquivo **supabase/upgrade-azul.sql** e clique Run. O arquivo pressupõe profiles/schema.sql já existente. Pode repetir esta migração sem apagar recordes. Não é necessário repetir os SQL anteriores já aplicados. Nenhuma chave precisa ser colada no frontend.
3. No Render, publique a branch main do backend com Build Command npm install e Start Command npm start. Preserve as variáveis atuais de Supabase, R2, Realtime e autenticação. O ranking usa SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY existente, apenas no backend. Confira /health: version 0.10.0-alpha e features.azul true.
4. Baixe **MN-Trono-Site-com-Desktop** na execução verde do workflow. Extraia o pacote. Ele inclui este guia, upgrade-azul.sql e a pasta frontend completa com downloads/, latest.yml e manual/.
5. No Git Bash entre na pasta frontend extraída e publique:

   ```bash
   cd "/c/Users/Jonatha/Downloads/PASTA-EXTRAIDA/frontend"
   npx surge . a-lei-do-trono.surge.sh
   ```

6. Confira https://a-lei-do-trono.surge.sh/downloads/latest.yml: version: 0.1.11 e MN-Trono-0.1.11-Windows.exe. O aplicativo já instalado recebe a atualização pelo canal interno. Clique na versão no rodapé e reinicie quando puder encerrar a chamada. Não precisa reinstalar nem apagar dados.

Use o frontend completo do artefato: o ZIP do código-fonte não contém o instalador. A sequência SQL → backend → site permite que o app antigo continue usando as funções anteriores enquanto as novas entram.

## Onde ficam os dados

Os recordes concluídos e confirmados ficam nas tabelas azul_matches e azul_scores do Supabase e sobrevivem a deploys. A migração só cria estruturas e funções; não limpa conversas nem arquivos. Os resultados são gravados por funções exclusivas do backend, de modo transacional e sem duplicar a partida em uma repetição.

As mesas em andamento ficam na memória do backend. Uma queda permite retomar a cadeira por 90 segundos. Após esse prazo, ou ao sair explicitamente, um bot assume e esse participante perde a elegibilidade ao ranking nessa partida. Reiniciar/publicar o backend encerra mesas em andamento. Prefira publicar quando ninguém estiver jogando.

Se o banco falhar ao finalizar, a tela mostra resultado pendente e o servidor tenta salvar novamente a cada 30 segundos; também existe um botão de tentativa. Aguarde “Recordes salvos” antes de reiniciar o backend. Um resultado ainda pendente em memória pode se perder num reinício. Não há upload de vídeo/áudio nem armazenamento R2 adicional por causa do Azul.

## Conferir

Entre na voz da comunidade e ligue o microfone/câmera/tela. Abra Jogos, escolha Azul e crie uma mesa. Outra pessoa entra em Mesas abertas, ou o anfitrião completa com bots. Escolha uma cor e depois uma linha válida ou Chão. Termine a partida e confira os bônus e “Recordes salvos”. Troque de layout, navegue ao chat e volte: a mesma chamada continua. Reabra o app/site e confira o recorde com o mesmo apelido da conta.
