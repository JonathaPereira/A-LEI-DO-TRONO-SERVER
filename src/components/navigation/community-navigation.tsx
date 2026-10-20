import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { CommunityNavigation } from '../../lib/navigation/community-navigation';
export interface CommunityNavigationHosts {
  status: Element;
  count: Element;
  room: Element;
  title: Element;
  enter: Element;
  back: Element;
}
export function CommunityNavigationContents({
  controller,
  hosts,
}: {
  controller: CommunityNavigation;
  hosts: CommunityNavigationHosts;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return (
    <>
      {createPortal(state.status, hosts.status)}
      {createPortal(
        `${state.count} ${state.count === 1 ? 'pessoa conectada' : 'pessoas conectadas'}`,
        hosts.count,
      )}
      {createPortal(state.roomName, hosts.room)}
      {createPortal(state.chatTitle, hosts.title)}
      {createPortal(
        <button
          id="chatOnlyBtn"
          className="royal-btn primary"
          type="button"
          onClick={() => void controller.enter()}
        >
          Entrar no Salão Livre
        </button>,
        hosts.enter,
      )}
      {createPortal(
        <button
          id="backFromChatOnlyBtn"
          className="chat-header-action back-action"
          title="Voltar ao início"
          type="button"
          onClick={() => void controller.leave()}
        >
          <span>←</span>
          <b>Voltar</b>
        </button>,
        hosts.back,
      )}
    </>
  );
}
