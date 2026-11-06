'use strict';
const { installVoiceTestModules } = require('./voice-test-modules.cjs');
const assert = require('node:assert/strict'),
  os = require('node:os');
async function exerciseVoiceProtection({ app, page }) {
  const metrics = () =>
    app.evaluate(({ app }) => {
      const os = process.getBuiltinModule('node:os');
      return app.getAppMetrics().map((r) => {
        let priority = null;
        try {
          priority = os.getPriority(r.pid);
        } catch {}
        return {
          pid: r.pid,
          creationTime: r.creationTime,
          type: r.type,
          name: r.name,
          serviceName: r.serviceName,
          priority,
        };
      });
    });
  const original = await metrics();
  try {
    const state = await page.evaluate(() => window.TronoDesktop.setVoiceProtection(true));
    assert.equal(state.active, true);
    assert(['managed', 'system', 'waiting', 'unavailable'].includes(state.status));
    const during = await metrics();
    for (const row of during) {
      const before = original.find((r) => r.pid === row.pid && r.creationTime === row.creationTime);
      if (
        !before ||
        before.priority === null ||
        row.priority === null ||
        before.priority === row.priority
      )
        continue;
      assert.equal(row.type, 'Utility');
      assert(row.serviceName === 'audio.mojom.AudioService' || row.name === 'Audio Service');
      assert(row.priority <= os.constants.priority.PRIORITY_ABOVE_NORMAL);
    }
    await page.evaluate(() => window.TronoDesktop.setVoiceProtection(false));
    for (const row of await metrics()) {
      const before = original.find((r) => r.pid === row.pid && r.creationTime === row.creationTime);
      if (before && before.priority !== null && row.priority !== null)
        assert.equal(row.priority, before.priority, 'Service priority restored after the call');
    }
    await installVoiceTestModules(page, ['createVoiceTelemetry']);
    const receiver = await page.evaluate(() => {
      const pc = new RTCPeerConnection(),
        r = pc.addTransceiver('audio', { direction: 'recvonly' }).receiver,
        policy = window.__voiceTestModules.createVoiceTelemetry({
          protection: true,
          getSettings: () => ({ joined: true }),
          getConnections: () => [['p2p:probe', pc]],
          getLocalVideo: () => undefined,
          onSample: async () => {},
          onChange: () => {},
        }),
        original = r.jitterBufferTarget;
      try {
        policy.registerReceiver('probe', r);
        const requested = r.jitterBufferTarget;
        policy.configureProtection(false);
        return {
          supported: 'jitterBufferTarget' in r,
          requested,
          original,
          restored: r.jitterBufferTarget,
        };
      } finally {
        policy.reset();
        pc.close();
      }
    });
    assert(receiver.supported, 'Modern Windows WebRTC exposes the receive margin API');
    assert.equal(receiver.requested, 60);
    assert.equal(receiver.restored, receiver.original);
    await assert.rejects(
      page.evaluate(() => window.TronoDesktop.setVoiceProtection({ pid: 1, priority: -20 })),
    );
  } finally {
    await page.evaluate(() => window.TronoDesktop.setVoiceProtection(false));
  }
}
module.exports = { exerciseVoiceProtection };
