# Cargos, canais, anexos e efeitos sonoros

Estas alterações usam o backend existente e o frontend original da v0.8.0
fornecido em ZIP. O frontend atualizado está em `frontend/`, incluindo os
arquivos do jogo, imagens, áudio e manuais existentes.

## Como publicar a atualização

1. Execute a migração abaixo no Supabase.
2. Atualize o backend com todos os arquivos da raiz, incluindo `roles.js`,
   `community-management.js`, `soundboard.js` e os módulos alterados. Preserve
   as variáveis de Supabase, R2, SFU e TURN do Render. Use `npm ci` e o comando
   de início `npm start`; não envie `node_modules`.
3. Depois de reiniciar, confirme no `/health` que
   `community.channelsReady` está verdadeiro. Login e R2 devem continuar
   funcionando com as configurações existentes.
4. Publique **o conteúdo de `frontend/`** no Surge. A pasta publicada deve ter
   `index.html` na raiz. No Git Bash, dentro dela, use sua sessão Surge:

   ```bash
   surge . a-lei-do-trono.surge.sh
   ```

5. Faça login na conta com o e-mail confirmado do criador. Em Pessoas, o botão
   Cargo permite conceder/remover Admin. Gerenciar permite criar/excluir canais;
   Anexos reúne as fotos e arquivos do canal; Efeitos abre os sons e o volume.

O frontend contém somente URLs públicas. Chaves Supabase de serviço, R2 e
Cloudflare continuam no backend. A versão do protocolo permanece
`0.8.0-alpha` para preservar a compatibilidade; os arquivos de interface usam
uma nova chave de cache. Esta entrega não executa deploy nem migração remota.

## Atualização do banco

Execute `supabase/upgrade-community.sql` no SQL Editor do seu projeto Supabase,
depois de `schema.sql`, `upgrade-v079.sql` e `upgrade-v080.sql`. A migração preserva
as contas e arquivos, inicializa os três canais existentes e pode ser repetida.
Os canais antigos mantêm texto e voz para preservar os clientes atuais; novos
canais são exclusivamente de texto ou voz.

O cargo **Criador** é calculado pelo e-mail confirmado
`Jonathapereira.jj@gmail.com`, obtido do Supabase. O apelido, metadados enviados
pelo navegador e dados decodificados de um JWT não concedem esse cargo. Se o
e-mail confirmado da conta mudar, ela deixa de ser o criador. O cargo Admin é
armazenado no perfil e só o criador pode conceder ou remover. Membros não têm
permissão de escrita direta nos perfis nem nas tabelas de canais.

| Ação | Criador | Admin | Membro |
| --- | --- | --- | --- |
| Conceder/remover Admin | Sim | Não | Não |
| Criar/excluir canais | Sim | Sim | Não |
| Enviar arquivos e efeitos | Sim | Sim | Sim |
| Excluir os próprios arquivos | Sim | Sim | Sim |
| Excluir anexos de outras contas | Sim | Sim | Não |

Uma foto de perfil ainda em uso exige a troca do ícone antes de ser removida.
Convidados continuam restritos às mesas do jogo e não acessam anexos ou efeitos.

## Contrato para o frontend

As rotas abaixo exigem `Authorization: Bearer <access_token>` e uma origem
permitida em `APP_URL`/`AUTH_ALLOWED_ORIGINS`. As respostas usam `{error:{code,message}}`
em caso de erro. Permissões são conferidas novamente no servidor a cada ação.

| Rota | Corpo/resposta principal |
| --- | --- |
| `GET /community/permissions` | `{role, permissions}` |
| `GET /community/channels` | `{channels:[{id,name,description,channel_type,...}]}` |
| `POST /community/channels` | `{name,type:"text" ou "voice",description}` → `{channel}` |
| `DELETE /community/channels/:id` | Exclui o canal e desconecta os participantes dessa sala |
| `POST /community/roles` | `{userId,role:"admin" ou "member"}` |
| `GET /files/channel/:roomId` | Anexos prontos do canal em que a conta está conectada |
| `DELETE /files/:id` | Remove o próprio arquivo ou modera com cargo Criador/Admin |
| `GET /files/soundboard` | Biblioteca de efeitos para contas autenticadas |
| `POST /files/upload` | Arquivo binário; `X-File-Kind: soundboard`, `X-File-Name` codificado com `encodeURIComponent` |
| `GET /files/:id/url` | URL temporária para reproduzir/abrir um arquivo |

As listas de arquivos aceitam `?offset=...` e retornam `hasMore` e `nextOffset`.
O catálogo de efeitos é compartilhado entre as contas. Cada arquivo conta na
reserva existente de 8 GB. Canais são limitados a 50 ativos e o nome deve ter
2–40 caracteres. A exclusão preserva os anexos: seus donos podem removê-los por
`/files/mine`. Ela também preserva um registro da exclusão no banco para impedir
que os canais padrão sejam recriados no próximo reinício.

O evento WebSocket `chat-channels` inclui `type: "text" | "voice" | "mixed"`.
`joined-room.room` inclui `channelType`. Um canal de texto recusa voz/SFU; um
canal de voz recusa mensagens e anexos de texto. O backend atualiza os canais
imediatamente após as ações HTTP, ao autenticar uma conexão e, quando a chave de
serviço está disponível, a cada 15 segundos. `health.community.channelsReady`
informa se o catálogo persistido foi carregado. Sem a migração, as funções de
gerenciamento retornam indisponibilidade; os canais legados continuam operando.

`auth-result.user`, login, renovação, `/auth/me` e atualização de perfil incluem
`role` e `permissions`. A presença e os jogadores incluem o cargo, sem divulgar
e-mails. Quando um cargo muda, as conexões locais recebem `role-updated`. Ao
excluir um canal, seus participantes recebem `channel-deleted` com `roomId`:
o frontend deve encerrar os tracks, limpar o estado da chamada e voltar à lista.
`attachment-deleted` continua sinalizando a exclusão para retirar a foto/anexo
das mensagens e da biblioteca de efeitos.

## Áudio de até 15 segundos

O formato recebido é WAV PCM canônico: cabeçalho de 44 bytes, PCM de 16 bits,
mono ou estéreo, 8–48 kHz, seguido de amostras. O cliente deve decodificar o
arquivo escolhido, conferir a duração e convertê-lo para esse formato. Assim,
o usuário pode escolher formatos que seu navegador suporte, sem instalar um
codec externo no servidor. O servidor confirma duração, formato e tamanho
pelas amostras: um campo de duração enviado pelo cliente não é aceito como prova.
Áudio acima de 15 segundos, cabeçalhos inconsistentes e arquivos renomeados são
recusados antes do envio ao R2. O máximo é 2.880.044 bytes; 15 segundos exatos são
aceitos. A duração validada é devolvida em `file.durationMs`.

Para tocar na chamada, envie `{type:"soundboard-play",fileId}` pelo WebSocket.
Somente contas autenticadas presentes na voz podem iniciar o efeito. Os
participantes da mesma chamada recebem `{type:"soundboard-play",id,roomId,file,
playerId,name,at}`. Há somente um efeito ativo por sala, com intervalo mínimo
de três segundos. Cada cliente busca `/files/:id/url` e reproduz localmente.
O controle de volume deve ficar no cliente (`audio.volume`, de 0 a 1), salvo nas
preferências daquele usuário. Quem dispara o efeito não determina o volume dos
demais. Pausar e encerrar os sons ao sair da chamada é responsabilidade do cliente.

## Compartilhamento, mosaico e interface

Ao clicar em Compartilhar tela, o popup oferece 720p/1080p e 15/30/60 FPS,
além de áudio quando o navegador permitir. Só a confirmação abre a seleção
nativa da tela. A escolha é salva no navegador; a captura e os emissores P2P/SFU
recebem resolução, taxa de quadros e limites de bitrate. O navegador e o
dispositivo podem entregar valores menores. As restrições existentes de
consumo do SFU continuam sendo respeitadas.

Câmeras e telas aparecem em um mosaico comum. Ampliar mosaico abre uma grade
com até seis pessoas selecionáveis. A tela ocupa o bloco principal e a câmera
da mesma pessoa fica sobreposta quando ambas estão disponíveis. Fechar a grade
libera os elementos de reprodução sem encerrar os tracks da chamada. Os blocos
ampliados ficam sem áudio duplicado. Uma transmissão remota exige clicar em
Assistir para iniciar a recepção, preservando o controle de consumo.

O layout tem grupos de canais de texto/voz, controles com rótulos, fontes
Manrope locais, efeitos de foco/hover e fundo discreto com suporte a movimento
reduzido. Os antigos atalhos decorativos foram removidos. Canais de texto
priorizam mensagens/anexos; os de voz priorizam a chamada. Os canais legados
continuam com ambas as funções. O jogo e o portal continuam disponíveis.

O cliente decodifica os efeitos enviados e gera WAV PCM. Efeitos acima de
15 segundos são recusados antes do upload e também pelo backend. O volume
fica salvo por conta no navegador e não altera a preferência dos outros.

## Validação

Execute `npm ci`, `npm test` e `npm run test:frontend`. Além das quatro suítes existentes, os testes novos
exercitam HTTP/WebSocket, concessão e revogação de cargos, edição de apelido,
exclusão de canais ocupados, separação texto/voz, escopo dos efeitos, limite de
áudio e moderação de fotos. PGlite executa as migrações em PostgreSQL, incluindo
negação de operações por membros, bloqueio da promoção por Admin e repetição
da migração sem recriar canais excluídos.

Os sete cenários de navegador validam permissões ao vivo, galeria de fotos e
moderação, criação/exclusão e navegação entre canais, seleção antes de capturar
tela, limite de seis pessoas na grade, conversão/upload de efeitos e volume,
layout em desktop/celular e acesso ao lobby do jogo. Screenshots são gerados
em `artifacts/`. O teste usa Chromium, microfone/câmera artificiais, captura de
tela simulada e URLs de armazenamento simuladas; ele não comprova uma chamada
real entre seis dispositivos nem a entrega efetiva de 1080p/60 FPS.

Os serviços externos continuam simulados nos testes. A migração no Supabase
real, o deploy no Render/Surge e os testes de voz/vídeo em dispositivos não foram
executados. Para o backend de produção, mantenha Supabase/R2 configurados como
na versão 0.8.0 e execute a migração antes de disponibilizar os novos controles.
