export type AndroidAudioRoute = 'speaker' | 'earpiece' | 'bluetooth';

export interface AndroidBackgroundStatus {
  readonly microphone: boolean;
  readonly notifications: boolean;
  readonly batteryUnrestricted: boolean;
  readonly bluetooth: boolean;
  readonly audioRoute: AndroidAudioRoute;
  readonly bluetoothAvailable: boolean;
  readonly allReady: boolean;
}

export interface AndroidBackgroundPort {
  getBackgroundStatus(): Promise<AndroidBackgroundStatus>;
  requestBackgroundPermissions(): Promise<AndroidBackgroundStatus>;
  requestBatteryExemption(): Promise<AndroidBackgroundStatus>;
  setAudioRoute(route: AndroidAudioRoute): Promise<{
    audioRoute: AndroidAudioRoute;
    bluetoothAvailable?: boolean;
  }>;
}

export interface AndroidPermissionsSnapshot extends AndroidBackgroundStatus {
  readonly supported: boolean;
  readonly checked: boolean;
  readonly busy: boolean;
  readonly modalOpen: boolean;
  readonly dismissed: boolean;
  readonly error: string | null;
}

export interface AndroidPermissionsGuard {
  getSnapshot(): AndroidPermissionsSnapshot;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<AndroidPermissionsSnapshot>;
  configureAll(): Promise<AndroidPermissionsSnapshot>;
  requestRuntimePermissions(): Promise<AndroidPermissionsSnapshot>;
  requestBatteryExemption(): Promise<AndroidPermissionsSnapshot>;
  setAudioRoute(route: AndroidAudioRoute): Promise<AndroidAudioRoute>;
  cycleAudioRoute(): Promise<AndroidAudioRoute>;
  openModal(): void;
  dismissModal(): void;
}

function normalizeRoute(value: unknown): AndroidAudioRoute {
  return value === 'earpiece' || value === 'bluetooth' ? value : 'speaker';
}

function normalizeStatus(
  raw: Partial<AndroidBackgroundStatus> | null | undefined,
): AndroidBackgroundStatus {
  const microphone = raw?.microphone === true;
  const notifications = raw?.notifications === true;
  const batteryUnrestricted = raw?.batteryUnrestricted === true;
  const bluetooth = raw?.bluetooth !== false;
  const audioRoute = normalizeRoute(raw?.audioRoute);
  const bluetoothAvailable = raw?.bluetoothAvailable === true;
  const allReady =
    typeof raw?.allReady === 'boolean'
      ? raw.allReady
      : microphone && notifications && batteryUnrestricted && bluetooth;
  return Object.freeze({
    microphone,
    notifications,
    batteryUnrestricted,
    bluetooth,
    audioRoute,
    bluetoothAvailable,
    allReady,
  });
}

export function audioRouteLabel(route: AndroidAudioRoute): string {
  if (route === 'bluetooth') return 'Bluetooth';
  if (route === 'earpiece') return 'Auricular';
  return 'Viva-voz';
}

/**
 * Owns Android startup permission checks (Microphone, Notifications, Battery exemption, Bluetooth)
 * and native call audio output route switching. Prompts automatically on launch whenever a
 * background-call permission is missing on Android.
 */
export function createAndroidPermissionsGuard({
  host,
}: {
  host: AndroidBackgroundPort | null | undefined;
}): AndroidPermissionsGuard {
  const supported =
    !!host &&
    typeof host.getBackgroundStatus === 'function' &&
    typeof host.requestBackgroundPermissions === 'function' &&
    typeof host.requestBatteryExemption === 'function';

  const listeners = new Set<() => void>();
  let snapshot: AndroidPermissionsSnapshot = Object.freeze({
    supported,
    checked: !supported,
    busy: false,
    modalOpen: false,
    dismissed: false,
    error: null,
    microphone: !supported,
    notifications: !supported,
    batteryUnrestricted: !supported,
    bluetooth: true,
    audioRoute: 'speaker',
    bluetoothAvailable: false,
    allReady: !supported,
  });

  function emit(patch: Partial<AndroidPermissionsSnapshot>) {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    for (const listener of listeners) listener();
    return snapshot;
  }

  function applyStatus(
    raw: Partial<AndroidBackgroundStatus> | null | undefined,
    { allowAutoOpen }: { allowAutoOpen: boolean },
  ) {
    const status = normalizeStatus(raw);
    const shouldAutoOpen = allowAutoOpen && !status.allReady && !snapshot.dismissed;
    const modalOpen = status.allReady ? false : shouldAutoOpen || snapshot.modalOpen;
    return emit({
      ...status,
      checked: true,
      busy: false,
      modalOpen,
      error: null,
    });
  }

  async function refresh(): Promise<AndroidPermissionsSnapshot> {
    if (!supported || !host) return snapshot;
    try {
      const raw = await host.getBackgroundStatus();
      return applyStatus(raw, { allowAutoOpen: true });
    } catch {
      return emit({ checked: true, busy: false });
    }
  }

  async function requestRuntimePermissions(): Promise<AndroidPermissionsSnapshot> {
    if (!supported || !host) return snapshot;
    emit({ busy: true, error: null });
    try {
      const raw = await host.requestBackgroundPermissions();
      return applyStatus(raw, { allowAutoOpen: false });
    } catch (error) {
      return emit({
        busy: false,
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível solicitar as permissões do Android.',
      });
    }
  }

  async function requestBatteryExemption(): Promise<AndroidPermissionsSnapshot> {
    if (!supported || !host) return snapshot;
    emit({ busy: true, error: null });
    try {
      const raw = await host.requestBatteryExemption();
      return applyStatus(raw, { allowAutoOpen: false });
    } catch (error) {
      return emit({
        busy: false,
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível abrir o ajuste de bateria do Android.',
      });
    }
  }

  async function configureAll(): Promise<AndroidPermissionsSnapshot> {
    if (!supported || !host) return snapshot;
    emit({ busy: true, error: null });
    try {
      let current = normalizeStatus(await host.requestBackgroundPermissions());
      emit({ ...current, checked: true });
      if (!current.batteryUnrestricted) {
        current = normalizeStatus(await host.requestBatteryExemption());
      }
      return applyStatus(current, { allowAutoOpen: false });
    } catch (error) {
      return emit({
        busy: false,
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível concluir a liberação em segundo plano.',
      });
    }
  }

  async function setAudioRoute(route: AndroidAudioRoute): Promise<AndroidAudioRoute> {
    const next = normalizeRoute(route);
    if (!host || typeof host.setAudioRoute !== 'function') {
      emit({ audioRoute: next });
      return next;
    }
    try {
      const result = await host.setAudioRoute(next);
      const applied = normalizeRoute(result?.audioRoute ?? next);
      emit({
        audioRoute: applied,
        bluetoothAvailable:
          typeof result?.bluetoothAvailable === 'boolean'
            ? result.bluetoothAvailable
            : snapshot.bluetoothAvailable,
      });
      return applied;
    } catch {
      return snapshot.audioRoute;
    }
  }

  async function cycleAudioRoute(): Promise<AndroidAudioRoute> {
    const order: AndroidAudioRoute[] = snapshot.bluetoothAvailable
      ? ['speaker', 'bluetooth', 'earpiece']
      : ['speaker', 'earpiece'];
    const idx = order.indexOf(snapshot.audioRoute);
    const next = order[(idx + 1) % order.length] ?? 'speaker';
    return setAudioRoute(next);
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    configureAll,
    requestRuntimePermissions,
    requestBatteryExemption,
    setAudioRoute,
    cycleAudioRoute,
    openModal() {
      if (!supported) return;
      emit({ modalOpen: true, dismissed: false });
      void refresh();
    },
    dismissModal() {
      emit({ modalOpen: false, dismissed: true });
    },
  };
}
