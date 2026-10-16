# Publicar o frontend com o instalador Windows 0.2.8

O pacote **MN-Trono-Frontend-0.2.8.zip** contém o frontend completo e um único instalador, em `frontend/downloads/MN-Trono-0.2.8-Windows.exe`, junto do manifesto `latest.yml`. Não é necessário enviar o EXE para outro repositório.

1. No SQL Editor do Supabase, execute `20261016140000_giphy_profile_credits.sql`, incluído na raiz do ZIP. Atualize o backend no Render com o código desta entrega. Para busca integrada, configure `GIPHY_API_KEY` conforme o guia; sem chave, o seletor permite abrir o GIPHY e colar um link.
2. Baixe o pacote da compilação Windows aprovada, autenticado no GitHub, e extraia numa pasta nova.
3. Abra o Git Bash dentro da pasta `frontend` e execute:

```bash
npx surge . a-lei-do-trono.surge.sh
```

4. Confira se `https://a-lei-do-trono.surge.sh/downloads/latest.yml` mostra `version: 0.2.8`.
5. No aplicativo instalado, verifique a atualização e reinicie quando o download terminar. Para instalação manual, use o EXE que já acompanha o pacote.

Preserve o manifesto e o instalador desta mesma entrega; não altere o SHA-512. O empacotador inclui somente o instalador atual e verifica o tamanho total preventivo de 190 MiB. O relatório `TAMANHO-E-DOWNLOAD.json` registra a identidade e o tamanho do pacote.

Detalhes em [ATUALIZAR_WINDOWS_v0.2.8.md](ATUALIZAR_WINDOWS_v0.2.8.md).
