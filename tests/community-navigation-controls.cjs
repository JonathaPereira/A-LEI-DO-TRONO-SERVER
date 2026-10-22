'use strict';
const { expect } = require('@playwright/test'),
  assert = require('node:assert/strict');
async function exerciseCommunityNavigation(page) {
  await page.evaluate(() => {
    window.TronoPortal.showOnly('setupScreen');
    window.__communityNodes = [
      'chatOnlyBtn',
      'backFromChatOnlyBtn',
      'chatOnlyStatus',
      'chatOnlyCount',
      'chatOnlyRoomName',
      'communityChatTitle',
    ].map((id) => document.getElementById(id));
    window.__communityMic = window.TronoSocial.getLocalAudioTrack();
    window.__communityDisplay = window.TronoSocial.getLocalDisplayStream();
    window.__communityNetwork = window.TronoNetwork;
    const refresh = window.TronoCommunityAdmin.refresh;
    window.TronoCommunityAdmin.refresh = () =>
      new Promise((resolve) => {
        window.__releaseCommunityNavigation = () => {
          window.TronoCommunityAdmin.refresh = refresh;
          resolve();
        };
      });
    // No portal-supplied guard: the community owns this pending intention itself.
    window.__communityPending = window.TronoChatHub.enter();
  });
  await page.waitForFunction(() => !!window.__releaseCommunityNavigation);
  await page.evaluate(() => window.TronoPortal.showOnly('gamesScreen'));
  assert.equal(
    await page.evaluate(async () => {
      window.__releaseCommunityNavigation();
      return window.__communityPending;
    }),
    false,
  );
  await expect(page.locator('#gamesScreen')).toBeVisible();
  assert(
    await page.evaluate(
      () =>
        window.TronoSocial.getLocalAudioTrack() === window.__communityMic &&
        window.TronoSocial.getLocalDisplayStream() === window.__communityDisplay,
    ),
  );
  assert.equal(await page.evaluate(() => window.TronoChatHub.enter()), true);
  await expect(page.locator('#callWorkspace')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const room = window.TronoCallNavigation.getSnapshot().textRoom;
        return (
          room?.kind === 'chat' &&
          room.id === window.TronoNetwork.currentRoom &&
          document.getElementById('chatOnlyRoomName').textContent === (room.name || 'Comunidade')
        );
      }),
    )
    .toBe(true);
  assert(
    await page.evaluate(
      () =>
        window.TronoNetwork === window.__communityNetwork &&
        window.TronoSocial.getLocalAudioTrack() === window.__communityMic &&
        window.TronoSocial.getLocalDisplayStream() === window.__communityDisplay &&
        window.__communityNodes.every(
          (node) =>
            node === document.getElementById(node.id) &&
            node.isConnected &&
            document.querySelectorAll('#' + node.id).length === 1,
        ),
    ),
  );
  await page.evaluate(() => {
    window.TronoPortal.showOnly('setupScreen');
    for (const key of [
      '__communityNodes',
      '__communityMic',
      '__communityDisplay',
      '__communityNetwork',
      '__releaseCommunityNavigation',
      '__communityPending',
    ])
      delete window[key];
  });
}
module.exports = { exerciseCommunityNavigation };
