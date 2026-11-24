'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  filterRegisteredAccounts,
  type RegisteredAccounts,
} from '../../lib/profiles/registered-accounts';

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
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!state.open) {
      setQuery('');
      setCopiedId(null);
      if (copyTimer.current) {
        clearTimeout(copyTimer.current);
        copyTimer.current = null;
      }
    }
    return () => {
      if (copyTimer.current) {
        clearTimeout(copyTimer.current);
        copyTimer.current = null;
      }
    };
  }, [state.open]);
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
  const visibleAccounts = filterRegisteredAccounts(state.accounts, query);
  function copyEmail(id: string, email: string) {
    if (!navigator.clipboard?.writeText) return;
    void navigator.clipboard
      .writeText(email)
      .then(() => {
        setCopiedId(id);
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => {
          copyTimer.current = null;
          setCopiedId(null);
        }, 1800);
      })
      .catch(() => {});
  }
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
      <div className="creator-accounts-toolbar">
        <input
          id="creatorAccountsSearch"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrar por nome ou e-mail…"
          aria-label="Filtrar contas cadastradas"
        />
        <button
          id="creatorAccountsRefresh"
          type="button"
          disabled={state.loading}
          onClick={() => void controller.open()}
        >
          Atualizar
        </button>
      </div>
      <div className="creator-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Cadastro</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody id="creatorAccountsList">
            {visibleAccounts.map((account) => (
              <tr key={account.id}>
                <td>{account.nickname}</td>
                <td>{account.email}</td>
                <td>{account.confirmed ? 'Confirmado' : 'Aguardando confirmação'}</td>
                <td>
                  <button
                    type="button"
                    className="creator-copy-email"
                    onClick={() => copyEmail(account.id, account.email)}
                  >
                    {copiedId === account.id ? 'Copiado' : 'Copiar'}
                  </button>
                </td>
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
