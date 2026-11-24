export type AndroidUpdateStatus =
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'permission_required'
  | 'error';

export interface AndroidUpdateState {
  readonly status: AndroidUpdateStatus;
  readonly version?: string;
  readonly sha256?: string;
  readonly message?: string;
  readonly percent?: number;
  readonly releaseUrl?: string;
}

export interface AndroidUpdateSnapshot {
  readonly state: AndroidUpdateState;
  readonly currentVersion: string;
  readonly visible: boolean;
  readonly checking: boolean;
  readonly downloading: boolean;
  readonly installing: boolean;
}

export interface AndroidReleaseCandidate {
  readonly version: string;
  readonly tag: string;
  readonly apkName: string;
  readonly apkUrl: string;
  readonly checksumUrl: string;
  readonly releaseUrl: string;
}

export interface AndroidUpdatePort {
  readonly version: string;
  getUpdateState(): Promise<unknown>;
  onUpdateState(listener: (value: unknown) => void): (() => void) | void;
  checkUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  installUpdate(): Promise<unknown>;
  openUpdateDownload?(): Promise<unknown>;
}

const ALLOWED_UPDATE_HOSTS = new Set([
  'api.github.com',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'a-lei-do-trono.surge.sh',
]);

const VALID_STATUSES = new Set<AndroidUpdateStatus>([
  'idle',
  'checking',
  'current',
  'available',
  'downloading',
  'verifying',
  'ready',
  'permission_required',
  'error',
]);

const SEMVER_PATTERN = /^(?:android-)?v?(\d+)\.(\d+)\.(\d+)$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function parseSemver(raw: unknown): readonly [number, number, number] | null {
  if (typeof raw !== 'string') return null;
  const match = SEMVER_PATTERN.exec(raw.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareSemver(a: string, b: string): number | null {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}

export function isAllowedUpdateUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    return ALLOWED_UPDATE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function parseSha256Sums(content: string, filename: string): string | null {
  if (typeof content !== 'string' || typeof filename !== 'string' || !filename.trim()) return null;
  const expectedName = filename.trim();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = /^([a-f0-9]{64})\s+\*?(.+)$/i.exec(line);
    if (!match) continue;
    if (match[2].trim() === expectedName) return match[1].toLowerCase();
  }
  return null;
}

export function verifySha256Hex(expectedHex: string, actualHex: string): boolean {
  if (typeof expectedHex !== 'string' || typeof actualHex !== 'string') return false;
  const expected = expectedHex.trim().toLowerCase();
  const actual = actualHex.trim().toLowerCase();
  if (!SHA256_PATTERN.test(expected) || !SHA256_PATTERN.test(actual)) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return diff === 0;
}

export function selectAndroidRelease(
  releases: unknown,
  currentVersion: string,
): AndroidReleaseCandidate | null {
  if (!Array.isArray(releases) || !parseSemver(currentVersion)) return null;
  let best: AndroidReleaseCandidate | null = null;
  for (const entry of releases) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    if (item.draft === true || item.prerelease === true) continue;
    const tag = typeof item.tag_name === 'string' ? item.tag_name.trim() : '';
    if (!tag.startsWith('android-v')) continue;
    const version = tag.slice('android-v'.length);
    const cmpCurrent = compareSemver(version, currentVersion);
    if (cmpCurrent === null || cmpCurrent <= 0) continue;
    if (best) {
      const cmpBest = compareSemver(version, best.version);
      if (cmpBest === null || cmpBest <= 0) continue;
    }
    const assets = Array.isArray(item.assets) ? item.assets : [];
    const expectedApkName = `MN-Trono-${version}-Android.apk`;
    let apkAsset: { name: string; url: string } | null = null;
    let sumAssetUrl = '';
    for (const rawAsset of assets) {
      if (!rawAsset || typeof rawAsset !== 'object' || Array.isArray(rawAsset)) continue;
      const asset = rawAsset as Record<string, unknown>;
      const name = typeof asset.name === 'string' ? asset.name.trim() : '';
      const url = typeof asset.browser_download_url === 'string' ? asset.browser_download_url : '';
      if (!isAllowedUpdateUrl(url)) continue;
      if (name === expectedApkName) apkAsset = { name, url };
      if (name === 'SHA256SUMS.txt') sumAssetUrl = url;
    }
    const releaseUrl =
      typeof item.html_url === 'string' && isAllowedUpdateUrl(item.html_url)
        ? item.html_url
        : `https://github.com/JonathaPereira/A-LEI-DO-TRONO-SERVER/releases/tag/${tag}`;
    if (!apkAsset || !sumAssetUrl) continue;
    best = Object.freeze({
      version,
      tag,
      apkName: apkAsset.name,
      apkUrl: apkAsset.url,
      checksumUrl: sumAssetUrl,
      releaseUrl,
    });
  }
  return best;
}

function parseState(value: unknown): AndroidUpdateState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (!VALID_STATUSES.has(item.status as AndroidUpdateStatus)) return null;
  if (item.version !== undefined && (typeof item.version !== 'string' || !item.version.trim()))
    return null;
  if (item.message !== undefined && typeof item.message !== 'string') return null;
  if (
    item.sha256 !== undefined &&
    (typeof item.sha256 !== 'string' || !SHA256_PATTERN.test(item.sha256.trim()))
  )
    return null;
  if (
    item.percent !== undefined &&
    (typeof item.percent !== 'number' ||
      !Number.isFinite(item.percent) ||
      item.percent < 0 ||
      item.percent > 100)
  )
    return null;
  if (item.releaseUrl !== undefined && !isAllowedUpdateUrl(item.releaseUrl)) return null;
  return Object.freeze({
    status: item.status as AndroidUpdateStatus,
    ...(typeof item.version === 'string' ? { version: item.version.trim() } : {}),
    ...(typeof item.sha256 === 'string' ? { sha256: item.sha256.trim().toLowerCase() } : {}),
    ...(typeof item.message === 'string' ? { message: item.message } : {}),
    ...(typeof item.percent === 'number' ? { percent: Math.round(item.percent) } : {}),
    ...(typeof item.releaseUrl === 'string' ? { releaseUrl: item.releaseUrl } : {}),
  });
}

/** Single-owner renderer projection for native Android APK updates with SHA-256 verification. */
export function createAndroidUpdates(native: AndroidUpdatePort) {
  let snapshot: AndroidUpdateSnapshot = Object.freeze({
    state: Object.freeze({ status: 'idle' }),
    currentVersion: native.version || '0.0.0',
    visible: false,
    checking: false,
    downloading: false,
    installing: false,
  });
  let started = false,
    disposed = false,
    manual = false,
    revision = 0;
  let off: (() => void) | void;
  const listeners = new Set<() => void>();

  function update(patch: Partial<AndroidUpdateSnapshot>) {
    if (disposed) return;
    snapshot = Object.freeze({ ...snapshot, ...patch });
    for (const listener of listeners) listener();
  }

  function accept(value: unknown, revealOnActionable = true) {
    if (disposed) return false;
    const state = parseState(value);
    if (!state) return false;
    revision++;
    const actionable =
      state.status === 'available' ||
      state.status === 'downloading' ||
      state.status === 'verifying' ||
      state.status === 'ready' ||
      state.status === 'permission_required';
    update({
      state,
      currentVersion: native.version || snapshot.currentVersion,
      visible: snapshot.visible || manual || (revealOnActionable && actionable),
      downloading: state.status === 'downloading' || state.status === 'verifying',
    });
    return true;
  }

  async function read() {
    const expected = revision;
    try {
      const value = await native.getUpdateState();
      if (!disposed && revision === expected) accept(value, true);
    } catch {
      // Keep last confirmed native state.
    }
  }

  async function runCheck(silent: boolean) {
    if (!started || disposed || snapshot.checking || snapshot.downloading || snapshot.installing)
      return;
    if (!silent) manual = true;
    update({ visible: silent ? snapshot.visible : true, checking: true });
    const expected = ++revision;
    try {
      const value = await native.checkUpdates();
      if (!disposed && revision === expected) {
        const parsed = parseState(value);
        if (parsed) {
          if (silent && parsed.status === 'error') {
            // Silent startup checks never nag the user on offline/transient failures.
            return;
          }
          accept(parsed, true);
        } else if (!silent) {
          accept({ status: 'error', message: 'Não foi possível verificar atualizações agora.' });
        }
      }
    } catch {
      if (!disposed && revision === expected && !silent) {
        accept({ status: 'error', message: 'Não foi possível verificar atualizações agora.' });
      }
    } finally {
      update({ checking: false });
    }
  }

  async function download(): Promise<boolean> {
    if (!started || disposed || snapshot.downloading || snapshot.installing) return false;
    manual = true;
    update({ visible: true, downloading: true });
    const expected = ++revision;
    try {
      const value = await native.downloadUpdate();
      if (disposed) return false;
      if (revision === expected) {
        if (!accept(value, true)) {
          accept({
            status: 'error',
            message: 'Não foi possível baixar e verificar a atualização.',
          });
          return false;
        }
      }
      return snapshot.state.status === 'ready';
    } catch (error) {
      if (!disposed) {
        accept({
          status: 'error',
          message:
            error instanceof Error && error.message
              ? error.message
              : 'Falha ao baixar ou validar o SHA-256 da atualização.',
        });
      }
      return false;
    } finally {
      update({ downloading: false });
    }
  }

  async function install(): Promise<void> {
    if (
      !started ||
      disposed ||
      snapshot.installing ||
      snapshot.downloading ||
      (snapshot.state.status !== 'ready' && snapshot.state.status !== 'permission_required')
    )
      return;
    manual = true;
    update({ visible: true, installing: true });
    const expected = ++revision;
    try {
      const result = await native.installUpdate();
      if (!disposed && revision === expected && result && typeof result === 'object') {
        const record = result as Record<string, unknown>;
        if (record.permissionRequired === true) {
          accept({
            status: 'permission_required',
            version: snapshot.state.version,
            sha256: snapshot.state.sha256,
            message:
              'Autorize "Instalar apps desconhecidos" para o MN Trono e toque novamente em Instalar.',
          });
        }
      }
    } catch (error) {
      if (!disposed && revision === expected) {
        accept({
          status: 'error',
          version: snapshot.state.version,
          message:
            error instanceof Error && error.message
              ? error.message
              : 'Não foi possível abrir o instalador nativo do Android.',
        });
      }
    } finally {
      update({ installing: false });
    }
  }

  async function downloadAndInstall(): Promise<void> {
    if (snapshot.state.status === 'ready' || snapshot.state.status === 'permission_required') {
      await install();
      return;
    }
    const ready = await download();
    if (ready && !disposed) await install();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (started || disposed) return;
      started = true;
      off = native.onUpdateState((value) => {
        accept(value, true);
      });
      void read().then(() => {
        if (!disposed && snapshot.state.status === 'idle') {
          void runCheck(true);
        }
      });
    },
    check: () => runCheck(false),
    download,
    install,
    downloadAndInstall,
    async openDownload() {
      if (disposed) return;
      try {
        await native.openUpdateDownload?.();
      } catch {}
    },
    close() {
      if (disposed) return;
      manual = false;
      update({ visible: false });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      revision++;
      off?.();
      listeners.clear();
    },
  };
}

export type AndroidUpdates = ReturnType<typeof createAndroidUpdates>;

export function androidUpdatePresentation(snapshot: AndroidUpdateSnapshot) {
  const state = snapshot.state;
  const versionLabel = state.version ? `v${state.version}` : 'nova versão';
  const ready = state.status === 'ready' || state.status === 'permission_required';
  const available = state.status === 'available';

  let text = state.message || 'Verificar atualizações do aplicativo Android.';
  if (state.status === 'checking') text = 'Buscando a versão mais recente do Android…';
  else if (state.status === 'current') text = 'Você já está na versão mais recente do Android.';
  else if (state.status === 'available')
    text = `Nova versão ${versionLabel} disponível (verificação SHA-256 automática antes de instalar).`;
  else if (state.status === 'downloading')
    text = `Baixando ${versionLabel} · ${state.percent ?? 0}%`;
  else if (state.status === 'verifying')
    text = `Verificando integridade SHA-256 de ${versionLabel}…`;
  else if (state.status === 'ready')
    text =
      state.message ||
      `Atualização ${versionLabel} verificada (SHA-256 OK) e pronta para instalar.`;
  else if (state.status === 'permission_required')
    text =
      state.message ||
      'Autorize "Instalar apps desconhecidos" para o MN Trono e toque novamente em Instalar.';

  const actionLabel = ready
    ? state.version
      ? `Instalar v${state.version}`
      : 'Instalar atualização'
    : available
      ? state.version
        ? `Atualizar para v${state.version}`
        : 'Baixar e instalar'
      : 'Buscar atualizações';

  return {
    text,
    ready,
    available,
    actionLabel,
    versionLabel,
  };
}
