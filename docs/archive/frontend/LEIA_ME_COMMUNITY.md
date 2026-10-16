# Frontend atualizado da v0.8.0

Esta pasta contém o frontend completo, com seleção de resolução/FPS antes do
compartilhamento, cargos Criador/Admin/Membro, gerenciamento de canais, galeria
de fotos/anexos, efeitos de até 15 segundos com volume pessoal e mosaico de
até seis pessoas. Agora as câmeras e telas abrem em tela cheia individual,
fechando a grade automaticamente. O layout e as fontes foram atualizados; jogo, mídias e
manuais existentes foram preservados.

Se você já instalou a atualização de cargos/canais e executou
`upgrade-community.sql`, este refinamento requer somente publicar o novo
frontend. Não há migração SQL nova nem alteração no backend.

Para uma instalação nova, atualize primeiro o Supabase com
`upgrade-community.sql` e o backend com o pacote correspondente.
O cargo Criador depende do e-mail **confirmado**
`Jonathapereira.jj@gmail.com`, verificado pelo backend. Só o Criador atribui
Admin. Alterar o apelido não altera o cargo.

Publique esta pasta, com `index.html` na raiz:

```bash
surge . a-lei-do-trono.surge.sh
```

O backend público permanece configurado em `network.js`. Nunca coloque chaves
de serviço, R2 ou Cloudflare nesta pasta. Consulte o `COMMUNITY_UPDATE.md` que
acompanha o backend para a ordem de migração/publicação e limites dos testes.

Em Pessoas, use Cargo para promover/remover Admin; em Gerenciar, crie/exclua
canais. Anexos lista fotos e arquivos do canal. Efeitos, no canto inferior
esquerdo, abre um submenu com miniaturas; o botão duplicado da barra central
foi removido. Em Adicionar efeito, escolha um
áudio de até 20 MB, selecione início/fim de um trecho de até 15 segundos e
ouça antes de enviar. Somente o trecho selecionado será publicado. O volume
é individual e o botão da miniatura toca o efeito na chamada. As miniaturas
ficaram menores para caberem mais efeitos no menu.

Em Perfil → Aparência, escolha roxo (padrão), verde/preto, preto/vermelho,
azul/preto ou amarelo/preto. O tema muda apenas para você e fica salvo por
conta neste navegador. Não muda a aparência dos outros participantes.

Arraste as bordas laterais, inferiores ou os cantos dos painéis de canais,
mensagens e pessoas para mudar o tamanho. A borda inferior da chamada ajusta
sua altura; as laterais ajustam sua largura. No celular, a faixa de canais
permite ajustar a altura. As medidas ficam salvas por conta neste navegador.
Perfil → Voltar ao padrão restaura todas as medidas sem mudar o tema.

Grade · até 6 permite escolher os participantes. Nos cartões da grade,
⛶ Tela ou ⛶ Câmera abre a mídia em tela cheia e fecha a grade. Também é
possível usar ⛶ ou um clique duplo diretamente no vídeo. Use Esc ou ⛶
para voltar. Em navegadores que bloqueiam a API de tela cheia, o vídeo ocupa
a janela inteira. O compartilhamento de tela depende
do suporte do navegador, especialmente no celular.

Durante compartilhamentos, as telas ocupam a área principal e as câmeras
ficam nos cartões dos perfis. Ao encerrar as telas, as câmeras voltam à área
de mídias. Ocultar câmera / Mostrar câmera funciona nos cartões e na grade:
afeta somente sua visualização, sem desligar a câmera da pessoa nem sua voz
ou transmissão. A preferência dura até sair da chamada.

Configurações → Áudio → Supressor ativa RNNoise no seu microfone, processado
localmente e gratuitamente antes de transmitir a voz. O primeiro uso carrega
um modelo de aproximadamente 3,6 MB. Publique a pasta `vendor/rnnoise/` junto
com os outros arquivos do frontend. O botão informa o modo real: RNNoise,
redução nativa do navegador, pausado ou indisponível. Em caso de falha, tenta
a redução nativa e mantém o microfone funcionando. Ruídos fortes ou outras
vozes próximas ainda podem passar; o resultado varia com o microfone.

A entrada da câmera fica em Configurações → Vídeo. Ao trocar, a captura
anterior é liberada primeiro. Se outro aplicativo estiver usando a câmera,
feche esse aplicativo e tente novamente; a página não pode liberar uma câmera
controlada por outro programa.
