import assert from 'node:assert/strict';
import { it } from 'node:test';
import { CallStability } from '../../apps/web/src/lib/voice/quality-policy.ts';

it('preserva os 60 FPS escolhidos em jogo nos dois níveis de adaptação', () => {
  const stability = new CallStability();
  const profile = {
    camera: { width: 1280, height: 720, fps: 30 },
    screen: { width: 1920, height: 1080, fps: 60 },
    videoBitrate: 2_000_000,
    screenBitrate: 8_000_000,
  };
  const pressure = { limiter: 'cpu' };
  stability.sample(pressure, 0);
  for (const [stamp, level, bitrate] of [
    [12_000, 1, 4_000_000],
    [32_000, 2, 2_500_000],
  ]) {
    assert.equal(stability.sample(pressure, stamp), true);
    assert.equal(stability.level, level);
    const adjusted = stability.profile(profile, 'motion');
    assert.equal(adjusted.screen.fps, 60);
    assert.equal(adjusted.screen.height, 720);
    assert.equal(adjusted.screenBitrate, bitrate);
    const thirtyFps = { ...profile, screen: { ...profile.screen, fps: 30 } };
    assert.equal(stability.profile(thirtyFps, 'motion').screen.fps, 30);
  }
  stability.sample({}, 40_000);
  assert.equal(stability.sample({}, 100_000), true);
  assert.equal(stability.sample({}, 160_000), true);
  assert.equal(stability.profile(profile, 'motion'), profile);
});
