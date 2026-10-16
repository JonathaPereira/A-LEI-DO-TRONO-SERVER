# Desenvolvimento desktop

O aplicativo Windows tem dois modos locais. Ambos usam um perfil de teste em
`artifacts/desktop-profile`, separado do perfil da instalação do usuário.

## Interface compilada e backend existente

```powershell
npm ci
npm run desktop:install
npm run build
npm run desktop:start
```

O Electron serve `out/` como a origem instalada, sem executar um servidor Next no
computador do usuário. Esse modo usa o backend publicado e as contas existentes.
Chat, arquivos e alterações de perfil afetam o serviço real. Após editar fontes,
execute `npm run build` e recarregue a janela. Não precisa gerar instalador.

## Atualização ao salvar com backend local

Prepare o ambiente local:

```powershell
Copy-Item .env.example .env
```

Configure as credenciais do ambiente de desenvolvimento em `.env`. O backend usa
Supabase para contas e persistência; mantenha autenticação obrigatória. As chaves
secretas ficam somente no backend. As migrações SQL estão em `supabase/`; esta
reorganização não executa migrações nem altera serviços remotos.

Em um terminal:

```powershell
npm run server:dev
```

Em outro:

```powershell
npm run desktop:dev
```

O segundo comando inicia Next em `http://127.0.0.1:3000` e abre o Electron nessa
origem. A interface procura o backend em `http://127.0.0.1:10000`. A origem precisa
estar em `APP_URL` e `AUTH_ALLOWED_ORIGINS`, como no exemplo.

Páginas, componentes e estilos globais usam a atualização do Next. Controladores
DOM podem exigir recarga completa: leia o guia de migração antes de introduzir
estado React em uma área controlada por eles. Para editar `src/legacy/`, reinicie
`desktop:dev` para preparar os arquivos de compatibilidade. Mudanças em
`electron/` exigem reabrir a aplicação; mudanças em C++ exigem recompilação.

O modo de desenvolvimento aceita apenas uma origem HTTP em `127.0.0.1` com porta
explícita e é desativado no aplicativo empacotado. O instalador serve somente seus
arquivos e autoriza os scripts de bootstrap por hash.

## Helper C++

Para áudio isolado de aplicativos e detecção de atividade, instale Visual Studio
ou Build Tools com **Desenvolvimento para desktop com C++**, MSVC, Windows SDK e
CMake. Depois:

```powershell
npm run desktop:build:native
```

O script detecta Visual Studio e CMake, escolhe o gerador disponível e produz
`artifacts/native-audio/Release/MN-Application-Audio.exe`. Não configure NMake
manualmente. A interface pode abrir sem o helper; as funções que dependem dele
ficam indisponíveis.

## Empacotar

```powershell
npm run desktop:build:native
npm run desktop:package
```

O pacote inclui a saída estática em `resources/renderer`. Os recursos grandes de
Cinzas mantêm a política de cache verificado. Valide as regressões Windows de
`CONTRIBUTING.md` antes de distribuir.
