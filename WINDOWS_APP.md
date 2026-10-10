# M&N · A Lei do Trono no Windows

Esta primeira versão instala o **jogo completo e o chat** no Windows, com navegação entre Início, Jogar, Comunidade, Clipes e Perfil. Usa a mesma implementação do site para manter regras, contas, cargos, mensagens persistentes, temas pessoais, canais independentes de texto/voz, câmeras, compartilhamento, RNNoise, volumes, efeitos e clipes.

O app funciona sem Chrome instalado e sem o antigo `MN-Clipes.exe`. Os recursos online continuam dependendo do backend Render, Supabase e infraestrutura de voz existentes. O app e usuários do site participam das mesmas salas. Usar a mesma conta simultaneamente em dois aparelhos/abas continua sujeito à restrição de presença já existente no servidor.

## Instalar e usar

1. Na ação **Windows full app**, abra a execução concluída da branch/commit desejado e baixe o artifact **MN-Trono-Windows-x64**. É necessário estar conectado ao GitHub com acesso ao repositório privado.
2. Extraia o ZIP e execute `MN-Trono-0.1.0-Windows.exe`. Conclua o assistente e abra o atalho M&N Trono.
3. Entre com a mesma conta do site. O aplicativo tem sua própria sessão; não importa cookies, temas ou clipes do navegador.
4. Abra Comunidade e entre na voz. A barra inferior contém microfone, saída, câmera, tela, Clipar, biblioteca e configurações. Navegar entre início, lista de jogos e clipes preserva a chamada. Entrar efetivamente em outra sala segue as regras do site. Antes de sair de uma sala de jogo para a comunidade, o app pede confirmação.
5. Compartilhe uma tela ou janela. O replay é preparado automaticamente, conforme as preferências; o atalho global funciona mesmo com outra janela em foco. Jogos/atalhos exclusivos ou executados com outra elevação podem bloquear atalhos externos; não há garantia em todo jogo.
6. Em Clipes, revise os trechos antes de salvar ou descartar. A biblioteca local por conta persiste ao encerrar/reabrir o app. Salvar usa o seletor de arquivo/pasta do Windows. A pasta escolhida vale pela sessão; fechar o seletor ou uma falha de disco mantém o clipe pendente.
7. Fechar a janela mantém chamada/replay na bandeja. Para encerrar, use **M&N > Sair** ou o menu da bandeja.

O instalador desta versão ainda não tem assinatura digital; o Windows pode mostrar um aviso de editor desconhecido. Instale apenas o artifact publicado pelo projeto. Para atualizar, instale a nova versão preservando os dados do aplicativo. Não há atualizador automático nesta etapa.

## O que é local e o que é compartilhado

| Recurso | Onde fica |
| --- | --- |
| Contas, cargos, salas, mensagens e anexos | Serviços existentes, compartilhados com o site |
| Interface e arquivos do jogo/chat | Instalados e versionados com o aplicativo |
| Tema, dispositivos, preferências e sessão | Perfil local do aplicativo no Windows |
| Segundos recentes do replay | Buffer limitado em memória, descartado ao parar |
| Clipes criados e pendentes | IndexedDB local, por conta, até salvar/descartar |
| Clipes exportados | Arquivos WebM na pasta escolhida pelo usuário |

Limpar o perfil do app pode apagar clipes pendentes. Se o armazenamento local falhar, o app avisa que o clipe existe somente na memória e pausa o replay; salve antes de encerrar. Clipes não são enviados à Cloudflare/Supabase. Transmitir a chamada continua usando a infraestrutura de voz normal.

## Integrações Windows já implementadas

- Atalho global integrado, sem código de pareamento/componente separado.
- Seletor de telas/janelas com miniaturas fornecidas pelo Windows via Electron.
- Seletor de pastas/arquivos nativo, validação de nomes/WebM e gravação por arquivo temporário; exportações para pasta não sobrescrevem clipes existentes.
- Bandeja e instância única. Segundo lançamento traz a janela existente à frente.
- Aplicativo instalado com frontend local, isolamento do renderer e acesso restrito às funções nativas específicas.
- Execução do renderer sem o throttling de janela em segundo plano do Electron, para preservar o processamento da chamada/replay quando o jogo está em foco.

## Limites desta primeira versão

O seletor oferece **áudio do computador inteiro**, desmarcado por padrão. Pode incluir as vozes da chamada e causar eco. Ainda não há captura WASAPI isolada por processo/jogo; não apresente essa caixa como áudio exclusivo da janela. No site, as opções de áudio de janela/aba do navegador permanecem como antes.

Replay ainda usa `MediaRecorder` do Chromium/Electron, com a mesma qualidade configurável do site. A versão Windows não reserva recursos, não garante voz sem travamentos e ainda não implementa encoder nativo com seleção de NVENC/AMF/Quick Sync. Os testes automatizados não reproduzem CPU/GPU saturadas nem todos os jogos, drivers, headsets ou webcams.

Uma próxima etapa pode incorporar Windows Graphics Capture + WASAPI por processo + Media Foundation, depois medir qualidade, consumo e sincronismo no hardware real. Assinatura digital, atualização automática assinada e suporte a outros sistemas também são etapas futuras. A base atual possui uma API estreita para ampliar integrações sem expor Node/arquivos à interface.

## Desenvolvimento e publicação

```bash
# Na raiz do repositório (Node 24)
npm ci
node --test tests/desktop-policy.js tests/desktop-browser.js
npm run test:frontend
npm run test:clips

cd desktop/app
npm ci
npm start
npm run pack:win
```

O download do runtime Electron exige acesso às releases oficiais. O comando `pack:win` deve ser executado no Windows; o workflow `windows-app.yml` instala as dependências, testa o runtime real e produz o instalador x64. Não coloque `node_modules`, executáveis ou `artifacts/` no Git. Alterações no app/frontend disparam uma nova compilação nas branches configuradas.

O teste `desktop-browser.js` usa um adaptador nativo simulado e um backend de teste para verificar chamadas, navegação, mensagens, câmera, biblioteca, cancelamentos e temas. `desktop-runtime.js` executa Electron real no Windows para verificar origem local, isolamento, IPC de janela não autorizada, atalho acionado por entrada real do Windows com o app sem foco, captura real de tela, cancelamento, RNNoise/AudioWorklet/WASM do bundle e exportação real de arquivo. Os testes do site verificam os fluxos existentes com Chromium; áudio/RTP físico e comportamento durante um jogo pesado exigem validação manual.

O backend e o SQL **não mudam nesta entrega**. O app serve exclusivamente seu bundle local na origem HTTPS já autorizada pelo servidor; solicitações dessa origem nunca carregam uma interface remota com privilégios nativos. Site e app continuam falando o protocolo/API existente. Publicar os arquivos `frontend/` no Surge mantém o site atualizado, mas o instalador já leva seu próprio frontend e não depende de uma publicação do Surge para mostrar a nova interface do app.

O preload usa `contextIsolation`, `sandbox` e `nodeIntegration: false`. IPC aceita somente o frame principal da janela instalada, valida nomes, origem, atalhos, dados e identificadores opacos de pasta. Janelas de anexos usam outra sessão, sem preload ou autorização nativa. A CSP bloqueia scripts, frames externos e plugins na interface instalada. O transporte HTTPS preserva corpo, autenticação e metadados de uploads e acrescenta a origem do app somente ao backend conhecido; o teste usa um endpoint HTTPS descartável para conferir fetch e XHR reais. Nenhuma chave de serviço é embutida no app.
