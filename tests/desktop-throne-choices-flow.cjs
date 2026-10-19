'use strict';
const { expect } = require('@playwright/test');
const assert = require('node:assert/strict');
async function exerciseThroneChoices({ page, receiver }) {
  await page.evaluate(() => {
    const call = window.TronoSocial;
    window.__choiceMedia = {
      mic: call.getLocalAudioTrack(),
      camera: call
        .getMediaSources()
        .find((s) => s.self)
        .camera.getVideoTracks()[0],
      screen: call.getLocalDisplayStream().getVideoTracks()[0],
      peers: [...window.__layoutPeers],
      client: window.TronoNetwork.clientId,
    };
  });
  for (const client of [page, receiver]) {
    await client.evaluate(() => window.TronoThroneLobby.enter('sala-chave'));
    await expect(client.locator('#roomSeats')).toContainText('Layout Principal');
    await client.locator('#readyOnlineBtn').click();
    await expect(client.locator('#readyOnlineBtn')).toContainText('Retirar Pronto');
  }
  await expect(page.locator('#startOnlineBtn')).toBeEnabled();
  await page.locator('#startOnlineBtn').click();
  // The fixture offers Reserva only; both humans must make the private card choice.
  for (let attempt = 0; attempt < 40; attempt++) {
    for (const client of [page, receiver]) {
      const prompt = await client.evaluate(() => window.TronoThroneChoices.getSnapshot().prompt);
      if (prompt?.kind === 'choose-decree')
        await client.locator('#throneChoiceDialog .choice-card').first().click();
    }
    if (
      await page.evaluate(
        () => window.TronoThroneChoices.getSnapshot().prompt?.kind === 'choose-reserva',
      )
    )
      break;
    await page.waitForTimeout(40);
  }
  for (const client of [page, receiver]) {
    await expect(client.locator('#throneChoiceDialog')).toBeVisible();
    assert.equal(
      await client.evaluate(() => window.TronoThroneChoices.getSnapshot().prompt.kind),
      'choose-reserva',
    );
    await expect(client.locator('#throneChoiceDialog .choice-card')).toHaveCount(10);
    assert(
      await client.evaluate(() =>
        Object.isFrozen(window.TronoThroneChoices.getSnapshot().context.hand[0]),
      ),
    );
  }
  // Leaving the view hides the native dialog without answering or losing its choice.
  await page.evaluate(() => window.TronoPortal.showOnly('portalScreen'));
  await expect(page.locator('#throneChoiceDialog')).toBeHidden();
  await page.evaluate(() => window.TronoPortal.showOnly('gameScreen'));
  await expect(page.locator('#throneChoiceDialog')).toBeVisible();
  await page.screenshot({ path: 'artifacts/throne-choices-electron.png' });
  await page.locator('#throneChoiceDialog .choice-card').first().click();
  await receiver.locator('#throneChoiceDialog .choice-card').first().click();
  await expect(page.locator('#throneChoiceDialog')).toBeHidden();
  await expect(receiver.locator('#throneChoiceDialog')).toBeHidden();
  for (const client of [page, receiver])
    await client.evaluate(() => window.TronoThroneBoard.backToLobby());
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
        before.camera.readyState === 'live' &&
        call.getLocalDisplayStream().getVideoTracks()[0] === before.screen &&
        before.screen.readyState === 'live' &&
        window.TronoNetwork.clientId === before.client &&
        before.peers.every(
          (peer, i) => peer === window.__layoutPeers[i] && peer.connectionState === 'connected',
        )
      );
    }),
  );
}
module.exports = { exerciseThroneChoices };
