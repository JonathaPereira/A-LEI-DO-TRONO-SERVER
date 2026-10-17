# Windows 0.2.10 · painel compacto e prioridade ao SFU

O painel durante os jogos passa a usar uma única apresentação flutuante compacta. O botão **Ampliar** reutiliza o mosaico existente; a janela antiga Completa/Flutuante e as cópias das câmeras ao redor da mesa deixam de duplicar apresentações. Avatares, miniaturas, altura e posição ficam limitados à tela. O botão de restaurar não fica atrás de Pessoas. Preferências antigas de tamanho do painel são descartadas uma vez para corrigir as dimensões excessivas.

A recuperação da chamada mantém o SFU quando falham câmeras ou telas. Essas mídias têm retentativas próprias, com limite, cancelamento ao desligar a captura e proteção contra respostas atrasadas. O envio do microfone tenta se recuperar antes de pedir fallback; o recebimento de áudio tem fila separada de vídeo. Um estado P2P atrasado na lista de participantes deixa de disparar sozinho outro fallback após cinco segundos.

**P2P continua disponível quando a voz não pode ser recuperada, o SFU está desligado/indisponível ou os limites operacionais exigem.** Os limites de consumo e participantes permanecem ativos. Uma câmera lenta não deve desligar o SFU da voz saudável.

## Atualizar e publicar

Na entrega validada **Pacotes Windows 0.2.10**, nas [Releases do repositório](https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases), baixe:

- `MN-Trono-Frontend-0.2.10.zip`: frontend completo com EXE e manifesto.
- `MN-Trono-0.2.10-Windows.exe`: o mesmo instalador separado.
- `SHA256SUMS-0.2.10.txt`: hashes para conferência.

Extraia em uma pasta nova. Na pasta `frontend`, publique pelo Git Bash:

```bash
npx surge . a-lei-do-trono.surge.sh
```

Publique a pasta inteira, incluindo `downloads/`. Confira `version: 0.2.10` em `https://a-lei-do-trono.surge.sh/downloads/latest.yml`. Preserve o EXE e o manifesto da mesma entrega.

No Windows, encerre o aplicativo pelo menu **Sair**, instale o EXE novo e abra novamente. A versão mantém a correção de voz em segundo plano da 0.2.9.

**Esta revisão não exige SQL novo nem redeploy do backend.** A configuração de Cloudflare SFU/TURN existente continua valendo. A migração de créditos do GIPHY da 0.2.8 segue incluída no ZIP para quem ainda não a aplicou.

## Chamada que já caiu para P2P

O backend escolhe um modo para a sala inteira e o mantém até a chamada esvaziar. Essa coordenação evita participantes em transportes incompatíveis e trocas repetidas durante a conversa. Não há migração automática P2P → SFU em uma chamada ativa nesta revisão.

Depois de atualizar os participantes, se a sala estiver presa em P2P por um erro antigo, **todos saiam somente da voz e entrem novamente**. A partida pode continuar aberta. A nova chamada escolherá SFU se o backend estiver configurado, habilitado e dentro dos limites. Confira a indicação Cloudflare SFU na conexão.

## Validação

Os testes de controle simulam respostas e falhas do SFU para verificar recuperação por mídia, filas independentes, retentativas limitadas, cancelamento e fallback da voz apenas depois de esgotar a recuperação. O protocolo real de WebSocket verifica que o backend mantém todos no mesmo modo e escolhe SFU na chamada seguinte. O painel é verificado no Chromium em Original e Discord, em telas de desktop e celular, sem substituir os dispositivos ou recriar o microfone ao mudar a apresentação.

Esses testes não usam credenciais de produção da Cloudflare e não medem a qualidade em uma rede real com carga. A análise detalhada está em `ANALISE_SFU_E_JANELA_FLUTUANTE.md` no GitHub e na raiz do ZIP.
