# Windows 0.2.0 · clareza na mesa

Esta é a versão 0.2 solicitada, identificada como **0.2.0** pelo instalador e pelo atualizador. Mantém as contas, a sessão, as permissões, os temas, as chamadas e os jogos existentes.

## O que mudou

- Catálogo menor, com cinco jogos em monitores largos e cards horizontais no celular. Love Letter tem a capa reenquadrada.
- Splendor usa a mesma madeira de Azul, sem duplicar o arquivo. Fichas gastáveis e descontos permanentes das cartas agora ocupam blocos separados, com formas, cores e legendas distintas. Reservas são identificadas à parte.
- Efeitos de carteado mais presentes e detalhados. Cada jogo de mesa tem um botão **Som**, com volume pessoal salvo, silenciar/restaurar e teste. Isso não altera música, chamada ou efeitos enviados pelos amigos. O botão geral de efeitos continua sendo respeitado. Cinzas mantém seus controles próprios de música e efeitos/voz.
- Splendor mostra primeiro o deslocamento e depois o bônus/pontuação recebidos. As animações são mais lentas e podem ser concluídas imediatamente; bots dão tempo para acompanhar.
- Love Letter: selecione uma carta, clique no participante destacado e, na Guarda, clique no palpite. Sem alvo em lista ou seleção automática de pessoa. Príncipe pode escolher você. Cartas sem alvo têm confirmação na própria mesa; Princesa informa a eliminação.
- Carta, efeito e resultado são apresentados em três etapas. O alvo recebe destaque. Jogadas recentes, histórico aberto, rodada e quantidades reveladas/totais ficam visíveis. As quantidades restantes significam **ainda ocultas**, podendo estar no baralho, nas mãos ou separadas — nenhuma mão adversária é exposta.
- As ilustrações de Love Letter foram reconstruídas usando a foto fornecida como referência; não são fotografias digitalizadas das cartas. Proporção 2:3 preservada nas imagens. Sacerdote passa a se chamar **Padre**, sem alterar seu efeito.
- Bots dos jogos de mesa usam Epaminondas, Bonifácio e Cícero; quando há mais de três, recebem sufixos 2. Quem assume uma cadeira abandonada também usa esses nomes. Os bots de Cinzas não mudam.
- Layouts Original/Discord, monitores pequenos/verticais, fullscreen e movimento reduzido continuam disponíveis. Navegar cancela apresentações pendentes sem sair da chamada.

## Ordem de publicação

1. **Não há SQL novo.** Se os rankings de Azul e Splendor já funcionam, não repita as migrações. Caso tenha pulado a integração de Splendor, aplique `supabase/upgrade-splendor.sql` para seu ranking; Love Letter não usa tabelas persistentes.
2. Faça merge do PR aprovado e aguarde o Render publicar o backend **0.13.0-alpha**. Confira `/health` e os recursos `loveLetter`/`splendor`.
3. Aguarde o workflow **Windows full app** gerado pelo merge ficar verde.
4. Entre no GitHub e abra as [Releases privadas](https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases). Baixe **MN-Trono-Frontend-0.2.0.zip** da entrega mais recente, posterior ao merge.
5. Extraia em uma pasta nova e publique somente a pasta `frontend`:

   ```bash
   npx surge . a-lei-do-trono.surge.sh
   ```

6. Confira `https://a-lei-do-trono.surge.sh/downloads/latest.yml`: deve indicar `version: 0.2.0`. O ZIP leva **um único instalador atual** e seu manifesto. Não misture com arquivos antigos.
7. No app já instalado, busque a atualização pela versão no rodapé e reinicie quando for conveniente. O atualizador pode ir diretamente da 0.1.x para a 0.2.0, sem instalar versões intermediárias. Novas instalações usam o EXE do login. O reinício encerra a chamada.

O tamanho medido está em `TAMANHO-E-DOWNLOAD.json`, dentro do ZIP. O limite preventivo de 190 MiB permanece ativo. Backups privados conservam somente a versão atual e uma anterior (0.2.0 e 0.1.17).

## Dados

Recordes de Azul/Splendor e mensagens permanecem no Supabase conforme as migrações anteriores. Mesas em andamento, inclusive Love Letter, ficam em memória e terminam ao reiniciar/deployar o backend. Love Letter não adiciona ranking permanente nesta versão. As cartas e regras continuam validadas pelo servidor; o navegador só apresenta as jogadas.
