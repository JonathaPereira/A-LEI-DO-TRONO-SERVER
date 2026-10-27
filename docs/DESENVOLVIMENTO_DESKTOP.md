# Desenvolvimento e validação

## Ambiente e execução

Requer Node.js 24.12 ou superior. Next exporta out para web e Electron.
Backend existente possui conta, dados e WebSocket; segredos ficam no servidor.

A instalação inicial é uma ação explícita: npm ci na raiz; desktop:install
instala as dependências do Electron, sem substituir a aplicação distribuída.

Use npm run dev para Next. Para backend local, configure .env a partir de
.env.example e execute npm run server:dev em outro terminal. APP_URL exige HTTPS
fora de testes; origens locais entram em AUTH_ALLOWED_ORIGINS. Consulte os
valores vigentes no exemplo e nos scripts; não grave credenciais em documentação.

npm run desktop:dev inicia o modo de desenvolvimento. npm run build seguido de
desktop:start usa a exportação estática. Conforme a configuração, esses modos
acessam o backend publicado: mensagens, arquivos e perfis afetam dados reais.
Desenvolvimento usa identidade/perfil separados da instalação do usuário.

Alterações em electron exigem reinício; alterações C++ exigem recompilar o
helper. HMR não comprova continuidade de dispositivos após qualquer edição.

## Um comando de testes

| Comando                     | Conteúdo e pré-requisitos                                                             |
| --------------------------- | ------------------------------------------------------------------------------------- |
| npm test                    | Contratos core de controladores, HTTP/WS, regras e banco local; dependências da raiz. |
| npm test -- --suite browser | Build e Playwright com navegador; fluxos web e adaptadores sintéticos.                |
| npm test -- --suite desktop | Windows e dependências nativas específicas dos testes selecionados.                   |
| npm test -- --suite all     | Todos os pré-requisitos acima.                                                        |

Use --filter com regex sobre os caminhos; --list mostra a seleção sem executá-la.
Exemplo: npm test -- --filter 'portal|community-navigation'. Seleção inválida ou
vazia falha. tests/suites.json classifica os testes; tests/release.json seleciona
os fluxos que bloqueiam uma entrega. Sem perfil, cada suíte continua completa.
Use npm test -- --suite browser --profile release e o equivalente --suite desktop
para reproduzir a seleção da pipeline; --list mostra os arquivos antes de rodar.
O perfil preserva todos os contratos core e não transforma falhas em retries.

Windows full app usa um runner Windows para instalar/compilar uma vez, conferir
contratos, fluxos essenciais web/Electron, empacotar e aceitar o instalador.
Depois o job de publicação verifica a entrega e envia ao Surge. extended_browser
inclui a suíte browser inteira quando necessário, especialmente após mudanças
nos jogos ou na cascata compartilhada. A seleção antiga por --shard foi retirada
junto da matriz; não há outro comando de teste por cenário.

Antes de enviar alterações de validação, execute a seleção afetada em pelo menos
duas rodadas consecutivas locais com o Chromium do Playwright. Uma falha invalida
a sequência: diagnostique/corrija e reinicie as rodadas, sem retry oculto. Use o
mesmo build entre rodadas se os fontes não mudaram. Limites exclusivos de runner,
como aceitação NSIS, permanecem explícitos; não instalar no computador do usuário.

A suíte desktop inclui updater que importa dependências do Electron e remux que
exige ffmpeg/ffprobe no PATH. Modelos de mídia sem esses recursos ficam em core.

O runner respeita CHROMIUM_EXECUTABLE_PATH. No Windows, quando o navegador do
Playwright está ausente, aproveita o Chrome instalado no caminho padrão.
Instalação não é feita automaticamente. Dependência ausente permanece pendência.

## Conferência

Após código: typecheck, format:check, build e regressões afetadas. Build antes
de suítes que consomem out. Confira desktop, janela reduzida, tablet e telefone.
Aceite humano precede novos snapshots visuais permanentes.

Fixtures de conta, dados e arquivos são locais/descartáveis. Tracks sintéticas
exercitam ciclo de vida e transporte; não provam captura física ou qualidade.

Mídia exige Electron real com perfis de QA e, quando pertinente, dispositivos,
captura de tela/áudio reais. Confira dois clientes, mute/deafen, navegação sem
recaptura, permissões, cancelamento e descarte pelo dono. Em recursos avançados,
confira exportação de clipes/gravação, atalhos, ponte Windows e Remote PC.

Declare equipamento, serviço ou runtime ausente. Não trate fixture como aceite
do caminho nativo. Evidências da reconstrução ficam em artifacts/frontend-reset;
MIGRACAO informa o que foi realmente concluído.

Para a chamada reconstruída, selecione application-call-browser e
application-call-desktop com --filter nas respectivas suítes. O primeiro usa
contas descartáveis, áudio sintético e canvas transmitidos por WebRTC; o segundo
usa main/preload reais e captura uma BrowserWindow controlada de QA. O microfone
do teste desktop é sintético e suas permissões são pré-concedidas somente no
perfil temporário. Não substitui teste com equipamento nem áudio por aplicativo.
Capturas locais e logs ficam em artifacts/frontend-reset/call-qa e call-*.log.
Os testes não encerram o Electron do usuário nem reutilizam seu perfil.
desktop-call-layout usa dois Electron reais com fontes de câmera/tela sintéticas
animadas: verifica frames WebRTC, peers/players, fullscreen nativo e descarte
atrasado. desktop-browser usa Chromium e bridge Windows simulada; pertence à
suíte browser e não comprova IPC/hardware real.

## Operações especiais

desktop:build:native exige MSVC, Windows SDK e CMake; Remote Input pode exigir
ViGEmBus. desktop:package gera pacote local, sem autorizar instalação ou upload.
Versão e recursos estão em electron/package.json; o renderer publica
mn-desktop-version e o empacotador confere o metadado sem editar chunks.

Distribuição segue [ATUALIZACOES.md](ATUALIZACOES.md) e o workflow Windows.
database:prepare somente gera SQL revisável; não aplica migrações remotas.
Instalação em PGlite descartável não comprova instalação no serviço completo.

A regressão application-call-desktop usa porta livre e perfil temporário, evitando
conectar ao backend de outra execução/worktree. Ela captura somente a BrowserWindow
de QA criada pelo próprio teste. O helper de gravação espera o primeiro bloco
codificado em vez de assumir que 1.200 ms bastam; o destino de arquivo é adiado
pela fixture para verificar que a captura já foi encerrada antes da persistência.
FFmpeg/FFprobe ausentes aparecem como skip nas verificações externas de gravação e
replay no navegador; isso não equivale a validar esses decodificadores.

O smoke desktop-runtime conserva permissões, isolamento IPC, HTTPS com corpo/CORS,
exportação, PCM de soundboard, fullscreen e bandeja. A detecção de processos nativos
fica em desktop-activity-native, que depende do helper compilado e falha se ele
estiver ausente; não é substituída por um mock nesse teste. desktop-cinzas-runtime
prepara o cache local e usa backend descartável para convidado/Splendor/Love Letter.
A captura do smoke seleciona uma BrowserWindow de QA criada pelo próprio teste.

Na gravação manual, logout invalida também operações de diretório/arquivo: aborta
um writable ainda não confirmado e impede download de fallback. Arquivos já
confirmados não são apagados. Core cobre cada fronteira de IO; navegador confere
logout enquanto write está pendente, além de seleção/captura pendentes.


Atalaia tem fontes Godot em `games/atalaia`. Antes das regressões de Atalaia e
do executável empacotado, execute `node scripts/prepare-godot.cjs` e
`node scripts/build-atalaia.cjs`. O workflow faz essa preparação. O teste browser
inicia a campanha real, constrói, começa uma onda, confere o save após recarregar
e baixa um CSV, preservando a chamada sintética no Trono. A aceitação do pacote
Windows carrega a mesma exportação na sessão isolada real, com WebGL por software
no runner; isso não mede desempenho em uma GPU física. Detalhes de edição e
publicação ficam no [README do jogo](../games/atalaia/README.md).
