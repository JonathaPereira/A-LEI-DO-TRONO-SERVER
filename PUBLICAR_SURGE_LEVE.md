# Publicar sem colocar o instalador no Surge

O pacote antigo incluía um instalador de aproximadamente 130 MB dentro de frontend/downloads. Esse arquivo aumenta muito o envio ao Surge. O pacote corrigido separa os arquivos:

- **MN-Trono-Site-Leve**: frontend completo de aproximadamente 20 MB, com jogos, chat, imagens, RNNoise, manual atual e downloads/latest.yml.
- **MN-Trono-Windows-x64**: o instalador Windows, publicado separadamente no GitHub Releases.

Esta correção conserva Windows 0.1.11 e o canal de atualização original. Não muda regras, backend, banco ou dados locais. Não há SQL adicional. O Azul ainda pressupõe o upgrade-azul.sql da atualização anterior, caso não tenha sido aplicado.

## Uma vez: criar o local de downloads

1. Entre na conta JonathaPereira no GitHub e abra https://github.com/new.
2. Nome: **MN-Trono-Downloads**. Selecione **Public**, adicione um README e clique Create repository. Coloque nesse repositório os instaladores e informações de download. O projeto A-LEI-DO-TRONO-SERVER continua privado.
3. Abra https://github.com/JonathaPereira/MN-Trono-Downloads/releases/new.
4. Em Choose a tag, crie **v0.1.11**. Título: **M&N Windows 0.1.11**.
5. Arraste o arquivo **MN-Trono-0.1.11-Windows.exe** do artefato **MN-Trono-Windows-x64** que acompanha o mesmo pacote leve. Se usar o EXE do pacote original do PR #17, escolha o da execução 38570134416: este pacote leve reutiliza exatamente aquele instalador já validado.
6. Clique Publish release. O download precisa abrir sem exigir login no GitHub:
   https://github.com/JonathaPereira/MN-Trono-Downloads/releases/download/v0.1.11/MN-Trono-0.1.11-Windows.exe

Nenhum token ou chave vai no site. A integração desta sessão recebeu HTTP 403 ao tentar criar o novo repositório; a criação pode exigir sua ação no GitHub. Isso não exige mudar a visibilidade do código do projeto.

## Publicar o site leve

1. Baixe **MN-Trono-Site-Leve** da execução aprovada, extraia e abra o Git Bash na pasta **frontend** desse pacote.
2. Execute:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

3. Confira o resumo de tamanho do Surge: deve ficar perto de 20 MB. Essa pasta não contém EXE. O arquivo .surgeignore também impede o envio acidental de instaladores e ZIPs. Preserve downloads/latest.yml.
4. Confira https://a-lei-do-trono.surge.sh/downloads/latest.yml: version: 0.1.11 e links absolutos para github.com/JonathaPereira/MN-Trono-Downloads/releases/download/v0.1.11/.
5. Na tela de login, Baixe a versão desktop abre o instalador público. No aplicativo instalado, clique na versão para verificar e atualizar internamente.

O atualizador continua consultando o pequeno manifesto no Surge e busca o EXE no GitHub, verificando SHA-512 antes de instalar. Usuários que já têm 0.1.11 não precisam reinstalar. Versões anteriores podem atualizar pelo mecanismo existente quando o manifesto e o instalador estiverem publicados.

## Próximas versões

Cada pacote leve corresponde ao EXE da mesma execução, registrado em TAMANHO-E-DOWNLOAD.json. Publique esse EXE na tag da versão antes de enviar o frontend. O manifesto precisa corresponder exatamente aos bytes do instalador. Não substitua um EXE por outro enquanto o manifesto antigo estiver em uso.

O workflow Windows full app passa a gerar o site leve. O workflow Lightweight Surge package permite reaproveitar um instalador já aprovado sem recompilar o aplicativo; informe o ID da execução que contém MN-Trono-Windows-x64 da versão atual. Publicar o site continua sendo uma ação separada no Surge.
