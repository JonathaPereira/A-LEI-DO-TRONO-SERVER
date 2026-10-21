# Windows 0.3.1 · disposição da mesa Ticket to Ride

O mapa ocupa o centro da mesa. Cartas compradas ficam empilhadas à esquerda;
o monte de vagões e as cinco cartas abertas ficam à direita. Objetivos ficam
no canto inferior esquerdo e o monte de destinos no inferior direito.
Telas largas recebem uma coluna separada para os jogadores.

Compras confirmadas pelo servidor animam a carta até a mão. Para os demais
jogadores, compras fechadas mostram apenas o verso. Vagões entram na rota
em sequência. A preferência de movimento reduzido desativa esses efeitos.
Tela cheia foi validada em Chromium a 1366×768 e 1920×1080; celular e tela
vertical mantêm navegação sem transbordamento horizontal.

As artes finais das cartas ainda dependem dos arquivos do proprietário.
Esta entrega usa ilustrações vetoriais e a composição da referência recebida.

## Validação

Na raiz, com Node.js 24 e Chromium instalado:

```bash
npm run test:ticket-to-ride
node --test tests/site-package.js tests/build-downloads.js tests/download-retention.js
npm run test:desktop:core
```

A suíte do Ticket to Ride valida regras, WebSocket, mãos privadas, compras,
animações, posição dos painéis em fullscreen e movimento reduzido.
O workflow Windows também valida e compila o aplicativo completo.

## Publicação

1. Aguarde o workflow **Windows full app** da branch desta entrega concluir.
   A execução deve gerar `MN-Trono-0.3.1-Windows.exe`,
   `MN-Trono-Frontend-0.3.1.zip` e `SHA256SUMS-0.3.1.txt` na release em rascunho.
2. Confira os hashes e extraia o ZIP em uma pasta nova. O pacote inclui o
   frontend completo, somente o instalador 0.3.1 e o `downloads/latest.yml`
   correspondente. Não publique o checkout sem esse instalador.
3. Na pasta `frontend/` extraída, execute:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

4. Confira `downloads/latest.yml`: deve informar `version: 0.3.1`.
   Abra **Jogos → Ticket to Ride**, confira a disposição e a tela cheia.
5. No aplicativo instalado, verifique a atualização e reinicie quando solicitado.
   O app embute o frontend; publicar apenas o site não atualiza a interface
   embutida em instalações antigas.

Esta atualização mantém o backend 0.14.0-alpha da 0.3.0, sem SQL novo.
Não reinicie o backend para aplicar somente esta mudança visual: as mesas
em andamento ficam em memória. Voz e compartilhamento de PC permanecem
independentes da mesa.
