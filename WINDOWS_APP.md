# M&N · A Lei do Trono no Windows — 0.1.2

O aplicativo reúne o jogo e o chat do site, com as mesmas contas, salas, cargos e mensagens. Preserva temas pessoais, canais independentes de texto/voz, câmeras, RNNoise, volumes, efeitos e a biblioteca de clipes. Não precisa do Chrome nem do antigo `MN-Clipes.exe`. Os recursos online continuam usando os serviços existentes.

## Instalar e usar

1. No workflow **Windows full app**, baixe **MN-Trono-Windows-x64** da execução concluída correspondente à versão. O repositório privado exige login no GitHub. Depois de publicar o pacote do site, o login também oferece **Baixe a versão desktop**, sem exigir conta no GitHub.
2. Para uma instalação nova, extraia o ZIP e instale `MN-Trono-0.1.2-Windows.exe`. Quem já tem 0.1.1 recebe 0.1.2 internamente quando o pacote completo for publicado no site. Quem tem 0.1.0 precisa de uma instalação manual única para receber o atualizador. Mantenha os dados do aplicativo.
3. Entre com a mesma conta do site. Sessões, temas e clipes do navegador não são importados. A restrição de presença da mesma conta em sessões simultâneas continua valendo.
4. A coluna esquerda contém Início, Jogar, Comunidade, Efeitos, Clipes, Perfil e Tela cheia. F11 também alterna tela cheia. A biblioteca de clipes oculta a área central da chamada; os controles inferiores e a voz permanecem ativos. **Pessoas** e **Telemetria** ficam no topo e permitem abrir/minimizar seus painéis em qualquer área. A presença recebe atualizações ao vivo do servidor.
5. Ao abrir, o app prepara o replay da **tela principal definida no Windows**, com o áudio do computador quando disponível. O indicador superior mostra quando está pronto. O atalho global guarda os segundos anteriores mesmo com o jogo em foco, sem entrar na voz ou publicar a tela. Em máquinas sem saída de áudio disponível, tenta vídeo sem áudio e informa isso em Clipes. Jogos podem bloquear atalhos externos, especialmente com elevações diferentes.
6. O replay privado da tela principal continua independente de compartilhar outra tela e de sair da chamada. **Trocar tela**, na prévia da transmissão, mantém a captura anterior até a nova escolha; cancelar mantém a transmissão atual. Se o replay estiver usando a transmissão em vez da fonte privada, a troca inicia um novo buffer. Clipes já criados permanecem.
7. Em Clipes, configure duração, qualidade, FPS, atalho e pasta. **Trocar fonte do replay** permite escolher outra tela/janela e seu áudio. A preferência **Preparar a tela principal ao abrir o aplicativo** desativa o início automático. **Parar replay local** libera a captura privada e descarta somente os segundos temporários; não reinicia ao mutar/desmutar ou entrar na voz até você reativar. Guarde vários trechos e escolha quais salvar/descartar. A pasta de exportação vale pela sessão. Cancelar o seletor ou falhar a gravação mantém o clipe pendente.
8. Fechar a janela mantém chamada/replay na bandeja. Para encerrar de verdade, use **M&N > Sair** ou o menu da bandeja.

**Silenciar voz** bloqueia o microfone e o áudio recebido da chamada. Ao voltar a ouvir, restaura o estado anterior do microfone, inclusive se já estava mutado. O microfone não pode ser liberado enquanto o áudio da chamada estiver silenciado.

Em cada perfil da chamada, **Exibição** permite colocar a câmera ou a transmissão naquele quadrado, ou devolver as mídias ao espaço ampliado. O botão de minimizar na câmera também alterna essa posição. São preferências locais, sem encerrar a mídia nem mudar a visualização das outras pessoas. Tela cheia continua disponível.

O instalador ainda não tem assinatura digital; o Windows pode mostrar editor desconhecido. Baixe somente do projeto ou do domínio oficial.

## Áudio por aplicativo

No seletor nativo, **Aplicativo escolhido · isolado** usa a API Windows Application Loopback/WASAPI para capturar o processo da janela escolhida e seus subprocessos. Para uma tela inteira, escolha separadamente a janela do aplicativo que fornecerá o áudio. A captura exclui o próprio app M&N, para evitar retransmitir as vozes reproduzidas nele.

Requer **Windows 11 ou Windows build 20348+**. O Windows 10 comum (build 19045) não oferece essa API; nesse caso a opção fica indisponível e o padrão é **Sem áudio**. **Computador inteiro** é uma alternativa explícita: pode incluir a chamada e causar eco. Uma falha da captura isolada nunca troca silenciosamente para o áudio inteiro.

O isolamento é por processo/aplicativo, não por aba. Abas ou janelas de um mesmo navegador podem compartilhar processos. Prefira a janela do jogo instalado para separar seu som das demais aplicações. Microfone e RNNoise continuam em um fluxo separado. Há até duas capturas isoladas simultâneas para permitir trocar a tela sem encerrar a anterior primeiro.

## Atualizações internas

O app verifica o canal público `https://a-lei-do-trono.surge.sh/downloads/` após abrir e a cada quatro horas. Clicar no número da versão permite verificar manualmente. A nova versão baixa em segundo plano. O aviso **Reiniciar e atualizar** pede confirmação porque encerra a chamada e o buffer temporário; os clipes criados persistem. Também instala ao sair de verdade, depois de confirmar o encerramento, sem reiniciar uma chamada silenciosamente. Fechar para a bandeja continua mantendo o app aberto.

O canal só fica disponível quando o responsável publica o pacote completo do site, incluindo o instalador e `downloads/latest.yml`. Usuários a partir de 0.1.1 não precisam baixar outro EXE manualmente: o atualizador faz esse download e instala internamente. Publicar somente o frontend do Git não atualiza o app instalado. O manifesto contém SHA-512 do instalador; HTTPS e a verificação de integridade não substituem uma assinatura digital de editor. Falhar a atualização não interrompe o uso do app.

## Dados e consumo

| Recurso | Armazenamento |
| --- | --- |
| Contas, cargos, salas, mensagens e anexos | Serviços existentes, compartilhados com o site |
| Interface e jogo | Bundle instalado, atualizado junto com o app |
| Tema, dispositivos, preferências e sessão | Perfil local do app |
| Segundos recentes do replay | Buffer limitado em memória, descartado ao parar/trocar fonte |
| Clipes criados e pendentes | IndexedDB local por conta, até salvar/descartar |
| Clipes exportados | WebM no local escolhido pelo usuário |

Não há upload de clipes para Cloudflare ou Supabase. Limpar o perfil pode apagar clipes pendentes. Se o armazenamento local falhar, o app avisa e pausa o replay; salve os clipes que estiverem apenas em memória antes de encerrar. Atualizações preservam a identidade e o perfil do aplicativo.

Replay continua usando `MediaRecorder` do Chromium/Electron: até 1440p/60 FPS conforme fonte, hardware e preferência. Não há encoder nativo com seleção de NVENC/AMF/Quick Sync nem reserva garantida de CPU/GPU. Uma captura privada também consome recursos de captura e codificação.

## Desenvolvimento e publicação

```bash
# Raiz, Node 24
npm ci
node --test tests/desktop-policy.js tests/desktop-updates.js tests/desktop-browser.js tests/desktop-download.js
npm run test:frontend
npm run test:clips

# Windows, com Visual Studio C++ e Windows SDK recente
cd desktop/app
npm ci
npm run build:native
npm start
npm run pack:win
cd ../..
node desktop/scripts/prepare-downloads.cjs
```

O workflow `windows-app.yml` compila o helper nativo e o instalador x64, testa Electron real e abre o executável compilado. Produz dois pacotes:

- **MN-Trono-Windows-x64**: instalador e instruções para o usuário.
- **MN-Trono-Site-com-Desktop**: frontend completo, instalador e manifesto de atualização. Extraia, entre na pasta `frontend` do pacote e execute `surge . a-lei-do-trono.surge.sh`. Não publique somente os arquivos do Git: o executável não fica no repositório.

Nas próximas versões, incremente a versão do app/preload e publique o novo pacote completo do site. O script calcula o manifesto a partir do EXE realmente compilado e ajusta o link de download no frontend do pacote. Nunca coloque `node_modules`, `artifacts/`, EXEs ou chaves de serviço no Git.

O teste de áudio inicia dois processos com tons diferentes e mede se o processo capturado exclui o outro. Se o runner não tiver dispositivo de reprodução ativo, esse teste é explicitamente ignorado; validar isolamento e sincronismo no computador real continua necessário. Os testes não reproduzem todos os jogos, drivers ou CPU/GPU saturadas. Testes de navegador simulam algumas fronteiras de mídia, sem afirmar validação de RTP físico.

## Segurança e compatibilidade

Backend e SQL **não mudam**. O app serve exclusivamente seu bundle local na origem HTTPS já autorizada; não carrega interface remota com privilégios nativos. A sessão do atualizador é separada e usa o canal público. Site e app mantêm o protocolo/API existente.

O preload usa `contextIsolation`, `sandbox` e `nodeIntegration: false`. IPC aceita apenas o frame principal autorizado e valida atalhos, nomes, bytes, pastas e fontes de captura. O helper recebe somente uma fonte selecionada no seletor confiável. PCM possui filas limitadas e crédito de entrega, sem monitoramento em alto-falantes. Janelas de anexos usam outra sessão, sem preload nativo. Nenhuma chave de serviço é embutida.
