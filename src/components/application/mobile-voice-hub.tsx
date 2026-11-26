'use client';

import { useState, useSyncExternalStore } from 'react';
import {
  audioRouteLabel,
  type AndroidPermissionsSnapshot,
} from '../../lib/mobile/background-permissions';
import { Avatar } from '../profiles/avatar';
import { AppIcon as Icon } from './icons';
import { useModel, type ApplicationServices } from './services';
import styles from './mobile-voice-hub.module.css';

const noop = () => () => {};
const emptyBg = (): AndroidPermissionsSnapshot | null => null;

/**
 * Dedicated Conceito A mobile Voice Hub ("Voz" tab): lists every live voice room,
 * shows who is currently talking, and offers a 1-tap pre-join bottom sheet with
 * microphone and audio output route controls.
 */
export function MobileVoiceHub({
  runtime,
  open,
  hasCallBar,
  onClose,
}: {
  runtime: ApplicationServices;
  open: boolean;
  hasCallBar: boolean;
  onClose(): void;
}) {
  const auth = useModel(runtime.TronoAuth);
  const channels = useModel(runtime.TronoChannels);
  const call = useModel(runtime.TronoCallNavigation);
  const bgGuard = runtime.TronoAndroidBackground;
  const bgState = useSyncExternalStore(
    bgGuard?.subscribe ?? noop,
    bgGuard?.getSnapshot ?? emptyBg,
    emptyBg,
  );

  const voiceRooms = channels.channels.filter((c) => c.type !== 'text');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [joinMuted, setJoinMuted] = useState(false);
  const [joining, setJoining] = useState(false);

  if (!open) return null;

  const totalLive = voiceRooms.reduce(
    (sum, room) => sum + room.players.filter((p) => p.inVoice).length,
    0,
  );
  const selectedRoom =
    voiceRooms.find((r) => r.id === selectedId) ??
    (!call.voiceRoom ? voiceRooms.find((r) => r.players.some((p) => p.inVoice)) : null) ??
    null;

  async function enterRoom(roomId: string) {
    if (joining) return;
    setJoining(true);
    try {
      runtime.TronoDirectMessages.close();
      runtime.TronoPortal.showOnly('chatOnlyScreen');
      await runtime.TronoChatHub.switchChannel(roomId, { connectVoice: true });
      if (joinMuted && !runtime.TronoCallToolbar.getSnapshot().buttons.muteMicBtn.active) {
        await runtime.TronoCallToolbar.activate('muteMicBtn');
      }
      runtime.TronoCallNavigation.showCall();
      setSelectedId(null);
      onClose();
    } finally {
      setJoining(false);
    }
  }

  return (
    <section
      className={styles.hub}
      data-mobile-voice-hub
      data-call-bar={hasCallBar}
      aria-label="Salas de voz"
    >
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.emblem}>
            <Icon name="crown" size={18} />
          </span>
          <div className={styles.titleBlock}>
            <h2>Salas de Voz</h2>
            <small data-empty={totalLive === 0}>
              {totalLive === 0
                ? 'Toque em uma sala para iniciar'
                : totalLive === 1
                  ? '1 pessoa ao vivo agora'
                  : `${totalLive} pessoas ao vivo agora`}
            </small>
          </div>
        </div>
        {bgGuard && bgState?.supported && (
          <button
            type="button"
            className={styles.bgButton}
            data-alert={!bgState.allReady}
            aria-label="Permissões de segundo plano"
            onClick={() => bgGuard.openModal()}
          >
            <Icon name="shield" size={15} />
            <span>{bgState.allReady ? '2º plano OK' : 'Configurar 2º plano'}</span>
          </button>
        )}
      </header>

      <div className={styles.list}>
        {!auth.user ? (
          <p className={styles.emptyState}>Entre na sua conta para acessar as salas de voz.</p>
        ) : voiceRooms.length === 0 ? (
          <p className={styles.emptyState}>Nenhuma sala de voz disponível no momento.</p>
        ) : (
          voiceRooms.map((room) => {
            const membersInVoice = room.players.filter((p) => p.inVoice);
            const connected = call.voiceRoom?.id === room.id;
            const selected = !connected && selectedRoom?.id === room.id;
            return (
              <button
                key={room.id}
                type="button"
                className={styles.roomCard}
                data-mobile-voice-room={room.id}
                data-connected={connected}
                data-selected={selected}
                onClick={() => {
                  if (connected) {
                    runtime.TronoDirectMessages.close();
                    runtime.TronoPortal.showOnly('chatOnlyScreen');
                    runtime.TronoCallNavigation.showCall();
                    onClose();
                    return;
                  }
                  setSelectedId(room.id);
                }}
              >
                <div className={styles.roomTop}>
                  <div className={styles.roomNameRow}>
                    {membersInVoice.length > 0 ? (
                      <span className={styles.liveDot} aria-hidden="true" />
                    ) : (
                      <Icon name="voice" size={16} />
                    )}
                    <span className={styles.roomName}>{room.name}</span>
                    {membersInVoice.length > 0 && <span className={styles.liveBadge}>AO VIVO</span>}
                  </div>
                  <span className={styles.roomCount}>
                    {membersInVoice.length > 0 ? `${membersInVoice.length} na call` : 'Vazia'}
                  </span>
                </div>

                {membersInVoice.length > 0 && (
                  <div className={styles.peopleRow}>
                    <div className={styles.avatars}>
                      {membersInVoice.slice(0, 4).map((person) => (
                        <Avatar key={person.id} person={person} className={styles.avatarItem} />
                      ))}
                    </div>
                    <span className={styles.peopleNames}>
                      {membersInVoice.map((p) => p.name).join(', ')}
                    </span>
                  </div>
                )}

                <div className={styles.roomFoot}>
                  <span>
                    {connected
                      ? 'Você está nesta sala'
                      : membersInVoice.length > 0
                        ? 'Voz em tempo real pronta'
                        : 'Abrir sala de voz'}
                  </span>
                  <span className={styles.roomCta}>
                    {connected ? 'Voltar à chamada →' : 'Toque p/ entrar →'}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {selectedRoom && call.voiceRoom?.id !== selectedRoom.id && (
        <div
          className={styles.sheet}
          role="region"
          aria-label={`Entrar na sala ${selectedRoom.name}`}
          data-voice-prejoin={selectedRoom.id}
        >
          <div className={styles.sheetHead}>
            <div>
              <small>Pronto para entrar</small>
              <strong>Sala {selectedRoom.name}</strong>
            </div>
            <button
              type="button"
              className={styles.sheetClose}
              aria-label="Fechar prévia de entrada"
              onClick={() => setSelectedId('__none__')}
            >
              <Icon name="close" size={16} />
            </button>
          </div>

          <div className={styles.sheetOptions}>
            <button
              type="button"
              className={styles.optionBtn}
              data-muted={joinMuted}
              aria-pressed={joinMuted}
              onClick={() => setJoinMuted((prev) => !prev)}
            >
              <Icon name={joinMuted ? 'microphoneSlash' : 'microphone'} size={17} />
              <span>{joinMuted ? 'Entrar mutado' : 'Mic ligado'}</span>
            </button>
            <button
              type="button"
              className={styles.optionBtn}
              onClick={() => void bgGuard?.cycleAudioRoute()}
            >
              <Icon name={bgState?.audioRoute === 'bluetooth' ? 'bluetooth' : 'voice'} size={17} />
              <span>{audioRouteLabel(bgState?.audioRoute ?? 'speaker')}</span>
            </button>
          </div>

          <button
            type="button"
            className={styles.joinBtn}
            disabled={joining}
            onClick={() => void enterRoom(selectedRoom.id)}
          >
            {joining ? 'Conectando…' : `Entrar na chamada (${selectedRoom.name})`}
          </button>
        </div>
      )}
    </section>
  );
}
