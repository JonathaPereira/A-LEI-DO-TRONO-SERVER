# Windows 0.2.7 · chat, voz e jogos

- As imagens anexadas aparecem diretamente, sem exibir nomes extensos. Clique para ampliar; o botão de fechar e a tecla Esc retornam à conversa. Documentos mantêm nome e download. Exclusão, permissões e conversas privadas continuam valendo.
- Clicar na sala mantém o chat de texto fechado. Um ícone pequeno ao lado do nome abre as mensagens; abrir texto de outra sala preserva a chamada. A lista deixa de repetir detalhes de voz/texto em cada linha.
- O modo nativo do microfone volta ao processamento anterior ao filtro adicional introduzido na 0.2.2. A redução nativa continua ativa quando suportada, sem empilhar o expansor de ruído. RNNoise permanece uma opção separada. Um teste de PCM verifica a preservação de sinais baixos. A causa do relato de voz robótica ainda depende de comparação no computador do usuário; o teste não simula o microfone, driver e rede dele.
- Splendor mantém os quatro mercadores, incluindo você, ao lado do mercado em janelas de desktop. Recursos e pontos ficam visíveis; as reservas podem ser expandidas. Em telas estreitas, os painéis se reorganizam.
- Love Letter mantém o histórico aberto e melhora cada entrada com carta, autor, alvo e resultado. Uma jogada confirmada atualiza a mesa uma vez, sem repetir a resolução em 1/3, 2/3 e 3/3. Eventos de lista e temporizadores não reconstroem a mesa; informações secretas continuam privadas.

## Baixar e publicar

Nas [Releases do repositório](https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases), abra a entrega **Pacotes Windows 0.2.7** da compilação aprovada:

- `MN-Trono-Frontend-0.2.7.zip`: frontend completo com o EXE e o manifesto.
- `MN-Trono-0.2.7-Windows.exe`: o mesmo instalador, separado.
- `SHA256SUMS-0.2.7.txt`: hashes para conferência.

Extraia o ZIP em uma pasta nova, entre na pasta `frontend` e execute no Git Bash:

```bash
npx surge . a-lei-do-trono.surge.sh
```

Publique toda a pasta, incluindo `downloads/`. Preserve o instalador e o manifesto da mesma entrega. Confira se `https://a-lei-do-trono.surge.sh/downloads/latest.yml` mostra `version: 0.2.7`. Atualize pelo aplicativo ou execute o EXE manualmente.

**Backend 0.13.0-alpha compatível; nenhum SQL novo.** Não é necessário redeploy do backend nem reaplicar migrações. O EXE 0.2.6 não inclui estas correções.
