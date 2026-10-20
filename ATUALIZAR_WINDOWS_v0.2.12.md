# Atualização Windows 0.2.12

Esta revisão adiciona um controle Xbox virtual separado para o convidado,
reduz a carga inicial de vídeo da beta e inclui moderação da chamada.
A voz continua usando sua conexão atual, com SFU como preferência existente.

## Publicar

1. Integre o PR desta revisão no `main` e faça redeploy do backend no Render.
   Esta revisão altera as permissões e o protocolo de moderação. Não exige SQL novo.
2. Baixe `MN-Trono-Frontend-0.2.12.zip` nos Assets da entrega no GitHub.
3. Extraia o ZIP numa pasta nova. Dentro de `frontend`, execute:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

4. O ZIP já inclui `frontend/downloads/MN-Trono-0.2.12-Windows.exe` e `latest.yml`.
   Instale o EXE ou use a atualização interna depois da publicação no Surge.
   Os participantes que hospedam o PC precisam atualizar o aplicativo.

## Dois jogadores

Conecte primeiro o gamepad do anfitrião. Na beta, o anfitrião pode abrir a
versão oficial do driver opcional [ViGEmBus 1.22.0](https://github.com/nefarius/ViGEmBus/releases/tag/v1.22.0).
A instalação acontece pelo instalador do fornecedor e pode pedir reinicialização.
O projeto do driver foi encerrado; a dependência é opcional, sem instalador ou
atualizador automático no M&N. Depois, use **Verificar instalação**.

O convidado aceita o vídeo e escolhe **Gamepad · jogador separado** ou
**Teclado como gamepad · jogador separado**, antes de pedir controle.
O anfitrião autoriza especificamente esse dispositivo na janela do Windows.
O controle virtual ocupa o próximo slot XInput disponível, sem misturar comandos
com o controle local. Use Start no jogo para entrar como segundo jogador.
Se o jogo só enumera controles ao iniciar, conecte o controle virtual antes de abrir o jogo.

Dois mouses/teclados no modo de acesso ao desktop continuam controlando o mesmo
cursor e teclado do Windows. O modo teclado como gamepad resolve essa distinção
para jogos que aceitam um controle Xbox. A beta atual oferece um convidado.

## Atraso e qualidade

O padrão é **Resposta rápida · 720p/60 FPS**, até 6 Mbps. **Mais detalhes**
solicita 1080p/60, até 12 Mbps. O encoder reduz resolução/bitrate ao detectar
congestionamento ou limitação de CPU e recupera gradualmente a qualidade.
A recepção solicita buffer mínimo; o helper de entrada lê o pipe sem a antiga
espera de polling. Gamepad e ponteiro usam estados recentes sem retransmissão,
com sequência para descartar pacotes antigos. Teclas/cliques continuam confiáveis.

**Qualidade da conexão** mostra RTT, FPS, resolução, processamento e buffer
quando o navegador disponibiliza os dados. RTT não é o atraso total do jogo.
Não foi medida equivalência com Parsec nem latência entre redes reais. Cabo,
boa rota direta, modo janela sem borda e margem de upload continuam relevantes.

## Moderação

No menu de perfil de cada participante, administradores e criador podem:

- Silenciar ou liberar o microfone. Liberar não liga o microfone da pessoa.
- Bloquear ou liberar câmera e compartilhamentos, incluindo o PC Beta.
- Remover da chamada por cinco minutos, mantendo jogo e chat disponíveis.

Administradores moderam membros e convidados. O criador também pode moderar
administradores. Ninguém modera o próprio perfil nem o criador.
As regras são verificadas no servidor e mantidas por conta e canal em memória
até reiniciar o backend. Remoções expiram após cinco minutos. Convidados são
identificados pela sessão, sem proibição permanente de novas sessões anônimas.

O SFU retira assinaturas de áudio/mídia moderados e mantém o publicador do
microfone, evitando trocar a chamada para P2P. No P2P, clientes atualizados
aplicam o estado de moderação no envio e na reprodução; esse transporte não
oferece um relé central capaz de impedir clientes modificados de trocar mídia.

## Validação

Testes cobrem permissões, hierarquia, retorno à chamada, estados inválidos,
HUD responsivo e continuidade do microfone. No Windows, a CI instala o driver
somente no runner descartável e verifica dois dispositivos XInput reais com
estados diferentes, neutralização após interrupção e desconexão independente.
Isso valida a separação de dispositivos; Cuphead e BlazBlue precisam de um
novo teste manual no computador dos jogadores.
