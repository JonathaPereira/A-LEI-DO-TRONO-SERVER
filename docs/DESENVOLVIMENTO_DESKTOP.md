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
| `npm run test:profiles` | Validar perfis e autorização com banco local de teste |
| `npm run desktop:package` | Gerar o instalador Windows; exige o helper compilado |

Os testes de núcleo não substituem a validação de Electron real, dispositivos ou
chamadas entre máquinas. Os testes completos e a publicação estão descritos em
`WINDOWS_APP.md` e `.github/workflows/windows-app.yml`.

## Organização gradual

A primeira etapa centraliza os comandos de desenvolvimento e documenta o caminho
do desktop. As próximas etapas são validar os layouts no Electron, atribuir a um
único módulo a organização dos controles da chamada e extrair estado de mídia,
chat e apresentação para responsabilidades menores. Trocar tela, canal ou jogo
deve preservar a chamada e suas mídias.
