# Contribuir

Comece pelo [README](README.md) e pelo [guia desktop](docs/DESENVOLVIMENTO_DESKTOP.md).
Antes de converter um fluxo, leia [Arquitetura](docs/ARQUITETURA.md) e confira sua
etapa em [Migração](docs/MIGRACAO.md).

## Alterar e verificar

Trabalhe em uma branch de contribuição, preservando a main. Use os comandos de
formatação e tipagem do `package.json`. Mantenha módulos com propósito claro e
nomes do domínio; comentários explicam decisões e restrições não óbvias.

`npm test` cobre backend e jogos; `test:profiles` cobre validação de perfis;
`test:desktop:core` cobre políticas do desktop. O `package.json` também agrupa
testes de voz, jogos, social, clipes e layouts.

Para mudanças na interface, compile antes de testar: os testes e o Electron
consomem `out/`. Instale Chromium com `npx playwright install chromium`.
`test:desktop:layout` abre duas instâncias reais com perfis descartáveis e mídia
simulada para verificar chamadas nas trocas de layout e navegação.

Antes de distribuir, valide também build nativo, runtime e aplicativo empacotado
no Windows, conforme `.github/workflows/windows-app.yml`. Não altere versões nem
publique instaladores como parte de uma refatoração de estrutura.

## Onde editar

Edite telas em `src/components/`, bibliotecas em `src/lib/`, estilos de domínio
em `src/styles/`, backend em `server/` e integração nativa em `electron/`.
`src/legacy/` foi removida. A tipagem também recusa variáveis, imports e parâmetros
sem uso; use o prefixo `_` somente para posições obrigatórias de callbacks.
Os JS/CSS preparados em `public/`, `.next/` e `out/` são gerados. Preserve recursos,
créditos e licenças de `public/assets`, `public/vendor` e `public/roguelite`.

Atualize a documentação responsável pela informação. As notas de `docs/archive/`
são históricas.
