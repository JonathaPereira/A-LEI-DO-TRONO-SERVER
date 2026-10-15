# Windows 0.2.2 · mesas e filtro leve

## Mudanças

- **Trono:** botão Tela cheia usa a janela nativa no app e a API Fullscreen no site. A mesa ocupa a área disponível; cartas, assentos e mão ajustam as dimensões em monitores menores e verticais. Prompts e animações continuam visíveis em tela cheia. Na Usurpação online, atualizações da mesa não interrompem a sequência da troca nem abandonam o resultado privado. As cartas trocadas continuam privadas.
- **Azul:** o centro mostra todos os azulejos, agrupados por cor em uma única escolha. Acima de dez peças, o mercado passa a uma disposição com centro abaixo das fábricas, que cresce sem esconder peças. A pontuação destaca conexões e leva o valor até o placar, com mais tempo para leitura e opção de concluir a contagem.
- **Splendor:** cada cor reúne desconto das cartas + fichas = poder de compra. A forma de carta distingue o desconto permanente da ficha circular que será gasta. Ouro continua separado como curinga. As negociações mostram fichas indo/voltando do banco, apresentação da carta comprada, desconto recebido e pontuação. Movimentos reduzidos e Concluir animação continuam disponíveis.
- **Redução leve:** solicita a redução nativa, acrescenta filtro de graves a 75 Hz e atenuação suave entre falas. O filtro usa um pequeno AudioWorklet sem modelo de IA; ele não remove todo ruído misturado à voz. A interface mostra se a redução nativa foi confirmada; falhas preservam o caminho nativo quando disponível. O microfone mutado permanece mutado ao trocar os modos.

Esta revisão preserva as melhorias de recepção de voz da 0.2.1. **A investigação da robotização ao trocar de área virtual do Windows foi adiada**, conforme solicitado; esta versão não é apresentada como solução desse problema.

## Publicar

1. Faça merge do PR e aguarde **Windows full app** ficar verde no commit do merge.
2. Baixe **MN-Trono-Frontend-0.2.2.zip** na entrega privada mais recente das [Releases](https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases).
3. Extraia em uma pasta nova. Em `frontend/downloads` haverá somente **MN-Trono-0.2.2-Windows.exe** e o manifesto `latest.yml` correspondente.
4. Dentro de `frontend`, publique no Git Bash:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

5. Confira `https://a-lei-do-trono.surge.sh/downloads/latest.yml`: deve mostrar `version: 0.2.2`.
6. No aplicativo instalado, clique na versão no rodapé para buscar a atualização. Confirme o reinício quando puder encerrar a chamada. A atualização interna preserva conta e preferências; não exige baixar manualmente outro instalador.

**Backend 0.13.0-alpha compatível; nenhum SQL novo.** Não repita as migrações de Azul/Splendor já aplicadas. O frontend contém só o instalador atual. Os backups privados conservam a atual e a anterior (**0.2.2 e 0.2.1**), com limite preventivo de 190 MiB para o site. Consulte `TAMANHO-E-DOWNLOAD.json` no ZIP para o tamanho medido.
