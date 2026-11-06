import type { ProfileLink, ProfileMediaCredit, ProfileMediaKind } from '../../types/profiles';

/** Shared write contract. Reading old/partial profiles is handled separately by protocol.ts. */
export function normalizeProfileUrl(value: unknown): string {
  let raw = String(value || '').trim();
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

const linkNames: Readonly<Record<string, string>> = {
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'twitch.tv': 'Twitch',
  'instagram.com': 'Instagram',
  'x.com': 'X',
  'github.com': 'GitHub',
};
export function normalizeProfileLinks(
  rows: unknown,
  { strict = true }: { strict?: boolean } = {},
): readonly ProfileLink[] {
  if (!Array.isArray(rows) || rows.length > 8) throw new Error('Adicione até 8 links.');
  const result: ProfileLink[] = [];
  for (const row of rows) {
    const data: Record<string, unknown> = row && typeof row === 'object' ? row : {};
    const address = String(data.url || '').trim(),
      label = String(data.label || '').trim();
    if (!address && !label) continue;
    try {
      if (!address) throw new Error('Preencha o endereço do link ou remova a linha vazia.');
      const url = normalizeProfileUrl(address),
        host = new URL(url).hostname.replace(/^www\./, '');
      const name = label || linkNames[host] || host;
      if (name.length > 32) throw new Error('O nome do link pode ter até 32 caracteres.');
      result.push(Object.freeze({ label: name, url }));
    } catch (error) {
      if (strict) throw error;
    }
  }
  return Object.freeze(result);
}

export function validateProfileEmoji(value: unknown): string {
  const text = String(value || '').trim();
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

export function normalizeProfileMediaCredits(
  value: unknown = {},
): Readonly<Partial<Record<ProfileMediaKind, ProfileMediaCredit>>> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Créditos da mídia inválidos.');
  const result: Partial<Record<ProfileMediaKind, ProfileMediaCredit>> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      (key !== 'avatar' && key !== 'cover' && key !== 'background') ||
      !item ||
      typeof item !== 'object'
    )
      throw new Error('Créditos da mídia inválidos.');
    const data = item as Record<string, unknown>;
    const source = normalizeProfileUrl(data.source),
      licenseURL = data.license_url ? normalizeProfileUrl(data.license_url) : '';
    const origin = new URL(source);
    if (
      origin.port ||
      !(
        origin.hostname === 'commons.wikimedia.org' ||
        (origin.hostname === 'giphy.com' && /^\/(gifs|stickers)\/[\w-]+\/?$/.test(origin.pathname))
      )
    )
      throw new Error('Fonte de GIF inválida.');
    result[key] = Object.freeze({
      title: String(data.title || 'GIF').slice(0, 200),
      author: String(data.author || 'Autor na fonte').slice(0, 200),
      license: String(data.license || 'Ver licença na fonte').slice(0, 80),
      source,
      license_url: licenseURL,
    });
  }
  return Object.freeze(result);
}
