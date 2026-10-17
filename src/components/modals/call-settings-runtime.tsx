'use client';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createSettingsController } from '../../lib/settings/controller';
import type { SettingsTopic } from '../../lib/settings/controller';
import type { SettingsRuntime, Contents } from '../../lib/settings/runtime';
import { CallSettings } from './call-settings';

const installed = new WeakSet<Window>();
export function prepareCallSettings(target: Window) {
  const runtime = target as unknown as SettingsRuntime;
  runtime.TronoCallSettings ??= createSettingsController(
    !!runtime.TronoDesktop,
    runtime.TronoStorage ?? localStorage,
  );
  if (runtime.TronoDesktop) runtime.TronoDesktopSettings = runtime.TronoCallSettings;
  return runtime.TronoCallSettings;
}

/** Converts only the settings shell; borrowed legacy bodies never become React children. */
export function initializeCallSettings(target: Window): void {
  const runtime = target as unknown as SettingsRuntime;
  if (installed.has(target)) return;
  installed.add(target);
  const panel = document.getElementById('voiceSettingsPanel')!;
  const contents: Contents = {};
  const fragment = (topic: SettingsTopic) =>
    (contents[topic] ??= document.createDocumentFragment());
  for (const pane of panel.querySelectorAll<HTMLElement>('[data-settings-panel]'))
    fragment(pane.dataset.settingsPanel as SettingsTopic).append(...pane.childNodes);
  const desktop = !!runtime.TronoDesktop;
  let dialog: HTMLDialogElement | null = null;
  if (desktop) {
    dialog = document.createElement('dialog');
    dialog.id = 'desktopSettingsDialog';
    dialog.className = 'desktop-settings-dialog';
    dialog.setAttribute('aria-label', 'Configurações');
    document.body.append(dialog);
    dialog.append(panel);
    const get = (id: string) => document.getElementById(id)!;
    fragment('appearance').append(document.querySelector<HTMLElement>('.profile-appearance')!);
    (fragment('appearance').firstChild as HTMLElement).hidden = false;
    fragment('account').append(get('profileForm'), get('accountLogoutBtn'));
    const heading = document.createElement('h2');
    heading.textContent = 'Meus arquivos';
    fragment('files').append(
      heading,
      document.querySelector('.profile-files-load')!,
      get('storageUsage'),
      get('profileFiles'),
    );
    const capture = fragment('capture');
    const captureHeading = document.createElement('h2');
    captureHeading.textContent = 'Captura de tela';
    const help = document.createElement('p');
    help.className = 'appearance-help';
    help.textContent =
      'Qualidade e áudio da transmissão. Você escolhe a tela ou janela ao compartilhar, e pode trocar sem interromper a anterior.';
    const devices = document.createElement('div');
    devices.className = 'voice-devices voice-devices-vertical';
    for (const id of ['screenFormatSelect', 'screenBitrateSelect', 'screenContentSelect'])
      devices.append(contents.video!.querySelector('#' + id)!.closest('label')!);
    const audio = contents.video!.querySelector('#shareStreamAudio')!.closest('label')!,
      note = contents.video!.querySelector('.settings-context-help')!;
    note.textContent =
      'Para áudio isolado, escolha o aplicativo/jogo no seletor. O áudio do computador inteiro pode incluir as vozes da chamada.';
    capture.append(captureHeading, help, devices, audio, note);
    contents.video!.querySelector('.settings-section-heading strong')!.textContent = 'Câmera';
    contents.video!.querySelector('.settings-section-heading small')!.textContent =
      'VÍDEO DA CHAMADA';
    (contents.audio!.querySelector('#noiseModeLabel') as HTMLElement).hidden = false;
    (contents.audio!.querySelector('#noiseSuppressionBtn') as HTMLElement).hidden = true;
    const game = fragment('game');
    const gameHeading = document.createElement('h2');
    gameHeading.textContent = 'Jogo';
    game.append(gameHeading);
    const gameHelp = document.createElement('p');
    gameHelp.className = 'appearance-help';
    gameHelp.textContent =
      'As opções da partida ficam aqui. Ordenar cartas e usar Influência continuam ao alcance da sua mão.';
    game.append(gameHelp);
    for (const [key, title, ids] of [
      ['match', 'Partida e velocidade', ['speedBtn', 'restartBtn']],
      ['help', 'Regras e histórico', ['rulesBtn', 'logBtn']],
      ['media', 'Comunicação e gravação manual', ['socialBtn', 'recordMatchBtn']],
    ] as const) {
      const group = document.createElement('details');
      group.className = 'game-settings-group';
      group.open = title === 'Partida e velocidade';
      const summary = document.createElement('summary');
      summary.textContent = title;
      const actions = document.createElement('div');
      actions.className = 'game-settings-actions';
      actions.dataset.gameGroup = key;
      actions.append(...ids.map(get));
      group.append(summary, actions);
      game.append(group);
    }
  }
  const controller = prepareCallSettings(target);
  flushSync(() =>
    createRoot(panel).render(
      <CallSettings
        runtime={runtime}
        controller={controller}
        panel={panel}
        dialog={dialog}
        contents={contents}
      />,
    ),
  );
}
