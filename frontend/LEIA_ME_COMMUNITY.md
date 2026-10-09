# Frontend atualizado da v0.8.0

Esta pasta contém o frontend completo, com seleção de resolução/FPS antes do
compartilhamento, cargos Criador/Admin/Membro, gerenciamento de canais, galeria
de fotos/anexos, efeitos de até 15 segundos com volume pessoal e mosaico de
até seis pessoas. O layout e as fontes foram atualizados; jogo, mídias e
manuais existentes foram preservados.

Atualize primeiro o Supabase com `upgrade-community.sql` e o backend com o
pacote correspondente. O cargo Criador depende do e-mail **confirmado**
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
canais. Anexos lista fotos e arquivos do canal. Efeitos permite enviar áudio,
ouvir uma prévia e tocar na chamada; o volume é individual. Ampliar mosaico
permite escolher até seis participantes. O compartilhamento de tela depende
do suporte do navegador, especialmente no celular.
