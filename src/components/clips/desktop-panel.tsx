'use client';
import { useSyncExternalStore } from 'react';
import type { DesktopClipBridge } from '../../lib/clips/desktop-bridge';
export function ClipDesktopPanel({ bridge }: { bridge: DesktopClipBridge }) {
  const state = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot, bridge.getSnapshot),
    busy = state.connecting || state.connected;
  return (
    <div className="clip-desktop-panel">
      <strong>Atalho durante o jogo · Windows</strong>
      <p id="clipDesktopStatus" role="status">
        {state.message}
      </p>
      <label>
        Código mostrado no aplicativo
        <input
          id="clipDesktopCode"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="Cole o código de conexão local"
          value={state.code}
          disabled={busy}
          onChange={(event) => bridge.setCode(event.target.value)}
        />
      </label>
      <button id="clipDesktopConnect" type="button" disabled={busy} onClick={bridge.connect}>
        Conectar ao Windows
      </button>
      <button id="clipDesktopDisconnect" type="button" hidden={!busy} onClick={bridge.disconnect}>
        Desconectar
      </button>
    </div>
  );
}
