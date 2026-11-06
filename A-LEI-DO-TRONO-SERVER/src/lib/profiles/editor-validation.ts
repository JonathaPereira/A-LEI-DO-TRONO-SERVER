import type { ProfileLink, ProfilePersonalization } from '../../types/profiles';
import { normalizeProfileLinks, validateProfileEmoji } from './validation.ts';
export { normalizeProfileUrl, normalizeProfileLinks, validateProfileEmoji } from './validation.ts';

export const profileTags = (value: string): readonly string[] =>
  Object.freeze(
    value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
export function validateEditorDraft(
  draft: ProfilePersonalization,
  links: readonly ProfileLink[],
  tags: string,
): ProfilePersonalization {
  const safeTags = profileTags(tags);
  if (safeTags.length > 12 || safeTags.some((tag) => [...tag].length > 24))
    throw new Error('Escolha até 12 interesses, com 24 caracteres cada.');
  return Object.freeze({
    ...draft,
    tags: safeTags,
    links: normalizeProfileLinks(links),
    emoji: validateProfileEmoji(draft.emoji),
  });
}
