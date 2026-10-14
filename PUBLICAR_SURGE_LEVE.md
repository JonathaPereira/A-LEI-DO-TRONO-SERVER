# Publicar o frontend com somente o instalador atual

O pacote **MN-Trono-Frontend-0.1.16.zip** inclui o site inteiro e **um único EXE**, o da versão atual. Não precisa publicar esse instalador separadamente em outro repositório.

## Passo a passo

1. Execute `upgrade-splendor.sql` no SQL Editor do Supabase, faça merge do PR e publique o backend **0.11.0-alpha** no Render. Aguarde o serviço ficar Live e o build Windows terminar. Abra o link de downloads indicado no PR, entre na conta GitHub e baixe **MN-Trono-Frontend-0.1.16.zip** da release privada.
2. Extraia numa **pasta nova**. Dentro de frontend/downloads devem existir somente:

   ```text
   MN-Trono-0.1.16-Windows.exe
   latest.yml
   ```

3. Abra o Git Bash na pasta frontend extraída e execute:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

4. Confira https://a-lei-do-trono.surge.sh/downloads/latest.yml: deve mostrar **version: 0.1.16**. O botão Baixe a versão desktop da tela de login baixa o EXE desse mesmo site.
5. No aplicativo já instalado, clique na versão no rodapé para buscar a atualização. Ele baixa internamente e permite reiniciar para instalar. Conta, permissões e preferências são mantidas.

**Esta versão exige `upgrade-splendor.sql` e o backend 0.11.0-alpha antes do frontend.** Se o SQL de Azul já foi executado, não é necessário repeti-lo. A publicação do frontend inclui o instalador e o manifesto de atualização. Veja [o guia 0.1.16](ATUALIZAR_WINDOWS_v0.1.16.md).

## Tamanho e versões antigas

O site inclui as novas artes e um único instalador atual. O pacote completo permanece abaixo da proteção de 190 MiB do empacotador. O valor exato fica em TAMANHO-E-DOWNLOAD.json. O EXE precisa aparecer no resumo do Surge; não o remova nem edite o SHA-512 do manifesto.

O empacotador recria downloads/ a cada entrega e copia somente o instalador aprovado da versão atual. A .surgeignore permite esse arquivo específico e bloqueia outros EXEs e arquivos compactados, inclusive se houver sobras de uma extração anterior. Use a pasta nova para evitar confusão com cópias antigas no PC.

O atualizador continua usando a-lei-do-trono.surge.sh/downloads/. Ele verifica SHA-512 antes de instalar; app e manifesto precisam vir da mesma entrega. Não é necessário preencher chaves ou tokens no frontend.

Os backups privados conservam uma entrega completa por versão para as duas versões mais recentes. O frontend publicado contém apenas o instalador atual. Os instaladores do repositório público MN-Trono-Downloads podem continuar como backup; esta publicação não depende deles.
