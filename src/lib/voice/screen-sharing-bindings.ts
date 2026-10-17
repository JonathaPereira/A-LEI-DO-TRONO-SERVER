import type { createScreenSharing } from './screen-sharing';
interface BindingOptions {
  document: Document;
  sharing: ReturnType<typeof createScreenSharing>;
  call(): { joined: boolean; generation: number };
  localId(): string | null | undefined;
  replayEnabled(): boolean;
  onStatus(text: string, kind: 'ok'): void;
  onRender(): void;
  warn?(error: unknown): void;
}
/** Owns sharing dialog/events while legacy presentation still moves the same nodes. */
export function createScreenSharingBindings(options: BindingOptions) {
  const document = options.document,
    sharing = options.sharing;
  const cleanup: (() => void)[] = [];
  let started = false,
    disposed = false;
  const warn = options.warn ?? ((error: unknown) => console.warn('[ScreenSharingBindings]', error));
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const close = () => get<HTMLDialogElement>('screenOptionsDialog')?.close();
  function bind(target: EventTarget | null, event: string, listener: EventListener) {
    if (target) {
      target.addEventListener(event, listener);
      cleanup.push(() => target.removeEventListener(event, listener));
    }
  }
  function open() {
    if (disposed || !options.call().joined) return;
    const value = sharing.dialogOptions(),
      resolution = get<HTMLSelectElement>('shareResolution'),
      fps = get<HTMLSelectElement>('shareFps');
    resolution.value = String(value.resolution);
    fps.value = String(value.fps);
    get<HTMLInputElement>('shareAudio').checked = value.audio;
    resolution.querySelector<HTMLOptionElement>('[value="1080"]')!.disabled = value.limited;
    fps.querySelector<HTMLOptionElement>('[value="60"]')!.disabled = value.limited;
    get('shareOptionsNote').textContent = value.limited
      ? 'O limite de consumo atual permite até 720p / 30 FPS.'
      : 'Escolha a qualidade; em seguida, o navegador perguntará qual tela ou aba compartilhar.';
    get('shareReplayHelp').textContent = options.replayEnabled()
      ? 'O replay será preparado automaticamente para clipar pelo botão ✂ na barra da chamada, com o áudio da tela quando disponível.'
      : 'Replay desligado. Ative em Meus clipes → Preferências para preparar clipes ao compartilhar.';
    get<HTMLDialogElement>('screenOptionsDialog').showModal();
  }
  const click: EventListener = (event) => {
    if (disposed || !(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>(
      '.screen-resource-btn, .screen-switch-btn, .screen-collapse-btn',
    );
    const tile = button?.closest<HTMLElement>('.screen-share-tile');
    if (!button || !tile) return;
    event.stopPropagation();
    const self = tile.dataset.peer === options.localId();
    if (button.classList.contains('screen-resource-btn')) {
      if (self) sharing.togglePreview();
      return;
    }
    if (button.classList.contains('screen-switch-btn')) {
      if (!self) return;
      button.disabled = true;
      void sharing
        .switchSource()
        .catch(warn)
        .finally(() => {
          button.disabled = false;
        });
      return;
    }
    const generation = options.call().generation;
    const collapse = async () => {
      if (document.fullscreenElement === tile) await document.exitFullscreen().catch(() => {});
      if (disposed || generation !== options.call().generation) return;
      tile.classList.remove('media-maximized');
      document.body.classList.remove('media-focus-open');
      if (self) sharing.toggleCollapsed();
      else {
        tile.dataset.collapsed = tile.dataset.collapsed === '1' ? '0' : '1';
        options.onRender();
      }
    };
    void collapse().catch(warn);
  };
  return {
    open,
    close,
    start() {
      if (started || disposed) return;
      started = true;
      bind(get('screenShareBtn'), 'click', () => {
        if (sharing.isActive()) void sharing.stop();
        else open();
      });
      bind(get('screenOptionsForm'), 'submit', (event) => {
        event.preventDefault();
        if (!options.call().joined) {
          close();
          return;
        }
        if (
          !sharing.configure(
            get<HTMLSelectElement>('shareResolution').value,
            get<HTMLSelectElement>('shareFps').value,
            get<HTMLInputElement>('shareAudio').checked,
          )
        )
          return;
        close();
        void sharing.start(); // Do not await before the native picker.
      });
      bind(get('screenOptionsCancel'), 'click', close);
      bind(get('shareStreamAudio'), 'change', () => {
        sharing.setAudio(get<HTMLInputElement>('shareStreamAudio').checked);
        options.onStatus('Preferência de áudio aplicada ao próximo compartilhamento.', 'ok');
      });
      bind(document, 'click', click);
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        for (const remove of cleanup.splice(0)) remove();
      }
    },
  };
}
