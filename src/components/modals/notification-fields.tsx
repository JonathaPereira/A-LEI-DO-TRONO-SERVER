'use client';

import { useSyncExternalStore } from 'react';
import type { NotificationsController } from '../../lib/notifications/controller';

export function NotificationFields({ client }: { client: NotificationsController }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return (
    <div id="notificationSettings">
      <h2>Notificações</h2>
      <label className="social-setting">
        Avisos de mensagens
        <select
          id="notificationMode"
          value={state.mode}
          onChange={(event) => client.setMode(event.target.value)}
        >
          <option value="mentions">Menções, amigos e mensagens privadas</option>
          <option value="all">Todas as mensagens</option>
          <option value="off">Desligados</option>
        </select>
      </label>
      <p className="appearance-help">
        Mensagens privadas também aparecem em avisos compactos com o ícone de quem enviou. Em
        segundo plano, você recebe avisos do sistema. Use @apelido para mencionar alguém. Os
        contadores continuam funcionando com avisos desligados.
      </p>
      <label className="social-setting">
        Silenciar um canal
        <select
          id="notificationChannel"
          value={state.selectedChannelId}
          onChange={(event) => client.selectChannel(event.target.value)}
        >
          <option value="">Escolha um canal</option>
          {state.channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </select>
      </label>
      <label className="auth-check">
        <input
          id="notificationChannelMute"
          type="checkbox"
          checked={state.selectedMuted}
          disabled={!state.selectedChannelId}
          onChange={(event) => client.setSelectedMuted(event.target.checked)}
        />{' '}
        Não receber avisos deste canal
      </label>
      <button
        id="notificationPermission"
        className="secondary-button"
        type="button"
        hidden={state.desktop}
        disabled={state.permissionPending}
        onClick={() => {
          void client.requestPermission();
        }}
      >
        Ativar avisos neste navegador
      </button>
      <p id="notificationPermissionStatus" role="status" className="appearance-help">
        {state.permissionStatus}
      </p>
    </div>
  );
}
