# Atualizar para Windows 0.2.15

Esta versão acrescenta controles claros para notificações de mensagens no Windows, deixa o aviso de entrada na chamada mais suave e corrige a organização dos controles de PC, câmera e tela.

## Usar as melhorias

- **Configurações → Notificações → Notificações do Windows:** ative os avisos nativos. Escolha **Todas as mensagens** para avisar também sobre mensagens comuns dos canais, ou mantenha menções e mensagens privadas. O botão **Testar notificação do Windows** funciona com o app aberto. Mensagens reais notificam quando o Trono está em segundo plano ou minimizado; respeitam o filtro e canais silenciados. Desativar os avisos do Windows mantém os contadores de não lidas. O Windows pode silenciá-los com Não incomodar.
- **Configurações → Áudio → Avisos de entrada e saída:** ajuste o volume ou marque **Silenciar avisos de entrada e saída**. O mute é independente dos demais efeitos. O som de entrada tem notas menos agudas e menor intensidade; o novo padrão é 45%, preservando volumes já escolhidos.
- **Controles da chamada:** PC, câmera e tela ficam na mesma linha na barra lateral Discord; o botão de PC mantém um ícone visível também nas outras áreas do aplicativo. Original e janelas estreitas mantêm os controles agrupados, sem sobreposição. Trocar layout preserva a chamada.

## Nexus atualizado

**Jogos → Nexus → Jogar Nexus** passa a abrir `https://itch.io/embed-upload/19926871?color=333333`, fornecido pelo proprietário. A configuração é compartilhada pelo site e pela janela isolada do Windows. O cache do script foi atualizado para não reutilizar o endereço anterior.

## Publicar

1. Aguarde a execução **Windows full app** da branch `codex/desktop-nexus-0215` aprovar os testes e gerar os downloads no GitHub Actions.
2. Baixe **MN-Trono-Frontend-0.2.15.zip** da entrega validada e extraia em uma pasta nova. O pacote contém `frontend`, o instalador e o manifesto de atualização correspondentes.
3. Abra o terminal dentro de `frontend` e execute:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

4. Confira `https://a-lei-do-trono.surge.sh/downloads/latest.yml`: deve mostrar `version: 0.2.15`. Recarregue o site e abra **Jogos → Nexus → Jogar Nexus**.
5. No aplicativo instalado, busque a atualização e reinicie. Para instalação manual, use **MN-Trono-0.2.15-Windows.exe** da mesma entrega. Um aplicativo antigo conserva seu frontend empacotado, mesmo após atualizar o site.

O jogo permanece no itch.io; ZIP, PCK e WASM do Nexus não ocupam o Surge. A mudança no Trono é o endereço de acesso e a identificação da nova versão. Conta, chamada, isolamento da janela e os demais jogos continuam usando a integração existente.

## Servidor do Nexus 0.15

No Render, o serviço separado `nexus-pvp` precisa estar na branch **codex/nexus-015**, do repositório PROJETO-NEXUS, compatível com o ZIP 0.15 enviado ao itch.io. Espere **Live** e confira `https://nexus-pvp.onrender.com/health` antes de testar salas. O endereço do jogo permanece `wss://nexus-pvp.onrender.com/pvp`.

Esta atualização do embed não exige redeploy do backend do Trono, SQL ou novas chaves. Para jogar enquanto publica o Trono, use [a página oficial do Nexus](https://semchakra10.itch.io/nexus-mn).
