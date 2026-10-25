'use client';

import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { RegisteredAccounts } from '../../lib/profiles/registered-accounts';

export function CreatorAccountsButton({
  controller,
  profile = false,
  disabled = false,
}: {
  controller: RegisteredAccounts;
  profile?: boolean;
  disabled?: boolean;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return (
    <button
      id={profile ? undefined : 'creatorAccountsBtn'}
      type="button"
      className={profile ? 'profile-files-load' : 'chat-header-action'}
      hidden={!state.allowed}
      disabled={disabled}
      onClick={() => void controller.open()}
    >
      {profile ? 'Área do criador · Contas cadastradas' : 'Contas'}
    </button>
  );
}
export function RegisteredAccountsDialog({ controller }: { controller: RegisteredAccounts }) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const dialog = useRef<HTMLDialogElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (state.open && !element.open) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
    } else if (!state.open && element.open) {
      element.close();
      if (returnFocus.current?.isConnected && !returnFocus.current.hidden)
        returnFocus.current.focus();
      returnFocus.current = null;
    }
  }, [state.open]);
  return (
    <dialog
      closedby="any"
      ref={dialog}
      id="creatorAccountsDialog"
      className="creator-accounts-dialog"
      aria-labelledby="creatorAccountsTitle"
      onCancel={(event) => {
        event.preventDefault();
        controller.close();
      }}
      onClose={(event) => {
        if (!event.currentTarget.open) controller.close();
      }}
    >
      <button
        className="member-close"
        type="button"
        aria-label="Fechar contas"
        onClick={controller.close}
      >
        ×
      </button>
      <small>ÁREA DO CRIADOR</small>
      <h2 id="creatorAccountsTitle">Contas cadastradas</h2>
      <p>E-mails de cadastro. Senhas e dados de autenticação não são exibidos.</p>
      <div className="creator-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Cadastro</th>
            </tr>
          </thead>
          <tbody id="creatorAccountsList">
            {state.accounts.map((account) => (
              <tr key={account.id}>
                <td>{account.nickname}</td>
                <td>{account.email}</td>
                <td>{account.confirmed ? 'Confirmado' : 'Aguardando confirmação'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p id="creatorAccountsStatus" role="status" aria-live="polite">
        {state.message}
      </p>
      <button
        id="creatorAccountsMore"
        type="button"
        hidden={!state.hasMore}
        disabled={state.loading}
        onClick={() => void controller.more()}
      >
        Carregar mais
      </button>
    </dialog>
  );
}
