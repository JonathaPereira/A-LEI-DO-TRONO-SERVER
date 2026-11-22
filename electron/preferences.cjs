'use strict';
const fs = require('node:fs/promises'),
  path = require('node:path'),
  crypto = require('node:crypto');
const PRESENCE_STATUSES = new Set(['online', 'away', 'dnd']);
const OVERLAY_CORNERS = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
const DEFAULT_OVERLAY = Object.freeze({
  enabled: false,
  corner: 'top-left',
  opacity: 0.9,
  hideWhenIdle: true,
  shortcut: 'Control+Shift+O',
});
function normalizeOverlay(value, fallback = DEFAULT_OVERLAY) {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const enabled = typeof src.enabled === 'boolean' ? src.enabled : fallback.enabled;
  const corner = OVERLAY_CORNERS.has(src.corner) ? src.corner : fallback.corner;
  const opacityRaw = Number(src.opacity);
  const opacity = Number.isFinite(opacityRaw)
    ? Math.round(Math.max(0.35, Math.min(1, opacityRaw)) * 100) / 100
    : fallback.opacity;
  const hideWhenIdle =
    typeof src.hideWhenIdle === 'boolean' ? src.hideWhenIdle : fallback.hideWhenIdle;
  const shortcut =
    src.shortcut === ''
      ? ''
      : typeof src.shortcut === 'string' &&
          src.shortcut.length <= 40 &&
          /^[A-Za-z0-9+]+$/.test(src.shortcut)
        ? src.shortcut
        : fallback.shortcut;
  return { enabled, corner, opacity, hideWhenIdle, shortcut };
}
// Only the trusted installed frame can reach this store. Authentication is
// protected by the OS keyring/DPAPI; there is no plaintext credential fallback.
class DesktopPreferences {
  constructor(directory, safeStorage) {
    this.directory = directory;
    this.safeStorage = safeStorage;
    this.permissions = new Set();
    this.presenceByAccount = Object.create(null);
    this.overlay = { ...DEFAULT_OVERLAY };
    this.queue = Promise.resolve();
  }
  async load() {
    try {
      const data = JSON.parse(
        await fs.readFile(path.join(this.directory, 'media-permissions.json'), 'utf8'),
      );
      for (const kind of data.allowed || [])
        if (['audio', 'video'].includes(kind)) this.permissions.add(kind);
    } catch {}
    try {
      const settings = JSON.parse(
        await fs.readFile(path.join(this.directory, 'desktop-settings.json'), 'utf8'),
      );
      if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
        if (
          settings.presenceByAccount &&
          typeof settings.presenceByAccount === 'object' &&
          !Array.isArray(settings.presenceByAccount)
        ) {
          for (const [accountId, status] of Object.entries(settings.presenceByAccount)) {
            if (
              typeof accountId === 'string' &&
              accountId.length > 0 &&
              accountId.length <= 128 &&
              PRESENCE_STATUSES.has(status)
            )
              this.presenceByAccount[accountId] = status;
          }
        }
        this.overlay = normalizeOverlay(settings.overlay, DEFAULT_OVERLAY);
      }
    } catch {}
  }
  enqueue(work) {
    const next = this.queue.catch(() => {}).then(work);
    this.queue = next;
    return next;
  }
  async atomic(file, bytes) {
    await fs.mkdir(this.directory, { recursive: true });
    const target = path.join(this.directory, file),
      temporary = target + '.' + crypto.randomUUID() + '.tmp';
    try {
      await fs.writeFile(temporary, bytes, { mode: 0o600 });
      await fs.rename(temporary, target);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
  }
  async saveDesktopSettings() {
    const payload = {
      presenceByAccount: { ...this.presenceByAccount },
      overlay: { ...this.overlay },
    };
    await this.atomic('desktop-settings.json', JSON.stringify(payload));
  }
  getPresenceStatus(accountId) {
    if (typeof accountId !== 'string' || !accountId) return 'online';
    return this.presenceByAccount[accountId] || 'online';
  }
  setPresenceStatus(accountId, status) {
    if (typeof accountId !== 'string' || accountId.length > 128 || !PRESENCE_STATUSES.has(status))
      throw Error('Status de presença inválido.');
    return this.enqueue(async () => {
      if (accountId) {
        this.presenceByAccount[accountId] = status;
        const keys = Object.keys(this.presenceByAccount);
        if (keys.length > 64) delete this.presenceByAccount[keys[0]];
        await this.saveDesktopSettings();
      }
      return status;
    });
  }
  getOverlayConfig() {
    return { ...this.overlay };
  }
  setOverlayConfig(patch) {
    return this.enqueue(async () => {
      this.overlay = normalizeOverlay(patch, this.overlay);
      await this.saveDesktopSettings();
      return { ...this.overlay };
    });
  }
  async grant(types) {
    return this.enqueue(async () => {
      const next = new Set(this.permissions);
      for (const kind of types) if (['audio', 'video'].includes(kind)) next.add(kind);
      await this.atomic('media-permissions.json', JSON.stringify({ allowed: [...next] }));
      this.permissions = next;
    });
  }
  async reset() {
    return this.enqueue(async () => {
      await fs.rm(path.join(this.directory, 'media-permissions.json'), { force: true });
      this.permissions.clear();
    });
  }
  async readSession() {
    await this.queue.catch(() => {});
    if (!this.safeStorage.isEncryptionAvailable()) return null;
    try {
      const bytes = await fs.readFile(path.join(this.directory, 'remembered-session.bin'));
      return this.validate(JSON.parse(this.safeStorage.decryptString(bytes)));
    } catch {
      return null;
    }
  }
  validate(value) {
    if (
      !value?.session?.refresh_token ||
      !value?.session?.access_token ||
      !value?.user?.id ||
      !Number.isFinite(value.session.expires_at)
    )
      throw Error('Sessão inválida.');
    const json = JSON.stringify(value);
    if (
      json.length > 131072 ||
      typeof value.session.refresh_token !== 'string' ||
      typeof value.session.access_token !== 'string' ||
      typeof value.user.id !== 'string'
    )
      throw Error('Sessão inválida.');
    return JSON.parse(json);
  }
  saveSession(value) {
    return this.enqueue(async () => {
      if (!value) {
        await fs.rm(path.join(this.directory, 'remembered-session.bin'), { force: true });
        return { saved: false };
      }
      const data = this.validate(value);
      if (!this.safeStorage.isEncryptionAvailable())
        return {
          saved: false,
          error:
            'O Windows não disponibilizou o armazenamento seguro. Sua sessão vale enquanto o app estiver aberto.',
        };
      await this.atomic(
        'remembered-session.bin',
        this.safeStorage.encryptString(JSON.stringify(data)),
      );
      return { saved: true };
    });
  }
}
module.exports = { DesktopPreferences, DEFAULT_OVERLAY, normalizeOverlay };
