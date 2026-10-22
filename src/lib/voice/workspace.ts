import type { AvatarAppearance } from '../../types/domain';

export interface WorkspacePerson extends AvatarAppearance {
  readonly id: string;
  readonly name: string;
  readonly unread: number;
}
export interface WorkspaceSource {
  active: boolean;
  layout: 'original' | 'discord';
  roomName: string;
  directVisible: boolean;
  drawerOpen: boolean;
  width: number;
}
interface WorkspaceSnapshot extends Readonly<WorkspaceSource> {
  readonly headerCollapsed: boolean;
  readonly sidebarOpen: boolean;
  readonly people: readonly WorkspacePerson[];
  readonly unread: number;
}
interface WorkspaceOptions {
  events: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  read(): WorkspaceSource;
  subscribeSource(listener: () => void): () => void;
  accountId(): string | null;
  readHeader(): unknown;
  saveHeader(collapsed: boolean): void;
  resize(): void;
  authReady: Promise<unknown>;
  openDirect(id?: string): void;
  openGames(): void;
  applyLayout(layout: WorkspaceSource['layout']): void;
}
const emptyPeople: readonly WorkspacePerson[] = Object.freeze([]);
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const count = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

/** A projection of the existing messenger, never a second inbox or request owner. */
function readDirect(value: unknown, account: string | null) {
  const data = record(value);
  if (!account || data?.accountId !== account || !Array.isArray(data.people) || !count(data.unread))
    return null;
  const people: WorkspacePerson[] = [],
    ids = new Set<string>();
  for (const value of data.people) {
    const person = record(value);
    if (
      !person ||
      typeof person.id !== 'string' ||
      !person.id ||
      ids.has(person.id) ||
      typeof person.name !== 'string' ||
      !count(person.unread) ||
      (person.avatar_preset != null && typeof person.avatar_preset !== 'string') ||
      (person.avatar_file_id != null && typeof person.avatar_file_id !== 'string')
    )
      return null;
    ids.add(person.id);
    if (people.length < 7)
      people.push(
        Object.freeze({
          id: person.id,
          name: person.name,
          unread: person.unread,
          avatar_preset:
            typeof person.avatar_preset === 'string' ? person.avatar_preset : undefined,
          avatar_file_id: person.avatar_file_id as string | null | undefined,
        }),
      );
  }
  return { people: Object.freeze(people), unread: data.unread };
}

/** Owns workspace presentation only; navigation, preferences and messages keep their owners. */
export function createCallWorkspace(options: WorkspaceOptions) {
  let account = options.accountId(),
    disposed = false,
    started = false;
  let state: WorkspaceSnapshot = Object.freeze({
    ...options.read(),
    headerCollapsed: options.readHeader() === true,
    sidebarOpen: false,
    people: emptyPeople,
    unread: 0,
  });
  const listeners = new Set<() => void>(),
    cleanup: (() => void)[] = [];
  function update(patch: Partial<typeof state>) {
    if (
      disposed ||
      !Object.entries(patch).some(([key, value]) => state[key as keyof typeof state] !== value)
    )
      return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) listener();
  }
  function refresh() {
    const source = options.read();
    update({ ...source, ...(!source.active ? { sidebarOpen: false } : {}) });
  }
  function readHeader() {
    update({ headerCollapsed: options.readHeader() === true });
  }
  function authChange() {
    const next = options.accountId();
    if (next !== account) {
      account = next;
      update({ people: emptyPeople, unread: 0, sidebarOpen: false });
    }
    readHeader();
  }
  function listen(name: string, listener: EventListener) {
    options.events.addEventListener(name, listener);
    cleanup.push(() => options.events.removeEventListener(name, listener));
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    start() {
      if (started || disposed) return;
      started = true;
      cleanup.push(options.subscribeSource(refresh));
      listen('trono-layout-change', refresh);
      listen('resize', () => {
        refresh();
        if (state.width >= 1100) update({ sidebarOpen: false });
      });
      listen('trono-auth-change', authChange);
      listen('trono-personal-change', (event) => {
        if (record((event as CustomEvent<unknown>).detail)?.key === 'workspaceHeaderCollapsed')
          readHeader();
      });
      listen('trono-direct-change', (event) => {
        // The messenger includes the account that produced this projection.
        const direct = readDirect((event as CustomEvent<unknown>).detail, options.accountId());
        if (direct) {
          if (account !== options.accountId()) authChange();
          update(direct);
        }
      });
      void options.authReady.then(() => {
        if (!disposed) authChange();
      });
      refresh();
    },
    toggleHeader() {
      if (disposed) return;
      const collapsed = !state.headerCollapsed;
      update({ headerCollapsed: collapsed });
      options.saveHeader(collapsed);
      options.resize();
    },
    toggleSidebar() {
      if (state.active) update({ sidebarOpen: !state.sidebarOpen });
    },
    closeSidebar() {
      update({ sidebarOpen: false });
    },
    openDirect(id?: string) {
      if (disposed) return;
      update({ sidebarOpen: false });
      options.openDirect(id);
    },
    openGames() {
      if (!disposed) options.openGames();
    },
    switchLayout() {
      if (!disposed) options.applyLayout(state.layout === 'discord' ? 'original' : 'discord');
    },
    dispose() {
      disposed = true;
      for (const remove of cleanup.splice(0)) remove();
      listeners.clear();
    },
  };
}
export type CallWorkspace = ReturnType<typeof createCallWorkspace>;
