# Distribuição web e Windows

A interface é compilada com `npm run build`. A saída publicável é `out/`;
`src/` contém fontes e `public/` contém entradas estáticas. Não publique essas
pastas de fontes como se fossem o aplicativo compilado.

O empacotamento Windows usa `electron/package.json` e inclui `out/` em
`resources/renderer`. O script `scripts/desktop/prepare-downloads.cjs` prepara
o site com um único instalador e seu manifesto de atualização, mantendo a pasta
`frontend/` dentro do ZIP para compatibilidade com a distribuição existente.

As notas por versão necessárias ao pacote ficam em `docs/archive/`. O workflow
Windows valida o build antes de preparar os downloads. Esta migração não altera
versões, não faz push e não publica builds.

Para comandos locais e pré-requisitos, consulte
[Desenvolvimento desktop](DESENVOLVIMENTO_DESKTOP.md). Para critérios de validação,
consulte [Contribuição](../CONTRIBUTING.md).
