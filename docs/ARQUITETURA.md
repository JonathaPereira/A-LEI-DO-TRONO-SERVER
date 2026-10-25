# Arquitetura e responsabilidades

Este documento registra os donos e contratos vigentes. Produto e referência
visual ficam em [UX_COMUNICACAO.md](UX_COMUNICACAO.md), operação em
[DESENVOLVIMENTO_DESKTOP.md](DESENVOLVIMENTO_DESKTOP.md) e disponibilidade da
reconstrução em [MIGRACAO.md](MIGRACAO.md). Detalhes históricos ficam no Git.

## Composição da aplicação

Next App Router, React e TypeScript estrito exportam a mesma interface estática
para web e Electron. Não há API Routes ou Server Actions: HTTP, contas,
persistência e WebSocket pertencem ao backend Express existente.

`src/components/application.tsx` compõe o shell, a superfície permanente dos
jogos, o visualizador de anexos e a inicialização. `src/app/application-runtime.tsx`
instala os donos uma vez por página, fora da fase de commit, e emite
`trono:ready` depois de preparar suas dependências. A ordem de inicialização
deve conservar conta/rede/arquivos antes dos consumidores.

`src/components/application/` apresenta autenticação, navegação, comunicação e
catálogo novos. `services.ts` publica disponibilidade das fachadas, sem outro
estado de domínio. React observa os snapshots imutáveis por
`getSnapshot`/`subscribe`; assinaturas de apresentação terminam na desmontagem.
Comandos continuam nos donos existentes. `Trono*` são adaptadores desses donos.

A interface externa usa CSS Modules e Phosphor Icons. `src/styles/index.css`
carrega somente a cascata preservada dos jogos, delimitada por
`@scope (#gameSurface)`. Estado visual necessário do body é projetado nesse
escopo. Tokens do shell não dependem da cascata antiga.

A superfície dos jogos permanece montada durante a navegação. Telas podem ser
ocultadas; prompts e efeitos pertencem ao mesmo escopo, inclusive hosts criados
dinamicamente. Trocar tela não recria socket, partida, captura ou player.
As apresentações dos marcos 2/3 ainda aguardam reintegração; existência de fonte
não significa que o recurso esteja montado. Consulte o checkpoint da migração.

## Navegação, conta e comunicação

| Dono em src/lib                    | Responsabilidade                                                       |
| ---------------------------------- | ---------------------------------------------------------------------- |
| auth/session.ts e auth/forms.ts    | Sessão/restauração, conta/convidado e estados dos formulários.         |
| auth/callback-boot.ts              | Entrada de callback gerada em /auth-boot.js antes da hidratação.       |
| navigation/portal.ts               | Identidade exibida, disponibilidade de nome e tela/intenção principal. |
| navigation/community-navigation.ts | Entrada na comunidade, seleção de texto e troca explícita de voz.      |
| games/library.ts                   | Encaminhamento do catálogo aos controladores dos jogos.                |
| socket/transport.ts                | Uma conexão, correlação, deadlines e fila de autenticação.             |
| socket/client.ts e socket/state.ts | Comandos de rede e participação independente em texto/voz/jogo.        |
| channels/catalog.ts                | Catálogo confirmado, seleção, presença e metadados dos canais.         |
| community/controller.ts            | Presença e diretório da comunidade.                                    |
| chat/composer.ts                   | Rascunho, anexo, progresso, envio e cancelamento de upload.            |
| chat/messages.ts                   | Histórico, paginação, revisão e confirmação de moderação.              |
| messenger/controller.ts            | Amizades, conversa privada, histórico, rascunho e convites.            |
| messenger/client.ts                | Transporte HTTP social autenticado.                                    |
| notifications/controller.ts        | Não lidas, deduplicação, preferências e entrega de avisos.             |
| files/client.ts                    | Uploads e links compartilhados por chat, DM, perfis e soundboard.      |

Após autenticação, o portal abre comunicação. Abrir texto usa a entrada
`textOnly` e não seleciona uma chamada. Retornar ao Trono consulta a partida e
retoma setup, lobby ou mesa existentes. Tela aberta, destino do compositor e
participação em voz/jogo são estados distintos.

Trocar conta/canal incrementa a geração relevante, cancela trabalho pendente e
impede respostas antigas de publicar dados no escopo novo. O cache de arquivos é
por conta, deduplica pedidos e invalida links expirados/excluídos. Histórico não
restaura mensagens apagadas ao receber uma página antiga. Paginação preserva a
posição de leitura. Permissões exibidas não substituem autorização do servidor.

Protocolos recebem dados desconhecidos, validam páginas completas, identidade,
revisão e campos necessários antes de publicar snapshots. O transporte valida o
envelope; cada domínio valida o conteúdo. Não enviar dados privados por
projeções públicas ou confiar em metadados editáveis para privilégios.

## Jogos preservados

`src/components/games/` contém hosts e apresentações;
`src/lib/games/` contém regras, controladores, protocolos e coordenação;
`src/styles/games/` contém os estilos próprios e dependências compartilhadas
extraídas. Efeitos, tooltips, áudio e comunicação usados nas partidas também
permanecem protegidos, mesmo quando seus módulos estão fora dessas pastas.

A Lei do Trono separa lobby, partida online, motor local, escolhas, mão, mesa,
assentos, histórico, revelações privadas, efeitos, controles e navegação.
`throne-rules.ts` e o planejador de leis são compartilhados com o servidor.
Cada controlador expõe comandos/snapshots; fachadas não duplicam estado. Somente
o participante autorizado vê mãos/revelações privadas. Uma substituição de
estado não descarta uma revelação já enfileirada.

Azul, Splendor, Love Letter e Ticket to Ride mantêm motores puros compartilhados,
controle cliente e serviços autoritativos por jogo. Comandos verificam revisão,
ator, turno e jogada; projeções por espectador escondem cartas e escolhas privadas.
Reconexão atualiza presença sem repetir jogadas ou resultados. Persistência de
ranking usa identidade idempotente da partida e resultados calculados pelo motor.

Cinzas do Abismo conserva o aplicativo em `public/roguelite/`, sua persistência,
assets, áudio e ponte de integração. Nexus conserva a integração com
`electron/nexus.cjs`. URLs públicas, manuais, cartas, mapas, fontes, sons,
licenças e créditos não são saídas descartáveis do build.

## Voz, captura e recursos avançados

`src/lib/voice/runtime.ts` integra os donos existentes. Microfone,
processamento de ruído, peers/P2P, SFU, reprodução, compartilhamento, qualidade e
áudio por aplicativo mantêm suas responsabilidades. `microphone.ts` possui
dispositivo/track; `application-audio.ts` possui grafos e jobs de áudio por
aplicativo; `noise-processors.ts` carrega os processadores locais.
Protocolos P2P/SFU validam SDP, ICE, respostas e catálogos antes de negociar.

`voice/navigation.ts` possui apresentação/rota da chamada e atividade de texto.
`voice/stage.ts` projeta grade/foco e preferências de exibição por participante.
`voice/stream-controls.ts` controla cada transmissão. Projetores de configurações
delegam aos donos de captura/reprodução; não abrem outra mídia.

Há um dono por recurso. Consumidores emprestados não param tracks ou fecham
contextos. Saída, cancelamento e troca de identidade invalidam operações antigas;
uma captura que termina atrasada é descartada pelo dono. A tentativa de chamada
guarda sua própria identidade de sala, mesmo que a navegação já tenha mudado.
Navegar conserva a chamada; entrar/trocar/sair da voz são ações explícitas.

`settings/controller.ts` possui abertura/aba de configurações. Perfis usam
`profiles/client.ts` para consultas e donos separados para viewer, editor,
busca de GIF e contas registradas. Biblioteca de arquivos e soundboard reutilizam
o cliente de arquivos. O editor possui rascunho, mídia pendente e salvar/descartar.

`clips/store.ts` mantém IndexedDB trono-local-clips v1, lojas clips/settings
e índice owner. Não recriar ou limpar registros ao reconstruir a apresentação.
Preferências conservam tronoClips:<owner> v2; `preferences/personal.ts` conserva
mn-personal:<id>. Troca de conta limpa a projeção e invalida trabalhos anteriores.

Gravação manual e replay possuem seus próprios recursos; bibliotecas e janelas
flutuantes emprestam comandos/streams. A gravação só confirma no commit da
persistência. Não criar recorder, buffer ou captura adicional ao navegar.
Remote PC conserva transporte, autorização de controle e ponte nativa existentes.

## Backend e persistência

`server/app.ts` compõe serviços isolados por aplicação; `server/index.ts` é
a entrada operacional. Express e ws mantêm os contratos HTTP/WebSocket atuais.
`server/http-api.ts` centraliza origem, CORS, autenticação, JSON limitado e
erros públicos. Contextos de conta/credenciais permanecem privados por request.

Serviços de canais coordenam participação em texto/voz/jogo. Chat possui buffer,
revisões, limites e histórico; persistência e moderação compartilham a fila por
sala. Broadcast ocorre depois da confirmação da persistência. Social publica
mensagens privadas somente para as duas contas participantes. Operações revalidam
socket, sala e identidade depois de IO. Mutação já aceita termina no escopo do
serviço; stop cancela pendências e impede publicação tardia.

Serviços de arquivos, storage e upload validam reserva, confirmação, quota e
autorização. Anexos privados exigem autorização explícita; object_key não é
público. Excluir confirma remoção do objeto antes de liberar quota/notificar.
PUT não confirmado conserva reserva pendente até a limpeza confirmada.
Adaptadores privilegiados não enviam segredos ao renderer.

Regras/validações compartilhadas em src continuam protegidas mesmo quando
importadas pelo servidor. Não alterar contratos, armazenamento ou autorização
como efeito colateral da reconstrução. Nenhuma migração de banco está prevista.
SQL de instalação e contratos operacionais existentes permanecem em suas fontes.

## Electron e distribuição

Main/preload possuem permissões, captura, áudio nativo, atalhos, atualizações e
integrações do SO. O renderer usa a ponte com isolamento de contexto.
O pacote carrega resources/renderer; desenvolvimento compilado usa out.
A política de scripts confere hashes dos bootstraps instalados.

O metadado mn-desktop-version vem de electron/package.json; download e pacote
devem corresponder. A instalação mantém com.jonatha.mn.trono; desenvolvimento
usa com.jonatha.mn.trono.development e perfil separado. Desenvolvimento não
instala nem atualiza automaticamente o produto distribuído.

Capacidades ausentes devem aparecer como indisponíveis. Fixtures de mídia/IPC
não comprovam hardware, segundo plano, captura ou instalação reais.
Contratos de distribuição estão em [ATUALIZACOES.md](ATUALIZACOES.md) e no guia
de desenvolvimento. Instalação, commit, publicação e deploy obedecem à autorização
do usuário; são operações separadas da implementação local.
