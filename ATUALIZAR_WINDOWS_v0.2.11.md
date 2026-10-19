# Atualização 0.2.11 · Compartilhar PC Beta

A função aparece junto aos controles da chamada com o selo **Beta**. Compartilha um monitor com uma pessoa da mesma voz; o convidado pode pedir controle de mouse e teclado, e o dono precisa autorizar. A voz continua conectada durante o compartilhamento e depois de encerrá-lo.

Baixe os Assets da entrega validada **Pacotes Windows 0.2.11** nas Releases do repositório, com sua conta do GitHub autorizada:

- `MN-Trono-Frontend-0.2.11.zip`: frontend completo com instalador e manifesto.
- `MN-Trono-0.2.11-Windows.exe`: o mesmo instalador separado.
- `SHA256SUMS-0.2.11.txt`: hashes da entrega.

## Ordem de atualização

1. Atualize o backend no Render com esta revisão. A beta usa o protocolo de sessão remota novo; o backend anterior não o oferece. Não há SQL novo.
2. Extraia o ZIP em uma pasta nova e publique a pasta `frontend` inteira, incluindo `downloads/`, com `npx surge . a-lei-do-trono.surge.sh`.
3. Confira `version: 0.2.11` em `/downloads/latest.yml` no site. Encerre o aplicativo pelo menu Sair e instale o EXE novo.
4. Teste com duas contas na mesma voz. Abra **Compartilhar PC · Beta**, selecione a pessoa e o monitor. O convidado aceita o convite e, se quiser, pede controle.

O host precisa do aplicativo Windows 0.2.11. O convidado pode usar o app ou navegador compatível. Revogue o controle sem interromper o vídeo, ou use **Ctrl + Alt + Shift + F12** para encerrar o compartilhamento. O app mantém uma faixa de aviso no Windows.

As configurações SFU/TURN atuais são reutilizadas. Sem TURN disponível, algumas redes não conectarão. O vídeo remoto usa transporte próprio e não força a voz para P2P. O consumo do transporte remoto não aparece no contador estimado do SFU; acompanhe TURN no provedor.

A beta tem perfil de até 1080p/60 FPS, um monitor, uma pessoa, mouse e teclado. Não há controle de videogame nem promessa de latência equivalente ao Parsec. Veja `COMPARTILHAR_PC_BETA.md`, incluído na raiz do ZIP, para uso, áudio isolado, limites e validação.

As correções de voz em segundo plano da 0.2.9 e da recuperação SFU da 0.2.10 permanecem nesta entrega.
