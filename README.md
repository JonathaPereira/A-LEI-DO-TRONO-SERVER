# A Corte · A Lei do Trono

Comunicação, jogos e chamadas na web e no Electron. Interface Next.js/React com
TypeScript e exportação estática; backend Express/WebSocket existente.

A reconstrução está na branch `codex/frontend-rebuild`.
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
interface consomem o build de out. A adaptação de expectativas antigas acompanha
os marcos; confira as pendências antes de interpretar testes como aceite visual.

Para Electron, serviços locais, dependências e fixtures, leia o guia de
desenvolvimento. Operações no backend publicado afetam dados reais.

## Fontes únicas

- [Workflow](docs/agents/workflow.md): TDD, skills, revisão e critérios.
- [Migração](docs/MIGRACAO.md): plano, preservação, entregas e aceites.
- [UX](docs/UX_COMUNICACAO.md): produto e referência aprovada.
- [Arquitetura](docs/ARQUITETURA.md): donos e ciclos de vida.
- [Desenvolvimento](docs/DESENVOLVIMENTO_DESKTOP.md): ambiente e verificações.
- [Atualizações](docs/ATUALIZACOES.md): contrato de distribuição.

Fontes em src, server e electron; testes em tests; operações em scripts.
Recursos originais de public são preservados. Saídas e evidências ficam nos
diretórios ignorados. Histórico detalhado permanece no Git.
