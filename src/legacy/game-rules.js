'use strict';
(function (root) {
  const version = '0.9.0';
  const laws = {
    ordem: {
      name: 'Ordem',
      img: 'assets/laws/ordem.svg',
      description:
        'Siga o naipe inicial se puder. Coroa: maior valor desse naipe. Sombra: menor valor do mesmo naipe, entre os demais. Se ninguém além da Coroa seguiu o naipe, a menor carta dos demais recebe a Sombra.',
    },
    estandarte: {
      name: 'Estandarte',
      img: 'assets/laws/estandarte.svg',
      description:
        'A Sombra anterior declara o trunfo. Você pode jogar trunfo mesmo tendo o naipe inicial; fora isso, siga o naipe se puder. Com dois ou mais trunfos: maior trunfo recebe a Coroa e menor dos demais trunfos recebe a Sombra. Com um trunfo: ele recebe a Coroa e a menor carta dos demais recebe a Sombra. Sem trunfos, aplica-se Ordem.',
    },
    revolta: {
      name: 'Revolta',
      img: 'assets/laws/revolta.svg',
      description:
        'Siga o naipe inicial se puder. A menor carta desse naipe recebe a Coroa; a maior carta entre os demais jogadores recebe a Sombra, independentemente do naipe.',
    },
    anarquia: {
      name: 'Anarquia',
      img: 'assets/laws/anarquia.svg',
      description:
        'Jogue qualquer naipe. A maior carta recebe a Coroa; a menor carta entre os demais recebe a Sombra. Os naipes são ignorados.',
    },
    usurpacao: {
      name: 'Usurpação',
      img: 'assets/laws/usurpacao.svg',
      description:
        'Com pelo menos 4 cartas por jogador, a Sombra anterior escolhe qualquer adversário e separa uma carta para entregar. Escolhe uma carta fechada da mão desse adversário antes de entregar a sua, garantindo que nunca receba a própria carta de volta. Corte Aberta permanece protegida. Depois, joga-se como Ordem.',
    },
  };
  const lawOrder = Object.keys(laws);
  const decrees = [
    {
      id: 'reserva',
      name: 'Reserva',
      icon: '▣',
      text: 'Cada jogador separa 1 carta. Ela fica fora da mão nas 9 primeiras vazas e deve ser jogada na 10ª.',
    },
    {
      id: 'rotacao',
      name: 'Rotação',
      icon: '⟳',
      text: 'Após as vazas 7, 8 e 9, todos passam simultaneamente 1 carta ao jogador à esquerda.',
    },
    {
      id: 'corte',
      name: 'Corte Aberta',
      icon: '◉',
      text: 'No início da rodada, cada jogador revela 1 carta da mão. Ela permanece pública até ser usada e é protegida da Usurpação e da Influência.',
    },
    {
      id: 'desafio',
      name: 'Desafio',
      icon: '⚔',
      text: 'Na primeira Coroa de cada jogador, revele 1 carta. Novas Coroas consecutivas revelam mais 1.',
    },
    {
      id: 'silencio',
      name: 'Silêncio',
      icon: '⊘',
      text: 'Nas 3 primeiras vazas, ninguém pode gastar Influência. A partir da 4ª, funciona normalmente.',
    },
    {
      id: 'sucessao',
      name: 'Sucessão',
      icon: '♛',
      text: 'O próximo líder não pode abrir com o naipe que venceu a vaza anterior, salvo se não possuir outro.',
    },
    {
      id: 'conselho',
      name: 'Conselho',
      icon: '⇄',
      text: 'No início da rodada, todos escolhem 1 carta fechada e a passam simultaneamente ao jogador à direita.',
    },
    {
      id: 'favor',
      name: 'Favor Real',
      icon: '✦',
      text: 'Todos começam a rodada com 1 Influência. O limite continua sendo 2.',
    },
    {
      id: 'espionagem',
      name: 'Espionagem',
      icon: '◈',
      text: 'No início da rodada, cada jogador vê, em segredo, 1 carta aleatória da mão do jogador à direita. A carta não muda de mão nem se torna pública.',
    },
    {
      id: 'peso',
      name: 'Peso da Coroa',
      icon: '♜',
      text: 'Quem ganhou a Coroa não pode gastar Influência na vaza seguinte. Na primeira vaza, ninguém está bloqueado por este Decreto.',
    },
  ];
  const playerId = (p) => p.seat ?? p.id;
  const effective = (play) =>
    Math.max(1, Math.min(12, (play.card.value || 0) + (play.modifier || 0)));
  function pick(list, mode) {
    return list.reduce(
      (best, p) =>
        !best || (mode === 'max' ? effective(p) > effective(best) : effective(p) < effective(best))
          ? p
          : best,
      null,
    );
  }
  function evaluate(plays, law, lead, trump) {
    if (plays.length !== 4 || plays.some((p) => !p.card))
      throw Error('A vaza precisa conter quatro cartas reveladas.');
    const led = plays.filter((p) => p.card.suit === lead),
      trumps = law === 'estandarte' ? plays.filter((p) => p.card.suit === trump) : [];
    const decisive = trumps.length ? trumps : led;
    const crown =
      law === 'anarquia'
        ? pick(plays, 'max')
        : pick(law === 'revolta' ? led : decisive, law === 'revolta' ? 'min' : 'max');
    if (!crown) throw Error('A vaza não possui carta elegível para a Coroa.');
    const others = plays.filter((p) => p.playerId !== crown.playerId);
    const same = decisive.filter((p) => p.playerId !== crown.playerId);
    const shadow =
      law === 'revolta'
        ? pick(others, 'max')
        : pick(law === 'anarquia' ? others : same.length ? same : others, 'min');
    if (!shadow || crown.playerId === shadow.playerId)
      throw Error('Coroa e Sombra precisam ser jogadores diferentes.');
    return { crown, shadow };
  }
  function followCards(hand, law, lead, trump) {
    if (!lead || law === 'anarquia') return [...hand];
    const led = hand.filter((c) => c.suit === lead);
    if (law === 'estandarte' && led.length)
      return hand.filter((c) => c.suit === lead || c.suit === trump);
    return led.length ? led : [...hand];
  }
  function influenceBlocked(game, player) {
    return (
      (game.decree?.id === 'silencio' && game.trick <= 3) ||
      (game.decree?.id === 'peso' && game.trick > 1 && game.lastCrown === playerId(player || {}))
    );
  }
  const eligible = (hand) => hand.filter((c) => c.publicReason !== 'Corte Aberta');
  function reserveExchange(players, shadow, target, cardId, shuffle) {
    if (!shadow || !target || shadow === target || playerId(shadow) === playerId(target))
      throw Error('Escolha outro jogador para a Usurpação.');
    if (players.some((p) => p.hand.length < 4))
      throw Error('Todos precisam de pelo menos 4 cartas para a Usurpação.');
    const given = eligible(shadow.hand).find((c) => c.id === cardId);
    if (!given || !eligible(target.hand).length) throw Error('Carta protegida ou indisponível.');
    const state = { given, shadowCount: shadow.hand.length, targetCount: target.hand.length };
    shadow.hand = shadow.hand.filter((c) => c.id !== given.id);
    target.hand = shuffle(target.hand);
    state.pickableIds = eligible(target.hand).map((c) => c.id);
    return state;
  }
  function finishExchange(shadow, target, state, index) {
    if (!Number.isInteger(index) || index < 0 || index >= state.pickableIds.length)
      throw Error('Escolha uma carta fechada válida.');
    const id = state.pickableIds[index],
      taken = eligible(target.hand).find((c) => c.id === id);
    if (!taken || taken.id === state.given.id)
      throw Error('A carta entregue nunca pode retornar à Sombra.');
    target.hand = target.hand.filter((c) => c.id !== id);
    shadow.hand.push(taken);
    target.hand.push(state.given);
    if (
      shadow.hand.length !== state.shadowCount ||
      target.hand.length !== state.targetCount ||
      new Set([...shadow.hand, ...target.hand].map((c) => c.id)).size !==
        state.shadowCount + state.targetCount
    )
      throw Error('A troca precisa preservar as cartas e o tamanho das mãos.');
    return { given: state.given, taken, returnedSameCard: false };
  }
  function passCards(players, choices, direction) {
    const count = players.length,
      selected = players.map((p) =>
        p.hand.find(
          (c) =>
            c.id === (choices instanceof Map ? choices.get(playerId(p)) : choices[playerId(p)]),
        ),
      );
    if (selected.some((c) => !c) || new Set(selected.map((c) => c.id)).size !== count)
      throw Error('Cada jogador precisa escolher uma carta da própria mão.');
    for (let i = 0; i < count; i++)
      players[i].hand = players[i].hand.filter((c) => c.id !== selected[i].id);
    for (let i = 0; i < count; i++) players[(i + direction + count) % count].hand.push(selected[i]);
  }
  function intelligence(players, index, random = Math.random) {
    const target = players[(index + players.length - 1) % players.length],
      card = target.hand[Math.floor(random() * target.hand.length)];
    if (!card) throw Error('Espionagem exige uma carta na mão do adversário.');
    return { target: playerId(target), name: target.name, card: { ...card } };
  }
  const api = {
    version,
    laws,
    lawOrder,
    decrees,
    evaluate,
    effective,
    pick,
    followCards,
    influenceBlocked,
    eligible,
    reserveExchange,
    finishExchange,
    passCards,
    intelligence,
  };
  root.TronoRules = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
