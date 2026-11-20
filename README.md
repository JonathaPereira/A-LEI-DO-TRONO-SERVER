# A Corte · A Lei do Trono

Comunicação, jogos e chamadas na web e no Electron, com host Android em preparação. Interface Next.js/React com
TypeScript e exportação estática; backend Express/WebSocket existente.

A reconstrução está incorporada à main. A contribuição Android fica em `codex/android-app`.
[Plano e checkpoint](docs/MIGRACAO.md) ·
[Produto e visual](docs/UX_COMUNICACAO.md) ·
[Arquitetura](docs/ARQUITETURA.md) ·
[Desenvolvimento](docs/DESENVOLVIMENTO_DESKTOP.md)

## Executar e verificar

Requer Node.js 24.12 ou superior e dependências da raiz.

```powershell
npm run dev
npm run typecheck
npm run format:check
npm run build
npm test
```

`npm test` executa core. Use `--suite browser|desktop|all`, `--filter` com uma
expressão regular sobre caminhos e `--list` para conferir a seleção. Suítes de
interface consomem o build de out. A migração conserva as regressões úteis e os aceites visuais registrados no checkpoint.
Confira ali os resultados e os pré-requisitos nativos ainda pendentes.

Para Electron, serviços locais, dependências e fixtures, leia o guia de
desenvolvimento. Operações no backend publicado afetam dados reais.

## Fontes únicas

- [Workflow](docs/agents/workflow.md): TDD, skills, revisão e critérios.
- [Migração](docs/MIGRACAO.md): plano, preservação, entregas e aceites.
- [UX](docs/UX_COMUNICACAO.md): produto e referência aprovada.
- [Arquitetura](docs/ARQUITETURA.md): donos e ciclos de vida.
- [Desenvolvimento](docs/DESENVOLVIMENTO_DESKTOP.md): ambiente e verificações.
- [Atualizações](docs/ATUALIZACOES.md): contrato de distribuição.

Fontes em src, server, electron e android; testes em tests; operações em scripts.
Recursos originais de public são preservados. Saídas e evidências ficam nos
diretórios ignorados. Histórico detalhado permanece no Git.


## Android

A prévia 1.0.1 usa o mesmo backend e os mesmos donos, com navegação para celular,
Android Keystore, permissões próprias e foreground service durante chamadas.
Não declara paridade de todos os recursos nativos do Windows. Firebase, SQL,
assinatura permanente e aceite em aparelho continuam requisitos separados da
compilação. Consulte [gerar e configurar Android](docs/DESENVOLVIMENTO_DESKTOP.md#android-gerar-e-configurar),
incluindo o passo a passo do Firebase e os secrets do pipeline automático.
