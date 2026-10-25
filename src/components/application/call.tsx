'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { ParticipantView, StageSnapshot } from '../../lib/voice/stage';
import type { CallControlId } from '../../lib/voice/toolbar';
import { CallMenu } from './call-menu';
import { Avatar } from '../profiles/avatar';
import { AppIcon as Icon } from './icons';
import { useModel, type ApplicationServices } from './services';
import styles from './call.module.css';

type CallHosts = {
  grid: RefObject<HTMLDivElement | null>;
  focus: RefObject<HTMLDivElement | null>;
  strip: RefObject<HTMLDivElement | null>;
};

function CallCard({
  runtime,
  person: p,
  kind,
  visible,
  snapshot: state,
  hosts,
  order,
}: {
  runtime: ApplicationServices;
  person: ParticipantView;
  kind: 'person' | 'screen';
  visible: boolean;
  snapshot: StageSnapshot;
  hosts: CallHosts;
  order: number;
}) {
  const [element] = useState(() => document.createElement('article'));
  const card = useRef<HTMLElement>(element);
  const stage = runtime.TronoCallStage,
    screen = kind === 'screen';
  const focused = state.focused?.id === p.id && state.focused.kind === kind;
  const live = screen ? p.watching && p.screenLive : p.camera && !p.hiddenCamera && p.cameraLive;
  const paused = screen && p.self && state.previewPaused;
  const select = () => {
    if (screen && !p.watching) void stage.toggleScreen(p.id);
    if (focused) stage.grid();
    else stage.focus(p.id, kind);
  };
  useLayoutEffect(() => {
    element.className = styles.card;
    element.setAttribute('aria-label', (screen ? 'Tela de ' : 'Participante ') + p.name);
    element.dataset[screen ? 'callScreen' : 'callPerson'] = p.id;
    element.dataset.focused = String(focused);
    element.dataset.speaking = String(!screen && p.speaking);
    element.style.order = String(order);
    const host = state.focused
      ? focused
        ? hosts.focus.current
        : hosts.strip.current
      : hosts.grid.current;
    if (host && element.parentElement !== host) {
      const active = document.activeElement;
      if (element.isConnected && host.moveBefore) host.moveBefore(element, null);
      else host.append(element);
      if (
        active instanceof HTMLElement &&
        element.contains(active) &&
        document.activeElement !== active
      )
        active.focus({ preventScroll: true });
    }
  });
  useLayoutEffect(() => () => element.remove(), [element]);
  return createPortal(
    <>
      <button
        type="button"
        className={styles.focusTarget}
        title={focused ? 'Voltar à grade' : 'Ampliar ' + p.name}
        aria-label={focused ? 'Voltar à grade' : 'Ampliar ' + p.name}
        aria-pressed={focused}
        onClick={select}
      >
        <span className={styles.focusGlyph}>
          <Icon name={focused ? 'grid' : 'expand'} size={16} />
        </span>
      </button>
      <div className={styles.video} data-call-video />
      <div className={styles.placeholder} hidden={!!live && !paused}>
        {screen ? (
          <>
            <Icon name="screen" size={30} />
            <strong>Tela de {p.name}</strong>
            {paused ? (
              <small>Sua transmissão continua. A prévia local está pausada.</small>
            ) : p.watching ? (
              <small>Conectando à transmissão…</small>
            ) : (
              <button type="button" className={styles.watch} onClick={select}>
                Assistir transmissão
              </button>
            )}
          </>
        ) : (
          <Avatar person={p} className={styles.avatar} />
        )}
      </div>
      {screen && <span className={styles.live}>AO VIVO</span>}
      <div className={styles.cardActions}>
        <CallMenu runtime={runtime} person={p} kind={kind} visible={visible} card={card} />
      </div>
      <span className={styles.name}>
        <Icon name={screen ? 'screen' : p.muted ? 'microphoneSlash' : 'microphone'} size={13} />
        {p.name}
        {p.self ? ' (você)' : ''}
      </span>
    </>,
    element,
  );
}
export function CallSurface({
  runtime,
  visible,
  chatOpen,
  toggleChat,
}: {
  runtime: ApplicationServices;
  visible: boolean;
  chatOpen: boolean;
  toggleChat(): void;
}) {
  const stage = runtime.TronoCallStage,
    state = useModel(stage),
    toolbar = useModel(runtime.TronoCallToolbar);
  const grid = useRef<HTMLDivElement>(null),
    focus = useRef<HTMLDivElement>(null),
    strip = useRef<HTMLDivElement>(null);
  const hosts = { grid, focus, strip };
  const count = state.participants.length + state.screens.length;
  const slots = state.participants.map((p) => p.id + ':' + !!p.screen).join(',');
  useLayoutEffect(() => {
    window.dispatchEvent(new Event('trono:call-hosts'));
  }, [slots]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        visible &&
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !document.fullscreenElement &&
        !document.querySelector('dialog[open], [popover]:popover-open, .media-maximized')
      ) {
        if (chatOpen) toggleChat();
        else stage.grid();
      }
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [stage, visible, chatOpen, toggleChat]);
  const controls: readonly [
    CallControlId,
    (
      | 'microphone'
      | 'microphoneSlash'
      | 'headphones'
      | 'camera'
      | 'cameraOff'
      | 'screen'
      | 'settings'
      | 'disconnect'
    ),
  ][] = [
    ['muteMicBtn', toolbar.buttons.muteMicBtn.active ? 'microphoneSlash' : 'microphone'],
    ['deafenVoiceBtn', 'headphones'],
    ['cameraBtn', toolbar.buttons.cameraBtn.active ? 'camera' : 'cameraOff'],
    ['screenShareBtn', 'screen'],
    ['voiceSettingsBtn', 'settings'],
    ['joinVoiceBtn', 'disconnect'],
  ];
  return (
    <section
      className={styles.call}
      data-focused={!!state.focused}
      hidden={!visible}
      aria-label="Chamada da Corte"
    >
      <header className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>À MESMA MESA</span>
          <h1>{state.roomName || 'Salão da Corte'}</h1>
          <p>
            {state.joined
              ? state.participants.length + ' na chamada'
              : 'Entre na voz para participar.'}
          </p>
        </div>
        <div className={styles.headingActions}>
          {state.focused && (
            <button type="button" onClick={stage.grid}>
              <Icon name="grid" size={16} /> Grade
            </button>
          )}
          <button
            type="button"
            aria-label={chatOpen ? 'Ocultar conversa da chamada' : 'Mostrar conversa da chamada'}
            aria-expanded={chatOpen}
            onClick={toggleChat}
          >
            <Icon name="chat" size={17} /> Conversas
          </button>
        </div>
      </header>
      <div
        ref={grid}
        className={styles.grid}
        hidden={!!state.focused}
        data-focus="false"
        data-many={count > 4}
        data-crowded={count > 9}
        data-stack={count > 2}
        style={
          {
            '--rows-one': Math.max(1, count),
            '--rows-two': Math.max(1, Math.ceil(count / 2)),
            '--rows-three': Math.max(1, Math.ceil(count / 3)),
            '--rows-four': Math.max(1, Math.ceil(count / 4)),
          } as CSSProperties
        }
      >
        {!state.participants.length && (
          <p className={styles.empty}>A sala está pronta para a próxima conversa.</p>
        )}
      </div>
      <div className={styles.focusLayout} hidden={!state.focused}>
        <div ref={focus} className={styles.focusMain} aria-label="Quadro em foco" />
        <div ref={strip} className={styles.filmstrip} aria-label="Outros quadros da chamada" />
      </div>
      {state.participants.map((p, index) => (
        <CallCard
          key={'person:' + p.id}
          runtime={runtime}
          person={p}
          snapshot={state}
          hosts={hosts}
          order={index}
          kind="person"
          visible={visible}
        />
      ))}
      {state.screens.map((p, index) => (
        <CallCard
          key={'screen:' + p.id}
          runtime={runtime}
          person={p}
          snapshot={state}
          hosts={hosts}
          order={state.participants.length + index}
          kind="screen"
          visible={visible}
        />
      ))}

      <footer className={styles.footer} data-status={toolbar.status.kind}>
        <div className={styles.controls}>
          {controls.map(([id, icon]) => (
            <button
              type="button"
              key={id}
              aria-label={toolbar.buttons[id].label}
              title={toolbar.buttons[id].title}
              aria-pressed={toolbar.buttons[id].active}
              disabled={toolbar.buttons[id].disabled}
              data-control={id}
              data-danger={id === 'joinVoiceBtn'}
              onClick={() => void runtime.TronoCallToolbar.activate(id)}
            >
              <Icon name={icon} />
            </button>
          ))}
        </div>
        <p role="status">{toolbar.status.text}</p>
      </footer>
    </section>
  );
}
