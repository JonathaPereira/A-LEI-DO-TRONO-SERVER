# Atualizar para Windows 0.2.13

O Nexus agora aparece na biblioteca do site e do aplicativo, com capa, instruções de PvP e abertura sob demanda. A base é a versão 0.2.12; os jogos e recursos de chamada anteriores são mantidos.

1. Aguarde a compilação Windows validada da branch `codex/desktop-nexus-0213` no GitHub Actions.
2. Baixe e extraia **MN-Trono-Frontend-0.2.13.zip** em uma pasta nova.
3. Publique a pasta `frontend` com `npx surge . a-lei-do-trono.surge.sh`.
4. Confira o `downloads/latest.yml` e mantenha o EXE e o manifesto da mesma entrega.
5. Busque a atualização no app e reinicie. Para instalação manual, use **MN-Trono-0.2.13-Windows.exe**.
6. Abra **Jogos → Nexus → Jogar Nexus**.

O Nexus permanece no itch.io, sem adicionar os arquivos pesados ao Surge. A chamada continua no Trono enquanto a janela do jogo estiver aberta. No site, o jogo abre dentro da página com opção de tela cheia. O iframe fornecido pelo proprietário já está configurado.

Esta integração não exige SQL nem mudança no backend. Os requisitos de versões anteriores continuam válidos se ainda não foram aplicados. Veja [INTEGRAR_NEXUS.md](INTEGRAR_NEXUS.md) para configurar o iframe e jogar PvP.
