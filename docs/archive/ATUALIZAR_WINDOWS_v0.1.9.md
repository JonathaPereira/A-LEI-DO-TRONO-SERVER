# M&N 0.9.1 · Windows 0.1.9

Esta versão atualiza backend, banco, frontend e aplicativo. As regras do jogo e o manual da versão 0.9.0 continuam válidos.

## Novidades

- Aparência → Disposição do aplicativo: **Original / Padrão** ou **Discord**. A opção Discord organiza canais à esquerda, mensagens no centro e perfil/microfone/áudio/configurações no canto inferior. A troca é imediata, pessoal por conta/aparelho e preserva chamada, câmera, tela compartilhada e participação no jogo.
- Configurações ocupam a largura disponível também em monitores verticais. Barras, conteúdo e controles se adaptam a telas menores.
- O botão **M&N** leva ao início, preservando a chamada. Amigos fica no menu lateral; mensagens novas podem aparecer em avisos compactos com o avatar do remetente, respeitando silenciamento e preferências.
- Mensagens mostram data completa e hora. Somente o criador pode excluir mensagens específicas ou limpar o histórico do canal selecionado. A exclusão é persistente e exige confirmação; não exclui o canal nem seus arquivos de armazenamento.
- Amigos podem enviar anexos em conversas privadas: as mesmas validações e limites do chat geral, 10 MB por arquivo e até 100 MB por vídeo MP4/WebM. O limite compartilhado de armazenamento continua o mesmo. Os anexos privados ficam acessíveis somente ao remetente e ao destinatário da mensagem; o histórico continua disponível após remover a amizade, sem permitir novos envios.

## Publicar, nesta ordem

1. Faça merge do PR no GitHub.
2. No **Supabase → SQL Editor**, execute os dois SQL novos, uma vez cada:
   - `supabase/upgrade-chat-moderation.sql`
   - `supabase/upgrade-direct-attachments.sql`

   O banco existente precisa ter as migrações anteriores: comunidade, arquivos, histórico do chat e amigos (`supabase/upgrade-social.sql`, introduzida na 0.1.7). Quem já as aplicou não precisa refazer. Os dois SQL novos podem ser executados novamente com segurança. Não apague tabelas nem conversas.
3. No **Render**, publique a `main`. Build Command: `npm install`; Start Command: `npm start`. Mantenha as variáveis existentes. Confira `/health`: versão `0.9.1-alpha` e `independentGameVoice: true`.
4. Aguarde **Windows full app** do commit publicado terminar com sucesso. Baixe o artefato **MN-Trono-Site-com-Desktop** e extraia-o. Ele inclui o site, o instalador, o canal de atualização e cópias dos SQL fora de `frontend/`.
5. Publique a pasta `frontend` completa desse artefato, incluindo `manual/` e `downloads/`:

   ```bash
   cd "/c/Users/Jonatha/Downloads/PASTA-EXTRAIDA/frontend"
   npx surge . a-lei-do-trono.surge.sh
   ```

6. Confira `https://a-lei-do-trono.surge.sh/downloads/latest.yml`: deve mostrar `version: 0.1.9`. Mantenha o EXE indicado no YAML na mesma pasta `downloads/`.
7. Quem já tem o app recebe a versão mais recente internamente. Pode clicar na versão no rodapé do menu lateral para buscar atualização e reiniciar quando o download terminar. Não precisa baixar outro instalador manualmente. A reinicialização encerra a chamada; aguarde um momento conveniente.

## Conferência rápida

- Entre numa chamada, ligue a câmera, compartilhe a tela e troque os dois layouts em Aparência: os mesmos recursos devem continuar ativos.
- Abra Configurações num monitor vertical e confira conteúdo e botão fechar sem faixa vazia.
- Entre numa sala de texto sem sair da chamada, envie mensagem e confira data/hora.
- Na conta criadora, exclua uma mensagem e limpe um canal de teste; reabra para conferir. Membro/Admin não recebem esses controles.
- Envie anexo por privado a um amigo; confira em ambas as contas e verifique que uma terceira conta não acessa o arquivo.

Não envie `node_modules`, `.env` ou EXE para o Git. Clipes continuam bloqueados em desenvolvimento. A versão Android fica para outra etapa.
