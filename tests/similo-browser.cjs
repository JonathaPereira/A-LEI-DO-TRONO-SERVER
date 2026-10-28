'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  express = require('express'),
  { chromium, expect } = require('@playwright/test'),
  { startFixture } = require('./auth-fixture'),
  { installCanvasCamera } = require('./camera-fixture');
test(
  'Similo real multiplayer: mixed decks, private cards, captain divergence, full win/loss, hover info, responsive HUD and call continuity',
  { timeout: 240000 },
  async () => {
    const server = await new Promise((r) => {
        const s = express()
          .use(express.static(path.resolve('out')))
          .listen(0, '127.0.0.1', () => r(s));
      }),
      origin = 'http://127.0.0.1:' + server.address().port,
      f = await startFixture({ port: 10871, appOrigin: origin, similoSeed: 1 });
    let browser;
    const contexts = [],
      errors = [],
      missing = [];
    try {
      await fs.mkdir('artifacts/similo/screens', { recursive: true });
      const users = [];
      for (let i = 0; i < 3; i++) {
        const email = `similo-ui-${i}@example.test`;
        await f.call('signup', {
          email,
          nickname: ['Ana', 'Bruno', 'Carla'][i],
          password: 'Senha12!',
        });
        await f.call('verify', { token_hash: [...f.links.keys()].at(-1), type: 'signup' });
        users.push((await f.call('login', { email, password: 'Senha12!' })).data);
      }
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--mute-audio',
          '--autoplay-policy=no-user-gesture-required',
        ],
      });
      const pages = [];
      for (let i = 0; i < 3; i++) {
        const context = await browser.newContext({
          viewport: { width: 1536, height: 1024 },
          permissions: ['microphone', 'camera'],
          reducedMotion: i === 1 ? 'no-preference' : 'reduce',
        });
        contexts.push(context);
        await context.route('**/*', async (r) => {
          const u = new URL(r.request().url());
          if (u.hostname === 'similo-mn.surge.sh') {
            const name = u.pathname.slice(1);
            if (!/^v1\/(animals|history|tales|monsters|myths)\.webp$/.test(name))
              throw Error('Unexpected art ' + name);
            return r.fulfill({
              status: 200,
              contentType: 'image/webp',
              headers: { 'access-control-allow-origin': '*' },
              body: await fs.readFile(path.resolve('games/similo/art', name)),
            });
          }
          return u.hostname === '127.0.0.1' ? r.continue() : r.abort();
        });
        await context.addInitScript(
          ({ base, data }) => {
            window.TRONO_BACKEND_URL = base;
            sessionStorage.setItem('mn-auth-session-v1', JSON.stringify(data));
            localStorage.setItem('tronoMusicEnabled', '0');
            localStorage.setItem('tronoSfxEnabled', '0');
            localStorage.setItem('mnDesktopNoiseMode', 'native');
            window.__similoPackets = [];
            const Native = window.WebSocket;
            window.WebSocket = class extends Native {
              constructor(...args) {
                super(...args);
                this.addEventListener('message', (e) => {
                  const m = JSON.parse(e.data);
                  if (m.type === 'similo-state') window.__similoPackets.push(m);
                });
              }
            };
          },
          { base: f.base, data: users[i] },
        );
        await context.addInitScript(installCanvasCamera, { display: true });
        const page = await context.newPage();
        pages.push(page);
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('response', (r) => {
          if (r.status() >= 400 && /\.(webp|woff2|js|css|svg)/.test(r.url())) missing.push(r.url());
        });
        page.setDefaultTimeout(10000);
        await page.goto(origin);
        await page.waitForFunction(() => window.TronoAuth?.ready);
        await page.evaluate(() => window.TronoAuth.ready);
        await expect(page.locator('#chatOnlyScreen')).toBeVisible();
      }
      const [a, b, c] = pages,
        screen = (p) => p.locator('#similoScreen');
      await a.getByRole('button', { name: 'Entrar na voz de Jogos', exact: true }).click();
      await expect.poll(() => a.evaluate(() => window.TronoSocial.voiceJoined)).toBe(true);
      await a.evaluate(() => window.TronoCallToolbar.activate('cameraBtn'));
      await expect.poll(() => a.evaluate(() => window.TronoSocial.cameraOn)).toBe(true);
      await a.evaluate(() => window.TronoSocial.startScreenShare());
      await expect.poll(() => a.evaluate(() => window.TronoSocial.screenSharing)).toBe(true);
      const tracks = () =>
        a.evaluate(() => ({
          socket: window.TronoNetwork.clientId,
          voice: window.TronoNetwork.primaryRoom,
          mic: window.TronoSocial.getLocalAudioTrack()?.id,
          camera: window.TronoSocial.getMediaSources()
            .find((s) => s.self)
            ?.camera?.getVideoTracks()[0]?.id,
          share: window.TronoSocial.getLocalDisplayStream()?.getVideoTracks()[0]?.id,
        }));
      const before = await tracks();
      for (const p of pages) {
        await p.getByRole('button', { name: 'Biblioteca de jogos', exact: true }).click();
        await p.locator('[data-game="similo"]').click();
        await expect(screen(p)).toBeVisible();
      }
      const boardDeck = screen(a).getByRole('group', { name: '12 cartas da mesa', exact: true });
      const informantDeck = screen(a).getByRole('group', { name: 'Baralho do informante', exact: true });
      await boardDeck.getByRole('combobox', { name: 'Misturar com (opcional)', exact: true }).selectOption('history');
      await boardDeck.getByRole('combobox', { name: 'Tema principal', exact: true }).selectOption('history');
      await expect(boardDeck.getByRole('combobox', { name: 'Misturar com (opcional)', exact: true })).toHaveValue('');
      await boardDeck.getByRole('combobox', { name: 'Tema principal', exact: true }).selectOption('animals');
      await boardDeck.getByRole('combobox', { name: 'Misturar com (opcional)', exact: true }).selectOption('history');
      await informantDeck.getByRole('combobox', { name: 'Tema principal', exact: true }).selectOption('tales');
      await informantDeck.getByRole('combobox', { name: 'Misturar com (opcional)', exact: true }).selectOption('myths');
      for(const width of [1536,390]) {
        await a.setViewportSize({width,height:width===390?844:1024});
        const hide=a.getByRole('button',{name:'Ocultar lista de membros',exact:true});
        if(width===390 && await hide.isVisible()) await hide.click();
        for(const group of [boardDeck,informantDeck]) {
          const sizes=await group.getByRole('combobox').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {left:b.left,right:b.right,width:b.width,height:b.height};}));
          assert(sizes.every(b=>b.left>=0&&b.right<=width&&b.width>=140&&b.height>=40),JSON.stringify(sizes));
        }
        assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await a.screenshot({path:`artifacts/similo/screens/decks-${width}.png`});
      }
      await a.setViewportSize({width:1536,height:1024});
      await screen(a).getByRole('button', { name: 'Criar mesa online' }).click();
      await expect(screen(a).getByRole('heading', { name: /Mesa [A-F0-9]{10}/ })).toBeVisible();
      const roomId = await a.evaluate(() => window.TronoSimilo.room.id);
      for (const p of [b, c]) {
        await screen(p).getByRole('button', { name: 'Atualizar lista' }).click();
        await screen(p)
          .getByRole('button', { name: new RegExp(roomId) })
          .click();
        await expect(screen(p).getByRole('heading', { name: 'Mesa ' + roomId })).toBeVisible();
      }
      for (const p of pages) {
        await expect.poll(() => p.evaluate(() => window.TronoSimilo.room.settings.boardThemes)).toEqual(['animals','history']);
        await expect.poll(() => p.evaluate(() => window.TronoSimilo.room.settings.clueThemes)).toEqual(['tales','myths']);
        if (p !== a) {
          await expect(screen(p).getByRole('group',{name:'12 cartas da mesa',exact:true}).getByRole('combobox',{name:'Tema principal',exact:true})).toBeDisabled();
        }
      }
      await boardDeck.getByRole('combobox',{name:'Misturar com (opcional)',exact:true}).selectOption('');
      for(const p of pages) await expect.poll(() => p.evaluate(() => window.TronoSimilo.room.settings.boardThemes)).toEqual(['animals']);
      await boardDeck.getByRole('combobox',{name:'Misturar com (opcional)',exact:true}).selectOption('history');
      for(const p of pages) await expect.poll(() => p.evaluate(() => window.TronoSimilo.room.settings.boardThemes)).toEqual(['animals','history']);
      await a.screenshot({ path: 'artifacts/similo/screens/lobby.png' });
      await screen(a).getByRole('button', { name: 'Começar partida' }).click();
      await expect(screen(a).locator('[data-phase="clue"]')).toBeVisible();
      const original = await a.evaluate(() => window.TronoSimilo.room.state);
      assert(original.hand.length === 5);
      assert(original.board.every((id) => id.startsWith('animals-') || id.startsWith('history-')));
      assert(original.hand.every((id) => id.startsWith('tales-') || id.startsWith('myths-')));
      for (const p of [b, c]) {
        await expect(screen(p).locator('[data-phase="clue"]')).toBeVisible();
        const packets = await p.evaluate(() => window.__similoPackets);
        assert(
          packets
            .filter((m) => m.room.state)
            .every(
              (m) =>
                m.room.state.secretId === null &&
                m.room.state.hand.length === 0 &&
                !('drawPile' in m.room.state),
            ),
        );
        assert.equal(
          await screen(p)
            .getByRole('button', { name: /Escolher pista/ })
            .count(),
          0,
        );
      }
      await a.screenshot({ path: 'artifacts/similo/screens/informant.png' });
      for (let round = 0; round < 5; round++) {
        await expect(
          screen(a).locator('[data-phase="clue"][data-round="' + (round + 1) + '"]'),
        ).toBeVisible();
        const g = await a.evaluate(() => window.TronoSimilo.room.state),
          safe = g.board.filter((id) => id !== g.secretId && !g.eliminated.includes(id)),
          quota = [1, 2, 3, 4, 1][round];
        await screen(a)
          .getByRole('button', { name: /Escolher pista/ })
          .first()
          .click();
        if (round % 2)
          await screen(a)
            .getByRole('button', { name: /É diferente/ })
            .click();
        else
          await screen(a)
            .getByRole('button', { name: /Parece com/ })
            .click();
        await screen(a).getByRole('button', { name: /^Jogar pista (vertical|horizontal)$/ }).click();
        const relation = round % 2 ? 'unlike' : 'like';
        for (const [client, p] of pages.entries()) {
          const size = [{width:1536,height:1024},{width:1280,height:720},{width:390,height:844}][client];
          await p.setViewportSize(size);
          const hide=p.getByRole('button',{name:'Ocultar lista de membros',exact:true});
          if(client === 2 && await hide.isVisible()) await hide.click();
          await expect(screen(p).locator('[data-phase="vote"]')).toBeVisible();
          const received = await p.evaluate(() => window.TronoSimilo.room.state.clues);
          assert.equal(received.at(-1).relation, relation, 'all clients receive the authoritative relation');
          const card = screen(p).getByRole('button', { name: 'Ver pista ' + require('../src/lib/games/similo/catalog.ts').getCard(g.hand[0]).name, exact: true });
          const layout = await card.evaluate(node => {
            const box=node.getBoundingClientRect(),style=getComputedStyle(node);
            const matrix=new DOMMatrixReadOnly(style.transform);
            return {width:box.width,height:box.height,a:matrix.a,b:matrix.b,transform:style.transform,animation:style.animationName,rotate:style.rotate};
          });
          assert.equal(received.length,round+1);
          assert.equal(received.at(-1).cardId,g.hand[0]);
          assert.equal(layout.width > layout.height, relation === 'unlike', `client ${client}, round ${round}: ${JSON.stringify(layout)}`);
          if (relation === 'unlike') {
            await card.click();
            const dialog=screen(p).getByRole('dialog');
            await expect(dialog).toBeVisible();
            await expect(dialog.getByText('Pista horizontal · É diferente',{exact:true})).toBeVisible();
            const zoom=await dialog.locator('svg').first().evaluate(node=>{const r=node.getBoundingClientRect();return {width:r.width,height:r.height};});
            assert(zoom.width > zoom.height, `a horizontal clue must remain horizontal when inspected: ${JSON.stringify(zoom)}`);
            if(round===1) await p.screenshot({path:`artifacts/similo/screens/horizontal-inspection-${client}.png`});
            await p.keyboard.press('Escape');
          }
          await p.setViewportSize({width:1536,height:1024});
        }
        for (const [i, p] of [b, c].entries()) {
          await expect(screen(p).locator('[data-phase="vote"]')).toBeVisible();
          const offset = safe.length > quota ? i : 0;
          for (const id of safe.slice(offset, offset + quota))
            await screen(p)
              .locator(
                `[data-testid="similo-board"] [data-card-id="${id}"] button[aria-label^="Selecionar"]`,
              )
              .click();
          await screen(p)
            .getByRole('button', {
              name: `Confirmar ${quota} carta${quota > 1 ? 's' : ''}`,
              exact: true,
            })
            .click();
        }
        const cap = round % 2 ? c : b,
          other = cap === b ? c : b;
        await expect(
          screen(cap).getByRole('button', {
            name: `Eliminar ${quota} carta${quota > 1 ? 's' : ''}`,
            exact: true,
          }),
        ).toBeVisible();
        assert.equal(
          await screen(other)
            .getByRole('button', { name: /^Eliminar \d carta/ })
            .count(),
          0,
        );
        if (safe.length > quota) {
          await expect(
            screen(cap).getByRole('heading', { name: 'O capitão decide' }),
          ).toBeVisible();
          for (const id of safe.slice(0, quota))
            await screen(cap)
              .locator(
                `[data-testid="similo-board"] [data-card-id="${id}"] button[aria-label^="Selecionar"]`,
              )
              .click();
        }
        if (round === 0) {
          const info = screen(b)
            .getByRole('button', { name: /^Sobre / })
            .first();
          await info.hover();
          await expect(screen(b).getByRole('tooltip')).toBeVisible();
          assert(await screen(b).getByRole('tooltip').innerText());
          await info.click();
          await expect(screen(b).getByRole('dialog')).toBeVisible();
          await b.screenshot({ path: 'artifacts/similo/screens/card-info.png' });
          await b.keyboard.press('Escape');
          await expect(screen(b).getByRole('dialog')).toHaveCount(0);
          for (const [w, h] of [
            [1536, 1024],
            [1280, 720],
            [1024, 768],
            [390, 844],
          ]) {
            await b.setViewportSize({ width: w, height: h });
            const hide = b.getByRole('button', { name: 'Ocultar lista de membros', exact: true });
            if (w <= 1000 && (await hide.isVisible())) await hide.click();
            await b.evaluate(
              () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
            );
            const bounds = await screen(b).evaluate((root) => {
              const board = root.querySelector('[data-testid="similo-board"]'),
                r = board.getBoundingClientRect();
              return {
                root: root.getBoundingClientRect().width,
                scroll: root.scrollWidth,
                cards: [...board.querySelectorAll('article')].map((n) => {
                  const q = n.getBoundingClientRect();
                  return q.left >= r.left - 1 && q.right <= r.right + 1;
                }),
                overflow: document.documentElement.scrollWidth > innerWidth,
              };
            });
            assert(bounds.cards.every(Boolean), JSON.stringify(bounds));
            assert(!bounds.overflow, JSON.stringify(bounds));
            await b.screenshot({ path: `artifacts/similo/screens/vote-${w}.png` });
          }
          await b.setViewportSize({ width: 1536, height: 1024 });
        }
        const revealStart = Date.now();
        await screen(cap)
          .getByRole('button', {
            name: `Eliminar ${quota} carta${quota > 1 ? 's' : ''}`,
            exact: true,
          })
          .click();
        await expect(screen(a).locator('[data-phase="resolving"]')).toBeVisible();
        if (round === 0) {
          await expect(screen(b).locator('[data-phase="resolving"]')).toBeVisible();
          const animations = await screen(b)
            .locator('[data-testid="similo-board"] [data-card-id]')
            .evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).animationName));
          assert(animations.some((name) => name !== 'none'));
          await b.screenshot({ path: 'artifacts/similo/screens/reveal.png' });
        }
        await expect(
          screen(a).locator(`[data-phase="${round === 4 ? 'finished' : 'clue'}"]`),
        ).toBeVisible();
        assert(Date.now() - revealStart >= 2000, 'Reveal must leave time to read the decision');
      }
      await expect(screen(b).getByText('Vocês venceram!', { exact: true })).toBeVisible();
      assert.deepEqual(await tracks(), before);
      await b.screenshot({ path: 'artifacts/similo/screens/victory.png' });
      await screen(a).getByRole('button', { name: 'Jogar novamente', exact: true }).click();
      await expect(screen(a).locator('[data-phase="clue"]')).toBeVisible();
      const secret = await a.evaluate(() => window.TronoSimilo.room.state.secretId);
      await screen(a)
        .getByRole('button', { name: /Escolher pista/ })
        .first()
        .click();
      await screen(a).getByRole('button', { name: /^Jogar pista (vertical|horizontal)$/ }).click();
      for (const p of [b, c]) {
        await expect(screen(p).locator('[data-phase="vote"]')).toBeVisible();
        await screen(p)
          .locator(
            `[data-testid="similo-board"] [data-card-id="${secret}"] button[aria-label^="Selecionar"]`,
          )
          .click();
        await screen(p).getByRole('button', { name: 'Confirmar 1 carta', exact: true }).click();
      }
      await screen(b).getByRole('button', { name: 'Eliminar 1 carta', exact: true }).click();
      await expect(screen(a).locator('[data-phase="finished"]')).toBeVisible();
      await expect(
        screen(b).getByText('Quase! Vamos tentar outra conexão?', { exact: true }),
      ).toBeVisible();
      assert.equal(await b.evaluate(() => window.TronoSimilo.room.state.secretId), secret);
      await b.screenshot({ path: 'artifacts/similo/screens/defeat.png' });
      await screen(b).getByRole('button', { name: 'Voltar aos jogos', exact: true }).click();
      await expect(screen(b)).toBeHidden();
      await b.locator('[data-game="similo"]').click();
      await expect(screen(b).locator('[data-phase="finished"]')).toBeVisible();
      assert.deepEqual(errors, []);
      assert.deepEqual(missing, []);
    } finally {
      for (const context of contexts) await context.close().catch(() => {});
      await browser?.close();
      await f.stop();
      await new Promise((r) => server.close(r));
    }
  },
);
