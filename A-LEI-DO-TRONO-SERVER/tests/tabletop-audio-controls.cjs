'use strict';
const assert = require('node:assert/strict');
const { expect } = require('@playwright/test');
const games = [
  ['throne', 'gameScreen', 13],
  ['azul', 'azulScreen', 24],
  ['splendor', 'splendorScreen', 35],
  ['love-letter', 'loveLetterScreen', 46],
  ['similo', 'similoScreen', 57],
];

/** Shared by the exported web UI and the real Electron call regression. */
async function exerciseTabletopAudio(page) {
  const previous = await page.evaluate((keys) => {
    const source = window.TronoAudio;
    window.__tabletopBaseline = {
      source,
      network: window.TronoNetwork,
      social: window.TronoSocial,
      mic: window.TronoSocial?.getLocalAudioTrack(),
      display: window.TronoSocial?.getLocalDisplayStream(),
      nodes: [...document.querySelectorAll('[data-game-audio]')],
    };
    return {
      screen: [...document.querySelectorAll('.screen')].find((n) => !n.classList.contains('hidden'))
        ?.id,
      enabled: source.sfxEnabled,
      volumes: Object.fromEntries(
        keys.map((key) => [key, source.gameVolume(key)]),
      ),
    };
  }, games.map(([key]) => key));
  try {
    assert.equal(await page.evaluate(() => window.TronoTabletopAudio), undefined);
    for (const [key, screen, value] of games) {
      await page.evaluate((id) => window.TronoPortal.showOnly(id), screen);
      const panel = page.locator(`[data-game-audio="${key}"]`),
        summary = panel.locator('summary');
      await expect(panel).toHaveCount(1);
      await expect(summary).toBeVisible();
      await summary.click();
      await expect(summary).toHaveAttribute('aria-expanded', 'true');
      await expect(panel.locator('.tt-audio-panel')).toBeInViewport({ ratio: 1 });
      const input = panel.locator('input');
      await input.fill(String(value));
      await expect(panel.locator('output')).toHaveText(value + '%');
      assert.equal(await page.evaluate((key) => window.TronoAudio.gameVolume(key), key), value);
      await panel.getByRole('button', { name: 'Silenciar', exact: true }).click();
      await expect(input).toHaveValue('0');
      await expect(summary).toHaveClass(/tt-muted/);
      await panel.getByRole('button', { name: 'Restaurar', exact: true }).click();
      await expect(input).toHaveValue(String(value));
      await page.evaluate(() => window.TronoAudio.setSfxEnabled(false));
      await expect(panel.locator('small')).toHaveText('Os efeitos gerais estão silenciados.');
      await panel.getByRole('button', { name: 'Ativar efeitos gerais', exact: true }).click();
      await expect(panel.locator('small')).toHaveText('Somente os efeitos deste jogo.');
      await expect(panel.locator('.tt-audio-enable')).toBeHidden();
      await expect(input).toHaveValue(String(value));
      // An update from another consumer is rendered without replacing the controls.
      await page.evaluate(({ key, value }) => window.TronoAudio.setGameVolume(key, value + 1), {
        key,
        value,
      });
      await expect(input).toHaveValue(String(value + 1));
      await input.fill(String(value));
      await panel.getByRole('button', { name: 'Ouvir', exact: true }).click();
      await page.keyboard.press('Escape');
      await expect(panel).not.toHaveAttribute('open');
      await expect(summary).toBeFocused();
      // Keyboard activation uses the same owner as pointer activation.
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(panel).toHaveAttribute('open', '');
      await page.mouse.click(2, 2);
      await expect(panel).not.toHaveAttribute('open');
      await summary.click();
      await page.evaluate(() => window.TronoPortal.showOnly('setupScreen'));
      await expect(page.locator('.tt-audio[open]')).toHaveCount(0);
    }
    assert.deepEqual(
      await page.evaluate(
        (keys) => Object.fromEntries(keys.map((key) => [key, window.TronoAudio.gameVolume(key)])),
        games.map(([key]) => key),
      ),
      Object.fromEntries(games.map(([key, , value]) => [key, value])),
    );
    assert.equal(
      await page.evaluate(() => {
        const before = window.__tabletopBaseline;
        return (
          before.source === window.TronoAudio &&
          before.network === window.TronoNetwork &&
          before.social === window.TronoSocial &&
          before.mic === window.TronoSocial?.getLocalAudioTrack() &&
          before.display === window.TronoSocial?.getLocalDisplayStream() &&
          before.nodes.every(
            (n) => n === document.querySelector(`[data-game-audio="${n.dataset.gameAudio}"]`),
          )
        );
      }),
      true,
      'Navigation and React updates preserve audio, socket, controls and media owners',
    );
  } finally {
    await page.evaluate((previous) => {
      for (const [key, value] of Object.entries(previous.volumes))
        window.TronoAudio.setGameVolume(key, value);
      window.TronoAudio.setSfxEnabled(previous.enabled);
      if (previous.screen) window.TronoPortal.showOnly(previous.screen);
      delete window.__tabletopBaseline;
    }, previous);
  }
}
module.exports = { exerciseTabletopAudio };
