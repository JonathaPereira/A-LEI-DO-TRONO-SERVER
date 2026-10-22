# Windows 0.3.3 · instalação com o aplicativo na bandeja

Fechar no X mantém o MN Trono em segundo plano. O instalador desta versão
identifica o executável do aplicativo por uma chamada nativa, solicita o
fechamento e encerra as instâncias que continuarem escondidas após a autorização
da instalação. Não depende da consulta PowerShell que interpolava o diretório
e confundia outros executáveis da pasta com o aplicativo.

Conta e preferências continuam preservadas. A atualização mantém as artes
fornecidas para Ticket to Ride, a disposição da mesa e as animações da 0.3.2.
Não exige alterações no backend ou no banco de dados.

## Se o instalador antigo estiver preso

1. No aplicativo, use **M&N → Sair**. Fechar apenas no X mantém a bandeja.
2. Se a janela não responder, abra **Ctrl + Shift + Esc**, selecione
   **MN Trono** no Gerenciador de Tarefas e clique em **Finalizar tarefa**.
3. Volte ao instalador e clique em **Repetir**.

## Validação e publicação

Os testes locais cobrem o atualizador, preferências e integridade do pacote.
O workflow **Windows full app** também executa o instalador real em uma pasta
com espaços e apóstrofo, abre o aplicativo, esconde sua janela na bandeja,
instala novamente sobre a instância aberta e confere a reabertura e a preservação
do perfil. A entrega só é criada depois que esse teste passa.

Publique o pacote **MN-Trono-Frontend-0.3.3.zip** da execução aprovada usando
o workflow **Publish approved frontend**, informando a tag exata dessa entrega.
O pacote já contém **MN-Trono-0.3.3-Windows.exe** e o manifesto correspondente.
Confirme `version: 0.3.3` em
<https://a-lei-do-trono.surge.sh/downloads/latest.yml>.
