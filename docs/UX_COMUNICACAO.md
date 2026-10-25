# Produto e referência visual

Atualizado em 24/10/2026. Contrato aprovado para a reconstrução. Plano e andamento:
[MIGRACAO.md](MIGRACAO.md). Este arquivo substitui planos visuais separados.

## Experiência

- Após autenticação, abrir comunicação diretamente. Jogos têm área própria.
  Convidados mantêm acesso onde o produto atual permite.
- Referência visual vigente: imagem da Corte enviada pelo usuário nesta retomada.
  Fundo quase preto, dourado discreto, sidebar única, títulos com identidade própria,
  separações sutis e controles compactos. Usar Phosphor Icons na interface nova.
  O Discord orienta interações; sua aparência literal foi substituída.
- Organização: canais/conversas à
  esquerda; conteúdo central; membros/detalhes recolhíveis; entrada pessoal e
  conexão persistentes. Preservar marca própria.
- Desktop/Electron primeiro, com adaptação funcional para janela reduzida,
  tablet e telefone. Controles acessíveis por toque e teclado.
- Preservar o fluxo completo e a aparência dos jogos, incluindo lobbies, regras,
  efeitos, áudio e resultados. Reconstruir o catálogo externo.
- Voltar dos salões da Corte mantém a identidade: conta retorna à comunicação,
  convidado retorna ao catálogo. O formulário de acesso só ocupa a entrada de
  visitante ou um diálogo solicitado, com dimensões próprias fora do shell.
- Navegar entre texto, jogos e configurações conserva a chamada. Entrada, troca
  e saída de voz são ações explícitas.
- Grade/foco: grade inicial automática; quadro escolhido em destaque; demais em
  miniaturas; voltar restaura grade. Nova transmissão não toma o foco.
- Pessoa e transmissão têm quadros separados. Controles de microfone, áudio,
  câmera, compartilhar e sair permanecem acessíveis.
- Desativar áudio silencia também o microfone efetivo; reativar respeita mute
  manual anterior. Volume local não é moderação do servidor.
- Compartilhamento permite escolher fonte e configurar capacidades realmente
  suportadas pela plataforma. Controle de uma stream afeta só essa stream.
- Configurações pessoais categorizadas; administração separada; fechar acessível
  fora da rolagem; Escape fecha e devolve foco ao acionador.
- Preservar perfis, arquivos, notificações, soundboard, clipes, gravação, Remote PC
  e administração. Não apresentar como funcionalidade pronta recursos que o
  backend não oferece.

## Capacidades atuais

Manter contratos existentes: chat de canal com 300 caracteres, DM com 2.000 e
um anexo por envio. O servidor rejeita mensagens em canal exclusivamente de voz.
Qualquer expansão desses contratos é outra entrega. Histórico, IDs, arquivos,
cargos e perfis são preservados.

## Discord com REA

A preparação anterior observou o Discord Web autenticado em 24/10/2026 no
Chrome Windows, com REA para capturas/inspeção e Playwright para navegação.
Foram observados amigos, canais e configurações de voz: coluna compacta de
navegação, canais separados do conteúdo, compositor no rodapé e configurações
com categorias laterais.

Captura de canais registrada no chat:
`ev_424e88949823e044ff7060f48053403bb20c69c0cd2a291489c102b316085136`.
É referência histórica da preparação; um ID de sessão não garante que o
registro ainda esteja recuperável. Não há pacote de evidências exportado neste
checkout. Não usar capturas pessoais como dados de demonstração do produto.

O CLI 6.7.0 confirmou registro Codex alinhado; o MCP continua ausente nesta
sessão. A janela isolada anterior foi recuperada para o Marco 2, conservando a
sessão Discord. Em 24/10/2026, inspect_web_page via CLI registrou a página de
canais autenticada: ev_d4dbe4f3da8c189a6a9e3997452c1129ee4e3020af4e987a640ec9a6e403dd3b.
A inspeção reteve acessibilidade, sem valores de armazenamento ou corpos de
rede. É observação passiva da página de canais, sem chamada ativa; não
comprova grade, foco ou compartilhamento. Evidência completa em
artifacts/frontend-reset/rea-marco2-inspection.json.

A tentativa inicial de cenário encontrou a introdução do Chrome e falhou; esse
resultado não é contado como captura concluída. A inspeção passiva posterior,
já no alvo Discord, é a evidência bem-sucedida acima.

Antes do Marco 2, observar especificamente chamada ativa, grade/foco e
compartilhamento por REA. O material anterior não estabelece esses comportamentos
nem qualidade de mídia. Registrar alvo, data, método, observações, inferências e
lacunas nesta seção; capturas/relatórios ficam em artifacts.

Use a skill reverse-engineer-anything para a referência distribuída/runtime.
Código deste repositório é inspecionado por ferramentas normais. Ausência do MCP
de REA não significa ausência de uma instalação; diagnosticar conforme a skill,
sem reinstalação preventiva nem alterações de configuração não autorizadas.

## Avaliação

O agente executa QA com navegador/Playwright e corrige defeitos antes de apresentar
cada marco. O usuário aprova Marco 1, depois Marco 2, depois Marco 3. Não avançar
o marco seguinte antes do aceite. Escolher poucas regressões visuais duráveis
após aprovar o desenho. O usuário confirmou a direção visual do Marco 1 em
24/10/2026; modal cortado e retorno indevido ao login apontados nessa avaliação
foram corrigidos e verificados no navegador e Electron real. Marcos 2/3 ainda
não receberam aceite.
