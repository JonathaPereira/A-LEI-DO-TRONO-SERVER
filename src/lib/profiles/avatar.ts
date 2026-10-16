import type { AvatarAppearance } from '../../types/domain';

interface ProfileRuntime {
  TronoProfile?: { avatarHtml(person: AvatarAppearance): string; hydrate(host: HTMLElement): void };
}

/** The empty host belongs to the shared profile renderer until its React conversion. */
export function renderProfileAvatar(host: HTMLElement, person: AvatarAppearance): void {
  const profile = (window as ProfileRuntime).TronoProfile;
  host.innerHTML = profile?.avatarHtml(person) ?? '👤';
  profile?.hydrate(host);
}
