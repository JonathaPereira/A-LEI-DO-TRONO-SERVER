'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startFixture } = require('./auth-fixture');

test(
  'typed commands use one transport for account, guest, chat, voice and game flows',
  { timeout: 30000 },
  async () => {
    const { createSocketTransport } = await import('../src/lib/socket/transport.ts');
    const { createNetworkClient } = await import('../src/lib/socket/client.ts');
    const fixture = await startFixture({ port: 11974 });
    const sockets = [];
    const sent = [];
    const pendingWaits = new Set();
    const errors = [];
    let network;
    try {
      await fixture.call('signup', {
        email: 'socket@example.test',
        nickname: 'Transporte',
        password: 'Senha12!',
      });
      await fixture.call('verify', {
        token_hash: [...fixture.links.keys()].at(-1),
        type: 'signup',
      });
      const login = await fixture.call('login', {
        email: 'socket@example.test',
        password: 'Senha12!',
      });
      assert.equal(login.status, 200);
      const { session, user } = login.data;
      const runtime = {
        TRONO_BACKEND_URL: fixture.base,
        TronoAuth: {
          user,
          getAccessToken: async () => session.access_token,
          ensureGuest: async () => {
            await network.authenticateGuest('Visitante', runtime.guest.ticket);
            return true;
          },
          open: () => assert.fail('Unexpected login prompt'),
          expire: () => assert.fail('Unexpected session expiry'),
        },
        TronoSocial: { deafened: true, screenSettings: { fps: 15 } },
      };
      const transport = createSocketTransport({
        url: fixture.base.replace('http:', 'ws:') + '/ws',
        warn: (...message) => errors.push(message),
        createSocket(url) {
          const socket = new WebSocket(url);
          sockets.push(socket);
          const send = socket.send.bind(socket);
          socket.send = (message) => {
            sent.push(JSON.parse(message));
            send(message);
          };
          return socket;
        },
      });
      network = createNetworkClient({
        backendHttp: fixture.base,
        transport,
        getIdentity: () => runtime.TronoAuth,
        getVoiceContext: () => runtime.TronoSocial,
        warn: (error) => errors.push(error),
      });
      function wait(type, predicate = () => true) {
        return new Promise((resolve, reject) => {
          const cancel = () => {
            clearTimeout(timer);
            unsubscribe();
            pendingWaits.delete(cancel);
          };
          const unsubscribe = network.onMessage((message) => {
            if (message.type === type && predicate(message)) {
              cancel();
              resolve(message);
            }
          });
          const timer = setTimeout(() => {
            cancel();
            reject(Error('Timeout waiting for ' + type));
          }, 5000);
          pendingWaits.add(cancel);
        });
      }
      const welcome = wait('welcome');
      assert.equal(await network.connect(), true);
      await welcome;
      const clientId = network.clientId;
      assert.equal(typeof clientId, 'string');
      assert.equal(network.independentGameVoice, true);
      assert.equal((await network.authenticate(session.access_token)).id, user.id);
      const authRequests = () => sent.filter((message) => message.type === 'authenticate').length;
      assert.equal(authRequests(), 1);
      assert.equal((await network.authenticate(session.access_token)).id, user.id);
      assert.equal(authRequests(), 1, 'same token reuses the authenticated socket');
      assert.equal((await network.checkName('Transporte')).available, true);

      let joined = wait('joined-room');
      assert.equal(await network.joinRoom('chat-jogos'), true);
      await joined;
      const voice = await network.prepareVoice();
      assert.equal(voice.mode, 'p2p');
      assert.equal(network.setVoiceState(true, true, true, true), true);
      const voiceState = sent.at(-1);
      assert.equal(voiceState.type, 'voice-state');
      assert.equal(voiceState.deafened, true);
      assert.equal(voiceState.screenFps, 15);

      joined = wait('joined-text-channel');
      assert.equal(await network.joinTextChannel('chat-livre'), true);
      await joined;
      joined = wait('joined-game-room');
      assert.equal(await network.joinRoom('sala-cetro'), true);
      await joined;
      assert.equal(network.primaryRoom, 'chat-jogos');
      assert.equal(network.currentRoom, 'chat-livre');
      assert.equal(network.gameRoom, 'sala-cetro');
      assert.equal(network.clientId, clientId);
      const chat = wait('chat-message', (message) => message.message.text === 'Uma conexão');
      assert.equal(network.sendChat('Uma conexão'), true);
      assert.equal((await chat).message.roomId, 'chat-livre');
      const left = wait('left-game-room');
      assert.equal(network.leaveGameRoom(), true);
      await left;
      assert.equal(network.gameRoom, null);
      assert.equal(network.primaryRoom, 'chat-jogos');
      assert.equal(network.currentRoom, 'chat-livre');
      assert.equal(sockets.length, 1);

      // The server rejects guest login while an account is active; the queue must recover.
      const account = network.authenticate(session.access_token);
      const guest = network.authenticateGuest('Visitante');
      const guestRejected = assert.rejects(guest, { code: 'ALREADY_AUTHENTICATED' });
      assert.equal((await account).id, user.id);
      await guestRejected;
      network.disconnect();
      runtime.TronoAuth.user = null;
      const guestWelcome = wait('welcome');
      assert.equal(await network.connect(), true);
      await guestWelcome;
      runtime.guest = await network.authenticateGuest('Visitante');
      assert.match(runtime.guest.id, /^guest:/);
      const guestCount = sent.filter((message) => message.type === 'guest-authenticate').length;
      assert.equal(
        (await network.authenticateGuest('Visitante', runtime.guest.ticket)).id,
        runtime.guest.id,
      );
      assert.equal(
        sent.filter((message) => message.type === 'guest-authenticate').length,
        guestCount,
      );
      joined = wait('joined-game-room');
      assert.equal(await network.joinRoom('sala-cetro', 'Visitante'), true);
      await joined;
      assert.equal(network.gameRoom, 'sala-cetro');
      assert.equal((await network.prepareVoice()).mode, 'p2p');
      assert.equal(network.primaryRoom, 'sala-cetro');

      runtime.TronoAuth.user = user;
      assert.equal((await network.authenticate(session.access_token)).id, user.id);
      assert.equal(authRequests(), 2, 'switching back from guest reauthenticates the account');
      network.disconnect();
      assert.equal(network.connected, false);
      assert.equal(network.currentRoom, null);
      assert.equal(network.primaryRoom, null);
      assert.equal(network.gameRoom, null);
      const nextWelcome = wait('welcome');
      assert.equal(await network.connect(), true);
      await nextWelcome;
      assert.notEqual(network.clientId, clientId);
      assert.equal((await network.authenticate(session.access_token)).id, user.id);
      assert.equal(authRequests(), 3, 'new connections never reuse an old identity cache');
      await assert.rejects(network.prepareVoice(), { code: 'NOT_IN_ROOM' });
      await assert.rejects(network.requestSfu('new-session'), { code: 'SFU_CHAT_ONLY' });
      assert.equal(typeof (await network.getRealtimeStatus()), 'object');
      assert.equal(sockets.length, 3);
      assert.deepEqual(errors, []);
    } finally {
      for (const cancel of pendingWaits) cancel();
      network?.disconnect();
      await fixture.stop();
    }
  },
);
