'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import type { ParticipantView } from '../../lib/voice/stage';
import type { ApplicationServices } from './services';
import { useModel } from './services';
import { AppIcon as Icon } from './icons';
import styles from './call.module.css';

/** Local presentation only. Voice, screen audio and moderation delegate to their existing owner. */
export function CallMenu({
  runtime,
  person: p,
  kind,
  visible,
  card,
}: {
  runtime: ApplicationServices;
  person: ParticipantView;
  kind: 'person' | 'screen';
  visible: boolean;
  card: React.RefObject<HTMLElement | null>;
}) {
  const stage = runtime.TronoCallStage,
    state = useModel(stage),
    screen = kind === 'screen';
  const menu = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const previous = useRef(100),
    value = screen ? p.screenVolume : p.volume;
  if (value > 0) previous.current = value;
  const close = () => menu.current?.hidePopover();
  const show = (x: number, y: number) => {
    const node = menu.current;
    if (!node) return;
    node.showPopover();
    const box = node.getBoundingClientRect();
    node.style.left = Math.max(8, Math.min(x, window.innerWidth - box.width - 8)) + 'px';
    node.style.top = Math.max(8, Math.min(y, window.innerHeight - box.height - 8)) + 'px';
    node.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled)')?.focus();
  };
  useLayoutEffect(() => {
    const element = card.current;
    if (!element) return;
    const context = (event: MouseEvent) => {
      event.preventDefault();
      show(event.clientX, event.clientY);
    };
    element.addEventListener('contextmenu', context);
    return () => element.removeEventListener('contextmenu', context);
  });
  useLayoutEffect(() => {
    if (!visible) close();
  }, [visible]);
  const run = (action: () => unknown) => {
    close();
    void action();
  };
  const volume = (v: unknown) =>
    screen ? stage.setScreenVolume(p.id, v) : stage.setVolume(p.id, v);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={(screen ? 'Opções da transmissão de ' : 'Opções de ') + p.name}
        title="Mais opções"
        aria-expanded={open}
        onClick={() => {
          if (open) close();
          else {
            const box = trigger.current!.getBoundingClientRect();
            show(box.right - 260, box.bottom + 8);
          }
        }}
      >
        <Icon name="more" size={17} />
      </button>
      <div
        ref={menu}
        popover="auto"
        role="dialog"
        className={styles.contextMenu}
        aria-label={(screen ? 'Opções da transmissão de ' : 'Opções de ') + p.name}
        onToggle={(event) => setOpen(event.newState === 'open')}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
            trigger.current?.focus();
            event.stopPropagation();
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if ((event.target as HTMLElement).matches('input[type=range]')) return;
            const items = [
              ...menu.current!.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input:not(:disabled)',
              ),
            ];
            const index = items.indexOf(document.activeElement as HTMLElement),
              step = event.key === 'ArrowDown' ? 1 : -1;
            items[(index + step + items.length) % items.length]?.focus();
            event.preventDefault();
          }
        }}
      >
        <strong>
          {screen ? 'Transmissão de ' : ''}
          {p.name}
        </strong>
        <button
          type="button"
          disabled={screen && !p.watching}
          onClick={() => run(() => stage.focus(p.id, kind))}
        >
          <Icon name="expand" size={16} />
          Colocar em foco
        </button>
        {screen ? (
          <button
            type="button"
            disabled={!p.watching || !p.screenLive}
            onClick={() => run(() => runtime.TronoSocial.fullscreenMedia(p.id, 'screen'))}
          >
            Tela cheia
          </button>
        ) : (
          !p.self &&
          p.accountId && (
            <button
              type="button"
              onClick={() =>
                run(() => {
                  runtime.TronoPortal.showOnly('chatOnlyScreen');
                  return runtime.TronoDirectMessages.open(p.accountId!);
                })
              }
            >
              <Icon name="chat" size={16} />
              Mensagem
            </button>
          )
        )}
        {!p.self && (!screen || p.watching) && (
          <div className={styles.volumeGroup}>
            <label>
              {screen ? 'Volume da transmissão' : 'Volume da voz'}
              <output>{value}%</output>
              <input
                type="range"
                min="0"
                max="300"
                step="5"
                value={value}
                aria-label={screen ? 'Volume da transmissão' : 'Volume da voz'}
                disabled={screen && !p.hasScreenAudio}
                onInput={(event) => void volume(event.currentTarget.value)}
                onChange={(event) => void volume(event.currentTarget.value)}
              />
            </label>
            <label className={styles.mute}>
              <input
                type="checkbox"
                checked={value === 0}
                disabled={screen && !p.hasScreenAudio}
                onChange={(event) =>
                  void volume(event.currentTarget.checked ? 0 : previous.current)
                }
              />
              Silenciar para mim
            </label>
            {screen && !p.hasScreenAudio && (
              <small>Esta transmissão não tem áudio compartilhado.</small>
            )}
          </div>
        )}
        {screen ? (
          p.self ? (
            <>
              <button type="button" onClick={() => void stage.togglePreview()}>
                {state.previewPaused ? 'Mostrar prévia local' : 'Pausar prévia local'}
              </button>
              <button
                type="button"
                disabled={state.switching}
                onClick={() => run(stage.switchSource)}
              >
                <Icon name="swap" size={16} />
                Trocar tela ou janela
              </button>
            </>
          ) : (
            <button type="button" onClick={() => run(() => stage.toggleScreen(p.id))}>
              {p.watching ? 'Parar de assistir' : 'Assistir transmissão'}
            </button>
          )
        ) : (
          !!p.camera && (
            <button type="button" onClick={() => run(() => stage.toggleCamera(p.id))}>
              {p.hiddenCamera ? 'Mostrar câmera' : 'Ocultar câmera para mim'}
            </button>
          )
        )}
        {!screen && p.canModerate && (
          <div className={styles.moderation}>
            <small>MODERAÇÃO DA SALA</small>
            <button
              type="button"
              disabled={p.pendingModeration.mute}
              onClick={() =>
                run(() => stage.moderate(p.id, p.serverMuted ? 'unmute' : 'mute', p.name))
              }
            >
              {p.serverMuted ? 'Liberar microfone no servidor' : 'Silenciar microfone no servidor'}
            </button>
            <button
              type="button"
              disabled={p.pendingModeration.media}
              onClick={() =>
                run(() =>
                  stage.moderate(p.id, p.mediaBlocked ? 'allow-media' : 'block-media', p.name),
                )
              }
            >
              {p.mediaBlocked ? 'Liberar mídia no servidor' : 'Bloquear mídia no servidor'}
            </button>
            <button
              type="button"
              disabled={p.pendingModeration.kick}
              className={styles.danger}
              onClick={() => run(() => stage.moderate(p.id, 'kick', p.name))}
            >
              Desconectar da sala
            </button>
          </div>
        )}
      </div>
    </>
  );
}
