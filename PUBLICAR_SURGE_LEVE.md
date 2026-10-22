# Publicar o frontend com o instalador Windows 0.3.2

O pacote **MN-Trono-Frontend-0.3.2.zip** contém o frontend completo e um único instalador, em `frontend/downloads/MN-Trono-0.3.2-Windows.exe`, junto do manifesto `latest.yml`. Não é necessário enviar o EXE para outro repositório.

1. As artes do Ticket to Ride usam o backend 0.14.0-alpha da 0.3.0, sem SQL novo. Para uma instalação anterior à 0.3.0, siga primeiro o guia dessa versão.
2. Baixe o pacote da compilação Windows aprovada, autenticado no GitHub, e extraia numa pasta nova.
3. Abra o Git Bash dentro da pasta `frontend` e execute:

```bash
npx surge . a-lei-do-trono.surge.sh
```

4. Confira se `https://a-lei-do-trono.surge.sh/downloads/latest.yml` mostra `version: 0.3.2`.
5. No aplicativo instalado, verifique a atualização e reinicie quando o download terminar. Para instalação manual, use o EXE que já acompanha o pacote.

Preserve o manifesto e o instalador desta mesma entrega; não altere o SHA-512. O empacotador inclui somente o instalador atual e verifica o tamanho total preventivo de 190 MiB. O relatório `TAMANHO-E-DOWNLOAD.json` registra a identidade e o tamanho do pacote.

Detalhes em [ATUALIZAR_WINDOWS_v0.3.2.md](ATUALIZAR_WINDOWS_v0.3.2.md).

O Nexus fica hospedado no itch.io. Esta entrega inclui somente sua capa e a tela de acesso; não envie ZIP, PCK ou WASM do Nexus ao Surge. A troca do embed não altera o backend do Trono. O PvP do Nexus 0.15 usa regras novas e precisa do servidor separado na branch `codex/nexus-015`. Veja [INTEGRAR_NEXUS.md](INTEGRAR_NEXUS.md).
