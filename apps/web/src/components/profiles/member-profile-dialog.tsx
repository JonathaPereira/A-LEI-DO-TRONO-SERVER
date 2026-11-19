'use client';

import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { ProfileViewer } from '../../lib/profiles/viewer';
import { MemberCard } from './member-card';
import { AppIcon as Icon } from '../application/icons';
import styles from './member-profile.module.css';

/** React owns the dialog tree; the viewer owns requests and account boundaries. */
export function MemberProfileDialog({ viewer }: { viewer: ProfileViewer }) {
  const state = useSyncExternalStore(viewer.subscribe, viewer.getSnapshot, viewer.getSnapshot);
  const dialog = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (state.open && !element.open) element.showModal();
    else if (!state.open && element.open) element.close();
  }, [state.open]);

  return (
    <dialog
      closedby="any"
      ref={dialog}
      id="memberProfileDialog"
      className={`${styles.dialog} member-profile-dialog${state.full ? ' member-full' : ''}`}
      data-full={state.full}
      aria-label="Perfil do participante"
      onCancel={(event) => {
        event.preventDefault();
        viewer.close();
      }}
      onClose={(event) => {
        // A queued close event must not invalidate a profile opened in the meantime.
        if (!event.currentTarget.open) viewer.close();
      }}
    >
      <button
        className="member-close"
        type="button"
        aria-label="Fechar perfil"
        onClick={() => viewer.close()}
      >
        <Icon name="close" size={18} />
      </button>
      <div id="memberProfileContent" aria-busy={state.loading}>
        {state.open &&
          (state.profile ? (
            <MemberCard
              key={state.profile.id}
              profile={state.profile}
              variant={state.full ? 'full' : 'card'}
            />
          ) : (
            state.message || (state.loading ? 'Carregando perfil…' : '')
          ))}
      </div>
      <footer>
        <button
          id="memberProfileMessage"
          type="button"
          hidden={!state.canMessage}
          onClick={() => viewer.message()}
        >
          <Icon name="chat" size={16} /> Mensagem direta
        </button>
        <button
          id="memberProfileExpand"
          type="button"
          hidden={state.full}
          onClick={() => viewer.expand()}
        >
          <Icon name="expand" size={16} /> Ver perfil completo
        </button>
      </footer>
    </dialog>
  );
}
