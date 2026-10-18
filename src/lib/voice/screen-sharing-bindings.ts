import type { createScreenSharing } from './screen-sharing';
interface BindingOptions {
  document: Document;
  sharing: ReturnType<typeof createScreenSharing>;
  call(): { joined: boolean };
  replayEnabled(): boolean;
}
/** Owns the screen options dialog; toolbar and tile actions are React. */
export function createScreenSharingBindings(options: BindingOptions) {
  const document = options.document,
    sharing = options.sharing;
  const cleanup: (() => void)[] = [];
  let started = false,
    disposed = false;
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
  return {
    open,
    close,
    start() {
      if (started || disposed) return;
      started = true;
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
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        for (const remove of cleanup.splice(0)) remove();
      }
    },
  };
}
