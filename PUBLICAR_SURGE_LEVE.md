# Publicar o site leve e a atualização Windows

O repositório público de downloads já existe: **JonathaPereira/MN-Trono-Downloads**. O código do aplicativo continua no repositório privado.

- **MN-Trono-Site-Leve-0.1.12.zip** contém o frontend completo, com cerca de 20 MB, manual, imagens, jogos, RNNoise e downloads/latest.yml. Não inclui instaladores.
- **MN-Trono-0.1.12-Windows.exe** é o instalador. Publique-o no GitHub Releases antes de publicar o site.

Consulte o guia **ATUALIZAR_WINDOWS_v0.1.12.md** para esta versão. Não há SQL novo nem alteração do backend nesta atualização visual.

## Publicar

1. Abra **Pacotes Windows 0.1.12**, o link de Releases privadas indicado no PR. Entre na sua conta GitHub e baixe o EXE e o ZIP do site da mesma entrega. Extraia o ZIP numa pasta nova. Os pacotes ficam em um rascunho privado para revisão, fora da cota de artefatos dos Actions.
2. Abra https://github.com/JonathaPereira/MN-Trono-Downloads/releases/new. Crie **v0.1.12**, anexe **MN-Trono-0.1.12-Windows.exe** e publique. O link precisa abrir sem login:
   https://github.com/JonathaPereira/MN-Trono-Downloads/releases/download/v0.1.12/MN-Trono-0.1.12-Windows.exe
3. Entre na pasta **frontend** do artefato leve pelo Git Bash e execute:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

4. Confira https://a-lei-do-trono.surge.sh/downloads/latest.yml: **version: 0.1.12**, com o endereço público do EXE. Preserve o arquivo e o SHA-512 gerados.
5. Na tela de login, **Baixe a versão desktop** abre o instalador. O aplicativo já instalado recebe a atualização internamente; clique na versão do rodapé para buscar e reinicie quando puder encerrar a chamada.

O atualizador consulta o manifesto no Surge e busca o EXE no GitHub, verificando SHA-512 antes de instalar. Contas, permissões e preferências são mantidas. Não há chaves ou tokens para adicionar no frontend.

## Próximas versões e retenção

Cada pacote leve identifica sua versão, URL, tamanho e digest em **TAMANHO-E-DOWNLOAD.json**. Se a versão já estiver publicada, o empacotador reutiliza o instalador público e verifica o SHA-256 do GitHub antes de gerar o manifesto. Não substitua os bytes de uma versão publicada nem misture EXE e manifesto de execuções diferentes.

O GitHub Releases conserva os instaladores das **duas versões estáveis mais recentes**, atual e anterior. Ao publicar uma terceira, a limpeza remove o EXE e blockmap mais antigos; as pequenas notas de lançamento continuam. Os downloads privados gerados por Windows full app também mantêm um par completo por versão, nas duas versões mais recentes. A limpeza só afeta rascunhos automáticos identificados como entregas M&N; outros rascunhos e releases são preservados. Os artefatos antigos dos Actions têm retenção própria e omitem builds duplicados e os antigos pacotes pesados. Aplicativos diferentes e versões que não puderam ser identificadas são preservados.

O pacote leve traz somente os dois guias Windows mais recentes até sua versão. O frontend não contém EXEs e omite instruções antigas. Extraia sempre em uma pasta nova: extrair sobre uma pasta anterior não apaga arquivos locais antigos. A .surgeignore impede enviar EXEs e ZIPs acidentalmente; não exclua downloads/latest.yml.

Após publicar o EXE no repositório público, o workflow **Lightweight Surge package** permite reaproveitá-lo sem recompilar o Windows. Para uma versão nova do aplicativo, use primeiro **Windows full app**. Publicar no Surge continua sendo uma etapa separada.
