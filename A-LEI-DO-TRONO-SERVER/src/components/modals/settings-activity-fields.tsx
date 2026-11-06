'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { DesktopActivityController } from '../../lib/desktop/activity';

export function SettingsActivityFields({ client }: { client: DesktopActivityController }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const [draft, setDraft] = useState(state.name);
  const [editingName, setEditingName] = useState(false);
  const [editingApp, setEditingApp] = useState(false);
  const [focusedApps, setFocusedApps] = useState(state.apps);
  const apps = editingApp ? focusedApps : state.apps;
  useEffect(() => {
    if (!editingName) setDraft(state.name);
  }, [state.name, editingName]);
  return (
    <>
      <h2>Atividade</h2>
      <label className="auth-check">
        <input
          id="desktopActivityEnabled"
          type="checkbox"
          checked={state.enabled}
          disabled={!state.available || !state.accountPresent}
          onChange={(event) => client.setEnabled(event.target.checked)}
        />{' '}
        Mostrar meu jogo ou aplicativo
      </label>
      <p className="appearance-help">
        Opcional. Detecta jogos conhecidos e da Steam no Windows. Exibe apenas o nome do jogo;
        títulos das janelas e caminhos de arquivos não são compartilhados. Você também pode escolher
        outro aplicativo aberto.
      </p>
      <label className="desktop-activity-field">
        Aplicativo
        <select
          id="desktopActivityApp"
          value={state.preferredAppId ?? ''}
          disabled={!state.enabled || !state.accountPresent}
          onChange={(event) => client.setPreferredApp(event.target.value || null)}
          onFocus={() => {
            setFocusedApps(state.apps);
            setEditingApp(true);
          }}
          onBlur={() => setEditingApp(false)}
        >
          <option value="">Detecção automática</option>
          {apps.map((app) => (
            <option key={app.id} value={app.id}>
              {app.name}
            </option>
          ))}
          {state.preferredAppId && !apps.some((app) => app.id === state.preferredAppId) && (
            <option value={state.preferredAppId}>Aplicativo selecionado · não está aberto</option>
          )}
        </select>
      </label>
      <label
        className="desktop-activity-field"
        id="desktopActivityNameLabel"
        hidden={!state.preferredAppId}
      >
        Nome exibido
        <input
          id="desktopActivityName"
          maxLength={80}
          placeholder="Nome do jogo ou aplicativo"
          value={draft}
          disabled={!state.enabled}
          onFocus={() => setEditingName(true)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            client.setName(draft);
            setEditingName(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </label>
      <p id="desktopActivityStatus" role="status">
        {state.status}
      </p>
    </>
  );
}
