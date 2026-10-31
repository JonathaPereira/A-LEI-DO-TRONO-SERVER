import type { ClipLibrary } from '../../lib/clips/library';
import type { ClipPreferences } from '../../lib/clips/preferences';
import type { ReplayController } from '../../lib/clips/replay';
import type { ClipControls } from './controls-runtime';
import type { ClipShortcut } from '../../types/clips';

interface Runtime extends Window {
  documentPictureInPicture?: unknown;
  TronoClipDesktop?: { configure(value: { shortcut: ClipShortcut; active: boolean }): void };
  TronoSocial?: {
    readonly voiceJoined: boolean;
    joinVoice(): Promise<boolean>;
    openScreenOptions(): void;
  };
}
/** Owns remaining movable controls and dialog listeners; never owns media or library rows. */
export function createReplayView(
  target: Window,
  replay: ReplayController,
  preferences: ClipPreferences,
  library: ClipLibrary,
  controls: ClipControls,
) {
  const runtime = target as Runtime,
    doc = target.document,
    removers: (() => void)[] = [];
  const element = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const node = doc.getElementById(id);
    if (!node) throw Error('Controle de clipes ausente: ' + id);
    return node as T;
  };
  const dialog = element<HTMLDialogElement>('clipsDialog');
  let bound = false,
    disposed = false,
    owner = replay.getSnapshot().owner;
  const versions = { replay: 0, preferences: 0, library: 0 };
  const message = (text: string) => {
    element('clipsStatus').textContent = text;
  };
  function render() {
    if (disposed) return;
    const state = replay.getSnapshot(),
      settings = preferences.getSnapshot().settings,
      count = library.getSnapshot().pendingCount;
    element<HTMLInputElement>('clipAuto').checked = settings.auto;
    const available = Math.min(settings.seconds, Math.max(1, Math.floor(state.seconds)));
    const now = element<HTMLButtonElement>('clipNow'),
      toolbar = element<HTMLButtonElement>('clipToolbarNow');
    now.disabled = !state.ready;
    now.textContent = 'Clipar últimos ' + (state.ready ? available : settings.seconds) + ' s';
    toolbar.disabled = !state.ready;
    element('clipToolbarLabel').textContent = state.preparing
      ? 'Preparando…'
      : state.active
        ? 'Clipar ' + available + ' s'
        : 'Clipar';
    toolbar.title = state.ready
      ? 'Guardar o replay · ' + preferences.shortcutLabel()
      : 'Compartilhe sua tela para preparar o replay';
    toolbar.classList.toggle('replay-ready', state.ready);
    const source = state.ready
      ? 'Replay pronto · ' +
        Math.floor(state.seconds) +
        ' s disponíveis · ' +
        (state.hasAudio ? 'áudio incluído' : 'sem áudio')
      : state.active || state.preparing
        ? 'Preparando replay da tela compartilhada…'
        : state.shared
          ? 'Replay pausado'
          : 'Compartilhe sua tela para habilitar o replay';
    element('clipSource').textContent = source;
    element('clipReplayDot').classList.toggle('is-ready', state.ready);
    element('clipShare').hidden = state.shared;
    element('clipResume').hidden =
      !state.shared || state.active || state.preparing || !settings.auto;
    element('clipFloating').hidden = !runtime.documentPictureInPicture;
    element('clipPendingCount').textContent = String(count);
    element('clipToolbarCount').textContent = String(count);
    element('clipToolbarCount').hidden = !count;
    runtime.TronoClipDesktop?.configure({ shortcut: settings.shortcut, active: state.ready });
    target.dispatchEvent(
      new CustomEvent('trono-replay-change', {
        detail: {
          active: state.active,
          ready: state.ready,
          primary: false,
          preparing: state.preparing,
          paused: false,
        },
      }),
    );
    controls.update({ ready: state.ready, source, seconds: settings.seconds, count });
    if (state.owner !== owner) {
      owner = state.owner;
      message('Ao compartilhar a tela, o replay fica pronto automaticamente.');
    }
    for (const [key, snapshot] of [
      ['replay', state],
      ['preferences', preferences.getSnapshot()],
      ['library', library.getSnapshot()],
    ] as const) {
      if (versions[key] === snapshot.messageVersion) continue;
      versions[key] = snapshot.messageVersion;
      if (snapshot.owner === owner && snapshot.message) message(snapshot.message);
    }
  }
  function tab(name: 'library' | 'preferences') {
    doc.querySelectorAll<HTMLElement>('[data-clips-tab]').forEach((button) => {
      const selected = button.dataset.clipsTab === name;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    element('clipsLibrary').hidden = name !== 'library';
    element('clipsPreferences').hidden = name !== 'preferences';
  }
  function open({ inline = false }: { inline?: boolean } = {}) {
    if (disposed) return;
    tab('library');
    if (!dialog.open) {
      if (inline) dialog.show();
      else dialog.showModal();
    }
    void library.refresh();
  }
  function listen(node: EventTarget, event: string, listener: EventListener) {
    node.addEventListener(event, listener);
    removers.push(() => node.removeEventListener(event, listener));
  }
  return {
    open,
    bind() {
      if (bound || disposed) return;
      bound = true;
      controls.bind();
      removers.push(
        replay.subscribe(render),
        preferences.subscribe(render),
        library.subscribe(render),
      );
      doc
        .querySelectorAll('[data-open-clips]')
        .forEach((button) => listen(button, 'click', () => open()));
      listen(element('clipClose'), 'click', () => dialog.close());
      listen(element('clipAuto'), 'change', () =>
        preferences.setSetting('auto', element<HTMLInputElement>('clipAuto').checked),
      );
      listen(element('clipNow'), 'click', replay.clip);
      listen(element('clipToolbarNow'), 'click', replay.clip);
      listen(element('clipFloating'), 'click', () => void controls.openFloating());
      listen(element('clipResume'), 'click', () => void replay.resume());
      listen(element('clipShare'), 'click', () => {
        dialog.close();
        void (async () => {
          const social = runtime.TronoSocial;
          if (!social || (!social.voiceJoined && !(await social.joinVoice())) || disposed) return;
          social.openScreenOptions();
        })().catch((error) =>
          message(
            error instanceof Error
              ? error.message
              : 'Não foi possível preparar o compartilhamento.',
          ),
        );
      });
      doc
        .querySelectorAll<HTMLElement>('[data-clips-tab]')
        .forEach((button) =>
          listen(button, 'click', () =>
            tab(button.dataset.clipsTab === 'preferences' ? 'preferences' : 'library'),
          ),
        );
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const remove of removers.splice(0)) remove();
      runtime.TronoClipDesktop?.configure({
        shortcut: preferences.getSnapshot().settings.shortcut,
        active: false,
      });
    },
  };
}
