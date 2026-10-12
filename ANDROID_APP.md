# Android: base e distribuição de teste

Este é o plano para a próxima etapa. A versão atual contém o site e o app Windows; ainda não produz um APK.

## Base recomendada

Usar Capacitor para empacotar `frontend/` num projeto Android e criar uma ponte própria para os recursos do celular. Electron, o executável Windows e o helper de áudio WASAPI não se convertem em APK. Jogo, login, mensagens, cargos, biblioteca de efeitos, contas e protocolos de chamada podem ser reaproveitados. O site, Windows e Android continuarão ligados ao mesmo backend e Supabase.

O Android deve ter uma identificação de plataforma própria. Não simular `TronoDesktop`: isso habilitaria controles, armazenamento e captura exclusivos do Windows. Separar as interfaces de plataforma, mantendo a lógica compartilhada. Adaptar navegação e controles ao toque, orientação, teclado virtual e áreas reservadas do sistema.

## Ferramentas e requisitos para começar

- Node e dependências já usados pelo projeto; Android Studio, Android SDK e JDK compatíveis com a versão estável de Capacitor escolhida.
- Um identificador fixo de pacote, por exemplo `com.jonatha.mn.trono.android`, nome e ícone do app. Podemos reaproveitar a marca atual.
- Um celular Android físico para testar microfone, câmera, fones Bluetooth, tela bloqueada e segundo plano. Emulador auxilia o layout, mas não substitui estes testes.
- Backend HTTPS publicado e configuração de origens permitidas para o aplicativo, incluindo autenticação, uploads, WebSocket e Realtime. A origem local do Capacitor deve ser validada explicitamente; não liberar CORS para qualquer origem.
- Uma chave de assinatura de release e cópia segura dessa chave. O mesmo pacote e a mesma assinatura precisam ser usados em todas as atualizações; guardar as senhas fora do Git e do chat.

## Primeiro APK de teste

1. Criar o projeto Android e a ponte de plataforma, com navegação adequada ao celular.
2. Integrar login persistente com armazenamento protegido pelo Android Keystore. Validar sessão, renovação e logout com o backend atual.
3. Validar o jogo, canais de texto e efeitos com as mesmas contas do site.
4. Integrar permissões de microfone/câmera e chamadas. Voz em segundo plano exige integração nativa com serviço em primeiro plano e notificação da chamada, respeitando as regras da versão do Android. Testar tela bloqueada, troca de rede, interrupções e reconexão.
5. Testar a comunicação real entre Android, Windows e site, além de consumo de bateria e desempenho em um aparelho mais fraco.
6. Gerar um APK de release assinado e disponibilizar o download HTTPS para o grupo de teste.

Compartilhamento de tela será uma etapa separada: usar MediaProjection e consentimento do sistema. Captura do áudio de outro app depende da versão do Android e de o app capturado permitir esse acesso; a captura isolada do Windows não se aplica ao celular. Os clipes permanecem suspensos.

## Disponibilizar sem loja

Para testes particulares, podemos colocar o APK assinado em `downloads/` no mesmo domínio do projeto e oferecer o link ao grupo. Não exige conta de desenvolvedor do Google Play, taxa de loja ou publicação comercial. Cada pessoa permite a instalação pela fonte utilizada, como navegador ou gerenciador de arquivos, e instala o APK.

A primeira distribuição pode usar download direto. Depois podemos adicionar verificação de versão no app: baixar o APK novo e abrir o instalador do Android. O sistema normalmente exige que a pessoa confirme a atualização; o mecanismo de atualização do Electron não funciona no Android. Preservar pacote e assinatura mantém os dados da instalação anterior. Uma versão futura para iPhone precisará de projeto, ferramentas e distribuição Apple próprios.

Quando essa etapa for autorizada, é possível começar usando a marca e o backend atuais, gerar o projeto e um APK para teste. Antes de chamá-lo de pronto para uso, será necessário validar as chamadas em um aparelho físico.
