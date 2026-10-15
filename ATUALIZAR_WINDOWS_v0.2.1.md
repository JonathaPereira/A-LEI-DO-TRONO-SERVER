# Windows 0.2.1 · recepção de voz durante jogos

Esta revisão é focada em áudio. Mantém os jogos, contas, temas, permissões, controles, volumes e a atualização interna existentes.

## Mudanças

- **Configurações → Áudio → Proteger a voz recebida durante jogos**, ligada por padrão, com preferência local. Solicita uma margem de reprodução por voz de 60 ms; quando há reconstrução de áudio ou variação na chegada, aumenta em etapas até 140 ms. Após 60 segundos estáveis, reduz gradualmente. Não altera áudio da stream, câmera, bitrate do microfone ou sala. Desligar restaura o valor anterior do motor, sem reconectar.
- A API do receptor é verificada. Motores sem suporte continuam usando o controle nativo do WebRTC. O valor solicitado não é o atraso total até seu fone; o motor pode precisar de uma margem maior.
- Com volume normal, a reprodução permanece direta. Amplificação acima de 100% tem contexto de saída separado do processamento do microfone/RNNoise, com uma solicitação de buffer de 40 ms. O dispositivo/motor decide o buffer efetivo. Falhas de contexto preservam a reprodução direta, limitada a 100% enquanto a amplificação não está disponível.
- Ao perder o foco para o jogo, o app reduz as medições visuais de fala para uma leitura a cada 500 ms e pausa animações decorativas da chamada. Assim, uma segunda tela continua indicando quem fala. Quando a janela fica oculta/minimizada, suspende essas medições; elas retomam quando a janela reaparece. Microfone, recepção e transmissão continuam ativos. O diagnóstico mantém uma leitura a cada 5 segundos durante a chamada; painel em foco usa 2 segundos. Campos ocultos não são reescritos a cada leitura.
- Windows: a proteção avalia apenas processos Utility identificados como Audio Service do próprio Electron. Solicita prioridade **Acima do normal** somente se a prioridade atual for menor, mantendo prioridades nativas maiores. Reavalia reinício do serviço a cada 10 segundos durante a chamada; sair/desligar encerra a verificação e restaura somente ajustes feitos pelo app, se o PID e a criação do processo ainda coincidirem. Não exige administrador, não altera processos do jogo/renderer e não usa classe Tempo real. Se o Windows negar, mantém a prioridade do sistema.
- Diagnóstico por fluxo de voz: perda, jitter, reconstrução, buffer medido e margem solicitada, mais histórico curto de até 12 intervalos recentes. Lacunas na saída são mostradas apenas se o WebRTC fornecer a estatística associada à voz. Campos ausentes aparecem como indisponíveis. O relatório copiado continua sem nomes, IPs, mensagens, dispositivos, caminhos ou credenciais.

## Publicação

1. Faça merge do PR. Esta atualização não exige mudanças no backend **0.13.0-alpha**, nem SQL novo. Não repita as migrações anteriores.
2. Aguarde o workflow **Windows full app** do merge ficar verde.
3. Nas [Releases privadas](https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases), baixe **MN-Trono-Frontend-0.2.1.zip** da entrega mais recente.
4. Extraia em uma pasta nova. O ZIP inclui `frontend/downloads/MN-Trono-0.2.1-Windows.exe` e `latest.yml`, com exatamente um instalador.
5. No Git Bash, entre em `frontend` e publique:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

6. Confira `https://a-lei-do-trono.surge.sh/downloads/latest.yml`: deve indicar `version: 0.2.1`.
7. No app instalado, clique na versão no rodapé e busque a atualização. A instalação ocorre internamente; confirme o reinício quando puder encerrar a chamada. Não é preciso reinstalar manualmente o EXE. Contas e preferências são preservadas.

Somente a atual e a anterior são mantidas nos backups privados: **0.2.1 e 0.2.0**. O frontend leva só o EXE atual, com limite preventivo de 190 MiB. O tamanho real está em `TAMANHO-E-DOWNLOAD.json` dentro do ZIP.

## Como avaliar o resultado

Abra o diagnóstico com outro participante falando. Observe um intervalo com o jogo fechado e outro durante os cortes. Perda/jitter podem indicar irregularidade na rede ou no computador de quem fala. Atraso de interface sozinho não comprova falha no áudio. Estatísticas de saída, quando disponíveis, acrescentam evidência, mas não identificam automaticamente um driver defeituoso.

A proteção reduz trabalho dispensável e ajusta margens/prioridade; não reserva um núcleo ou uma porcentagem fixa de CPU. Sob saturação completa, drivers com atrasos ou perda de rede, nenhum ajuste garante voz intacta. Testes de PCM recebido e sobrecarga de interface não substituem a avaliação com jogos, headset e drivers reais do Windows.
