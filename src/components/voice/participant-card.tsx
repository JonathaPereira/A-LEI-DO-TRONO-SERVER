'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import type { CallStage, ParticipantView } from '../../lib/voice/stage';
import { Avatar } from '../profiles/avatar';
import { ParticipantBackground } from '../profiles/decorations';

function VoiceStatus({ person }: { person: ParticipantView }) {
  return (
    <span className="participant-voice-status" hidden={!person.muted && !person.deafened}>
      {person.muted && (
        <span
          className="participant-status-icon"
          role="img"
          aria-label="Microfone mutado"
          title="Microfone mutado"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 9v3a3 3 0 005 2M15 9V5a3 3 0 00-6 0M5 10v2a7 7 0 0012 5M19 12v-2M12 19v3M8 22h8" />
            <path d="M3 3l18 18" />
          </svg>
        </span>
      )}
      {person.deafened && (
        <span
          className="participant-status-icon"
          role="img"
          aria-label="Áudio da chamada silenciado"
          title="Áudio da chamada silenciado"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 13v-1a8 8 0 0113-6M20 12v5M4 13H2v7h5v-7H4M20 13h2v7h-5v-3" />
            <path d="M3 3l18 18" />
          </svg>
        </span>
      )}
    </span>
  );
}
export function ParticipantCard({
  person: p,
  client,
  openProfile,
  desktop,
}: {
  person: ParticipantView;
  client: CallStage;
  openProfile(id: string): void;
  desktop: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const card = useRef<HTMLDivElement>(null),
    details = useRef<HTMLDivElement>(null),
    expand = useRef<HTMLButtonElement>(null);
  const [native, setNative] = useState(false);
  const cameraDock = p.cameraDock && p.camera && !p.hiddenCamera,
    screenDock = p.screenDock && p.screen && p.watching;
  const title = `${expanded ? 'Recolher' : 'Expandir'} perfil de ${p.name}`;
  useLayoutEffect(() => {
    setNative(typeof details.current?.showPopover === 'function');
  }, []);
  useLayoutEffect(() => {
    const popup = details.current!,
      button = expand.current!;
    const position = () => {
      if (!expanded || !native) return;
      const anchor = button.getBoundingClientRect(),
        top = desktop
          ? (document.getElementById('desktopTopBar')?.getBoundingClientRect().bottom || 0) + 12
          : 12,
        bottom = desktop
          ? (document.getElementById('desktopCallDock')?.getBoundingClientRect().top ||
              innerHeight) - 12
          : innerHeight - 12;
      popup.style.maxHeight = Math.max(100, bottom - top) + 'px';
      const rect = popup.getBoundingClientRect();
      popup.style.left =
        Math.max(12, Math.min(anchor.right - rect.width, innerWidth - rect.width - 12)) + 'px';
      popup.style.top =
        Math.max(top, Math.min(anchor.top - rect.height - 8, bottom - rect.height)) + 'px';
    };
    if (native) {
      if (expanded && !popup.matches(':popover-open')) popup.showPopover();
      else if (!expanded && popup.matches(':popover-open')) popup.hidePopover();
    }
    const toggle = (event: Event) => {
      if ((event as ToggleEvent).newState === 'closed') setExpanded(false);
    };
    popup.addEventListener('toggle', toggle);
    const observer = new ResizeObserver(position);
    observer.observe(card.current!);
    observer.observe(popup);
    window.addEventListener('resize', position);
    document.getElementById('voiceRoster')?.addEventListener('scroll', position, { passive: true });
    position();
    return () => {
      observer.disconnect();
      popup.removeEventListener('toggle', toggle);
      window.removeEventListener('resize', position);
      document.getElementById('voiceRoster')?.removeEventListener('scroll', position);
    };
  }, [expanded, native, desktop]);
  const volume = (value: string) => void client.setVolume(p.id, value);
  return (
    <div
      ref={card}
      className={
        'voice-person joined' +
        (expanded ? ' participant-expanded' : '') +
        (p.speaking && !p.muted ? ' speaking' : '') +
        (cameraDock ? ' camera-in-profile' : '') +
        (cameraDock || screenDock ? ' media-in-profile' : '') +
        (p.activity ? ' has-activity' : '')
      }
      data-peer={p.id}
      data-account-id={p.accountId || ''}
    >
      <ParticipantBackground accountId={p.accountId} />
      <div className="participant-camera-slot" hidden={!cameraDock} />
      <div className="participant-screen-slot" hidden={!screenDock} />
      <span
        className="mn-person-avatar"
        data-color={[...p.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 4}
        role={p.accountId ? 'button' : undefined}
        tabIndex={p.accountId ? 0 : undefined}
        aria-label={'Ver perfil de ' + p.name}
        onClick={() => {
          if (p.accountId) openProfile(p.accountId);
        }}
        onKeyDown={(event) => {
          if (['Enter', ' '].includes(event.key) && p.accountId) {
            event.preventDefault();
            openProfile(p.accountId);
          }
        }}
      >
        <Avatar person={p} className="participant-avatar-image" />
        <i className="participant-online-dot" aria-label="Online" title="Online" />
      </span>
      <strong title={p.name + (p.self ? ' (você)' : '')}>{p.name}</strong>
      <div className="participant-meta">
        <small className="participant-caption" hidden={!!p.activity}>
          {(p.self ? 'Você · ' : '') +
            (p.deafened ? 'Áudio silenciado' : p.muted ? 'Mic mutado' : 'Na voz')}
        </small>
        <small
          className="participant-activity"
          hidden={!p.activity}
          title={p.activity ? 'Atividade: ' + p.activity : ''}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path d="M7 8h10a3 3 0 013 2l2 8a2 2 0 01-3 2l-4-3H9l-4 3a2 2 0 01-3-2l2-8a3 3 0 013-2Z" />
            <path d="M6 12h4m-2-2v4M16 11h.01M18 14h.01" />
          </svg>
          <span>{p.activity}</span>
        </small>
        <VoiceStatus person={p} />
      </div>
      <div
        ref={details}
        className="participant-details"
        hidden={!expanded}
        id={'participant-details-' + p.id}
        popover={native ? 'auto' : undefined}
      >
        <strong className="participant-popup-name">{p.name}</strong>
        <small className="participant-summary">{p.summary}</small>
        <button
          className="participant-camera-toggle"
          type="button"
          hidden={p.self || !p.camera}
          aria-label={(p.hiddenCamera ? 'Mostrar' : 'Ocultar') + ' câmera de ' + p.name}
          aria-pressed={p.hiddenCamera}
          title="Esta preferência muda apenas o que você vê."
          onClick={() => void client.toggleCamera(p.id)}
        >
          {p.hiddenCamera ? 'Mostrar câmera' : 'Ocultar câmera'}
        </button>
        <label className="participant-media-layout" hidden={!p.camera && !p.screen}>
          <span>Exibição</span>
          <select
            aria-label={'Exibição da mídia de ' + p.name}
            value={p.mode}
            onChange={(event) => client.setLayout(p.id, event.currentTarget.value)}
          >
            <option value="auto">Automática</option>
            <option value="camera" disabled={!p.camera}>
              Câmera no perfil
            </option>
            <option value="screen" disabled={!p.screen}>
              Tela no perfil
            </option>
            <option value="stage">Mídia ampliada</option>
          </select>
        </label>
        {!p.self && (
          <label className="mn-peer-gain">
            <span>Volume</span>
            <input
              type="range"
              min="0"
              max="300"
              step="5"
              value={p.volume}
              data-peer-volume={p.id}
              aria-label={'Volume de ' + p.name}
              onInput={(event) => volume(event.currentTarget.value)}
              onChange={(event) => volume(event.currentTarget.value)}
            />
            <output>{p.volume}%</output>
          </label>
        )}
      </div>
      <button
        ref={expand}
        type="button"
        className="participant-expand"
        aria-expanded={expanded}
        aria-controls={'participant-details-' + p.id}
        title={title}
        aria-label={title}
        onClick={() => setExpanded(!expanded)}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </div>
  );
}
