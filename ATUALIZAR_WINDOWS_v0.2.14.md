# Atualizar para Windows 0.2.14

**Jogos → Nexus → Jogar Nexus** passa a abrir o upload `19915488`, fornecido pelo proprietário após publicar o Nexus 0.14. O endereço PvP correto é `wss://nexus-pvp.onrender.com/pvp`. A exportação 0.14 do jogo já usa esse endereço e corrige o domínio antigo salvo.

## Publicar e jogar

1. Aguarde todos os testes e o empacotamento **Windows full app** da branch `codex/desktop-nexus-0214` passarem no GitHub Actions. Use os downloads da execução validada, indicados no resumo dela.
2. Baixe **MN-Trono-Frontend-0.2.14.zip** e extraia em uma pasta nova. O pacote inclui a pasta `frontend`, um único instalador Windows e o manifesto de atualização correspondente.
3. Abra o terminal dentro dessa pasta `frontend` e execute:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

4. Confira `https://a-lei-do-trono.surge.sh/downloads/latest.yml`: deve mostrar `version: 0.2.14`. Atualize a página do Trono e abra **Jogos → Nexus → Jogar Nexus**. Feche uma partida antiga antes de abrir a versão nova.
5. No aplicativo, busque a atualização e reinicie. Para instalar manualmente, use **MN-Trono-0.2.14-Windows.exe** da mesma entrega. Atualizar somente o site não troca o endereço dentro de um aplicativo antigo, que usa seu frontend empacotado.
6. No Nexus, abra **PvP online**, escolha três heróis e os engastes. Um jogador cria a sala; o outro entra pelo código. Ambos confirmam a equipe para começar.

O jogo continua hospedado no itch.io: o ZIP, o PCK e o WASM não ocupam o Surge. No site, ele abre em um iframe; no Windows, em uma janela isolada do aplicativo. O progresso do Nexus permanece separado da conta do Trono.

Não há alteração no backend do Trono nem SQL novo nesta versão. O servidor PvP existente continua no Render; sua configuração de origens deve aceitar `https://html-classic.itch.zone,https://itch.io`. Não coloque chaves de serviço no frontend.

Para jogar imediatamente enquanto publica a atualização, abra [Nexus no itch.io](https://semchakra10.itch.io/nexus-mn). Detalhes da integração em [INTEGRAR_NEXUS.md](INTEGRAR_NEXUS.md).
