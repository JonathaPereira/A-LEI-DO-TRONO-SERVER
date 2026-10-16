# Windows 0.2.9 · voz em segundo plano

Corrige dois pontos do envio do microfone que podiam torná-lo vulnerável à redução de recursos quando a janela ficava minimizada, encoberta ou em outra área de trabalho:

- No modo nativo ou com supressão desligada, o microfone em **100%** passa diretamente da captura para o WebRTC. A redução nativa continua sendo solicitada ao capturar. O sinal deixa de passar desnecessariamente pelo grafo Web Audio da interface.
- O Electron solicita ao Chromium que preserve a prioridade normal do renderer no Windows quando a janela perde visibilidade. A configuração existente `backgroundThrottling:false` permanece, assim como a prioridade do próprio serviço de áudio durante a chamada.
- RNNoise e volumes personalizados continuam disponíveis. O processamento Web Audio do desktop recebe uma margem de agendamento de 40 ms, sem alterar a taxa de 48 kHz. Essa é uma solicitação ao motor, não uma medição de latência final.
- Alterar o volume alterna entre captura e processamento sem reabrir o microfone. Mute continua aplicado às trilhas. Minimizar ou voltar à janela não troca o microfone nem reconecta a chamada.

## Baixar e atualizar

Nas [Releases do repositório](https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases), baixe a entrega validada **Pacotes Windows 0.2.9**:

- `MN-Trono-Frontend-0.2.9.zip`: frontend completo com EXE e manifesto.
- `MN-Trono-0.2.9-Windows.exe`: o mesmo instalador separado.
- `SHA256SUMS-0.2.9.txt`: hashes para conferência.

**Instale a 0.2.9 no computador de quem transmite a voz.** As configurações de prioridade do Electron exigem o EXE novo; publicar apenas o frontend não altera um EXE antigo. Atualizar pelo aplicativo também exige reiniciá-lo para carregar essa versão.

Extraia o ZIP em uma pasta nova, entre na pasta `frontend` e publique no Git Bash:

```bash
npx surge . a-lei-do-trono.surge.sh
```

Publique toda a pasta, incluindo `downloads/`. Confira `version: 0.2.9` em `https://a-lei-do-trono.surge.sh/downloads/latest.yml`. Preserve o EXE e o manifesto da mesma entrega.

**A correção de voz não exige SQL novo nem redeploy do backend.** Se ainda não concluiu a atualização de GIFs da 0.2.8, siga [o guia anterior](ATUALIZAR_WINDOWS_v0.2.8.md) para o SQL dos créditos e `GIPHY_API_KEY`. O SQL continua incluído no ZIP.

## Verificação

O teste de microfone mede o sinal PCM, o uso da captura direta em 100%, a amplificação e o mute, sem nova captura ao mudar o ganho. O teste específico do Windows usa uma janela real do Electron, captura de fala pelo serviço de microfone e WebRTC para outro cliente. Ele mede PCM e contadores RTP no receptor com o app encoberto, minimizado e escondido, nos modos nativo e RNNoise e com ganho personalizado. Não substitui eventos de visibilidade por eventos simulados.

O teste automatizado não troca a área de trabalho virtual do Windows nem reproduz o microfone, driver, jogo e carga exatos do usuário. A confirmação desse cenário requer comparar a 0.2.9 no computador afetado. O teste de isolamento de áudio por processo também depende de uma saída física/virtual no runner.
