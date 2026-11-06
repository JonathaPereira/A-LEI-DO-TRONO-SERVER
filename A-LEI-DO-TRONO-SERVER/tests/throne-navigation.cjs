'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { createThroneNavigation } = require('../src/lib/games/throne-navigation.ts');
function fixture({ gameRoom = 'sala-cetro', primaryRoom = 'chat-livre', joined = true } = {}) {
  const messages = new Set(),
    jobs = new Set(),
    calls = {
      clear: 0,
      leaveGame: 0,
      leaveVoice: 0,
      communityLeft: 0,
      board: 0,
      setup: 0,
      requests: 0,
    },
    notices = [],
    connections = [];
  let hub = false,
    lobby = true,
    disposed = false;
  const controller = createThroneNavigation({
    network: {
      get gameRoom() {
        return gameRoom;
      },
      get primaryRoom() {
        return primaryRoom;
      },
      leaveGameRoom() {
        calls.leaveGame++;
      },
      requestRooms() {
        calls.requests++;
      },
      onMessage(fn) {
        messages.add(fn);
        return () => messages.delete(fn);
      },
    },
    hub: () => hub,
    hasLobby: () => lobby,
    joined: () => joined,
    async leaveVoice() {
      calls.leaveVoice++;
      joined = false;
    },
    async leaveCommunity() {
      calls.communityLeft++;
    },
    prepareName() {},
    clearGame() {
      calls.clear++;
    },
    setHub(value) {
      hub = value;
    },
    showPanel() {},
    showSetup() {
      calls.setup++;
    },
    showBoard() {
      calls.board++;
    },
    setNameFeedback() {},
    notify: (text) => notices.push(text),
    connection: (name, reason) => connections.push({ name, reason }),
    schedule(fn) {
      const job = { fn, active: true };
      jobs.add(job);
      return () => {
        job.active = false;
        jobs.delete(job);
      };
    },
    warn(error) {
      throw error;
    },
  });
  controller.start();
  controller.start();
  return {
    controller,
    messages,
    jobs,
    calls,
    notices,
    connections,
    setHub(value) {
      hub = value;
    },
    setLobby(value) {
      lobby = value;
    },
    emit(msg) {
      for (const fn of messages) fn(msg);
    },
    fire() {
      for (const job of [...jobs]) {
        jobs.delete(job);
        if (job.active) job.fn();
      }
    },
  };
}
const match = () => ({ online: true, decree: 'reserva', phase: 'await-play', round: 1, trick: 1 });
test('board navigation presents an online game once and cannot reopen a left board from a late snapshot', () => {
  const f = fixture(),
    raw = match();
  f.controller.presentOnlineMatch(raw);
  assert.equal(f.calls.board, 1);
  const current = f.controller.getState();
  assert.equal(current.decree.id, 'reserva');
  assert.equal(current.gameOver, false);
  f.controller.presentOnlineMatch({ ...raw, trick: 2 });
  assert.equal(f.calls.board, 1);
  assert.equal(f.controller.getState(), current);
  assert.equal(current.trick, 2);
  assert.equal(raw.trick, 1);
  f.controller.backToLobby();
  assert.equal(f.calls.leaveVoice, 0);
  assert.equal(f.calls.leaveGame, 1);
  assert.equal(f.calls.clear, 1);
  f.controller.presentOnlineMatch({ ...raw, trick: 3 });
  assert.equal(f.calls.board, 1);
  assert.equal(f.controller.getState(), null);
  f.controller.prepareRoom('Alice');
  f.controller.presentOnlineMatch(raw);
  assert.equal(f.calls.board, 2);
  f.controller.dispose();
  assert.equal(f.messages.size, 0);
  assert.equal(f.jobs.size, 0);
});
test('leaving a game stops only voice attached to that game; next entry or disposal cancels the delayed room request', () => {
  for (const shared of [false, true]) {
    const f = fixture({ primaryRoom: shared ? 'sala-cetro' : 'chat-livre' });
    f.controller.backToLobby();
    assert.equal(f.calls.leaveVoice, shared ? 1 : 0);
    assert.equal(f.calls.leaveGame, 1);
    assert.equal(f.jobs.size, 1);
    f.controller.prepareRoom('Alice');
    f.fire();
    assert.equal(f.calls.requests, 0);
    f.controller.backToLobby();
    f.controller.dispose();
    f.fire();
    assert.equal(f.calls.requests, 0);
  }
});
test('connection and name failures keep community and game actions distinct and free their listeners', () => {
  const f = fixture();
  assert.equal(f.messages.size, 1);
  f.emit({ type: 'connection', connected: false });
  assert.equal(f.connections[0].reason, 'self-disconnect');
  f.setHub(true);
  f.emit({ type: 'error', code: 'NAME_TAKEN', message: 'Nome ocupado' });
  assert.equal(f.calls.communityLeft, 1);
  assert.equal(f.calls.leaveGame, 0);
  f.setHub(false);
  f.emit({ type: 'error', code: 'NAME_REQUIRED' });
  assert.equal(f.calls.leaveGame, 1);
  f.controller.dispose();
  const count = f.notices.length;
  f.emit({ type: 'version-mismatch' });
  assert.equal(f.notices.length, count);
});
