# Publicar o frontend com somente o instalador atual

O pacote **MN-Trono-Frontend-0.2.1.zip** inclui o site inteiro e **um único EXE**, o da versão atual. Não precisa publicar esse instalador separadamente em outro repositório.

## Passo a passo

1. Faça merge do PR e aguarde o build Windows ficar verde. Esta revisão é compatível com o backend **0.13.0-alpha** existente, sem SQL novo ou mudança de backend. Baixe **MN-Trono-Frontend-0.2.1.zip** da entrega privada mais recente, autenticado na conta GitHub.
2. Extraia numa **pasta nova**. Dentro de frontend/downloads devem existir somente:

   ```text
   MN-Trono-0.2.1-Windows.exe
   latest.yml
   ```

3. Abra o Git Bash na pasta frontend extraída e execute:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

4. Confira https://a-lei-do-trono.surge.sh/downloads/latest.yml: deve mostrar **version: 0.2.1**. O botão Baixe a versão desktop da tela de login baixa o EXE desse mesmo site.
5. No aplicativo já instalado, clique na versão no rodapé para buscar a atualização. Ele baixa internamente e permite reiniciar para instalar. Conta, permissões e preferências são mantidas.

**Esta revisão usa o backend 0.13.0-alpha existente. Não há SQL novo.** Se o SQL de Azul já foi executado, não é necessário repeti-lo. A publicação do frontend inclui o instalador e o manifesto de atualização. Veja [o guia 0.2.1](ATUALIZAR_WINDOWS_v0.2.1.md).

## Tamanho e versões antigas

O site inclui as novas artes e um único instalador atual. O pacote completo permanece abaixo da proteção de 190 MiB do empacotador. O valor exato fica em TAMANHO-E-DOWNLOAD.json. O EXE precisa aparecer no resumo do Surge; não o remova nem edite o SHA-512 do manifesto.

O empacotador recria downloads/ a cada entrega e copia somente o instalador aprovado da versão atual. A .surgeignore permite esse arquivo específico e bloqueia outros EXEs e arquivos compactados, inclusive se houver sobras de uma extração anterior. Use a pasta nova para evitar confusão com cópias antigas no PC.

O atualizador continua usando a-lei-do-trono.surge.sh/downloads/. Ele verifica SHA-512 antes de instalar; app e manifesto precisam vir da mesma entrega. Não é necessário preencher chaves ou tokens no frontend.

Os backups privados conservam uma entrega completa por versão para as duas versões mais recentes. O frontend publicado contém apenas o instalador atual. Os instaladores do repositório público MN-Trono-Downloads podem continuar como backup; esta publicação não depende deles.
