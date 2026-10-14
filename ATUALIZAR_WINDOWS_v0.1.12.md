# M&N · Windows 0.1.12 — o ateliê de Azul

## O que mudou

- Peças com ilustrações SVG próprias e acabamento de cerâmica: azul, amarelo floral, vermelho, preto ornamentado e branco/turquesa. O tabuleiro segue a disposição da referência: linhas triangulares, cinco setas, parede, sete espaços de chão e lembrete dos bônus.
- Fábricas ao redor do centro, entre os tabuleiros em janelas largas. Em janelas menores, viram uma faixa compacta. Mesas de 2, 3 e 4 participantes continuam disponíveis.
- **Tela cheia** amplia somente o jogo. **Sair da tela cheia** ou Escape retorna à interface. Se o navegador bloquear essa API, a mesa usa o espaço da janela com a mesma opção de sair. Voz, câmera e compartilhamento continuam conectados.
- Ao fechar a rodada, a contagem apresenta uma linha por vez: azulejo viajando até a parede, conexões destacadas, pontos recebidos, chão e bônus finais. **Concluir contagem** mostra imediatamente a mesa atual. O servidor continua validando jogadas e calculando pontos; animações não enviam nem alteram placares.
- Efeitos originais ao selecionar, colocar, pontuar e descontar penalidades. Respeitam a opção de efeitos sonoros já existente. Música e microfone não são alterados. Movimento reduzido elimina a espera da contagem.
- O Top 5 permanente, as regras originais, os dois layouts da comunidade e a atualização interna do Windows são preservados. Clipes continuam suspensos.

## Publicação, nesta ordem

1. Faça merge do PR com **Windows full app** verde. **Não há SQL novo nem mudança no backend** nesta versão. O Azul continua usando o backend 0.10.0-alpha e a migração upgrade-azul.sql já publicados na versão anterior.
2. Abra a execução verde indicada no PR. Baixe os dois artefatos **MN-Trono-Windows-x64** e **MN-Trono-Site-Leve** da mesma execução.
3. Extraia o primeiro. Em https://github.com/JonathaPereira/MN-Trono-Downloads/releases/new, crie a tag **v0.1.12**, título **M&N Windows 0.1.12**, anexe **MN-Trono-0.1.12-Windows.exe** e publique. O arquivo precisa abrir sem login em:
   https://github.com/JonathaPereira/MN-Trono-Downloads/releases/download/v0.1.12/MN-Trono-0.1.12-Windows.exe
4. Extraia o **MN-Trono-Site-Leve numa pasta nova**. O pacote tem cerca de 20 MB e não inclui EXEs. No Git Bash, entre na pasta frontend extraída e publique:

   ```bash
   cd "/c/Users/Jonatha/Downloads/PASTA-EXTRAIDA/frontend"
   npx surge . a-lei-do-trono.surge.sh
   ```

5. Confira https://a-lei-do-trono.surge.sh/downloads/latest.yml: deve mostrar **version: 0.1.12** e apontar para o EXE público. Não edite o SHA-512: ele já corresponde ao instalador daquele pacote.
6. No aplicativo instalado, clique na versão no rodapé para buscar a atualização. O app baixa internamente e permite reiniciar quando você puder encerrar a chamada. Contas, permissões e preferências lembradas são mantidas.

O instalador fica no GitHub Releases; o Surge recebe só o site e o manifesto de atualização. A retenção mantém a versão atual e uma anterior. Ao publicar 0.1.12, ficam 0.1.12 e 0.1.11. Não misture EXE e manifesto de execuções diferentes nem substitua os bytes de uma versão já publicada.

## Conferência rápida

Entre numa chamada, abra Jogos → Azul e comece uma mesa. Selecione uma cor e coloque numa linha destacada. Ao terminar a rodada, confira a passagem para a parede, os pontos e o chão. Use Concluir contagem e verifique que a próxima jogada está disponível quando for sua vez. Teste tela cheia, as regras dentro dela e Escape. Abra o chat e volte: a chamada e a mesa continuam. Em monitor vertical, as fábricas ficam compactas e os tabuleiros continuam acessíveis por rolagem, sem cortar peças lateralmente.
