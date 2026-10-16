/* Azul, tabuleiro colorido original: motor compartilhado; arte e interface M&N. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AzulRules = factory();
})(globalThis, () => {
  'use strict';
  const colors = ['Azul', 'Amarelo', 'Vermelho', 'Preto', 'Branco'],
    symbols = ['✥', '◆', '✿', '╱', '❖'],
    penalties = [1, 1, 2, 2, 2, 3, 3];
  const copy = (value) => JSON.parse(JSON.stringify(value));
  function fail(message) {
    throw Object.assign(Error(message), { code: 'AZUL_INVALID_MOVE' });
  }
  function shuffled(values, random) {
    const a = [...values];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function board(player) {
    return {
      id: player.id,
      name: player.name,
      bot: !!player.bot,
      score: 0,
      lines: Array.from({ length: 5 }, () => ({ color: null, count: 0 })),
      wall: Array.from({ length: 5 }, () => Array(5).fill(false)),
      floor: [],
      last: null,
    };
  }
  const wallColumn = (row, color) => (row + color) % 5;
  const fullRows = (p) => p.wall.filter((row) => row.every(Boolean)).length;
  function create(players, random = Math.random) {
    if (
      !Array.isArray(players) ||
      players.length < 2 ||
      players.length > 4 ||
      new Set(players.map((p) => p.id)).size !== players.length
    )
      fail('A mesa precisa de 2 a 4 participantes diferentes.');
    const state = {
      version: 1,
      phase: 'draft',
      round: 0,
      revision: 0,
      players: players.map(board),
      bag: shuffled(
        Array.from({ length: 100 }, (_, i) => i % 5),
        random,
      ),
      discard: [],
      factories: [],
      center: [],
      marker: true,
      starter: Math.floor(random() * players.length),
      nextStarter: null,
      turn: 0,
      last: null,
      winners: [],
    };
    nextRound(state, random);
    return state;
  }
  function nextRound(s, random) {
    s.round++;
    s.turn = s.starter;
    s.marker = true;
    s.nextStarter = null;
    s.factories = [];
    s.center = [];
    for (let n = 0; n < s.players.length * 2 + 1; n++) {
      const tiles = [];
      for (let i = 0; i < 4; i++) {
        if (!s.bag.length && s.discard.length) {
          s.bag = shuffled(s.discard, random);
          s.discard = [];
        }
        if (s.bag.length) tiles.push(s.bag.pop());
      }
      s.factories.push(tiles);
    }
  }
  function canPlace(p, row, color) {
    return (
      Number.isInteger(row) &&
      row >= 0 &&
      row < 5 &&
      !p.wall[row][wallColumn(row, color)] &&
      p.lines[row].count < row + 1 &&
      (p.lines[row].color === null || p.lines[row].color === color)
    );
  }
  function legalMoves(s) {
    if (s.phase !== 'draft') return [];
    const p = s.players[s.turn],
      moves = [];
    for (let source = -1; source < s.factories.length; source++)
      for (const color of new Set(source === -1 ? s.center : s.factories[source])) {
        for (let row = -1; row < 5; row++)
          if (row === -1 || canPlace(p, row, color)) moves.push({ source, color, row });
      }
    return moves;
  }
  function adjacency(wall, row, col) {
    let h = 1,
      v = 1;
    for (const d of [-1, 1]) {
      for (let x = col + d; x >= 0 && x < 5 && wall[row][x]; x += d) h++;
      for (let y = row + d; y >= 0 && y < 5 && wall[y][col]; y += d) v++;
    }
    return h === 1 && v === 1 ? 1 : (h > 1 ? h : 0) + (v > 1 ? v : 0);
  }
  function finishRound(s) {
    for (const p of s.players) {
      const before = p.score,
        placements = [];
      let points = 0;
      for (let row = 0; row < 5; row++) {
        const line = p.lines[row];
        if (line.count !== row + 1) continue;
        const col = wallColumn(row, line.color);
        p.wall[row][col] = true;
        const value = adjacency(p.wall, row, col);
        points += value;
        placements.push({ row, col, color: line.color, points: value });
        s.discard.push(...Array(row).fill(line.color));
        p.lines[row] = { color: null, count: 0 };
      }
      const penalty = p.floor.reduce((sum, _, i) => sum + penalties[i], 0);
      s.discard.push(...p.floor.filter((c) => c !== 5));
      p.floor = [];
      p.score = Math.max(0, p.score + points - penalty);
      p.last = { before, points, penalty, delta: p.score - before, placements };
    }
    s.starter = s.nextStarter ?? s.starter;
    if (s.players.some((p) => fullRows(p) > 0)) {
      s.phase = 'finished';
      for (const p of s.players) {
        const rows = fullRows(p),
          columns = Array.from({ length: 5 }, (_, c) => p.wall.every((r) => r[c])).filter(
            Boolean,
          ).length,
          sets = colors.filter((_, c) => p.wall.every((r, i) => r[wallColumn(i, c)])).length;
        p.bonus = { rows, columns, sets, total: rows * 2 + columns * 7 + sets * 10 };
        p.score += p.bonus.total;
      }
      const best = Math.max(...s.players.map((p) => p.score)),
        tied = s.players.filter((p) => p.score === best),
        rows = Math.max(...tied.map(fullRows));
      s.winners = tied.filter((p) => fullRows(p) === rows).map((p) => p.id);
    }
  }
  function move(state, playerId, input, random = Math.random) {
    if (state.phase !== 'draft' || state.players[state.turn]?.id !== playerId)
      fail('Aguarde a sua vez.');
    const { source, color, row } = input || {};
    if (
      !Number.isInteger(source) ||
      source < -1 ||
      source >= state.factories.length ||
      !Number.isInteger(color) ||
      color < 0 ||
      color > 4 ||
      !Number.isInteger(row) ||
      row < -1 ||
      row > 4
    )
      fail('Escolha uma fábrica, uma cor e uma linha.');
    const p = state.players[state.turn],
      tiles = source === -1 ? state.center : state.factories[source];
    if (!tiles.includes(color)) fail('Essa cor não está mais disponível.');
    if (row !== -1 && !canPlace(p, row, color))
      fail(
        'A linha precisa aceitar a cor e ainda ter espaço; a parede não pode repetir essa cor na linha.',
      );
    const s = copy(state),
      b = s.players[s.turn],
      selected = source === -1 ? s.center : s.factories[source],
      count = selected.filter((c) => c === color).length;
    if (source === -1) {
      s.center = selected.filter((c) => c !== color);
      if (s.marker) {
        s.marker = false;
        s.nextStarter = s.turn;
        if (b.floor.length < 7) b.floor.push(5);
      }
    } else {
      s.center.push(...selected.filter((c) => c !== color));
      s.factories[source] = [];
    }
    const accepted = row === -1 ? 0 : Math.min(count, row + 1 - b.lines[row].count);
    if (accepted) {
      b.lines[row].color = color;
      b.lines[row].count += accepted;
    }
    for (let n = accepted; n < count; n++)
      if (b.floor.length < 7) b.floor.push(color);
      else s.discard.push(color);
    s.revision++;
    s.last = { playerId, source, color, row, count, accepted };
    if (!s.center.length && s.factories.every((f) => !f.length)) {
      finishRound(s);
      if (s.phase !== 'finished') nextRound(s, random);
    } else s.turn = (s.turn + 1) % s.players.length;
    return s;
  }
  function botMove(s, random = Math.random) {
    const p = s.players[s.turn],
      choices = legalMoves(s);
    let best = null,
      bestValue = -Infinity;
    for (const m of choices) {
      const count = (m.source === -1 ? s.center : s.factories[m.source]).filter(
          (c) => c === m.color,
        ).length,
        space = m.row < 0 ? 0 : m.row + 1 - p.lines[m.row].count,
        fit = Math.min(count, space),
        overflow = count - fit;
      const value =
        fit * 2 +
        (m.row >= 0 && fit === space
          ? 4 + adjacency(p.wall, m.row, wallColumn(m.row, m.color))
          : 0) -
        overflow * 3 +
        (m.source === -1 && s.marker ? -1 : 0) +
        random() * 0.2;
      if (value > bestValue) {
        bestValue = value;
        best = m;
      }
    }
    return best;
  }
  function publicState(s) {
    const { bag, discard, ...view } = copy(s);
    return { ...view, bagCount: bag.length, discardCount: discard.length };
  }
  return {
    colors,
    symbols,
    penalties,
    wallColumn,
    fullRows,
    create,
    move,
    legalMoves,
    canPlace,
    adjacency,
    botMove,
    publicState,
  };
});
