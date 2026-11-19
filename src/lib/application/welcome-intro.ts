import type { AccountRole } from '../../types/domain';

export const WELCOME_INTRO_EVENT = 'trono:replay-welcome-intro';
export const WELCOME_INTRO_EXIT_DELAY_MS = 4450;
export const WELCOME_INTRO_DURATION_MS = 4950;
export const WELCOME_INTRO_MIN_READY_EXIT_MS = 2300;
export const WELCOME_INTRO_MIN_READY_DURATION_MS = 2750;
export const WELCOME_INTRO_REDUCED_EXIT_DELAY_MS = 450;
export const WELCOME_INTRO_REDUCED_DURATION_MS = 650;

export function triggerWelcomeIntroReplay(target?: EventTarget) {
  const host = target ?? (typeof window !== 'undefined' ? window : undefined);
  if (!host) return;
  host.dispatchEvent(new CustomEvent(WELCOME_INTRO_EVENT));
}

export function buildWelcomeIdentityKey(
  account: { id?: string | null; role?: AccountRole | string | null } | null | undefined,
  isGuest: boolean,
): string | null {
  if (!account?.id) return null;
  // Key strictly on account id + guest flag so background role/token refreshes never re-trigger mid-session.
  return `${isGuest ? 'guest' : 'user'}:${account.id}`;
}

export function getWelcomeGreeting(
  account: { nickname?: string | null } | null | undefined,
): string {
  const name = account?.nickname?.trim();
  return name ? `Bem vindo, ${name}` : 'Bem vindo à Corte';
}

export function getWelcomeRoleLabel(
  account: { role?: AccountRole | string | null } | null | undefined,
  isGuest: boolean,
): string {
  if (isGuest || account?.role === 'guest') return 'Convidado da Mesa';
  if (account?.role === 'creator') return 'Criador da Corte';
  if (account?.role === 'admin') return 'Administrador da Corte';
  return 'Membro da Corte';
}

export function getWelcomeLoadStatus(flags: {
  connected: boolean;
  channelsReady: boolean;
  membersReady: boolean;
  isGuest: boolean;
}): string {
  if (flags.isGuest) {
    return flags.connected
      ? 'Mesa pronta · Bem-vindo à Corte'
      : 'Preparando sua mesa e recursos de jogo…';
  }
  if (!flags.connected) return 'Conectando aos servidores da Corte…';
  if (!flags.channelsReady) return 'Carregando canais, mensagens e avatar…';
  if (!flags.membersReady) return 'Sincronizando membros e presença…';
  return 'Corte sincronizada · Abrindo sua mesa…';
}
