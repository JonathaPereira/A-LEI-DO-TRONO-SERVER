# Windows 0.2.6 · controles, perfis e início da transmissão

- No Discord, os controles da chamada aparecem na lateral inferior, tanto em Jogos quanto em Comunidade. No Original, continuam no centro inferior. Janelas estreitas usam a barra inferior para manter os controles acessíveis.
- Trocar de aba ou layout mantém um único botão e um único ícone por ação. A região dos controles recebe os cliques; clicar no status da voz quando já está na sala não reabre o chat de texto.
- Os cartões centrais voltam a usar o **fundo do perfil**. Somente as linhas com os nomes nas **mensagens diretas** recebem a **capa/banner** de cada pessoa.
- A câmera e a transmissão avisam os participantes assim que a captura começa, antes da preparação do transporte. A distribuição entre conexões acontece em paralelo. Desligar continua encerrando a captura e avisando a sala sem aguardar a limpeza da rede.

## Baixar

A entrega **Pacotes Windows 0.2.6**, nas [Releases do repositório](https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases), contém:

- `MN-Trono-Frontend-0.2.6.zip`: frontend completo com o instalador e o manifesto da atualização.
- `MN-Trono-0.2.6-Windows.exe`: o mesmo instalador, separado para instalação manual.
- `SHA256SUMS-0.2.6.txt`: hashes dos arquivos para conferência.

O workflow **Windows full app** compila o helper nativo e o instalador no Windows e valida o aplicativo empacotado antes de gerar a entrega. Use os arquivos da execução concluída com sucesso correspondente a esta revisão.

## Publicar

Extraia o ZIP em uma pasta nova. Entre na pasta `frontend` extraída e execute no Git Bash:

```bash
npx surge . a-lei-do-trono.surge.sh
```

Publique a pasta completa, incluindo `downloads/MN-Trono-0.2.6-Windows.exe` e `downloads/latest.yml`. O EXE não precisa ir para outro serviço. Preserve o manifesto e o instalador da mesma entrega.

Confira `https://a-lei-do-trono.surge.sh/downloads/latest.yml`: deve mostrar `version: 0.2.6`. Quem já usa o app pode clicar no botão de atualização e reiniciar após o download; também pode instalar o EXE manualmente.

**Backend 0.13.0-alpha compatível; nenhum SQL novo.** Não é necessário redeploy do backend nem reaplicar migrações. O EXE 0.2.5 não contém estas correções.
