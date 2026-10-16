# Windows 0.2.5 · controles da chamada e layouts

- O botão **Assistir stream** recebe cliques sem maximizar, inclusive em janelas menores. O vídeo do convite deixa de interceptar o botão.
- Desligar câmera ou transmissão encerra as trilhas, avisa os participantes e atualiza a interface antes da limpeza de rede. Uma conexão lenta não mantém o quadro congelado até o encerramento remoto.
- No Original, mensagens diretas ficam mais acima e alinhadas com a área da chamada. A capa de cada perfil emoldura seu cartão; o fundo é usado quando não há capa.
- No Discord, os botões de início e atualização têm ícones. A atualização fica no rodapé esquerdo e continua acessível em telas estreitas.
- A seta no canto superior direito oculta/restaura a barra de telemetria, chat e perfil. A preferência fica salva por conta. Trocar layouts e recolher a barra preserva a chamada.

## Gerar a entrega

1. Envie esta revisão para uma branch `codex/desktop-*`, ou faça merge e aguarde **Windows full app** no GitHub Actions. O job usa Windows, compila o helper nativo e o aplicativo, testa o pacote e gera o instalador.
2. Após o workflow concluir com sucesso, abra as [Releases privadas](https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases) e a entrega **Pacotes Windows 0.2.5** correspondente ao commit desta revisão.
3. Baixe **MN-Trono-Frontend-0.2.5.zip**. O EXE também é oferecido separadamente na mesma entrega. Use `SHA256SUMS-0.2.5.txt` para conferir os arquivos.

## Onde publicar

Extraia o ZIP em uma pasta nova. Ele contém `frontend/`, e dentro dela:

```text
frontend/downloads/MN-Trono-0.2.5-Windows.exe
frontend/downloads/latest.yml
```

No Git Bash, entre na pasta `frontend` extraída e execute:

```bash
npx surge . a-lei-do-trono.surge.sh
```

Publique toda a pasta `frontend`, com `downloads/`. Não é necessário subir o EXE em outro serviço. Preserve o manifesto e seu SHA-512 da mesma entrega.

Depois, confira `https://a-lei-do-trono.surge.sh/downloads/latest.yml`: deve mostrar `version: 0.2.5`. No app instalado, use o botão de atualização e reinicie após o download. Para instalação manual, execute o EXE incluído.

**Backend 0.13.0-alpha compatível; nenhum SQL novo.** Estas correções são do frontend/app e não exigem redeploy do backend nem repetição das migrações existentes. A versão 0.2.5 precisa de seu próprio instalador; o EXE 0.2.4 não contém estas mudanças.
