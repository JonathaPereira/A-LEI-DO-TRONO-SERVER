# Atalaia: Guardiões do Cristal — Godot 0.2

Projeto 2D em GDScript, com exportação atual em **Godot 4.6.3 Standard** (não exige .NET), renderer Compatibility e Web sem threads. A versão 0.2 melhora a apresentação do projeto Godot 0.1 enviado: HUD nomeado, campo sem esticar, fundos das três regiões e animações. Campanhas Godot existentes continuam compatíveis.

A versão web 0.6.1 compartilhada como referência tem seis regiões, 30 ondas,
cristais e oficina. O Godot conserva a campanha de três regiões e 15 ondas do
ZIP; essa referência não foi apresentada como equivalência de conteúdo.

## Abrir e jogar

1. Extraia o ZIP inteiro.
2. No gerenciador do Godot, escolha **Importar** e selecione `project.godot`.
3. Aguarde a importação das texturas, fontes e áudios.
4. Pressione **F5** e clique em **Iniciar campanha**.

Para a versão pronta de Windows, extraia o pacote de Windows e abra `Atalaia.exe`. O arquivo `Atalaia.pck` precisa continuar na mesma pasta. No Linux, dê permissão de execução a `Atalaia.x86_64` e execute-o ao lado do PCK. A compilação de Linux foi executada neste ambiente; a de Windows foi exportada, mas não testada em um computador Windows.

## O que já está jogável

- **3 fases / 15 ondas**: Floresta ancestral (1 via), Pântano das bifurcações (2 vias) e Cidadela das três vias (3 vias reais), com chefe a cada cinco ondas.
- **6 armas**: Balista, Morteiro, Lança-chamas, Tesla, Obelisco glacial e Alquimista. Três níveis por torreta.
- **12 cartas individuais**, até três por torreta, e **18 doutrinas possíveis** (três de cada tipo). As doutrinas são uma etapa adicional após os chefes das ondas 5 e 10, afetam armas atuais e futuras e não ocupam espaços individuais.
- Escolhas com entrada escalonada, escala/realce no hover, partículas gráficas nos emblemas e animação de confirmação. O recebedor precisa ser confirmado pelo ID/nome/nível da torreta.
- Caminhada de quatro quadros por distância para esqueletos, lobos, aranhas e golens; fungos e chefes usam duas poses, espíritos flutuam intencionalmente. Sombras e alinhamento pela base dos pés.
- Cabeças mecânicas com giro, recuo, projéteis na boca da arma, arco balístico e fumaça de morteiro, jato contínuo de fogo, raios em cadeia, congelamento e poças animadas de veneno.
- Terrenos detalhados, movimento discreto da água/neblina por shader, partículas ambientais e cristal com levitação, halo e fragmentos orbitais.
- HUD de núcleo, ouro e onda com ícones vetoriais, números separados e barras de avanço. Ouro conta suavemente e mostra ganhos sobre os inimigos derrotados.
- Campo com escala uniforme e recorte nas bordas; novos terrenos de floresta, pântano e cidadela, preservando as estradas e os espaços das regras. Construção, movimento e evolução animados.
- Evolução e detalhes da torre na lateral; relatório por torreta ou tipo, campanha/onda, dano efetivo, DPS e exportação CSV.
- Construção e reposicionamento grátis entre ondas; mover para um local ocupado troca as torretas. IDs, níveis e cartas acompanham cada unidade nas mudanças de mapa. Os 48 espaços foram validados junto às estradas.
- Pausa, velocidade 1×/2×, mixer separado e salvamento automático da campanha, inclusive durante uma onda ou escolha de carta.

## Controles

| Ação | Controle |
| --- | --- |
| Escolher arma | Botões inferiores ou 1–6 |
| Construir | Escolha a arma e clique em um círculo livre |
| Selecionar torreta | Clique nela ou na linha do relatório |
| Evoluir | Painel da torre na lateral ou U |
| Próxima onda | Botão lateral ou Espaço |
| Mover/trocar | Selecione a torreta, clique em Mover e no destino |
| Pausar/retomar | P, Esc ou botão Ⅱ |
| Velocidade | F ou botão 1×/2× |
| Silenciar | M |
| Ajustar volumes | Engrenagem superior |

Durante a onda, é possível evoluir. Construir, vender e mover ficam disponíveis na preparação. Esc também cancela uma construção ou mudança de posição. A campanha não começa uma onda automaticamente após uma escolha.

## Áudio

Paleta original de **19 arquivos estéreo a 48 kHz**: ambiência úmida de floresta, trilha harmônica suave, ruído filtrado de fogo contínuo, madeira/metal da balista, impacto grave e detritos do morteiro, descarga elétrica, vidro glacial, líquido alquímico, interface e resultados. Áudio pré-renderizado em Vorbis; não usa ondas quadradas, timbres de 8 bits ou arquivos de terceiros. Mixer com compressor geral, reverberação sutil e limites de simultaneidade. O gerador offline reproduzível está em `tools/create_audio.py`; só exige numpy/scipy/ffmpeg para **recriar** os sons.

## Estrutura editável

- `scenes/main.tscn`: entrada do jogo.
- `scenes/tower.tscn`: base, gimbal e cabeça, com script de animação visual.
- `scenes/enemy.tscn`: AnimatedSprite2D e caminhada.
- `scripts/run.gd`: regras de combate, cartas, progressão, autoria de dano, serialização. Sem dependência do HUD.
- `scripts/catalog.gd`: números das armas, monstros e cartas.
- `data/maps.json`: estradas e espaços de construção das três fases.
- `scripts/board.gd`, `terrain.gd`, `effects.gd`, `smoke.gd`, `core.gd`: cenário, estradas, efeitos e cristal.
- `scripts/main.gd`, `ui.gd`, `hud_icon.gd`, `card_view.gd`, `card_art.gd`: interface construída com Controls nativos, ícones vetoriais e animações por Tween.
- `scripts/sound.gd`: reprodução, espacialização e mixer.
- `assets/`: arte, fontes, shader e áudio, sem downloads em execução.

A interface é montada por código; os elementos visuais das torretas e criaturas estão em cenas separadas. A arte é 2D pré-renderizada. Este projeto inicia a direção do conceito; não é uma reprodução 3D nem uma equivalência quadro a quadro da ilustração. Animações mais longas, mais ataques dos chefes e polimento de efeitos continuam como próximas etapas de produção.

## Progresso

O Godot guarda a campanha em `user://atalaia_campaign_v1.json` e os volumes em `user://atalaia_settings_v1.json`. A gravação usa arquivo temporário antes da substituição. **Este save é separado da versão web anterior**; a migração dos saves do navegador ainda não está implementada. Uma nova campanha pelo menu pede confirmação antes de substituir o progresso atual.

Os CSVs são escritos em `user://atalaia-dano-onda-NN.csv`; a opção de exportação abre a pasta correspondente. O relatório preserva a autoria de veneno mesmo após venda da torreta. DPS usa o tempo de combate decorrido, com pausas/preparação excluídas. Poças do mesmo dono usam o maior DPS; poças de donos diferentes somam.

## Validação

Executado com Godot **4.5.2.stable.official.6ce3de25a**:

```sh
godot --headless --path . --script res://tests/verify.gd
godot --headless --path . --script res://tests/campaign.gd
godot --headless --path . --script res://tests/campaign.gd -- --fixed-policy
godot --path . --script res://tests/runtime_verify.gd -- --qa
```

- 24 verificações de regras: preços, evolução, ocupação, movimentos, slow/resistência, poças/autoria, dano efetivo, cartas/doutrinas, save durante onda e 48 espaços de construção.
- 15 verificações de interface em execução: construção, evolução, onda, pausa, mixer, entrada das cartas, recebedor, seleção, relatório, doutrina e salvar/continuar.
- Política determinística adaptativa, semente 78, usando ouro real e reposicionamento gratuito: completa as 15 ondas com **22/30** de integridade. Política que fica com as quatro torretas iniciais perde na **onda 8**. São verificações de viabilidade, não estimativas de taxa de vitória ou balanceamento definitivo.
- Capturas e vídeo produzidos pela renderização do próprio Godot. `--showcase` é uma **cena demonstrativa com estado preparado** no pântano, não uma partida começando do zero; não lê nem escreve o save do jogador. `tests/capture.gd` também prepara a escolha de cartas para verificar sua animação.

## Exportar

Instale os templates de exportação da mesma versão do Godot. Os presets `Windows` e `Linux` estão prontos:

```sh
godot --headless --path . --export-release Windows ../builds/windows/Atalaia.exe
godot --headless --path . --export-release Linux ../builds/linux/Atalaia.x86_64
```

As builds não são assinadas. Os scripts de teste e o gerador de áudio ficam fora do PCK. Uma janela menor mantém o enquadramento 16:9, sem rolagem da página. O foco desta versão é desktop com mouse e teclado; controles de toque e exportação mobile ainda não foram preparados.

## Créditos

Arte original do projeto enviado e novos fundos da edição 0.2 gerados com imagegen. Código, ícones vetoriais e áudio criados para este projeto. Caladea e Carlito sob SIL Open Font License; avisos em `FONT-LICENSES.txt`. Godot é distribuído sob MIT; o motor e bibliotecas incluídas estão documentados em `GODOT-LICENSE.txt` e `GODOT-COPYRIGHT.txt`. Nenhum asset de Nexus ou Cinzas do Abismo foi copiado.


## Integração ao Trono

O projeto enviado foi preservado em `games/atalaia`, com exportação Web adicional
validada em Godot 4.6.3, Compatibility e sem threads. O relatório CSV da Web usa
o download do navegador; Windows/Linux nativos continuam abrindo a pasta local.
Os testes originais de regras permanecem em `tests/`.

Na raiz do repositório do Trono:

```sh
node scripts/prepare-godot.cjs
node scripts/build-atalaia.cjs
npm run build
node --test tests/atalaia.cjs tests/atalaia-browser.cjs
```

O primeiro comando baixa o editor e os templates oficiais com SHA-512 fixado.
O build executa as verificações de regras e de interface Godot antes da exportação.
Quem já tem o Godot 4.6.3 e seus templates pode usar `GODOT_BIN=godot` no segundo.
A saída fica em `artifacts/atalaia/web`, separada do frontend principal. O teste
browser usa esse jogo real e contas/mídia descartáveis; o acesso remoto é servido
localmente pela fixture. Não é uma página simulando o jogo.

**Windows full app** exporta e valida o jogo antes do empacotamento. A mesma
release contém `Atalaia-Web-<versão desktop>.zip` e seus hashes. Ao publicar a
entrega aprovada, **Publish approved frontend** verifica esse ZIP, publica
`atalaia-mn.surge.sh`, confere `version.json` e só então atualiza o catálogo do
Trono. O secret existente `SURGE_TOKEN` é usado para ambos os domínios.

O motor e os recursos de Atalaia ficam nesse domínio separado para preservar o
limite de 190 MiB do pacote principal, sem retirar jogos nem o instalador.
No site, Jogar abre outra aba com `noopener`; no aplicativo, uma janela sem
preload usa `persist:mn-atalaia`, separada do Nexus e da conta do Trono. O jogo
salva via armazenamento próprio do navegador/Windows; não há sincronização de
campanha entre dispositivos. A chamada e seus dispositivos continuam no Trono.

Na publicação manual, extraia `Atalaia-Web-<versão>.zip` em uma pasta nova e
publique-a com `npx --yes surge@0.46.0 . atalaia-mn.surge.sh` antes de enviar a
pasta `frontend/` da mesma release. A URL pública única fica em
`electron/atalaia-config.cjs`. Para abrir o jogo fora do catálogo, use
https://atalaia-mn.surge.sh/. O projeto mantém foco em mouse e teclado.
