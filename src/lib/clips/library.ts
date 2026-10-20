import type { ClipDirectory, LocalClip } from '../../types/clips';
import type { ClipStore } from './store';
import { exportClip, type ClipFiles } from './export.ts';

export interface ClipLibrarySnapshot {
  readonly owner: string;
  readonly clips: readonly Readonly<LocalClip>[];
  readonly directory: ClipDirectory | null;
  readonly busyIds: readonly string[];
  readonly emergencyIds: readonly string[];
  readonly pendingCount: number;
  readonly message: string;
  readonly messageVersion: number;
}
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível acessar os clipes locais.';
/** Account-scoped library. Completed exports update their original record even after an account switch. */
export function createClipLibrary(
  store: Pick<ClipStore, 'list' | 'put' | 'remove' | 'directory' | 'setDirectory'>,
  files: ClipFiles,
) {
  let epoch = 0,
    loading = 0,
    folderVersion = 0,
    disposed = false;
  const emergency = new Map<string, LocalClip>(),
    memoryOnly = new Set<string>(),
    busy = new Set<string>(),
    listeners = new Set<() => void>();
  let state: ClipLibrarySnapshot = Object.freeze({
    owner: 'local',
    clips: Object.freeze([]),
    directory: null,
    busyIds: Object.freeze([]),
    emergencyIds: Object.freeze([]),
    pendingCount: 0,
    message: '',
    messageVersion: 0,
  });
  const current = (ticket: number) => !disposed && ticket === epoch;
  function update(patch: Partial<ClipLibrarySnapshot> = {}) {
    if (disposed) return;
    const clips = patch.clips ?? state.clips;
    state = Object.freeze({
      ...state,
      ...patch,
      pendingCount: clips.filter((clip) => clip.blob).length,
      busyIds: Object.freeze([...busy]),
      emergencyIds: Object.freeze([...emergency.keys()]),
    });
    for (const listener of listeners) listener();
  }
  function message(text: string, ticket: number) {
    if (current(ticket)) update({ message: text, messageVersion: state.messageVersion + 1 });
  }
  async function refresh() {
    if (disposed) return;
    const request = ++loading,
      ticket = epoch,
      owner = state.owner;
    let clips: LocalClip[] = [];
    try {
      clips = await store.list(owner);
    } catch (error) {
      if (!current(ticket) || request !== loading) return;
      message(errorMessage(error), ticket);
    }
    if (!current(ticket) || request !== loading) return;
    const merged = new Map(
      clips.filter((clip) => clip.owner === owner).map((clip) => [clip.id, clip]),
    );
    for (const clip of emergency.values()) if (clip.owner === owner) merged.set(clip.id, clip);
    update({
      clips: Object.freeze(
        [...merged.values()]
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((clip) => Object.freeze({ ...clip })),
      ),
    });
  }
  async function setOwner(owner: string) {
    if (disposed) return;
    const ticket = ++epoch,
      folder = ++folderVersion;
    update({ owner, clips: Object.freeze([]), directory: null, message: '' });
    await Promise.all([
      refresh(),
      (async () => {
        try {
          const directory = await store.directory(owner);
          if (current(ticket) && folder === folderVersion) update({ directory: directory ?? null });
        } catch {}
      })(),
    ]);
  }
  async function chooseFolder() {
    if (disposed) return;
    const ticket = epoch,
      owner = state.owner,
      folder = ++folderVersion;
    try {
      const handle = await files.chooseDirectory();
      if (!handle || !current(ticket) || folder !== folderVersion) return;
      update({ directory: handle });
      try {
        await store.setDirectory(owner, handle);
        if (folder === folderVersion)
          message('Pasta escolhida. Nenhum clipe é salvo nela sem clicar em Salvar.', ticket);
      } catch {
        if (folder === folderVersion)
          message(
            'Pasta escolhida para esta sessão. O navegador não permitiu lembrar essa pasta.',
            ticket,
          );
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError') && folder === folderVersion)
        message(
          'Não foi possível escolher a pasta. Você pode usar Salvar para escolher um arquivo.',
          ticket,
        );
    }
  }
  async function resetFolder() {
    if (disposed) return;
    const ticket = epoch,
      owner = state.owner;
    folderVersion++;
    update({ directory: null });
    message('Ao salvar, você poderá escolher um arquivo ou usar Downloads.', ticket);
    try {
      await store.setDirectory(owner, null);
    } catch {}
  }
  async function retain(clip: LocalClip, onStorageFailure: () => void) {
    const ticket = clip.owner === state.owner ? epoch : -1;
    try {
      await store.put(clip);
    } catch {
      emergency.set(clip.id, clip);
      memoryOnly.add(clip.id);
      onStorageFailure();
      message(
        'Replay pausado: sem espaço ou acesso ao armazenamento do navegador. Este clipe está somente na memória: salve ou descarte antes de retomar e antes de fechar a página.',
        ticket,
      );
    }
    if (current(ticket)) {
      await refresh();
      if (!emergency.has(clip.id))
        message(
          'Clipe armazenado. Você pode continuar jogando e guardar outros antes de salvar.',
          ticket,
        );
    }
  }
  async function save(id: string) {
    const clip = state.clips.find((clip) => clip.id === id);
    if (disposed || !clip?.blob || busy.has(id)) return;
    const ticket = epoch,
      directory = state.directory;
    busy.add(id);
    update();
    try {
      const result = await exportClip({ ...clip, blob: clip.blob }, directory, files, () =>
        current(ticket),
      );
      if (result === 'stale') return;
      if (result === 'canceled') {
        message('Salvamento cancelado. O clipe continua armazenado.', ticket);
        return;
      }
      const next: LocalClip =
        result === 'saved'
          ? { ...clip, blob: null, state: 'saved' }
          : { ...clip, state: 'download' };
      try {
        await store.put(next);
        emergency.delete(id);
        memoryOnly.delete(id);
        if (result === 'saved') message('Clipe salvo.', ticket);
      } catch {
        emergency.set(id, next);
        if (result === 'saved')
          message(
            'Clipe salvo no arquivo. A lista local não pôde ser atualizada e ele pode reaparecer pendente ao recarregar.',
            ticket,
          );
      }
      if (result === 'download')
        message(
          'Download solicitado. A cópia local fica guardada até você descartar; confira o arquivo em Downloads.',
          ticket,
        );
    } catch (error) {
      message(errorMessage(error), ticket);
    } finally {
      busy.delete(id);
      if (!disposed) {
        update();
        await refresh();
      }
    }
  }
  async function discard(id: string) {
    const clip = state.clips.find((clip) => clip.id === id);
    if (disposed || !clip || busy.has(id)) return;
    const ticket = epoch;
    busy.add(id);
    update();
    try {
      if (!memoryOnly.has(id)) await store.remove(id);
      emergency.delete(id);
      memoryOnly.delete(id);
      message(
        'Clipe removido da lista local. Arquivos já salvos em uma pasta continuam lá.',
        ticket,
      );
    } catch (error) {
      message(errorMessage(error), ticket);
    } finally {
      busy.delete(id);
      if (!disposed) {
        update();
        await refresh();
      }
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setOwner,
    refresh,
    chooseFolder,
    resetFolder,
    retain,
    save,
    discard,
    hasUnsavedMemory: (owner?: string) =>
      [...emergency.values()].some(
        (clip) => clip.blob && (owner === undefined || clip.owner === owner),
      ),
    dispose() {
      disposed = true;
      epoch++;
      listeners.clear();
    },
  };
}
export type ClipLibrary = ReturnType<typeof createClipLibrary>;
