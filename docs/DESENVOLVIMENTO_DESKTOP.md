# Desenvolvimento do desktop M&N

O foco atual do projeto é o aplicativo Windows. O Electron carrega os arquivos de
`frontend/` do checkout local e acrescenta navegação, configurações, permissões,
atualização e integrações nativas. A experiência no navegador serve como uma
validação complementar; ela não substitui a avaliação do aplicativo real.

## Abrir a versão local

Use Node.js 24 e npm. Execute na raiz do repositório:

```powershell
npm ci
npm run desktop:install
npm run desktop:start
```

As duas instalações só precisam ser repetidas quando as respectivas dependências
mudarem. Para abrir novamente, basta `npm run desktop:start`.

A interface é a deste checkout, sem precisar gerar instalador. O aplicativo usa o
backend existente em `https://a-lei-do-trono-server.onrender.com`: entre com a mesma
conta da comunidade. Mensagens e outras ações nessa sessão usam o serviço real.
Não é necessário iniciar `npm start` ou o servidor estático para esse fluxo.

O comando da raiz guarda a sessão e as preferências de desenvolvimento em
`artifacts/desktop-profile/`, separado do perfil da versão instalada. Essa pasta é
ignorada pelo Git e pode conter dados privados da conta; não a compartilhe.

Depois de editar HTML, CSS ou JavaScript de `frontend/`, use **Visualização →
Recarregar**. Para mudanças em `desktop/app/`, encerre em **M&N → Sair** e execute
o comando novamente. Fechar a janela normalmente envia o aplicativo para a bandeja.
F11 alterna tela cheia. O atualizador fica em modo de desenvolvimento nesta execução.

## Recursos nativos opcionais para avaliar a interface

O helper C++ é usado para áudio isolado por aplicativo e detecção de jogos.
A interface, autenticação, chat e os fluxos comuns de mídia podem iniciar sem ele.

Para compilar o helper, instale Visual Studio Build Tools com desenvolvimento
desktop em C++, um Windows SDK recente e CMake 3.24 ou posterior. Então execute:

```powershell
npm run desktop:build:native
```

O resultado esperado é `artifacts/native-audio/Release/MN-Application-Audio.exe`.
O comando detecta Visual Studio e CMake mesmo em um terminal aberto antes da
instalação. Também substitui um cache NMake antigo pelo gerador Visual Studio x64;
não é necessário configurar o NMake ou abrir um Developer PowerShell.
Reabra o app depois da compilação. Captura isolada exige Windows build 20348 ou
superior; câmera e microfone também dependem das permissões do sistema.

## Comandos da raiz

| Comando | Finalidade |
| --- | --- |
| `npm run desktop:install` | Instalar as dependências fixadas do Electron |
| `npm run desktop:start` | Abrir o aplicativo com perfil de desenvolvimento |
| `npm run desktop:build:native` | Compilar o helper Windows de áudio e atividade |
| `npm run test:desktop:core` | Validar políticas, preferências, atualizações, notificações e lógica de áudio |
| `npm run test:desktop:layout` | Exercitar layouts e navegação em duas instâncias reais do Electron com contas e mídias de teste |
| `npm run test:profiles` | Validar perfis e autorização com banco local de teste |
| `npm run desktop:package` | Gerar o instalador Windows; exige o helper compilado |

Os testes de núcleo não substituem a validação de Electron real, dispositivos ou
chamadas entre máquinas. Os testes completos e a publicação estão descritos em
`WINDOWS_APP.md` e `.github/workflows/windows-app.yml`.

## Organização dos controles da chamada

`frontend/call-controls-layout.js` é o único módulo que posiciona os botões da
chamada, o acesso às pessoas e a barra de controles. Ele registra as posições
originais antes da montagem do desktop e escolhe diretamente o destino de cada
elemento. Os botões são movidos, preservando identidade e listeners.

- `desktop-shell.js` monta a navegação e os contêineres do aplicativo.
- `app-layout.js` aplica a preferência Original/Discord e atualiza perfil e conexão.
- `call-workspace.js` monta a área da comunidade e controla sua navegação lateral.
- `call-controls-layout.js` centraliza posicionamento, ícones e rótulos dos controles.

Os módulos de apresentação podem chamar `TronoCallControlsLayout.refresh()` após
criar seus contêineres. Mudanças de tela e de estado da chamada também atualizam
o posicionamento. O módulo não captura mídia, não abre conexão e não conecta
handlers de ações aos botões. As configurações do desktop continuam no diálogo
montado por `desktop-settings.js`.

O teste `tests/desktop-call-layout.js` usa duas instâncias do Electron e um backend
local com provedor de contas simulado. Ele verifica os mesmos nós, tracks, socket,
conexão WebRTC e associações à voz e ao jogo durante a troca de layouts, navegação,
assinatura de texto e redimensionamento. Também verifica mute e configurações.
As capturas ficam em `artifacts/call-layout/`. Não usa contas ou dispositivos reais.

Esse teste reproduziu no código anterior a perda da posição do microfone ao
retornar ao layout Original após alternar entre as áreas. O teste passa com o
posicionamento centralizado e também integra o workflow Windows existente.

## Próximas etapas de organização

Os comandos de desenvolvimento e o posicionamento dos controles já estão
centralizados. As próximas etapas são extrair estado de mídia, chat e apresentação
para responsabilidades menores. Trocar a área visível ou abrir texto/jogos deve
preservar a chamada e suas mídias; trocar a própria sala de voz segue o fluxo
explícito de saída e entrada.
