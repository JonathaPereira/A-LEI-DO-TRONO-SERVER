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

O fixture web de Atalaia espelha a exportação real Godot em servidores estáticos
próprios. Traz a aba à frente antes de gestos que dependem de frames, limita as
esperas e registra fases; encerra contexto e conexões HTTP após as verificações.
Isso pertence à preparação/limpeza do teste, não ao comportamento do jogo.

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

Na voz em segundo plano, o perfil release mede cinco combinações: nativo a 100%
com janela coberta, minimizada e oculta; nativo a 180% com janela oculta; RNNoise
a 100% com janela oculta. Cada configuração de áudio conserva seu baseline e
amostras PCM de cinco segundos, com as mesmas verificações de RTP e recursos.
Sem perfil, `npm test -- --suite desktop --filter desktop-background-voice`
executa as nove combinações. A matriz completa continua necessária ao alterar
processamento, ganho ou comportamento de segundo plano.

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

Para medições e aceite final, execute as suítes em sequência: fixtures de arquivos
distintos ainda podem usar a mesma porta, inclusive Love Letter e o smoke empacotado.
Uma colisão pode responder com a conta/backend de outro cenário e invalida a execução.
Portas diferentes também não isolam disputa de CPU, captura e janelas nativas.
O teste `desktop-remote-native` injeta mouse/teclado na janela de QA e exige o
desktop sem interação durante esse trecho. Não mover o mouse, digitar ou trocar
de janela: o Windows pode entregar o clique à janela sobreposta mesmo quando
Electron informa foco na janela do teste. Não substituir esse gate por foco via DOM.

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

Os atalhos das janelas de jogos são exercitados com
`webContents.sendInputEvent`, incluindo entrada e saída de tela cheia. O teclado
injetado na página pelo CDP percorre outro caminho do Chromium e não aciona o
`before-input-event` do Electron. A verificação Windows 40526544387 confirmou
os dois estados de tela cheia pela entrada nativa antes da aceitação completa.


## Android: gerar e configurar

A versão do app é a de `electron/package.json` (agora 1.0.1); Gradle deriva
`versionCode = major*1000000 + minor*1000 + patch`. O protocolo backend mantém sua
versão interna. Use Node 24.12+, JDK 21 completo e Android SDK 36/build-tools 35.

1. `npm ci`, `npm run build`, `npm run android:sync`.
2. `npm run android:open` abre Android Studio; ou execute
   `android/gradlew -p android assembleDebug` para um APK de teste.
3. O arquivo é `android/app/build/outputs/apk/debug/app-debug.apk`. Habilite a
   instalação da origem usada para abrir o APK no aparelho. Debug não é a entrega
   permanente: sua chave pode mudar e exigir desinstalar antes de outro build.
4. Incorpore/deploy o backend desta branch para aceitar `https://localhost`.
   Para um servidor anterior, adicione essa origem a `AUTH_ALLOWED_ORIGINS`, sem
   remover as origens existentes. Senha, contas, dados e autorização são os mesmos.

O workflow `Android app` valida fontes, core/browser e uma WebView Android API35
real em emulador antes de publicar APK. A fixture é Supabase simulado e backend
real descartável. O teste faz login, usa o microfone virtual do emulador, minimiza
por cinco segundos, verifica a mesma track, aviso nativo e descarte ao sair.
Isso não comprova voz audível, tela bloqueada prolongada, Bluetooth, câmera ou
Doze em hardware. O host local desta sessão não tem KVM; execução em dispositivo
pertence ao runner/emulador ou aparelho, não aos testes Chromium de layout.
`TRONO_ANDROID_TEST_BACKEND` só aceita loopback no sync; nunca usar na distribuição.
O pipeline sincroniza novamente sem esse valor antes de empacotar a publicação.

### Firebase — configuração inicial

1. Abra <https://console.firebase.google.com/>, crie o projeto **MN Trono**;
   Analytics é opcional e não é exigido pelo aplicativo.
2. Adicione um aplicativo **Android** com pacote exato `br.com.mntrono.app`.
   Baixe `google-services.json`. Esse é o arquivo de configuração Android; não o
   confunda com a chave privada do serviço, que nunca deve ser enviada pelo chat.
3. No GitHub do repositório, Settings → Secrets and variables → Actions → New
   repository secret: `FIREBASE_ANDROID_CONFIG_JSON`, com o conteúdo completo
   desse `google-services.json`. Localmente, o arquivo pode ficar em
   `android/app/google-services.json` (ignorado pelo Git).
4. No Google Cloud do mesmo projeto, confirme a **Firebase Cloud Messaging API
   (HTTP v1)** habilitada. Firebase → Configurações do projeto → Contas de serviço:
   gere uma chave privada para o serviço autorizado a enviar mensagens FCM.
   Guarde-a como variável secreta `FIREBASE_SERVICE_ACCOUNT_JSON` somente no
   serviço backend do Render. Nunca use NEXT_PUBLIC, variável de frontend,
   Surge, APK ou commit para esse JSON privado. Restrinja a conta à permissão de
   envio do Firebase Cloud Messaging; proteja e rotacione a chave.
5. No SQL Editor do Supabase existente, execute somente
   `supabase/upgrade-android-push.sql`, que é aditivo. Não rode `install.sql` no
   banco existente. Faça backup conforme sua rotina de banco.
6. Incorpore/deploy esta branch no backend. `/health` deve informar
   `androidPush.configured: true`; esse sinal verifica configuração, não entrega
   física. Reconstrua o APK pelo workflow com o secret do passo 3.
7. Instale, entre na conta, Menu → Voz e vídeo → Notificações → **Ativar
   notificações no Android**. Envie uma DM de outra conta com o app minimizado
   e depois com o processo encerrado normalmente. Confirme o destino ao tocar.
   Forçar parada nas configurações do Android bloqueia push até abrir o app de novo.

Push FCM requer os Serviços Google Play no aparelho.

Sem Firebase, o APK ainda abre e usa conta/chat/jogos/chamada; push com o processo
encerrado fica desativado. Avisos do socket dependem do processo ativo, e o serviço
só mantém essa atividade durante chamadas iniciadas explicitamente. DMs/pedidos
usam push genérico quando configurado; push de menções de canal é pendência.

### Assinatura e futuras atualizações Android

Crie uma chave permanente no Android Studio, Build → Generate Signed App Bundle /
APK → Create new. Guarde o JKS e as senhas fora do Git em local seguro; perder a
chave impede atualizar instalações distribuídas diretamente. No GitHub configure:

- `ANDROID_KEYSTORE_BASE64`: conteúdo binário do JKS convertido em Base64.
- `ANDROID_STORE_PASSWORD`: senha do JKS.
- `ANDROID_KEY_ALIAS`: alias escolhido.
- `ANDROID_KEY_PASSWORD`: senha da chave.

Localmente os nomes usados pelo Gradle são `TRONO_ANDROID_KEYSTORE_PATH`,
`TRONO_ANDROID_STORE_PASSWORD`, `TRONO_ANDROID_KEY_ALIAS`,
`TRONO_ANDROID_KEY_PASSWORD`. `assembleRelease bundleRelease` recusa configuração
incompleta. No GitHub, com os quatro secrets, a execução gera APK/AAB assinados;
sem eles publica somente um APK identificado como teste. Uma execução da main
com chave permanente publica `android-v<versão>`; branches publicam prévias.
Isso não publica na Play Store nem instala uma atualização sem consentimento.
A distribuição Windows/Surge existente continua com seus próprios checks.
