'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ChannelGroup, ChannelParticipant } from '../../types/channels';
import type { ChannelsController } from '../../lib/channels/catalog';
import { EMPTY_CHANNELS } from '../../lib/channels/catalog';
import { initializeChannels, selectChannel } from '../../lib/channels/browser';
import { renderProfileAvatar } from '../../lib/profiles/avatar';

const emptySubscribe = () => () => {};
const emptySnapshot = () => EMPTY_CHANNELS;

function PresenceAvatar({ person, version }: { person: ChannelParticipant; version: number }) {
  const host = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    renderProfileAvatar(element, person);
    return () => element.replaceChildren();
  }, [person.avatar_preset, person.avatar_file_id, version]);
  const title = `${person.name}${person.guest ? ' · convidado' : ''} · na voz`;
  return <span ref={host} className="community-avatar" title={title} aria-label={title} />;
}

export function ChannelList({ group }: { group: ChannelGroup }) {
  const [controller, setController] = useState<ChannelsController | null>(null);
  useEffect(() => {
    setController(initializeChannels(window));
  }, []);
  const state = useSyncExternalStore(
    controller?.subscribe ?? emptySubscribe,
    controller?.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  const channels = state.ready
    ? state.channels.filter((c) => (group === 'text' ? c.type === 'text' : c.type !== 'text'))
    : [];
  return (
    <div id={group === 'text' ? 'textChannelList' : 'chatChannelList'} className="mn-channel-list">
      {!state.ready ? (
        <small className="channel-empty">Carregando canais...</small>
      ) : !channels.length ? (
        <small className="channel-empty">Nenhum canal</small>
      ) : (
        channels.map((channel) => {
          const selected = state.selectedId === channel.id;
          const notice = state.notices[channel.id];
          const people = channel.players.filter((person) => person.inVoice);
          return (
            <button
              key={channel.id}
              type="button"
              data-chat-channel={channel.id}
              className={`mn-channel${selected ? ' active' : ''}${notice?.muted ? ' channel-muted' : ''}`}
              aria-current={selected ? 'page' : 'false'}
              onClick={() => selectChannel(channel.id, group === 'voice')}
            >
              <span className="channel-kind-icon">{channel.type === 'text' ? '#' : '♬'}</span>
              <span className="mn-channel-meta">
                <strong>{channel.name}</strong>
                <small>
                  {channel.type === 'text'
                    ? 'Canal de texto'
                    : `${channel.count} pessoas${channel.voiceActive ? ' · voz ativa' : ''}${channel.type === 'mixed' ? ' · texto e voz' : ''}`}
                </small>
              </span>
              {channel.type !== 'text' && (
                <span className="room-presence-icons">
                  {people.slice(0, 8).map((person) => (
                    <PresenceAvatar key={person.id} person={person} version={state.avatarVersion} />
                  ))}
                  {people.length > 8 && <small>+{people.length - 8}</small>}
                </span>
              )}
              {!!notice?.unread && (
                <span
                  className="channel-unread"
                  aria-label={`${notice.unread} mensagens não lidas`}
                >
                  {Math.min(notice.unread, 99)}
                </span>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}
