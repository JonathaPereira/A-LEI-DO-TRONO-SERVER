import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { ThroneLobby } from '../../lib/games/throne-lobby';
import { throneRooms } from '../../lib/games/throne-lobby';
import { Avatar } from '../profiles/avatar';
import { CallNavigationHost } from '../navigation/call-navigation';

export interface ThroneLobbyHosts {
  grid: HTMLElement;
  status: HTMLElement;
  title: HTMLElement;
  seats: HTMLElement;
  actions: HTMLElement;
  roomStatus: HTMLElement;
  back: HTMLElement;
}
export function ThroneLobbyControls({
  controller,
  hosts,
  back,
}: {
  controller: ThroneLobby;
  hosts: ThroneLobbyHosts;
  back(): void;
}) {
  const s = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const allReady = !!s.room && s.room.players.length >= 2 && s.room.players.every((p) => p.ready);
  const status =
    s.notice ||
    (!s.connected
      ? 'Servidor desconectado. Aguarde alguns segundos e tente novamente.'
      : !s.me
        ? 'Entrando no salão...'
        : (s.room?.players.length ?? 0) < 2
          ? 'Você está online. Aguarde pelo menos mais 1 jogador; vagas restantes serão preenchidas por IAs.'
          : !allReady
            ? s.me.host
              ? 'Aguardando todos marcarem Pronto.'
              : 'Marque Pronto quando estiver preparado.'
            : s.me.host
              ? 'Todos estão prontos. Você pode iniciar a partida online.'
              : 'Todos estão prontos. Aguarde o anfitrião iniciar a partida.');
  return (
    <>
      {createPortal(
        throneRooms.map((room, index) => (
          <article key={room.id} className="room-card" data-room={room.id}>
            <div className={'room-glyph ' + room.suit}>{room.glyph}</div>
            <div>
              <small>SALÃO {['I', 'II', 'III'][index]}</small>
              <h3>{room.name}</h3>
              <p>Uma mesa aberta para até quatro Casas.</p>
            </div>
            <div className="room-footer">
              <span id={'roomCount' + index}>
                {s.rooms.find((r) => r.id === room.id)?.count ?? 0} / 4
              </span>
              <button
                className="royal-btn room-enter"
                data-room={room.id}
                disabled={s.entering}
                onClick={() => void controller.enter(room.id)}
              >
                Entrar
              </button>
            </div>
          </article>
        )),
        hosts.grid,
      )}
      {createPortal(
        <>
          <span className={'status-dot' + (s.connected ? ' online' : '')} />
          <span id="networkStatus" role="status">
            {s.notice || s.networkStatus}
          </span>
        </>,
        hosts.status,
      )}
      {createPortal(s.selected?.name ?? 'Sala do Cetro', hosts.title)}
      {createPortal(
        [0, 1, 2, 3].map((seat) => {
          const p = s.room?.players.find((p) => p.seat === seat);
          if (!p)
            return (
              <div key={seat} className="room-seat empty">
                <span className="seat-num">{seat + 1}</span>
                <div>
                  <strong>Vaga livre</strong>
                  <small>Aguardando jogador</small>
                </div>
              </div>
            );
          return (
            <div
              key={seat}
              className={
                'room-seat' + (p.id === s.me?.id ? ' is-me' : '') + (p.ready ? ' is-ready' : '')
              }
            >
              <Avatar person={p} className="seat-num" title={'Assento ' + (seat + 1)} />
              <div className="seat-copy">
                <strong>
                  {p.name}
                  {p.id === s.me?.id && (
                    <>
                      {' '}
                      <em>VOCÊ</em>
                    </>
                  )}
                  {p.guest && (
                    <>
                      {' '}
                      <em>CONVIDADO</em>
                    </>
                  )}
                </strong>
                <small>{p.host ? '♛ Anfitrião' : 'Casa convidada'}</small>
              </div>
              <div className={'seat-status ' + (p.ready ? 'ready' : 'waiting')}>
                {p.ready ? '✓ PRONTO' : 'AGUARDANDO'}
              </div>
            </div>
          );
        }),
        hosts.seats,
      )}
      {createPortal(
        <>
          <CallNavigationHost id="roomSocialBtn" />
          <button
            id="readyOnlineBtn"
            className={'royal-btn online-ready-btn' + (s.me?.ready ? ' ready-active' : '')}
            disabled={
              !s.connected ||
              !s.me ||
              s.entering ||
              s.readyPending ||
              s.starting ||
              s.room?.gameActive
            }
            onClick={() => controller.toggleReady()}
          >
            {s.me?.ready ? '↺ Retirar Pronto' : '✓ Marcar Pronto'}
          </button>
          <button
            id="startOnlineBtn"
            className={'royal-btn primary' + (!s.me?.host ? ' hidden' : '')}
            disabled={
              !s.connected ||
              !s.me?.host ||
              !allReady ||
              s.entering ||
              s.readyPending ||
              s.starting ||
              s.room?.gameActive
            }
            onClick={() => controller.startGame()}
          >
            ♛ Iniciar partida online
          </button>
        </>,
        hosts.actions,
      )}
      {createPortal(status, hosts.roomStatus)}
      {createPortal(
        <button id="backToLobbyBtn" className="back-lobby" onClick={back}>
          ← Voltar aos salões
        </button>,
        hosts.back,
      )}
    </>
  );
}
