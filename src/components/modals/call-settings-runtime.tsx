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
    fragment('account').append(get('profileEditorHost'), get('accountLogoutBtn'));
    fragment('files').append(get('profileFilesHost'));
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
      ['match', 'Partida e velocidade', ['throneSpeedHost', 'throneRestartHost']],
      ['help', 'Regras e histórico', ['throneRulesHost', 'logBtn']],
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
      actions.append(
        ...ids.map((id) =>
          id === 'socialBtn'
            ? get('call-nav-socialBtn')
            : id === 'logBtn'
              ? get('throneLogToggleHost')
              : id === 'recordMatchBtn'
                ? get('recordMatchHost')
                : get(id),
        ),
      );
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
