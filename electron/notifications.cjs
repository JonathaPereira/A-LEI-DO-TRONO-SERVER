'use strict';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function notificationPayload(value) {
  if (
    !value ||
    typeof value.key !== 'string' ||
    value.key.length > 160 ||
    typeof value.title !== 'string' ||
    typeof value.body !== 'string'
  )
    throw Error('Invalid notification');
  const target = value.target;
  if (
    !target ||
    !UUID.test(target.accountId) ||
    !['channel', 'direct', 'friends'].includes(target.type)
  )
    throw Error('Invalid notification target');
  if (
    target.type === 'channel'
      ? !/^(chat-[a-z0-9-]+|channel-[0-9a-f-]{36})$/i.test(target.id)
      : !UUID.test(target.id)
  )
    throw Error('Invalid notification target');
  return {
    key: value.key,
    title: value.title.slice(0, 100),
    body: value.body.slice(0, 220),
    target: { type: target.type, id: target.id, accountId: target.accountId },
  };
}
function createNotifications({ Notification, window, activate, now = Date.now }) {
  const seen = new Map(),
    active = new Set();
  let timestamps = [];
  function notify(value) {
    const data = notificationPayload(value),
      stamp = now();
    if (window.isFocused() && window.isVisible()) return { shown: false, reason: 'focused' };
    if (!Notification.isSupported()) return { shown: false, reason: 'unsupported' };
    for (const [key, at] of seen) if (stamp - at > 300000) seen.delete(key);
    timestamps = timestamps.filter((at) => stamp - at < 60000);
    if (seen.has(data.key) || timestamps.length >= 6) return { shown: false, reason: 'limited' };
    seen.set(data.key, stamp);
    timestamps.push(stamp);
    const toast = new Notification({ title: data.title, body: data.body, silent: true });
    active.add(toast);
    toast.on('click', () => activate(data.target));
    toast.on('close', () => active.delete(toast));
    toast.show();
    return { shown: true };
  }
  return {
    notify,
    dispose() {
      for (const toast of active) toast.close();
      active.clear();
    },
  };
}
module.exports = { notificationPayload, createNotifications };
