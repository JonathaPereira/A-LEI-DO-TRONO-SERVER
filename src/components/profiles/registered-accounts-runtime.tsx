import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createRegisteredAccounts } from '../../lib/profiles/registered-accounts';
import type { RegisteredAccounts } from '../../lib/profiles/registered-accounts';
import type { ProfilesClient } from '../../lib/profiles/client';
import type { NetworkAccount } from '../../types/network';
import { CreatorAccountsButton, RegisteredAccountsDialog } from './registered-accounts';

interface AccountsRuntime extends Window {
  TronoProfiles: ProfilesClient;
  TronoAuth: { readonly user: NetworkAccount | null };
}
const installed = new WeakMap<Window, RegisteredAccounts>();
export function initializeRegisteredAccounts(target: Window): RegisteredAccounts {
  const existing = installed.get(target);
  if (existing) return existing;
  const runtime = target as AccountsRuntime;
  const controller = createRegisteredAccounts({
    profiles: runtime.TronoProfiles,
    getAccount: () => runtime.TronoAuth.user,
  });
  installed.set(target, controller);
  const host = target.document.createElement('div');
  host.id = 'registeredAccountsHost';
  target.document.body.append(host);
  const button = target.document.getElementById('creatorAccountsButtonHost')!;
  flushSync(() => {
    createRoot(host).render(<RegisteredAccountsDialog controller={controller} />);
    createRoot(button).render(<CreatorAccountsButton controller={controller} />);
  });
  return controller;
}
