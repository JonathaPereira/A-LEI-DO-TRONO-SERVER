'use client';
import { memo } from 'react';

/** Stable fields still controlled by desktop-activity.js; the settings shell owns the pane. */
export const SettingsActivityFields = memo(function SettingsActivityFields() {
  return (
    <>
      <h2>Atividade</h2>
      <label className="auth-check">
        <input id="desktopActivityEnabled" type="checkbox" /> Mostrar meu jogo ou aplicativo
      </label>
      <p className="appearance-help">
        Opcional. Detecta jogos conhecidos e da Steam no Windows. Exibe apenas o nome do jogo;
        títulos das janelas e caminhos de arquivos não são compartilhados. Você também pode escolher
        outro aplicativo aberto.
      </p>
      <label className="desktop-activity-field">
        Aplicativo
        <select id="desktopActivityApp">
          <option value="">Detecção automática</option>
        </select>
      </label>
      <label className="desktop-activity-field" id="desktopActivityNameLabel" hidden>
        Nome exibido
        <input id="desktopActivityName" maxLength={80} placeholder="Nome do jogo ou aplicativo" />
      </label>
      <p id="desktopActivityStatus" role="status" />
    </>
  );
});
