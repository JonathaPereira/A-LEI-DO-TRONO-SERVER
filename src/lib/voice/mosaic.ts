import type { StageSnapshot } from './stage';

export interface MosaicPerson {
  id: string;
  name: string;
  self: boolean;
  cameraOffered: boolean;
  screenOffered: boolean;
  cameraHidden: boolean;
  watching: boolean;
  camera: MediaStream | null;
  screen: MediaStream | null;
}
export function getMosaicSources(stage: StageSnapshot): readonly MosaicPerson[] {
  return Object.freeze(
    stage.participants
      .filter((p) => p.camera || p.screen)
      .map((p) =>
        Object.freeze({
          id: p.id,
          name: p.name,
          self: p.self,
          cameraOffered: p.camera,
          screenOffered: p.screen,
          cameraHidden: p.hiddenCamera,
          watching: p.watching,
          camera: p.camera && !p.hiddenCamera ? p.cameraStream : null,
          screen: p.screen && p.watching ? p.screenStream : null,
        }),
      ),
  );
}
export const hasLiveVideo = (stream: MediaStream | null) =>
  !!stream?.getVideoTracks().some((track) => track.readyState === 'live');

interface MosaicOptions {
  read(): { generation: number; joined: boolean; people: readonly MosaicPerson[] };
  subscribe(listener: () => void): () => void;
  closeDialog(): void;
  fullscreen(id: string, kind: 'camera' | 'screen'): unknown;
  toggleScreen(id: string): unknown;
  toggleCamera(id: string): unknown;
}
/** Owns only the open selection. All streams and watching preferences are borrowed. */
export function createMosaic(options: MosaicOptions) {
  let open = false,
    generation: number | undefined,
    selected = new Set<string>();
  let disposed = false,
    unsubscribe: (() => void) | undefined;
  const listeners = new Set<() => void>();
  function read() {
    const source = options.read();
    if (!source.joined || (generation !== undefined && generation !== source.generation)) {
      open = false;
      selected.clear();
      options.closeDialog();
    }
    generation = source.generation;
    const people = source.people,
      ids = new Set(people.map((p) => p.id));
    selected = new Set([...selected].filter((id) => ids.has(id)));
    return Object.freeze({
      open,
      people,
      selected: Object.freeze([...selected]),
      visible: Object.freeze(open ? people.filter((p) => selected.has(p.id)) : []),
    });
  }
  let snapshot: ReturnType<typeof read> | undefined;
  const getSnapshot = () => (snapshot ??= read());
  function refresh() {
    if (disposed) return;
    snapshot = read();
    for (const listener of listeners) listener();
  }
  function close() {
    if (disposed) return;
    open = false;
    selected.clear();
    // Leave the native top layer synchronously, before requesting fullscreen.
    options.closeDialog();
    refresh();
  }
  function fullscreen(id?: string, kind?: 'camera' | 'screen') {
    if (disposed) return;
    refresh();
    const person = getSnapshot().visible.find(
      (p) =>
        (!id || p.id === id) &&
        (kind ? hasLiveVideo(p[kind]) : hasLiveVideo(p.screen) || hasLiveVideo(p.camera)),
    );
    if (!person) return;
    const media = kind ?? (hasLiveVideo(person.screen) ? 'screen' : 'camera');
    close();
    return options.fullscreen(person.id, media);
  }
  return {
    getSnapshot,
    refresh,
    close,
    fullscreen,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (!disposed && !unsubscribe) {
        unsubscribe = options.subscribe(refresh);
        refresh();
      }
    },
    open(id?: string) {
      if (disposed) return;
      refresh();
      if (!options.read().joined) return;
      const people = getSnapshot().people;
      selected = new Set(
        (id ? people.filter((p) => p.id === id) : people.slice(0, 6)).map((p) => p.id),
      );
      open = true;
      refresh();
    },
    select(id: string, include: boolean) {
      if (disposed || !open) return;
      refresh();
      if (!open || !getSnapshot().people.some((p) => p.id === id)) return;
      if (!include) selected.delete(id);
      else if (selected.size < 6) selected.add(id);
      refresh();
    },
    toggleScreen(id: string) {
      if (!disposed && open && getSnapshot().people.some((p) => p.id === id && p.screenOffered))
        return options.toggleScreen(id);
    },
    toggleCamera(id: string) {
      if (
        !disposed &&
        open &&
        getSnapshot().people.some((p) => p.id === id && !p.self && p.cameraOffered)
      )
        return options.toggleCamera(id);
    },
    dispose() {
      if (disposed) return;
      close();
      disposed = true;
      unsubscribe?.();
      listeners.clear();
    },
  };
}
export type Mosaic = ReturnType<typeof createMosaic>;
