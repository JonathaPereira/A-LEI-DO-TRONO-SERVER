'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const {
  readRealtimeSettings,
  realtimePolicy,
  clampRealtimeQuality,
  clampRealtimeRid,
  subscriptionBitrate,
  PROFILE,
} = require('../server/realtime-policy.ts');
const { createRealtimeUsage, monthKeyUTC } = require('../server/realtime-usage.ts');
const { RealtimeSfuManager } = require('../server/realtime-sfu.ts');
const usage = (bytes = 0) => ({ month: '2026-10', bytes, lastTick: 0, loadedFromDisk: false });
function temporary(t) {
  const root = fs.mkdtempSync(path.resolve('artifacts/realtime-policy-'));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve('artifacts'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}
test('Realtime defaults and configured clamps preserve bitrate profiles and the existing environment contract', () => {
  const settings = readRealtimeSettings({});
  assert.equal(settings.turnTtl, 21600);
  assert.equal(settings.softLimitGb, 800);
  assert.equal(settings.hardLimitGb, 950);
  assert.equal(settings.maxParticipants, 8);
  assert.equal(settings.estimateSafetyFactor, 1.5);
  assert.deepEqual(PROFILE, {
    economy: { audio: 64000, camera: { f: 900000, h: 450000, q: 180000 }, screen: 4000000 },
    balanced: { audio: 96000, camera: { f: 2200000, h: 950000, q: 350000 }, screen: 8000000 },
    high: { audio: 128000, camera: { f: 3500000, h: 1400000, q: 450000 }, screen: 10000000 },
  });
  const other = readRealtimeSettings({
    CLOUDFLARE_REALTIME_ENABLED: ' YES ',
    CLOUDFLARE_TURN_ENABLED: '0',
    CLOUDFLARE_TURN_TTL_SECONDS: '2',
    REALTIME_MAX_PARTICIPANTS: '100',
    REALTIME_ESTIMATE_SAFETY_FACTOR: '20',
    REALTIME_MONTHLY_SOFT_LIMIT_GB: '1000',
    REALTIME_MONTHLY_HARD_LIMIT_GB: '500',
    REALTIME_ULTRA_DISABLE_GB: '850',
    REALTIME_HIGH_DISABLE_GB: '100',
    REALTIME_SCREEN_DISABLE_GB: '600',
  });
  assert.equal(other.enabled, true);
  assert.equal(other.turnEnabled, false);
  assert.equal(other.turnTtl, 600);
  assert.equal(other.maxParticipants, 32);
  assert.equal(other.estimateSafetyFactor, 4);
  assert.equal(other.hardLimitGb, 1000);
  assert.equal(other.highDisableGb, 850);
  assert.equal(other.screenDisableGb, 850);
  assert.equal(readRealtimeSettings({ REALTIME_MAX_PARTICIPANTS: '' }).maxParticipants, 2);
});
test('budget boundaries preserve soft/high/screen/hard policy and never serialize provider credentials', () => {
  const settings = readRealtimeSettings({
    CLOUDFLARE_REALTIME_APP_ID: 'private-app',
    CLOUDFLARE_REALTIME_API_TOKEN: 'private-token',
    CLOUDFLARE_TURN_API_TOKEN: 'private-turn',
    CLOUDFLARE_REALTIME_ENABLED: 'true',
  });
  for (const [gb, soft, high, screen, blocked, quality] of [
    [799.99, false, true, true, false, 'high'],
    [800, true, true, true, false, 'high'],
    [850, true, false, true, false, 'balanced'],
    [900, true, false, false, false, 'balanced'],
    [950, true, false, false, true, 'economy'],
  ]) {
    const policy = realtimePolicy(settings, usage(gb * 1e9));
    assert.equal(policy.softWarning, soft);
    assert.equal(policy.highAllowed, high);
    assert.equal(policy.screenAllowed, screen);
    assert.equal(policy.hardBlocked, blocked);
    assert.equal(policy.maxQuality, quality);
    assert.equal(policy.ultraAllowed, false);
    assert(!JSON.stringify(policy).includes('private'));
  }
  const based = realtimePolicy({ ...settings, monthBaseGb: 50 }, usage(800e9));
  assert.equal(based.estimatedGb, 850);
  assert.equal(based.processEstimatedGb, 800);
  assert.equal(based.highAllowed, false);
});
test('quality/RID fallbacks retain the currently available layer and preserve screen/audio cost estimates', () => {
  const settings = readRealtimeSettings({}),
    low = realtimePolicy(settings, usage(850e9)),
    normal = realtimePolicy(settings, usage());
  assert.equal(clampRealtimeQuality('high', low), 'balanced');
  assert.equal(clampRealtimeQuality('invalid', normal), 'balanced');
  assert.equal(clampRealtimeRid({ rids: ['f', 'h', 'q'] }, 'f', 'high', low), 'h');
  assert.equal(clampRealtimeRid({ rids: ['q'] }, 'f', 'high', normal), 'q');
  assert.equal(clampRealtimeRid({ rids: ['f'] }, 'f', 'high', low), 'f');
  assert.equal(clampRealtimeRid({ rids: [] }, 'f', 'high', normal), null);
  assert.equal(
    subscriptionBitrate({ kind: 'screen', quality: 'high', screenBitrate: 12000000 }, 'q', 1.5),
    3240000,
  );
  assert.equal(subscriptionBitrate({ kind: 'camera', quality: 'balanced' }, 'f', 1.5), 3300000);
  assert.equal(subscriptionBitrate({ kind: 'audio', quality: 'high' }, null, 1.5), 192000);
  assert.equal(
    subscriptionBitrate({ kind: 'screen-audio', quality: 'economy' }, null, 1.5),
    288000,
  );
});
test('estimated usage retains the 15-second accrual cap and restores a checkpoint without charging downtime', (t) => {
  const root = temporary(t),
    file = path.join(root, 'usage.json');
  let now = Date.UTC(2026, 9, 21, 12);
  const meter = createRealtimeUsage({ file, now: () => now });
  now += 5000;
  meter.advance(8000000);
  assert.equal(meter.state.bytes, 5000000);
  now += 30000;
  meter.advance(8000000);
  assert.equal(meter.state.bytes, 20000000);
  meter.save();
  now += 300000;
  const resumed = createRealtimeUsage({ file, now: () => now });
  assert.equal(resumed.state.bytes, 20000000);
  assert.equal(resumed.state.loadedFromDisk, true);
  now += 1000;
  resumed.advance(8000000);
  assert.equal(resumed.state.bytes, 21000000);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).bytes, 20000000);
});
test('monthly rollover and old/invalid checkpoints cannot carry stale or malformed byte totals', (t) => {
  const root = temporary(t),
    file = path.join(root, 'usage.json');
  let now = Date.UTC(2026, 9, 31, 23, 59, 50);
  fs.writeFileSync(file, JSON.stringify({ month: '2026-10', bytes: '125' }));
  const meter = createRealtimeUsage({ file, now: () => now });
  assert.equal(meter.state.bytes, 125);
  now = Date.UTC(2026, 10, 1, 0, 0, 1);
  meter.advance(8000000);
  assert.equal(meter.state.month, '2026-11');
  assert.equal(meter.state.bytes, 0);
  assert.equal(meter.state.loadedFromDisk, false);
  assert.equal(monthKeyUTC(now), '2026-11');
  for (const data of [
    null,
    [],
    { month: '2026-10', bytes: 500 },
    { month: '2026-11', bytes: [500] },
    { month: '2026-11', bytes: true },
    { month: '2026-11', bytes: 'Infinity' },
  ]) {
    fs.writeFileSync(file, JSON.stringify(data));
    const next = createRealtimeUsage({ file, now: () => now });
    assert.equal(next.state.bytes, 0);
    assert.equal(next.state.loadedFromDisk, false);
  }
});
test('checkpoint IO failure is nonfatal and independent SFU managers keep a single isolated counter', (t) => {
  const root = temporary(t),
    broken = createRealtimeUsage({ file: root, now: () => Date.UTC(2026, 9, 21) });
  assert.doesNotThrow(() => broken.save());
  let now = Date.UTC(2026, 9, 21, 12);
  t.mock.method(Date, 'now', () => now);
  const make = (name) =>
      new RealtimeSfuManager({
        rooms: new Map(),
        send() {},
        broadcastVoiceRoster() {},
        version: 'fixture',
        env: {},
        usageFile: path.join(root, name),
      }),
    first = make('first.json'),
    second = make('second.json');
  try {
    first.subscriptions.set('one', { estimatedBps: 8000000 });
    now += 5000;
    first._tick();
    second._tick();
    assert.equal(first.usage.bytes, 5000000);
    assert.equal(second.usage.bytes, 0);
    assert.notEqual(first.usage, second.usage);
  } finally {
    first.stop();
    second.stop();
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'first.json'), 'utf8')).bytes, 5000000);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'second.json'), 'utf8')).bytes, 0);
});
