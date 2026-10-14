# Integração ao M&N

Origem: Cinzas_do_Abismo_v0.5_Tuneis_Especiais_Horda_Surge.zip, fornecido pelo usuário.

SHA-256 do ZIP original: 0bedaa0304fe463d923b2c5ea8303e07ef3c4eb0bd17e33d3063d7b6d742c680.

Os documentos desta pasta são registros da produção original. Os comandos de publicação do pacote original não são a publicação do M&N; siga ATUALIZAR_WINDOWS_v0.1.15.md.

O conteúdo de dist/ está em frontend/roguelite/. As artes, músicas, simulação, fases, física, cartas, controle e persistência foram preservados. index.html inclui embedded.css; game.js acrescenta a comunicação de visibilidade com o hospedeiro, interrupção do RAF quando oculto e padrões iniciais de música mutada/gráficos Leve somente na integração. O jogo pode continuar aberto diretamente como página independente.

A capa gerada para a integração está em assets/catalogue-cover.png. asset-manifest.json lista os recursos com tamanho, MIME e SHA-256; .gitattributes mantém seus bytes iguais no checkout Windows. O instalador carrega HTML/JS/CSS locais e usa desktop/app/game-assets.cjs para baixar somente a mídia aprovada e guardar o cache. Nunca há fallback para HTML/JavaScript remotos.

Os verificadores originais estão em tests/cinzas/, com apenas caminhos ajustados ao repositório. node --test tests/cinzas-upstream.js executa a verificação de lógica, exploração, regressões, controle, UI simulada, versão 0.5 e áudio. tests/roguelite-browser.js verifica o jogo real com mídia ativa, ambos os layouts, telas menores/verticais, tela cheia, pausa, retry, backup e retomada da horda. tests/game-assets.js verifica downloads reais comprimidos, limite de concorrência, cache offline e integridade. O workflow Windows abre o aplicativo compilado com o cache previamente preparado e confere a ausência de downloads de mídia nessa sessão.
