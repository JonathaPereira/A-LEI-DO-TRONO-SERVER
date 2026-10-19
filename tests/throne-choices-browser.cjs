'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const path = require('node:path'),
  express = require('express'),
  WebSocket = require('ws');
const { chromium, expect } = require('@playwright/test');
const { startFixture } = require('./auth-fixture');
const { exerciseThroneHistory } = require('./throne-history-controls.cjs');
const { installCanvasCamera } = require('./camera-fixture');
const { assertThroneSeats } = require('./throne-seat-assertions.cjs');
const {
  assertThroneTable,
  watchThroneTable,
  exerciseThroneTableControls,
} = require('./throne-table-assertions.cjs');

test(
  'React throne choices complete authoritative rounds and preserve private hands, previews and call tracks',
  { timeout: 180000 },
  async (t) => {
    const origin = 'http://127.0.0.1:10944';
    const server = express()
      .use(express.static(path.resolve(__dirname, '../out')))
      .listen(10944, '127.0.0.1');
    let browser;
    const errors = [],
      warnings = [],
      influenceUsed = new Set(),
      privateKinds = new Set();
    try {
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
        ],
      });
      for (const decree of ['reserva', 'conselho', 'corte', 'rotacao', 'desafio', 'espionagem'])
        await t.test(decree, async (sub) => {
          const fixture = await startFixture({
            port: 10943,
            appOrigin: origin,
            gameDecree: decree,
          });
          let context;
          const peers = [],
            played = new Set(),
            seen = new Set();
          sub.signal.addEventListener(
            'abort',
            () => {
              void context?.close();
            },
            { once: true },
          );
          try {
            await fixture.call('signup', {
              email: 'choices@example.test',
              nickname: 'Casa Humana',
              password: 'Senha12!',
            });
            await fixture.call('verify', {
              token_hash: [...fixture.links.keys()].at(-1),
              type: 'signup',
            });
            const data = (
              await fixture.call('login', { email: 'choices@example.test', password: 'Senha12!' })
            ).data;
            context = await browser.newContext({
              viewport: { width: 1440, height: 960 },
              permissions: ['microphone', 'camera'],
              // Exercise the supported accessibility preference; native tests retain normal motion.
              reducedMotion: 'reduce',
            });
            await context.route('**/*', (route) =>
              new URL(route.request().url()).hostname === '127.0.0.1'
                ? route.continue()
                : route.abort(),
            );
            await context.addInitScript(
              ({ base, data }) => {
                window.TRONO_BACKEND_URL = base;
                sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
                localStorage.setItem('tronoMusicEnabled', '0');
                localStorage.setItem('tronoSfxEnabled', '0');
                const Socket = window.WebSocket;
                window.WebSocket = class extends Socket {
                  constructor(...args) {
                    super(...args);
                    window.__choiceSocket = this;
                    this.addEventListener('message', (event) => {
                      const m = JSON.parse(event.data);
                      if (m.type === 'game-state') window.__choicePacket = m;
                      if (m.type === 'game-event' && m.event === 'game-ended')
                        window.__choiceGameDone = true;
                      if (m.type === 'game-event' && m.event === 'round-ended' && m.round === 1)
                        window.__choiceRoundDone = true;
                    });
                  }
                };
              },
              { base: fixture.base, data },
            );
            await context.addInitScript(installCanvasCamera, { display: true });
            const page = await context.newPage();
            page.on('pageerror', (e) => errors.push(e.message));
            page.on('console', (message) => {
              if (
                /\[Throne(?:Choices|Hand|Match|Private|Seats|Table|History|Effects|Events)\]/.test(
                  message.text(),
                )
              )
                warnings.push(message.text());
            });
            page.on('dialog', (dialog) => dialog.accept());
            await page.goto(origin);
            await page.waitForFunction(() => window.TronoAuth?.ready);
            await page.evaluate(() => window.TronoAuth.ready);
            await watchThroneTable(page);
            await page.evaluate(() => {
              window.__matchHosts = {
                owner: window.TronoThroneMatch,
                nodes: [
                  'throneStatusHost',
                  'roundBadge',
                  'trickBadge',
                  'turnBadge',
                  'turnTimer',
                  'turnNoticeClock',
                ].map((id) => document.getElementById(id)),
              };
            });
            await page.evaluate(() => window.TronoChatHub.enter({ channelId: 'chat-jogos' }));
            await expect
              .poll(() => page.evaluate(() => window.TronoNetwork.primaryRoom))
              .toBe('chat-jogos');
            await page.locator('#joinVoiceBtn').click();
            await expect.poll(() => page.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
            await page.locator('#cameraBtn').click();
            await expect.poll(() => page.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
            await page.evaluate(() => window.TronoSocial.startScreenShare());
            await page.evaluate(() => {
              const call = window.TronoSocial;
              window.__choiceTracks = [
                call.getLocalAudioTrack(),
                call
                  .getMediaSources()
                  .find((s) => s.self)
                  .camera.getVideoTracks()[0],
                call.getLocalDisplayStream().getVideoTracks()[0],
              ];
            });
            await page.evaluate(() => window.TronoThroneLobby.enter('sala-cetro'));
            await expect(page.locator('#roomSeats')).toContainText('Casa Humana');
            for (let seat = 1; seat <= 3; seat++) {
              const socket = new WebSocket(fixture.base.replace('http', 'ws') + '/ws'),
                messages = [];
              peers.push(socket);
              let state,
                last = '';
              socket.on('message', (raw) => {
                const m = JSON.parse(raw);
                messages.push(m);
                const send = (action, payload) =>
                  socket.send(JSON.stringify({ type: 'game-action', action, payload }));
                if (m.type === 'game-prompt') {
                  const p = m.prompt;
                  if (p.kind === 'choose-decree') send(p.kind, { value: decree });
                  else if (p.kind === 'choose-law')
                    send(p.kind, {
                      value: p.options.includes('usurpacao') ? 'usurpacao' : p.options[0],
                    });
                  else if (p.kind === 'choose-trump') send(p.kind, { value: p.options[0] });
                  else if (p.kind === 'usurp-target')
                    send(p.kind, { targetSeat: p.options[0].seat });
                  else if (p.kind === 'usurp-pick') send(p.kind, { index: 0 });
                  else send(p.kind, { cardId: p.cardIds[0] });
                }
                if (m.type === 'private-usurpation') send('usurp-ack', {});
                if (m.type === 'private-intelligence') send('intelligence-ack', {});
                if (m.type === 'game-state') {
                  state = m.state;
                  const key = state.round + ':' + state.trick;
                  if (
                    state.phase === 'await-play' &&
                    state.turn === state.youSeat &&
                    key !== last
                  ) {
                    last = key;
                    send('play-card', { cardId: state.legalCardIds[0] });
                  }
                }
              });
              await new Promise((resolve) => socket.once('open', resolve));
              socket.send(JSON.stringify({ type: 'guest-authenticate', name: 'Casa ' + seat }));
              await expect
                .poll(() => messages.some((m) => m.type === 'guest-result' && m.ok))
                .toBe(true);
              socket.send(JSON.stringify({ type: 'join-game-room', roomId: 'sala-cetro' }));
              await expect
                .poll(() => messages.some((m) => m.type === 'joined-game-room'))
                .toBe(true);
              socket.send(JSON.stringify({ type: 'ready', ready: true }));
            }
            await page.locator('#readyOnlineBtn').click();
            await expect(page.locator('#startOnlineBtn')).toBeEnabled();
            await page.locator('#startOnlineBtn').click();
            const deadline = Date.now() + (decree === 'reserva' ? 55000 : 30000);
            while (
              !(await page.evaluate(
                (full) => !!(full ? window.__choiceGameDone : window.__choiceRoundDone),
                decree === 'reserva',
              )) &&
              Date.now() < deadline
            ) {
              await page.evaluate(() => window.__LeiDoTrono.setFast());
              const snapshot = await page.evaluate(() => ({
                private: window.TronoThronePrivate.getSnapshot(),
                prompt: window.TronoThroneChoices.getSnapshot().prompt,
                open: window.TronoThroneChoices.getSnapshot().open,
                pending: window.TronoThroneChoices.getSnapshot().pending,
                packet: window.__choicePacket?.state,
              }));
              if (snapshot.private.open && snapshot.private.dialog) {
                const disclosure = snapshot.private.dialog.data;
                if (!privateKinds.has(disclosure.kind)) {
                  await page.evaluate(() => window.TronoPortal.showOnly('portalScreen'));
                  await expect(page.locator('#thronePrivateDialog')).toBeHidden();
                  await page.evaluate(() => window.TronoPortal.showOnly('gameScreen'));
                  await expect(page.locator('#thronePrivateDialog')).toBeVisible();
                  for (const layout of ['original', 'discord']) {
                    await page.evaluate((value) => window.TronoAppLayout.apply(value), layout);
                    for (const [width, height] of [
                      [480, 800],
                      [1080, 1920],
                    ]) {
                      await page.setViewportSize({ width, height });
                      const box = await page.locator('#thronePrivateDialog').evaluate((node) => {
                        const r = node.getBoundingClientRect();
                        return {
                          left: r.left,
                          right: r.right,
                          top: r.top,
                          bottom: r.bottom,
                          width: node.clientWidth,
                          scroll: node.scrollWidth,
                          vw: innerWidth,
                          vh: innerHeight,
                        };
                      });
                      assert(
                        box.left >= 0 &&
                          box.right <= box.vw + 1 &&
                          box.top >= 0 &&
                          box.bottom <= box.vh + 1 &&
                          box.scroll <= box.width + 1,
                        JSON.stringify({ layout, box }),
                      );
                      await page.screenshot({
                        path: path.resolve(
                          __dirname,
                          `../artifacts/throne-private-${disclosure.kind}-${layout}-${width}.png`,
                        ),
                      });
                    }
                  }
                  await page.setViewportSize({ width: 1440, height: 960 });
                  await page.evaluate(() => window.TronoAppLayout.apply('original'));
                }
                privateKinds.add(disclosure.kind);
                await expect(page.locator('#throneChoiceDialog')).toBeHidden();
                await page.locator('#thronePrivateContinue').click();
                await expect(page.locator('#thronePrivateDialog')).toBeHidden();
                if (disclosure.kind === 'intelligence' && snapshot.private.dialog.required) {
                  await page.locator('#decreeBadge').click();
                  await expect(page.locator('#thronePrivateDialog')).toBeVisible();
                  assert.equal(
                    await page.evaluate(
                      () => window.TronoThronePrivate.getSnapshot().dialog.action,
                    ),
                    null,
                  );
                  await page.locator('#thronePrivateContinue').click();
                }
              } else if (snapshot.open && snapshot.prompt && !snapshot.pending) {
                const p = snapshot.prompt;
                if (!seen.has('responsive') && 'cardIds' in p) {
                  for (const layout of ['original', 'discord']) {
                    await page.evaluate((value) => window.TronoAppLayout.apply(value), layout);
                    for (const [width, height] of [
                      [480, 800],
                      [1080, 1920],
                    ]) {
                      await page.setViewportSize({ width, height });
                      const box = await page.locator('#throneChoiceDialog').evaluate((dialog) => {
                        const r = dialog.getBoundingClientRect();
                        return {
                          left: r.left,
                          right: r.right,
                          top: r.top,
                          bottom: r.bottom,
                          scroll: dialog.scrollWidth,
                          width: dialog.clientWidth,
                          viewport: innerWidth,
                          height: innerHeight,
                        };
                      });
                      assert(
                        box.left >= 0 &&
                          box.right <= box.viewport + 1 &&
                          box.top >= 0 &&
                          box.bottom <= box.height + 1 &&
                          box.scroll <= box.width + 1,
                        JSON.stringify({ layout, box }),
                      );
                      if (decree === 'reserva')
                        await page.screenshot({
                          path: path.resolve(
                            __dirname,
                            `../artifacts/throne-choices-${layout}-${width}.png`,
                          ),
                        });
                    }
                  }
                  await page.setViewportSize({ width: 1440, height: 960 });
                  await page.evaluate(() => window.TronoAppLayout.apply('original'));
                  seen.add('responsive');
                }
                seen.add(p.kind);
                if (p.kind === 'choose-law') {
                  await page.locator('#throneChoiceHand').click();
                  await expect(page.locator('#throneChoiceBack')).toBeVisible();
                  assert(
                    await page.evaluate(
                      () =>
                        document.querySelectorAll('#throneChoiceDialog .deck-preview-card')
                          .length ===
                        window.TronoThroneChoices.getSnapshot().context.hand.length +
                          (window.TronoThroneChoices.getSnapshot().context.reserve ? 1 : 0),
                    ),
                  );
                  await page.locator('#throneChoiceBack').click();
                }
                const preferred =
                  p.kind === 'choose-law' && p.options.includes('usurpacao')
                    ? page.locator('#throneChoiceDialog [data-law="usurpacao"]')
                    : page.locator('#throneChoiceDialog .choice-card').first();
                await preferred.click();
              } else if (await page.locator('#modal').isVisible()) {
                const next = page.locator('#continueModal');
                if (await next.isVisible()) await next.click();
              } else {
                const s = snapshot.packet,
                  key = s?.round + ':' + s?.trick;
                if (s?.phase === 'await-play' && s.turn === s.youSeat && !played.has(key)) {
                  const hand = await page.evaluate(
                    () => window.TronoThroneHand.getSnapshot().context,
                  );
                  if (!hand || hand.turn !== hand.you || hand.automaticReserve) continue;
                  await assertThroneTable(page, !seen.has('public-seats'));
                  await assertThroneSeats(page, !seen.has('public-seats'));
                  seen.add('public-seats');
                  if (!seen.has('match-clock')) {
                    await expect(page.locator('#roundBadge')).toHaveText(`Rodada ${s.round}/3`);
                    await expect(page.locator('#trickBadge')).toHaveText(`Vaza ${s.trick}/10`);
                    await expect(page.locator('#turnBadge')).toHaveText('Vez: Casa Humana');
                    await expect(page.locator('#turnBadge')).toHaveClass(/your-turn-badge/);
                    assert(
                      await page.evaluate(() => {
                        const m = window.TronoThroneMatch.getSnapshot().match;
                        return (
                          m &&
                          Object.isFrozen(m.players[0]) &&
                          m.players.every((p) => !('hand' in p) && !('reserve' in p)) &&
                          !('intelligence' in m)
                        );
                      }),
                    );
                    const beforeClock = await page.locator('#turnTimer').textContent();
                    await expect
                      .poll(() => page.locator('#turnTimer').textContent())
                      .not.toBe(beforeClock);
                    assert(
                      await page.evaluate(
                        () =>
                          document.getElementById('turnTimer').textContent ===
                          document.getElementById('turnNoticeClock').textContent,
                      ),
                    );
                    await assertThroneSeats(page);
                    await assertThroneTable(page);
                    await page.screenshot({
                      path: path.resolve(__dirname, `../artifacts/throne-table-${decree}.png`),
                    });
                    seen.add('match-clock');
                  }
                  if (decree === 'reserva' && !seen.has('hand-responsive')) {
                    await expect(page.locator('#throneLocalHand')).toBeHidden();
                    await expect(page.locator('#throneOnlineHandCards .hand-card')).toHaveCount(
                      hand.hand.length,
                    );
                    await page.locator('#throneHandSort').click();
                    for (const layout of ['original', 'discord']) {
                      await page.evaluate((value) => window.TronoAppLayout.apply(value), layout);
                      for (const [width, height] of [
                        [480, 800],
                        [1080, 1920],
                      ]) {
                        await page.setViewportSize({ width, height });
                        await expect(page.locator('#throneOnlineHand')).toBeVisible();
                        const geometry = await page
                          .locator('#throneOnlineHandCards')
                          .evaluate((node) => ({
                            width: node.clientWidth,
                            height: node.clientHeight,
                            count: node.children.length,
                          }));
                        assert(
                          geometry.width > 0 &&
                            geometry.height > 0 &&
                            geometry.count === hand.hand.length,
                        );
                        await page.screenshot({
                          path: path.resolve(
                            __dirname,
                            `../artifacts/throne-hand-${layout}-${width}.png`,
                          ),
                        });
                      }
                    }
                    await page.setViewportSize({ width: 1440, height: 960 });
                    await page.evaluate(() => window.TronoAppLayout.apply('original'));
                    seen.add('hand-responsive');
                  }
                  if (
                    hand.canUseInfluence &&
                    (!influenceUsed.has('sigilo') || hand.canUseManeuver)
                  ) {
                    await page.locator('#throneHandInfluenceWrap').click();
                    await expect(page.locator('#throneHandDialog')).toBeVisible();
                    const action =
                      hand.canUseManeuver && !influenceUsed.has('plus')
                        ? 'plus'
                        : hand.canUseManeuver && !influenceUsed.has('minus')
                          ? 'minus'
                          : 'sigilo';
                    await page.locator(`#throneHandDialog [data-influence="${action}"]`).click();
                    if (hand.opening) {
                      await expect(
                        page.locator('#throneHandDialog [data-suit]').first(),
                      ).toBeVisible();
                      // Hiding the table retains this private choice and invalidates background clicks.
                      await page.evaluate(() => window.TronoPortal.showOnly('portalScreen'));
                      await expect(page.locator('#throneHandDialog')).toBeHidden();
                      await page.evaluate(() => window.TronoPortal.showOnly('gameScreen'));
                      await expect(page.locator('#throneHandDialog')).toBeVisible();
                      await page.locator('#throneHandDialog [data-suit]').first().click();
                      seen.add('opening-influence');
                    }
                    await expect(page.locator('#throneHandDialog')).toBeHidden();
                    influenceUsed.add(action);
                  }
                  const clicked = await page.evaluate(() => {
                    const node = document.querySelector(
                      '#throneOnlineHandCards .hand-card:not(:disabled)',
                    );
                    if (!node) return false;
                    node.click();
                    return true;
                  });
                  if (clicked) played.add(key);
                }
              }
              await page.waitForTimeout(25);
            }
            assert(
              await page.evaluate(() => !!window.__choiceRoundDone),
              `Round timed out (${decree}); seen: ${[...seen]}`,
            );
            if (['reserva', 'conselho', 'corte'].includes(decree))
              assert(seen.has('choose-' + decree));
            assert(
              await page.evaluate(() => {
                const call = window.TronoSocial,
                  before = window.__choiceTracks;
                return (
                  call.getLocalAudioTrack() === before[0] &&
                  call
                    .getMediaSources()
                    .find((s) => s.self)
                    .camera.getVideoTracks()[0] === before[1] &&
                  call.getLocalDisplayStream().getVideoTracks()[0] === before[2] &&
                  before.every((t) => t.readyState === 'live') &&
                  window.TronoThroneMatch === window.__matchHosts.owner &&
                  window.__matchHosts.nodes.every(
                    (node) => node && node.isConnected && document.getElementById(node.id) === node,
                  )
                );
              }),
            );
            await assertThroneSeats(page);
            await assertThroneTable(page);
            assert.deepEqual(await page.evaluate(() => window.__tableFailures), []);
            assert(await page.evaluate(() => window.__tableStates.has('result')));
            if (decree === 'reserva') {
              await expect(page.locator('#throneResultDialog')).toBeVisible();
              await expect(page.locator('#throneResultDialog .score-row.final')).toHaveCount(4);
              assert(
                await page.evaluate(
                  () => window.TronoThroneHistory.getSnapshot().dialog.kind === 'final',
                ),
              );
              await page.screenshot({ path: 'artifacts/throne-history-online-final.png' });
              await page.locator('#throneResultContinue').click();
            } else await page.evaluate(() => window.TronoThroneBoard.backToLobby());
            await assertThroneTable(page);
            assert.equal(await page.evaluate(() => window.TronoThroneTable.getSnapshot()), null);
            assert.equal(
              await page.evaluate(() => window.TronoThroneSeats.getSnapshot().players.length),
              0,
            );
            await expect(page.locator('#throneChoiceDialog')).toBeHidden();
            await expect(page.locator('#thronePrivateDialog')).toBeHidden();
            assert.equal(
              await page.evaluate(() => window.TronoThronePrivate.getSnapshot().intelligence),
              null,
            );
            assert.equal(
              await page.evaluate(() => window.TronoThroneMatch.getSnapshot().mode),
              null,
            );
            assert.equal(
              await page.evaluate(() => window.TronoThroneMatch.getSnapshot().match),
              null,
            );
            await expect(page.locator('#turnTimer')).toHaveClass('turn-timer idle');
            assert.equal(
              await page.evaluate(() => window.TronoThroneChoices.getSnapshot().context),
              null,
            );
            assert.equal(
              await page.evaluate(() => window.TronoThroneHand.getSnapshot().context),
              null,
            );
            if (decree === 'espionagem') {
              await exerciseThroneTableControls(page);
              await exerciseThroneHistory(page);
            }
            assert.deepEqual(await page.evaluate(() => window.__tableFailures), []);
          } finally {
            peers.forEach((peer) => peer.terminate());
            await context?.close();
            await fixture.stop();
          }
        });
      assert(privateKinds.has('intelligence'), 'Espionagem was confirmed and reviewed in React');
      assert(privateKinds.has('usurpation'), 'Usurpação private exchange was confirmed in React');
      assert(influenceUsed.has('sigilo'), 'Sigilo was exercised through React');
      assert(influenceUsed.has('plus'), 'Manobra +3 was exercised through React');
      assert(influenceUsed.has('minus'), 'Manobra -3 was exercised through React');
      assert.deepEqual(errors, []);
      assert.deepEqual(warnings, []);
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
