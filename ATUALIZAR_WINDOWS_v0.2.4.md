# Windows 0.2.4 — entrada voluntária na voz e ajustes do perfil

Abrir ou reabrir o app não conecta à chamada. O usuário escolhe uma sala de voz clicando nela, ou usa Conectar na sala selecionada. A navegação entre início, jogos, texto e comunidade preserva uma chamada que ele já iniciou. Sair da voz remove seu ícone da lista de participantes e mantém o acesso ao chat.

O perfil inclui Buscar GIF para avatar, capa e fundo, com pesquisa pública no Wikimedia Commons sem chave de API. Os créditos ficam disponíveis no perfil. O catálogo precisa de internet; a seleção é enviada como arquivo da própria conta ao salvar. Imagens e GIFs locais continuam disponíveis. A capa permite posição vertical, arraste na prévia e zoom. Links aceitam endereços sem `https://` e nome opcional; o seletor de emoji respeita emojis compostos.

Os cartões da chamada são menores e usam o fundo escolhido no perfil. As ações de conectar, ligar câmera e iniciar compartilhamento são verdes; sair, desligar câmera e parar compartilhamento são vermelhas. Original mantém rótulos inferiores e Discord mantém ícones.

## Publicar

1. Faça o merge desta revisão e confirme o deploy do backend no Render. As migrações de perfil e de controles de mídia já foram aplicadas no projeto chat-mn. Não as execute novamente nessa base. Em outra base, aplique as migrações em ordem.
2. Baixe `MN-Trono-Frontend-0.2.4.zip` da compilação Windows aprovada, autenticado no GitHub, e extraia numa pasta nova.
3. A pasta `frontend/downloads` inclui `MN-Trono-0.2.4-Windows.exe` e `latest.yml` da mesma entrega.
4. No Git Bash, dentro de `frontend`, execute `npx surge . a-lei-do-trono.surge.sh`.
5. Confira se `/downloads/latest.yml` mostra `version: 0.2.4`. Preserve seu SHA-512 e o EXE correspondente.
6. No app instalado, verifique a atualização e reinicie após o download. Para instalação manual, execute o EXE incluído.

A compilação valida o perfil e suas permissões em PostgreSQL local, os fluxos da interface em navegador e no shell Windows, o runtime nativo e a continuidade da mídia entre layouts antes de gerar o instalador. Os testes de catálogo simulam a API externa; a disponibilidade do Commons depende desse serviço.
