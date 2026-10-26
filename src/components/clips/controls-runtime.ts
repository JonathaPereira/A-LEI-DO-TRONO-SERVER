import type { ClipPreferences } from '../../lib/clips/preferences';
interface Runtime extends Window {
  TronoClips?: { clip(): void; open(): void };
  TronoClipDesktop?: { readonly globalActive: boolean };
  documentPictureInPicture?: {
    requestWindow(options: { width: number; height: number }): Promise<Window>;
  };
}
interface FloatingState {
  readonly ready: boolean;
  readonly source: string;
  readonly seconds: number;
  readonly count: number;
}
/** One keyboard owner for the main document and the optional floating window. */
export function createClipControls(target: Window, preferences: ClipPreferences) {
  const runtime = target as Runtime,
    documents = new Set<Document>();
  let pip: Window | null = null,
    pending = false,
    disposed = false,
    generation = 0;
  let state: FloatingState = { ready: false, source: '', seconds: 30, count: 0 };
  const message = (text: string) => {
    const status = target.document.getElementById('clipsStatus');
    if (status) status.textContent = text;
  };
  const keydown = (event: KeyboardEvent) => {
    // Event targets may belong to the floating window, whose Element constructor differs.
    const element = event.target as Element | null;
    const action = preferences.handleKey(
      event,
      !!element?.closest?.('input,textarea,select,[contenteditable="true"]'),
      runtime.TronoClipDesktop?.globalActive === true,
    );
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      if (action === 'clip') runtime.TronoClips?.clip();
    }
  };
  const bindDocument = (doc: Document) => {
    if (documents.has(doc)) return;
    documents.add(doc);
    doc.addEventListener('keydown', keydown, { capture: true });
  };
  const unbindDocument = (doc: Document) => {
    documents.delete(doc);
    doc.removeEventListener('keydown', keydown, { capture: true });
  };
  function render() {
    if (!pip || pip.closed) return;
    const status = pip.document.getElementById('pipStatus'),
      button = pip.document.getElementById('pipClip') as HTMLButtonElement | null,
      count = pip.document.getElementById('pipCount');
    if (status) status.textContent = state.source;
    if (button) {
      button.disabled = !state.ready;
      button.textContent = 'Clipar últimos ' + state.seconds + ' s';
    }
    if (count) count.textContent = state.count + ' clipes pendentes';
  }
  function closeFloating() {
    generation++;
    if (pip) {
      unbindDocument(pip.document);
      if (!pip.closed) pip.close();
      pip = null;
    }
  }
  async function openFloating() {
    if (disposed || pending) return;
    if (pip && !pip.closed) {
      pip.focus();
      return;
    }
    const request = ++generation;
    pending = true;
    try {
      if (!runtime.documentPictureInPicture) throw Error('Janela flutuante indisponível.');
      const window = await runtime.documentPictureInPicture.requestWindow({
        width: 290,
        height: 210,
      });
      if (disposed || request !== generation) {
        window.close();
        return;
      }
      pip = window;
      const doc = window.document;
      doc.title = 'Clipes · A Corte';
      doc.documentElement.lang = 'pt-BR';
      const style = doc.createElement('style');
      style.textContent =
        'body{margin:0;padding:16px;background:#161616;color:#e6dfd0;font:14px/1.5 system-ui}*{box-sizing:border-box}strong{color:#dfc691}button{padding:12px;width:100%;border:1px solid #514536;border-radius:8px;background:#292929;color:#e6dfd0;margin:8px 0;cursor:pointer;font:inherit}button:first-of-type{background:#d6b779;color:#191919}button:hover{filter:brightness(1.1)}button:focus-visible{outline:1px solid #d6b779;outline-offset:2px}button:disabled{opacity:.5;cursor:not-allowed}small{display:block;color:#b0b0b0;margin:6px 0}';
      doc.head.appendChild(style);
      const title = doc.createElement('strong'),
        status = doc.createElement('small'),
        button = doc.createElement('button'),
        count = doc.createElement('small'),
        back = doc.createElement('button');
      title.textContent = 'Clipes · A Corte';
      status.id = 'pipStatus';
      button.id = 'pipClip';
      count.id = 'pipCount';
      button.onclick = () => runtime.TronoClips?.clip();
      back.textContent = 'Abrir central';
      back.onclick = () => {
        target.focus();
        runtime.TronoClips?.open();
      };
      doc.body.replaceChildren(title, status, button, count, back);
      bindDocument(doc);
      window.addEventListener(
        'pagehide',
        () => {
          unbindDocument(doc);
          if (pip === window) pip = null;
        },
        { once: true },
      );
      render();
    } catch {
      if (!disposed && request === generation)
        message('Não foi possível abrir a janela flutuante. Use a central de clipes nesta página.');
    } finally {
      pending = false;
    }
  }
  const close = () => preferences.cancelShortcut();
  let bound = false;
  let owner = preferences.getSnapshot().owner;
  const unsubscribe = preferences.subscribe(() => {
    if (preferences.getSnapshot().owner !== owner) {
      owner = preferences.getSnapshot().owner;
      closeFloating();
    }
  });
  return {
    bind() {
      if (bound || disposed) return;
      bound = true;
      bindDocument(target.document);
      target.document.getElementById('clipsDialog')?.addEventListener('close', close);
      target.addEventListener('pagehide', closeFloating);
    },
    update(next: FloatingState) {
      state = next;
      render();
    },
    openFloating,
    dispose() {
      disposed = true;
      unsubscribe();
      closeFloating();
      for (const doc of documents) unbindDocument(doc);
      target.document.getElementById('clipsDialog')?.removeEventListener('close', close);
      target.removeEventListener('pagehide', closeFloating);
    },
  };
}
export type ClipControls = ReturnType<typeof createClipControls>;
