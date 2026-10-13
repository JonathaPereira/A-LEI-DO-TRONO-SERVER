# Atualizar M&N para Windows 0.1.7

Esta versão acrescenta amigos, pedidos de amizade, conversas privadas persistentes,
convites para canais, notificações de menções e mensagens, avisos silenciáveis por
canal e conversa, volumes individuais ligados à conta e diagnóstico copiável.

O painel Amigos não muda a sala nem interrompe o microfone. Mensagens privadas
podem ser enviadas depois de aceitar a amizade. Remover um amigo impede novos
envios e preserva o histórico. Só os dois participantes acessam a conversa;
o cargo Admin não dá acesso às mensagens privadas.

Os avisos do Windows aparecem em segundo plano. Por padrão: menções `@apelido`,
pedidos de amizade e mensagens privadas. Configurações → Notificações permite
avisar todas as mensagens ou desligar avisos e silenciar canais individualmente.
Contadores dos canais acompanham mensagens recebidas enquanto o app está conectado.
O contador das conversas privadas também recupera mensagens recebidas offline.
Preferências locais são separadas por conta e aparelho, sem alterar os outros usuários.

Conexão → Adaptar vídeo reduz temporariamente resolução, FPS e bitrate de vídeo
após problemas persistentes. A qualidade escolhida não é sobrescrita: retorna
gradualmente depois de 60 segundos estáveis. O microfone não é recapturado nem
perde o estado de mute. O diagnóstico mede a recepção local de áudio e a lentidão
local; não mede a CPU do computador de outra pessoa. O app não consegue reservar
recursos do Windows nem garantir ausência de cortes quando o jogo ocupa o computador.
Clipes e replay continuam suspensos.

Telemetria → Copiar diagnóstico inclui versão, transporte, estados de áudio,
métricas WebRTC e, no Windows, consumo de CPU/RAM do app. Não inclui nomes,
conversas, e-mails, tokens, IPs, SDP ou caminhos de arquivos.

## Ordem para publicar

1. No Supabase → SQL Editor, execute **supabase/upgrade-social.sql** completo.
   Esta migração pressupõe que `upgrade-community.sql` já foi aplicado.
   Pode executar novamente sem apagar dados. Não precisa repetir SQL antigo.
2. Faça merge do PR no GitHub. No Render, aguarde o deploy da `main`.
   Confira `/health`: `features.socialMessaging` e
   `features.channelNotifications` devem ser `true`.
   `social.ready` passa a `true` depois da primeira operação social bem-sucedida.
3. No GitHub Actions → Windows full app, baixe o artefato
   **MN-Trono-Site-com-Desktop** da versão 0.1.7 e extraia.
   Entre na pasta **frontend** extraída e publique no Git Bash:

   ```bash
   surge . a-lei-do-trono.surge.sh
   ```

   Publique a pasta inteira, incluindo `downloads/latest.yml` e o EXE.
   O frontend do código-fonte não contém o instalador.
4. No app existente, clique na versão no rodapé para buscar a última atualização.
   Ele baixa a versão completa diretamente; o usuário escolhe reiniciar para instalar.
   Quem já tem 0.1.1 ou posterior não precisa baixar o EXE manualmente.
   Conta lembrada, temas, permissões e arquivos locais são preservados.

O build do GitHub não publica no Surge. A publicação do pacote completo é o
que disponibiliza a atualização interna aos aplicativos instalados.
Nenhuma configuração nova de Render, R2 ou Cloudflare é necessária.
A migração cria tabelas no Supabase e usa as credenciais já configuradas.
Mensagens ficam no banco, nunca apenas na memória do Render.
O app e o site usam as mesmas contas, amizades, conversas e canais.
A versão celular não faz parte desta atualização.
