import type { AvatarAppearance } from '../../types/domain';

export function avatarFile(person: AvatarAppearance): string | null {
  return person.avatar_file_id && /^[a-f0-9-]{36}$/i.test(person.avatar_file_id)
    ? person.avatar_file_id
    : null;
}
