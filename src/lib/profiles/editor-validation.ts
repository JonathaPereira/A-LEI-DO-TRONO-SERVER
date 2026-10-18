import type { ProfileLink, ProfilePersonalization } from '../../types/profiles';

/** Matches the shared profile-data contract; the server still validates every save. */
export function normalizeProfileUrl(value: string): string {
  let raw = value.trim();
  if (!raw) return '';
  if (/^http:\/\//i.test(raw)) raw = raw.replace(/^http:/i, 'https:');
  else if (!/^[a-z][a-z\d+.-]*:/i.test(raw)) raw = 'https://' + raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Confira o endereço do link. Exemplo: youtube.com/@seucanal');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    /\s/.test(raw) ||
    !url.hostname.includes('.') ||
    url.href.length > 400
  )
    throw new Error('Use um link de site válido, sem espaços ou dados de acesso.');
  return url.href;
}
export function normalizeProfileLinks(
  rows: readonly ProfileLink[],
  { strict = true }: { strict?: boolean } = {},
): readonly ProfileLink[] {
  if (rows.length > 8) throw new Error('Adicione até 8 links.');
  const result: ProfileLink[] = [];
  const names: Record<string, string> = {
    'youtube.com': 'YouTube',
    'youtu.be': 'YouTube',
    'twitch.tv': 'Twitch',
    'instagram.com': 'Instagram',
    'x.com': 'X',
    'github.com': 'GitHub',
  };
  for (const row of rows) {
    const address = row.url.trim(),
      label = row.label.trim();
    if (!address && !label) continue;
    try {
      if (!address) throw new Error('Preencha o endereço do link ou remova a linha vazia.');
      const url = normalizeProfileUrl(address),
        host = new URL(url).hostname.replace(/^www\./, '');
      const name = label || names[host] || host;
      if (name.length > 32) throw new Error('O nome do link pode ter até 32 caracteres.');
      result.push(Object.freeze({ label: name, url }));
    } catch (error) {
      if (strict) throw error;
    }
  }
  return Object.freeze(result);
}
export function validateProfileEmoji(value: string): string {
  const text = value.trim();
  if (!text) return '';
  const parts =
    typeof Intl.Segmenter === 'function'
      ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)]
      : [...text];
  if (
    parts.length !== 1 ||
    [...text].length > 12 ||
    !/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(text)
  )
    throw new Error('Escolha um emoji para o status.');
  return text;
}
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
