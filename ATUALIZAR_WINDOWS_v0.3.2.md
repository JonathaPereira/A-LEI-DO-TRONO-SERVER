# Windows 0.3.2 · artes fornecidas para Ticket to Ride

Esta entrega aplica os arquivos de `Ticket-to-Ride-Artes-Completas.zip`:

- Tabuleiro dos EUA da referência, com as áreas clicáveis alinhadas às cidades e rotas impressas.
- Nove frentes de cartas: oito cores e a locomotiva coringa.
- Verso comum das cartas de vagão e verso verde dos destinos.
- Peças coloridas nos trechos construídos, com colocação animada.

A mão permanece à esquerda, a compra à direita, os objetivos no canto inferior
esquerdo e os destinos no inferior direito. O mapa ocupa o centro, e telas largas
têm o placar à direita. Compras fechadas continuam mostrando apenas o verso
ao adversário. Movimento reduzido desativa os efeitos.

Os originais do ZIP estão em `artwork/ticket-to-ride/`. O frontend usa versões
otimizadas das mesmas imagens; o tabuleiro conserva o JPEG fornecido.
As artes já estão aplicadas e dispensam qualquer download adicional no jogo.

## Validação

Com Node.js 24 e Chromium, na raiz:

```bash
npm run test:ticket-to-ride
npm run test:desktop:core
node --test tests/site-package.js tests/build-downloads.js tests/download-retention.js
```

A suíte de navegador verifica a carga das cinco imagens, os recortes das nove
cartas, a correspondência das 36 cidades com o tabuleiro, rotas paralelas,
compras, peças animadas, privacidade e fullscreen em 1366×768 e 1920×1080.
O workflow Windows verifica também as imagens dentro do aplicativo compilado.

## Atualizar frontend e Windows

1. Aguarde o workflow **Windows full app** desta branch terminar com sucesso.
2. Na release em rascunho da mesma execução, baixe
   `MN-Trono-Frontend-0.3.2.zip` e `SHA256SUMS-0.3.2.txt`; confira o hash.
   O instalador `MN-Trono-0.3.2-Windows.exe` também fica disponível separadamente.
3. Extraia o ZIP numa pasta nova. O diretório `frontend/` contém as artes,
   apenas o instalador atual e `downloads/latest.yml` correspondente.
4. No diretório `frontend/` extraído, publique:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

5. Confira `downloads/latest.yml`: `version: 0.3.2`. Abra **Jogos → Ticket to Ride**
   e confira as cartas ilustradas e o tabuleiro da referência.
6. No Windows, busque a atualização e reinicie o aplicativo. A interface do app
   é embutida no EXE e precisa do instalador desta entrega.

Esta revisão visual mantém o backend 0.14.0-alpha, sem SQL novo. Mesas em
andamento não exigem reinício do servidor. Voz e PC Beta permanecem independentes.
