'use strict';
const fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { pathToFileURL } = require('node:url');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_EXTENSIONS = Object.freeze({
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
});
function readImageUrl(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 4096) throw Error('Invalid notification image');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw Error('Invalid notification image');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
    throw Error('Invalid notification image');
  return parsed.href;
}
function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (ch) => {
    switch (ch) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}
function buildWindowsToastXml({ title, body, imagePath }) {
  const imageTag = imagePath
    ? `<image placement="hero" src="${escapeXml(pathToFileURL(imagePath).href)}"/>`
    : '';
  return (
    `<toast>` +
    `<visual><binding template="ToastGeneric">` +
    `<text>${escapeXml(title)}</text>` +
    `<text>${escapeXml(body)}</text>` +
    imageTag +
    `</binding></visual>` +
    `<audio silent="true"/>` +
    `</toast>`
  );
}
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
  const imageUrl = readImageUrl(value.imageUrl);
  return {
    key: value.key,
    title: value.title.slice(0, 100),
    body: value.body.slice(0, 220),
    ...(imageUrl ? { imageUrl } : {}),
    preview: value.preview === true,
    target: { type: target.type, id: target.id, accountId: target.accountId },
  };
}
function createNotifications({
  Notification,
  window,
  activate,
  now = Date.now,
  isDnd = () => false,
  platform = process.platform,
  cacheDir = path.join(os.tmpdir(), 'mn-trono-notification-images'),
  fetchImage = typeof fetch === 'function' ? fetch : null,
}) {
  const seen = new Map(),
    active = new Set(),
    cachedFiles = new Map();
  let timestamps = [],
    disposed = false;

  async function downloadImage(imageUrl) {
    if (!fetchImage || disposed) return null;
    try {
      const response = await fetchImage(imageUrl, {
        signal: AbortSignal.timeout(2500),
        redirect: 'follow',
      });
      if (!response?.ok) return null;
      const mime = String(response.headers?.get?.('content-type') || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      const ext = IMAGE_EXTENSIONS[mime];
      if (!ext) return null;
      const lengthHeader = Number(response.headers?.get?.('content-length') || 0);
      if (lengthHeader > MAX_IMAGE_BYTES) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || disposed) return null;
      await fs.mkdir(cacheDir, { recursive: true });
      const filePath = path.join(cacheDir, `${crypto.randomUUID()}${ext}`);
      await fs.writeFile(filePath, bytes, { mode: 0o600 });
      cachedFiles.set(filePath, now());
      for (const [oldFile, createdAt] of cachedFiles) {
        if (now() - createdAt > 300000 || cachedFiles.size > 16) {
          cachedFiles.delete(oldFile);
          void fs.rm(oldFile, { force: true }).catch(() => {});
        }
      }
      return filePath;
    } catch {
      return null;
    }
  }

  function showToast(data, imagePath) {
    if (disposed) return { shown: false, reason: 'disposed' };
    const options =
      platform === 'win32' && imagePath
        ? { toastXml: buildWindowsToastXml({ title: data.title, body: data.body, imagePath }) }
        : { title: data.title, body: data.body, silent: true };
    const toast = new Notification(options);
    active.add(toast);
    toast.on('click', () => activate(data.target));
    toast.on('close', () => active.delete(toast));
    toast.show();
    return { shown: true, hasImage: !!imagePath };
  }

  function notify(value) {
    const data = notificationPayload(value),
      stamp = now();
    if (!data.preview && isDnd()) return { shown: false, reason: 'dnd' };
    if (!data.preview && window.isFocused() && window.isVisible())
      return { shown: false, reason: 'focused' };
    if (!Notification.isSupported()) return { shown: false, reason: 'unsupported' };
    for (const [key, at] of seen) if (stamp - at > 300000) seen.delete(key);
    timestamps = timestamps.filter((at) => stamp - at < 60000);
    if (seen.has(data.key) || timestamps.length >= 6) return { shown: false, reason: 'limited' };
    seen.set(data.key, stamp);
    timestamps.push(stamp);
    if (data.imageUrl && platform === 'win32' && fetchImage) {
      return downloadImage(data.imageUrl).then((imagePath) => showToast(data, imagePath));
    }
    return showToast(data, null);
  }
  return {
    notify,
    dispose() {
      disposed = true;
      for (const toast of active) toast.close();
      active.clear();
      for (const file of cachedFiles.keys()) void fs.rm(file, { force: true }).catch(() => {});
      cachedFiles.clear();
    },
  };
}
module.exports = { notificationPayload, createNotifications, buildWindowsToastXml };
