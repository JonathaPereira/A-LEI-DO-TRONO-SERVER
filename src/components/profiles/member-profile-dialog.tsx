'use client';

import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { ProfileViewer } from '../../lib/profiles/viewer';
import { MemberCard } from './member-card';

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
      ref={dialog}
      id="memberProfileDialog"
      className={`member-profile-dialog${state.full ? ' member-full' : ''}`}
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
        ×
      </button>
      <div id="memberProfileContent" aria-busy={state.loading}>
        {state.open &&
          (state.profile ? (
            <MemberCard key={state.profile.id} profile={state.profile} />
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
          Mensagem direta
        </button>
        <button
          id="memberProfileExpand"
          type="button"
          hidden={state.full}
          onClick={() => viewer.expand()}
        >
          Ver perfil completo
        </button>
      </footer>
    </dialog>
  );
}
