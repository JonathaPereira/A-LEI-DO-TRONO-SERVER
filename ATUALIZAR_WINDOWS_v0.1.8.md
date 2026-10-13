# A Lei do Trono 0.9.0 · Windows 0.1.8

Esta atualização altera o servidor, o frontend e o app. Publique o conjunto completo para que todos usem as mesmas regras.

## O que mudou

- Ordem: a Sombra é a menor carta elegível do naipe inicial; sem outra carta desse naipe, a menor carta entre os demais jogadores. Empates continuam pela ordem de jogada.
- Estandarte: dois ou mais trunfos dão Coroa/Sombra ao maior/menor trunfo de pessoas diferentes; um trunfo dá Coroa a ele e Sombra à menor carta dos demais; sem trunfos, aplica-se Ordem. É permitido jogar trunfo mesmo tendo o naipe inicial.
- Usurpação: a Sombra escolhe qualquer adversário e separa sua carta antes da escolha cega. Sua própria carta não pode retornar. Corte Aberta continua protegida; somente os dois envolvidos recebem a revelação.
- Conselho, Favor Real, Espionagem e Peso da Coroa ampliam o catálogo para dez Decretos. O Decreto continua fixo na rodada. Não foi incluída troca de Decreto por Influência.
- Jogo e M&N possuem participações independentes no mesmo socket. Entrar na mesa, navegar à comunidade ou sair da mesa preserva a chamada do M&N, seus dispositivos e estados. Sair da conta encerra tudo. Sair explicitamente da mesa ainda permite que uma IA assuma sua Casa.
- Cinco novas cartas vetoriais de Lei, animações breves para cada Lei e Decreto, respeitando redução de movimento e modo leve. Manual temático HTML e PDF acessíveis pelo site e pelo app, com exemplos das regras novas.
- Estado vazio da chamada centralizado na área principal; verificação de layout em telas pequenas e verticais sem reduzir o espaço reservado à stream.

## Como publicar

1. Faça o merge do PR desta atualização no GitHub. Os arquivos da raiz do backend, `frontend/`, `desktop/`, scripts e testes pertencem ao mesmo repositório. Não coloque `node_modules`, `.env` ou instaladores EXE no Git.
2. No Render, publique o último commit da `main`. Mantenha Build Command `npm install`, Start Command `npm start` e as variáveis já existentes. `/health` deve mostrar `0.9.0-alpha`, `independentGameVoice: true` e `gameRulesVersion: "0.9.0"`.
3. Aguarde o workflow **Windows full app** do commit publicado terminar com sucesso. Na página da execução, baixe o artefato **MN-Trono-Site-com-Desktop** e extraia-o. O checkout do GitHub sozinho não contém o instalador nem o canal de atualização.
4. Publique a pasta `frontend` desse artefato, por inteiro, incluindo `manual/` e `downloads/`:

   ```bash
   cd "/c/Users/Jonatha/Downloads/PASTA-EXTRAIDA/frontend"
   npx surge . a-lei-do-trono.surge.sh
   ```

5. Confira `https://a-lei-do-trono.surge.sh/manual/` e `https://a-lei-do-trono.surge.sh/downloads/latest.yml`. O segundo deve indicar `version: 0.1.8`. Mantenha o EXE indicado pelo YAML na mesma pasta `downloads/`.
6. No app já instalado, abra Configurações → Aplicativo → **Verificar atualização**. Quando o download terminar, escolha **Reiniciar e atualizar**. As contas, preferências e permissões lembradas são mantidas. O primeiro acesso ao app pode usar o botão de download da tela de login.

Não há nova migração SQL nesta revisão. Quem já aplicou `supabase/upgrade-social.sql` na atualização 0.1.7 mantém o banco como está. Quem pulou a atualização anterior precisa aplicar esse SQL uma vez para amigos/mensagens privadas; o artefato inclui uma cópia fora da pasta frontend.

Teste com duas pessoas: entre na chamada M&N, mute o microfone, ative a câmera, entre na mesa e alterne entre jogo/comunidade. A mesma chamada deve continuar ativa. Confira Ordem, Estandarte e Usurpação nos exemplos do manual. Espionagem deve ser visível somente para quem recebeu a pista.

Clipes continuam suspensos. O app Android continua previsto para outra etapa. A captura isolada de áudio continua dependendo das condições do Windows já documentadas; a validação física em runner sem saída de áudio não substitui um teste em PC real.
