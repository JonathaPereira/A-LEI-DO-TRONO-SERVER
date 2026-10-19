'use strict';
const { expect } = require('@playwright/test'),
  assert = require('node:assert/strict');
async function exerciseThronePrivate({ page, receiver }) {
  for (const client of [page, receiver])
    await expect.poll(() => client.evaluate(() => window.TronoNetwork.gameRoom)).toBe(null);
  for (const client of [page, receiver]) {
    await client.evaluate(() => window.TronoPortal.openGame(true));
    await expect(client.locator('#setupScreen')).toBeVisible();
    await client.locator('.room-enter[data-room="sala-mascara"]').click();
    await expect(client.locator('#roomScreen')).toBeVisible();
    await expect(client.locator('#roomSeats')).toContainText('Layout Principal');
    await client.locator('#readyOnlineBtn').click();
    await expect(client.locator('#readyOnlineBtn')).toContainText('Retirar Pronto');
  }
  await page.locator('#startOnlineBtn').click();
  for (let attempt = 0; attempt < 40; attempt++) {
    for (const client of [page, receiver]) {
      if (
        await client.evaluate(
          () => window.TronoThroneChoices.getSnapshot().prompt?.kind === 'choose-decree',
        )
      )
        await client.locator('#throneChoiceDialog .choice-card').first().click();
    }
    if (await page.locator('#thronePrivateDialog').isVisible()) break;
    await page.waitForTimeout(40);
  }
  for (const client of [page, receiver]) {
    await expect(client.locator('#thronePrivateDialog')).toBeVisible();
    assert(
      await client.evaluate(() => {
        const s = window.TronoThronePrivate.getSnapshot();
        return (
          s.dialog.data.kind === 'intelligence' &&
          s.dialog.action === 'intelligence-ack' &&
          Object.isFrozen(s.dialog.data.clue.card)
        );
      }),
    );
    await expect(client.locator('#modal')).toHaveCount(0);
    await expect(client.locator('#throneChoiceDialog')).toBeHidden();
  }
  await page.evaluate(() => window.TronoPortal.showOnly('portalScreen'));
  await expect(page.locator('#thronePrivateDialog')).toBeHidden();
  await page.evaluate(() => window.TronoPortal.showOnly('gameScreen'));
  await expect(page.locator('#thronePrivateDialog')).toBeVisible();
  await page.screenshot({ path: 'artifacts/throne-private-electron.png' });
  for (const client of [page, receiver]) await client.locator('#thronePrivateContinue').click();
  for (const client of [page, receiver]) {
    await expect(client.locator('#thronePrivateDialog')).toBeHidden();
    await client.locator('#decreeBadge').click();
    await expect(client.locator('#thronePrivateDialog')).toBeVisible();
    assert.equal(
      await client.evaluate(() => window.TronoThronePrivate.getSnapshot().dialog.action),
      null,
    );
    await client.locator('#thronePrivateContinue').click();
  }
  for (const client of [page, receiver]) {
    await client.evaluate(() => window.TronoThroneBoard.backToLobby());
    assert.equal(
      await client.evaluate(() => window.TronoThronePrivate.getSnapshot().intelligence),
      null,
    );
    await expect(client.locator('#thronePrivateDialog')).toBeHidden();
  }
  assert(
    await page.evaluate(() => {
      const before = window.__choiceMedia,
        call = window.TronoSocial;
      return (
        call.getLocalAudioTrack() === before.mic &&
        before.mic.readyState === 'live' &&
        call
          .getMediaSources()
          .find((s) => s.self)
          .camera.getVideoTracks()[0] === before.camera &&
        call.getLocalDisplayStream().getVideoTracks()[0] === before.screen &&
        window.TronoNetwork.clientId === before.client &&
        before.peers.every(
          (peer, i) => peer === window.__layoutPeers[i] && peer.connectionState === 'connected',
        )
      );
    }),
  );
}
module.exports = { exerciseThronePrivate };
