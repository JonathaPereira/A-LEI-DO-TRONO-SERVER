# Registro do alerta do download

## Situação

Um usuário relatou que o navegador bloqueou `NEXUS-v0.1.zip` com a mensagem **“Falha — Vírus detectado”**. Não foi informado nome de ameaça, mecanismo ou identificador de detecção. Não há um resultado de análise do Microsoft Defender neste ambiente Linux. O diagnóstico permanece **inconclusivo**; não é possível classificar o aviso como falso positivo.

O ZIP foi retirado do estado atual da branch e os links de download foram removidos. Versões anteriores continuam no histórico Git para investigação; isso não autoriza sua execução. Uma cópia foi preservada fora da pasta publicada e não está sendo executada ou redistribuída.

## Evidências e limites

- SHA-256 do pacote publicado: `10d37efd3da7ccaecac82b3dbc926bebd5dda689560c1efb459f1cd19d9efd55`.
- SHA-256 do HTML contido: `4ba0cff2c62e3f217596b29272569669ceedab0c9b0918f83ab70ffc92cc03a0`.
- O inventário do ZIP contém um HTML e três arquivos de texto/instruções/licenças. Não contém EXE, instalador ou script de sistema. Um HTML ainda contém código executado pelo navegador; esse inventário não demonstra ausência de malware.
- O HTML reunia JavaScript minificado e imagens/fontes codificadas em Base64. O atlas era reconstruído com `atob` e uma URL Blob. Esse empacotamento foi removido da entrega; ele não constitui prova da causa do alerta.
- A integridade CRC do arquivo e a comparação com o HTML gerado foram verificadas. Esses checksums verificam identidade/integridade, não segurança.
- Os testes anteriores eram funcionais. Não foi executado um scanner antivírus compatível com o que produziu o alerta. Nenhum arquivo foi submetido a serviços públicos de análise.

## Ações tomadas

1. Interromper a distribuição e orientar a manter as proteções ativadas.
2. Preservar evidência e identificadores sem executar novamente o HTML sinalizado.
3. Remover o ZIP, o gerador de HTML único, o teste que o executava e a dependência de empacotamento.
4. Preparar uma entrega web convencional: HTML, CSS, módulos JavaScript legíveis, PNGs e fontes como arquivos separados. Não há reconstrução de payloads, minificação ou geração de downloads no navegador.
5. Validar a aplicação e os caminhos dos recursos. Essas verificações de funcionamento não equivalem a uma liberação antivírus.

O diagnóstico do arquivo antigo exige o nome/identificador da ameaça ou análise do mecanismo que o bloqueou. Não desative o antivírus, não crie exceções e não use versões antigas do pacote para tentar contornar o bloqueio.
