# M&N · Windows 0.1.10 — painel de voz Discord

## O que mudou

- No layout Discord, o canto inferior esquerdo reúne estado da conexão, nome real da sala de voz e botão de entrar/sair da chamada.
- Câmera e compartilhamento ficam logo abaixo, como ícones com tooltip, estado ligado/desligado e controles de teclado. O popup de qualidade/FPS e a troca de fonte continuam disponíveis.
- Foto, nome e estado pessoal aparecem na faixa inferior, junto de microfone, silenciamento e configurações. A bolinha fica fora da foto; o nome completo aparece no tooltip quando o espaço é pequeno.
- Clicar no canal conectado abre a sala correspondente e preserva microfone, câmera, transmissão e assento no jogo. O cartão continua mostrando a sala de voz mesmo ao ler outro canal de texto.
- Sair da call não muda o texto selecionado nem tira você da mesa. Entrar novamente funciona enquanto lê o texto. Durante a permissão de microfone, o painel mostra Conectando e bloqueia entradas duplicadas.
- Em monitores largos, o rodapé de controles passa à lateral e libera altura para a transmissão. Em telas menores/verticais, o painel ocupa a faixa inferior e os menus ficam acima dele.
- O layout Original/Padrão continua disponível em Aparência. A escolha continua individual.

## Publicar

Esta atualização altera frontend/app e usa o backend 0.9.1-alpha já publicado. **Não há SQL novo para executar.** As migrações da 0.1.9 precisam já estar aplicadas ao banco compartilhado. Quem pulou aquela versão deve seguir ATUALIZAR_WINDOWS_v0.1.9.md do repositório antes.

1. Faça merge do PR no GitHub.
2. Aguarde o workflow Windows full app terminar com sucesso. Baixe MN-Trono-Site-com-Desktop e extraia o pacote.
3. Entre na pasta frontend completa desse artefato, que inclui downloads/ e manual/. No Git Bash:

   ```bash
   cd "/c/Users/Jonatha/Downloads/PASTA-EXTRAIDA/frontend"
   npx surge . a-lei-do-trono.surge.sh
   ```

4. Confira https://a-lei-do-trono.surge.sh/downloads/latest.yml: deve mostrar version: 0.1.10 e apontar para MN-Trono-0.1.10-Windows.exe, presente na mesma pasta downloads/.
5. No app instalado, clique na versão no rodapé do menu lateral e busque a atualização. Reinicie quando puder encerrar a chamada. Contas, temas, preferências e permissões lembradas são mantidos.

Não publique somente o código-fonte: use a pasta frontend completa do artefato, com instalador e latest.yml. O EXE não vai para o Git. O canal de atualização continua no mesmo domínio.

## Conferência

Ative Aparência → Discord. Entre em Jogos, ligue câmera/tela pelos ícones inferiores e leia um canal de texto. O cartão deve continuar mostrando Jogos. Confira mute/silenciamento, saia da call e entre novamente sem mudar o texto. Clique no canal conectado para voltar à sua sala de voz. Troque para Original e volte: navegar e trocar layout preservam a chamada. Confira também uma janela pequena ou vertical.
