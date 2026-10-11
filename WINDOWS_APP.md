# M&N · A Lei do Trono no Windows — 0.1.3

O aplicativo reúne o jogo e o chat com as mesmas contas, salas, cargos e mensagens do site. Mantém temas pessoais, canais independentes de texto/voz, câmeras, volumes, efeitos, compartilhamento com áudio isolado e atualizações internas. Esta versão suspende os clipes para reduzir trabalho de captura e gravação. Backend e SQL não mudam.

## Instalar e atualizar

1. No workflow **Windows full app**, baixe **MN-Trono-Windows-x64** da execução concluída desta versão. O repositório privado exige login no GitHub. Extraia o ZIP e instale `MN-Trono-0.1.3-Windows.exe` em uma instalação nova.
2. Depois de publicar o pacote completo do site, o login oferece **Baixe a versão desktop**. Quem já usa 0.1.1 ou posterior recebe a atualização internamente; quem ainda usa 0.1.0 precisa instalar uma versão atual uma vez para habilitar o atualizador. Preserve os dados do aplicativo.
3. Entre com a mesma conta do site. **Lembre de mim**, marcado inicialmente, restaura a sessão ao reabrir o app. Desmarcar ou sair da conta remove a sessão persistida. Sessões e preferências do navegador não são importadas automaticamente.

O instalador ainda não tem assinatura digital; o Windows pode mostrar editor desconhecido. Baixe do projeto ou do domínio oficial.

## Interface e configurações

A coluna esquerda contém Início, Jogar, Comunidade, Efeitos, Clipes bloqueados e Tela cheia. F11 também alterna tela cheia. **Pessoas** e **Telemetria** ficam no topo e podem ser minimizados. Em janelas estreitas ou verticais, **Canais** abre a lista em uma lateral recolhível. Os controles da chamada permanecem acessíveis; o mínimo da janela é 480 × 520.

Todas as configurações ficam na engrenagem inferior, com os tópicos **Minha conta, Aparência, Áudio, Vídeo, Captura de tela, Conexão e Privacidade**. Perfil, arquivos, tema, redimensionamento das colunas, música, dispositivos, supressão e qualidade da transmissão usam os mesmos controles e preferências existentes. A música começa desativada em uma instalação nova; uma escolha anterior explícita é preservada.

Entrar na comunidade ou clicar em uma sala de voz conecta à chamada automaticamente. Selecionar canais de texto permite escrever sem mudar ou desligar a sala de voz ativa. **Silenciar voz** bloqueia microfone e áudio recebido; voltar a ouvir restaura o estado anterior do microfone.

Em cada perfil da chamada, **Exibição** permite colocar câmera ou transmissão naquele quadrado, ou devolver a mídia ao espaço ampliado. O botão de minimizar na câmera também alterna essa posição. São escolhas individuais e não encerram a mídia.

## Áudio e permissões

**Supressão leve · nativa** é o padrão do app. Usa o processamento de áudio do Chromium, sem carregar o WASM do RNNoise. **RNNoise · avançado** permanece opcional, assim como **Sem supressão**. O modo leve da chamada também reduz a frequência de medidores e diagnósticos. Trocar o processamento ou dispositivo preserva o mute. A supressão nativa pode filtrar menos ruído e varia com hardware/driver; nenhuma opção garante áudio sem cortes quando o PC está saturado.

Na primeira utilização, o app pergunta separadamente por microfone e câmera. Permissões aceitas são guardadas no perfil local e reutilizadas após reiniciar. A câmera continua desligada até ser ativada. **Privacidade → Redefinir permissões** limpa essa autorização, encerrando a chamada quando necessário; o próximo uso pergunta novamente. As permissões do Windows continuam valendo: em Configurações do Windows → Privacidade e segurança, permita acesso de aplicativos desktop ao microfone/câmera.

O “Lembre de mim” guarda tokens de sessão criptografados por `safeStorage`/DPAPI do Windows; não salva a senha e não usa alternativa em texto puro. Se o armazenamento seguro estiver indisponível, informa que a sessão vale apenas enquanto o app estiver aberto. A autenticação continua validando e renovando a sessão com o servidor.

## Compartilhamento e áudio por aplicativo

**Trocar tela**, na prévia da transmissão, mantém a captura anterior até a nova escolha. Cancelar mantém a transmissão. Cada compartilhamento exige escolher uma fonte; lembrar permissões de câmera/microfone não autoriza captura de tela automática.

No seletor nativo, **Aplicativo escolhido · isolado** usa Application Loopback/WASAPI para capturar a janela escolhida e seus subprocessos. Para uma tela inteira, escolha separadamente o aplicativo que fornecerá áudio. A captura exclui o próprio M&N.

Requer **Windows 11 ou build 20348+**. Windows 10 comum não oferece essa API; a opção fica indisponível e o padrão é **Sem áudio**. **Computador inteiro** é uma alternativa explícita e pode incluir vozes da chamada e causar eco. Falhas no áudio isolado nunca passam silenciosamente ao áudio inteiro. O isolamento é por processo/aplicativo, não por aba de navegador. Microfone e supressão usam um fluxo separado. Duas capturas isoladas simultâneas permitem trocar a tela sem encerrar a anterior primeiro.

## Clipes suspensos e dados

**Clipes 🔒 — Em desenvolvimento** fica bloqueado. Os controles de replay/clipar e as preferências de clipes foram removidos da interface do app. Abrir o aplicativo, entrar na chamada e compartilhar a tela não iniciam replay, `MediaRecorder`, workers de clipes ou atalhos globais de clipes, mesmo se a versão anterior tinha início automático salvo. A transmissão normal continua disponível.

Clipes antigos permanecem no IndexedDB local, sem biblioteca acessível nesta versão. Não há upload de clipes para Cloudflare/Supabase. A suspensão se aplica ao aplicativo Windows; o site mantém seu recurso existente.

| Dado | Armazenamento |
| --- | --- |
| Contas, cargos, salas, mensagens e anexos | Serviços existentes, compartilhados com o site |
| Interface e jogo | Bundle instalado, atualizado junto com o app |
| Tema, dispositivos e preferências | Perfil local do app |
| Sessão lembrada | Arquivo criptografado pelo Windows, removido ao sair/desmarcar |
| Permissões de microfone/câmera | Perfil local do app, com redefinição em Privacidade |
| Clipes antigos | IndexedDB local preservado |

Atualizações preservam o perfil e a identidade do aplicativo. Limpar/desinstalar com exclusão de dados pode remover essas informações. Fechar a janela mantém a chamada na bandeja; **M&N → Sair** encerra de verdade.

## Atualizações internas e publicação

O app verifica `https://a-lei-do-trono.surge.sh/downloads/` após abrir e a cada quatro horas. Clicar no número da versão verifica manualmente. A nova versão baixa em segundo plano. **Reiniciar e atualizar** pede confirmação para encerrar a chamada; também instala ao sair de verdade. Fechar para a bandeja não instala nem reinicia silenciosamente uma call.

O canal depende da publicação do pacote completo **MN-Trono-Site-com-Desktop**, incluindo o instalador e `downloads/latest.yml`. Extraia o ZIP, entre na pasta `frontend` e execute:

```bash
surge . a-lei-do-trono.surge.sh
```

Dar merge no GitHub ou publicar só o frontend do código-fonte não atualiza o app instalado. O manifesto usa SHA-512 do EXE compilado; HTTPS e verificação de integridade não substituem assinatura digital. Falhas do atualizador não impedem usar a versão instalada.

## Desenvolvimento e validação

```bash
# Raiz, Node 24
npm ci
node --test tests/desktop-policy.js tests/desktop-updates.js tests/desktop-preferences.js tests/desktop-browser.js tests/desktop-download.js
npm run test:frontend
npm run test:clips

# Windows, Visual Studio C++ e Windows SDK recente
cd desktop/app
npm ci
npm run build:native
npm start
npm run pack:win
cd ../..
node desktop/scripts/prepare-downloads.cjs
```

O workflow `windows-app.yml` compila o helper e o instalador x64, testa Electron real (inclusive permissões após reiniciar e sessão criptografada) e abre o app compilado. Produz **MN-Trono-Windows-x64** e **MN-Trono-Site-com-Desktop**.

Nas próximas versões, incremente app/preload e publique o novo pacote completo. O script calcula o manifesto a partir do EXE e ajusta o download no frontend do pacote. Não coloque EXEs, `node_modules`, `artifacts/` ou credenciais no Git.

O teste de áudio físico é explicitamente ignorado quando o runner não tem saída de áudio ativa. Validar isolamento, sincronismo e desempenho sob carga no PC real continua necessário. Testes de navegador usam mídia artificial e simulam algumas fronteiras; não comprovam comportamento em todos os jogos e drivers.

## Segurança e compatibilidade

O app serve exclusivamente seu bundle local na origem HTTPS já autorizada. O atualizador usa sessão separada e canal público. Preload mantém `contextIsolation`, `sandbox` e `nodeIntegration: false`; IPC aceita apenas o frame principal autorizado. Janelas de anexos têm sessão separada e nenhum preload nativo. Captura nativa recebe somente a fonte escolhida no seletor confiável, com PCM limitado e controle de entrega. Nenhuma chave de serviço é embutida.
