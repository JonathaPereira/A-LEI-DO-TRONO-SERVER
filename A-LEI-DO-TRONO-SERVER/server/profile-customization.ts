import type { ProfilePersonalization } from '../src/types/profiles';
import {
  normalizeProfileLinks,
  normalizeProfileMediaCredits,
  validateProfileEmoji,
} from '../src/lib/profiles/validation.ts';

const fail = (message: string) =>
  Object.assign(new Error(message), { code: 'INVALID_PROFILE', status: 400 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate the untrusted HTTP body before it reaches the profile RPC. */
export function cleanProfile(value: unknown): ProfilePersonalization {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('Perfil inválido.');
  const data = value as Record<string, unknown>;
  const text = (key: string, max: number): string => {
    const s = data[key] ?? '';
    if (typeof s !== 'string' || [...s].length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s))
      throw fail('Confira os campos do perfil.');
    return s.trim();
  };
  const handle = text('handle', 24).replace(/^@/, '').toLowerCase();
  if (handle && !/^[a-z0-9_]{3,24}$/.test(handle))
    throw fail('Use de 3 a 24 letras, números ou sublinhado no @usuário.');
  const number = (key: string, fallback: number, min: number, max: number): number => {
    const n = data[key] ?? fallback;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)
      throw fail('Ajuste de aparência inválido.');
    return Math.round(n);
  };
  const file = (key: string): string | null => {
    const id = data[key] || null;
    if (id === null) return null;
    if (typeof id !== 'string' || !UUID.test(id)) throw fail('Imagem de perfil inválida.');
    return id;
  };
  const tags = data.tags ?? [],
    links = data.links ?? [];
  if (
    !Array.isArray(tags) ||
    tags.length > 12 ||
    tags.some((s: unknown) => typeof s !== 'string' || !s.trim() || [...s].length > 24)
  )
    throw fail('Escolha até 12 interesses, com 24 caracteres cada.');
  if (!Array.isArray(links) || links.length > 8) throw fail('Adicione até 8 links.');
  let safeLinks, emoji, mediaCredits;
  try {
    safeLinks = normalizeProfileLinks(links);
    emoji = validateProfileEmoji(text('emoji', 12));
    mediaCredits = normalizeProfileMediaCredits(data.media_credits);
  } catch (error) {
    throw fail(error instanceof Error ? error.message : 'Confira os campos do perfil.');
  }
  const accent = data.accent ?? '#7865ff';
  if (typeof accent !== 'string' || !/^#[0-9a-f]{6}$/i.test(accent)) throw fail('Cor inválida.');
  return {
    handle,
    bio: text('bio', 300),
    status: text('status', 100),
    emoji,
    tags: [...new Set((tags as string[]).map((s) => s.trim()))],
    links: safeLinks,
    cover_file_id: file('cover_file_id'),
    background_file_id: file('background_file_id'),
    accent,
    darkness: number('darkness', 60, 0, 90),
    blur: number('blur', 0, 0, 20),
    opacity: number('opacity', 90, 40, 100),
    reduce_motion: data.reduce_motion === true,
    cover_position: number('cover_position', 50, 0, 100),
    cover_zoom: number('cover_zoom', 100, 100, 250),
    media_credits: mediaCredits,
  };
}
