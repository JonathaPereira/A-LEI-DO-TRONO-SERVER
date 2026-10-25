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
vazia falha. tests/suites.json é a classificação única; helpers não são entradas.

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

## Operações especiais

desktop:build:native exige MSVC, Windows SDK e CMake; Remote Input pode exigir
ViGEmBus. desktop:package gera pacote local, sem autorizar instalação ou upload.
Versão e recursos estão em electron/package.json; o renderer publica
mn-desktop-version e o empacotador confere o metadado sem editar chunks.

Distribuição segue [ATUALIZACOES.md](ATUALIZACOES.md) e o workflow Windows.
database:prepare somente gera SQL revisável; não aplica migrações remotas.
Instalação em PGlite descartável não comprova instalação no serviço completo.
