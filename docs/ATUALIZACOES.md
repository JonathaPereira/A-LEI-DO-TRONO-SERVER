# Atualizações do aplicativo

Este é o guia mantido para atualizar instalações existentes. A entrega prepara
Windows **0.3.11** e preserva o backend **0.14.0-alpha**. Instalador e manifesto
`downloads/latest.yml` identificam a versão efetivamente distribuída.

## Windows 0.3.11

Adiciona Similo online ao catálogo: visual escuro, cinco temas com misturas
independentes para mesa/pistas, capitão alternado para resolver divergências,
votos animados e informações flutuantes nas 120 cartas. Controles da Corte
ficam no cabeçalho desse jogo para liberar o HUD.

**Requer atualizar o backend com esta contribuição**, mantendo as variáveis
existentes. Confira `/health`: `features.similo` deve ser `true`. Não há SQL.
O frontend informa quando o servidor ainda não oferece o jogo; publicar somente
o site ou instalar o EXE não adiciona o serviço de partidas ao backend.

O pipeline entrega também `Similo-Art-0.3.11.zip` e publica suas folhas em
`similo-mn.surge.sh` antes do catálogo. Os hashes do ZIP e de cada folha são
conferidos. As imagens precisam de rede e ficam fora do EXE para conservar o
limite de tamanho do site. Regras e operação em [Similo](../games/similo/README.md).
Preserva avatares, lista de membros aberta por padrão e jogos existentes.

## Windows 0.3.10

Corrige os avatares das mensagens diretas: cada mensagem usa a foto ou o ícone
do remetente, inclusive a própria conta, e o cabeçalho identifica o destinatário.
Reutiliza o carregamento de arquivos e a proteção por conta já existentes.

A lista de membros fica aberta por padrão nas telas autenticadas de chamada,
texto, DMs, catálogo e jogos. Ela mostra online e offline com os dados de presença
já autorizados. O botão do cabeçalho e o X da lista permitem recolher; a escolha
permanece durante a navegação e volta a aberta ao trocar de conta ou reiniciar.
No desktop, a lista reserva uma coluna. Em telas menores, usa uma lateral
sobreposta, que também fecha com Esc depois dos diálogos/popovers superiores.
O fullscreen próprio de um jogo conserva sua apresentação imersiva.

Mantém Atalaia Godot 0.2 e as correções anteriores do instalador/atualizador.
Não há SQL nem alteração do backend nesta entrega. Frontend e instalador seguem
a publicação conjunta e automática no Surge após aprovação da pipeline.

## Windows 0.3.9

Atualiza Atalaia para Godot 0.2: HUD com indicadores nomeados, contagem animada
de ouro e barras de integridade/onda/campanha. O campo usa proporção uniforme,
com recorte dos objetos nos limites do cenário. As três regiões recebem novos
fundos; as estradas preservam a textura e a geometria aprovadas. Construções,
reposicionamentos e evoluções têm transições; inimigos mostram dano suavizado
e recompensas de ouro. Mantém as regras e os saves da campanha Godot existente.

O jogo web 0.6.1 fornecido como referência possui conteúdo adicional (seis
regiões, 30 ondas, cristais e oficina). Esta entrega visual do Godot conserva
suas três regiões e 15 ondas; não migra o save da versão web anterior.

Frontend, instalador e Atalaia são preparados pela mesma entrega e publicados
automaticamente no Surge após aprovação dos testes. A correção do atualizador
das versões 0.3.7/0.3.8 permanece incluída.

## Windows 0.3.8

O instalador volta a incluir a configuração necessária para baixar atualizações.
Instalações afetadas precisam instalar esta versão manualmente uma vez; as
próximas versões poderão ser obtidas pelo atualizador interno.

Inclui as animações públicas do Love Letter: carta, autor, alvo e resultado;
o Guarda aguarda dois segundos antes de revelar acerto ou erro. A última carta
permanece ilustrada na mesa, e os favores por vitória e pela Espiã aparecem
separados. Movimento reduzido e informações secretas são preservados.

A 0.3.8 também alinha os vagões às posições impressas do Ticket to Ride e integra
Atalaia: Guardiões do Cristal, com o projeto Godot e as artes enviados. O catálogo
abre o jogo em aba própria na web e janela isolada no Windows; a publicação
automática inclui o jogo antes de atualizar o frontend.

Entrega da reconstrução A Corte: comunicação, chamada com grade/foco, perfis,
arquivos, soundboard, clipes e gravação na interface Next.js, React e TypeScript.
Jogos completos, contratos do backend e recursos existentes são preservados.
Inclui cancelamento de gravação pendente ao trocar conta, inicialização do
atualizador e fullscreen independentes da apresentação antiga.

A versão 0.3.8 preserva contas,
sessão lembrada e preferências. A instalação conserva as correções que encerram
o aplicativo na bandeja e aceitam diretórios com apóstrofo. Reiniciar encerra a
chamada: escolha um momento conveniente.

Windows full app encadeia publicação no Surge após validar e empacotar a entrega.
A distribuição só está concluída quando a verificação do site passa; uma versão
preparada no código não comprova publicação. Veja o fluxo automático e a repetição
sem tag em [Distribuição web e Windows](PUBLICAR_SURGE_LEVE.md).
Esta entrega não introduz SQL nem altera a versão do backend.

### Novidades incorporadas (0.2.11 a 0.3.2 / 0.14.0-alpha)

- **Ticket to Ride**: Novo jogo de tabuleiro ferroviário com mapa interativo, cartas de vagão e bilhetes de destino, pontuação dinâmica e bots.
- **Nexus Hub & Launcher**: Gerenciador de jogos web independentes em iframe seguro com tokens temporários de autenticação.
- **Remote PC Beta & Gamepad Virtual**: Controle remoto e coop de PC em baixa latência via WebRTC com injeção nativa de controle virtual Xbox no Windows (ViGEm).
- **Moderação de Chamada**: Ferramentas de staff no card de participante para mutar/desmutar, bloquear/liberar câmera e tela, e desconectar membros da voz.

## Instalar ou atualizar no Windows

Use o EXE da entrega aprovada no repositório oficial. Quem já usa o atualizador
pode verificar a versão em **Configurações → Aplicativo** e seguir a atualização; a instalação manual
usa o EXE da mesma entrega. Reiniciar encerra a chamada: escolha um momento
conveniente. Contas, preferências e sessão lembrada são preservadas.

Mudanças no Electron ou no helper nativo exigem instalar o aplicativo atualizado,
pelo atualizador ou manualmente. Publicar somente a interface web não substitui
os arquivos incorporados à instalação. O desenvolvimento local não atualiza o
aplicativo instalado.

### Recuperação do atualizador Windows

Pacotes gerados com `electron-builder --dir` e depois NSIS com `--prepackaged`
ficaram sem `resources/app-update.yml`. Nessa condição, o aplicativo pode
encontrar uma versão mais recente, mas falha ao iniciar o download e mostra o
erro genérico em Configurações → Aplicativo. O fluxo de entrega agora gera o
pacote NSIS diretamente e confere esse arquivo no executável e após a instalação.
Uma instalação já afetada precisa receber manualmente o EXE da versão
**0.3.7 ou posterior**, após sua aprovação e publicação. Publicar o site
ou clicar novamente em Buscar atualizações não adiciona o arquivo ausente ao
aplicativo instalado. Preserve a
mesma conta e o perfil ao reinstalar.

## Conferir uma entrega

1. Use o build aprovado em Releases: `MN-Trono-Frontend-<versão>.zip`,
   `MN-Trono-<versão>-Windows.exe` e `SHA256SUMS-<versão>.txt` da mesma entrega.
   O acesso às releases privadas requer autenticação.
2. Confira os hashes e extraia o ZIP numa pasta nova. Ele contém `frontend/`,
   com um único instalador em `downloads/`, o manifesto e os guias na raiz.
   Não misture EXE e manifesto de builds diferentes, mesmo com a mesma versão.
3. A pipeline publica automaticamente quando habilitada. Para envio manual
   alternativo, publique `frontend/` inteira, incluindo `downloads/`, seguindo
   [Distribuição web e Windows](PUBLICAR_SURGE_LEVE.md). Confira a versão e o
   hash em `downloads/latest.yml`. Sincronizar fontes ou gerar um pacote local
   não publica o aplicativo.
4. Confira as mudanças de backend e SQL ausentes no destino antes de distribuir.
   A versão instalada no seu computador não comprova o estado do banco remoto.

O empacotador inclui este arquivo com nome fixo; não é necessário criar um novo
Markdown a cada versão. Atualize este guia quando houver uma nova exigência de
atualização. O histórico detalhado permanece nos commits e nas releases.

## Backend e banco de dados

A integração 0.2.10 não exige SQL adicional nem redeploy de backend em relação à
0.2.9. Isso não elimina os pré-requisitos das funcionalidades anteriores. Para
uma base existente, aplique somente upgrades e migrações ainda ausentes, na ordem
de suas dependências. Não reaplique o instalador de banco numa base existente.

Uma instalação nova usa `supabase/install.sql`; o comando
`npm run database:prepare` gera uma cópia reunida para revisão. No repositório,
`docs/DESENVOLVIMENTO_DESKTOP.md` descreve o ambiente e os limites desse roteiro.
As variáveis do servidor ficam em [Configuração do backend](PUBLICAR_SURGE_LEVE.md#configuração-do-backend).

### GIFs do GIPHY

Se o destino ainda não recebeu a atualização de GIFs da 0.2.8:

- Aplique `supabase/migrations/20261016140000_giphy_profile_credits.sql`, depois
  das migrações anteriores de perfis. O SQL também acompanha a raiz do ZIP.
  Ele atualiza o validador de créditos, preservando os perfis existentes.
- Use o backend com o endpoint autenticado `/community/gif-provider`.
- Configure `GIPHY_API_KEY` no backend para tendências, pesquisa e paginação
  dentro do seletor. Essa é a chave pública do cliente GIPHY, enviada ao navegador
  autenticado para consultas diretas; nunca use tokens privados de serviço ou do
  Supabase nessa variável. O token de sessão do app não é enviado ao GIPHY.

Sem chave, a importação por link e pré-visualização continuam disponíveis.
Sem o SQL necessário, o banco recusa salvar os novos créditos. GIFs continuam
limitados a 10 MB; os créditos antigos do Wikimedia permanecem válidos.
Testes com respostas controladas não comprovam o acesso ao catálogo real.

## Voz e recuperação de mídia

Abrir o aplicativo não conecta automaticamente à voz. Navegar por mensagens,
amigos e jogos preserva uma chamada já conectada; sair da voz preserva o jogo.

Desde a 0.2.9, microfone nativo ou sem filtro, com ganho em 100%, usa envio direto
para WebRTC, evitando processamento Web Audio desnecessário. Ganho e mute não
exigem recaptura. O Electron conserva o agendamento do renderer em segundo plano;
a margem solicitada de 40 ms não representa uma medição da latência final.

A proteção de voz recebida durante jogos é local e ligada por padrão. Pode pedir
uma margem de reprodução entre 60 e 140 ms sem trocar trilhas ou reconectar.
A prioridade de áudio ajusta somente processos elegíveis do próprio aplicativo,
preserva prioridades maiores e não exige administrador nem reserva CPU.

Na 0.2.10, câmera e tela tentam recuperar a publicação afetada, com fila separada
para o áudio recebido. O fallback P2P é coordenado para toda a sala e dura até
esvaziar a voz; não há retorno automático para SFU durante a chamada. Para tentar
uma nova escolha de transporte, todos saem da voz e entram novamente. A partida
pode continuar. Veja a [política de recuperação e painel flutuante](ANALISE_SFU_E_JANELA_FLUTUANTE.md).

O roteiro de validação e o aceite da versão migrada ficam em
`docs/MIGRACAO.md`, no repositório. Testes sintéticos não substituem microfone, áudio do
jogo e transmissão entre computadores reais.

## Resumo das versões incorporadas

| Desktop | Mudanças principais                                                             |
| ------- | ------------------------------------------------------------------------------- |
| 0.2.3   | Perfis com prévia de avatar, capa e fundo; ajustes da chamada.                  |
| 0.2.4   | Entrada explícita na voz, edição de perfis e navegação preservando a chamada.   |
| 0.2.5   | Correções dos controles de mídia, parada da câmera e cabeçalho recolhível.      |
| 0.2.6   | Controles consistentes e anúncio de mídia antes de aguardar o transporte.       |
| 0.2.7   | Imagens no chat, arquivos privados, canais mistos e ajustes de áudio e jogos.   |
| 0.2.8   | Seletor GIPHY e migração de créditos de perfis.                                 |
| 0.2.9   | Envio de voz direto e agendamento do Electron em segundo plano.                 |
| 0.2.10  | Painel flutuante compacto, recuperação por mídia e fallback coordenado da sala. |

As notas individuais foram consolidadas aqui. Para investigar uma versão antiga,
consulte o histórico Git de `docs/archive/ATUALIZAR_WINDOWS_v<versão>.md`.
