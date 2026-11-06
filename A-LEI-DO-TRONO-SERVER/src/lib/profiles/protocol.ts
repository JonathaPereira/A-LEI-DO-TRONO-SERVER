import type {
  MemberProfile,
  ProfileLink,
  ProfileMediaCredit,
  ProfileMediaKind,
  ProfilePersonalization,
  RegisteredAccount,
  RegisteredAccountsPage,
} from '../../types/profiles';
import { normalizePreset } from './icons.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
export const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, limit: number): string =>
  typeof value === 'string' ? [...value.replace(CONTROL, '').trim()].slice(0, limit).join('') : '';
const file = (value: unknown): string | null =>
  typeof value === 'string' && UUID.test(value) ? value : null;
export function profileId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('Perfil inválido.');
  return value;
}
function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 400 || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && url.hostname.includes('.')
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function links(value: unknown): readonly ProfileLink[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(
    value.slice(0, 8).flatMap((item: unknown) => {
      if (!record(item)) return [];
      const url = safeUrl(item.url);
      return url
        ? [Object.freeze({ label: text(item.label, 32) || new URL(url).hostname, url })]
        : [];
    }),
  );
}
function credits(value: unknown): ProfilePersonalization['media_credits'] {
  const result: Partial<Record<ProfileMediaKind, ProfileMediaCredit>> = {};
  if (!record(value)) return Object.freeze(result);
  for (const key of ['avatar', 'cover', 'background'] as const) {
    const item = value[key];
    if (!record(item)) continue;
    const source = safeUrl(item.source);
    if (!source) continue;
    const url = new URL(source);
    if (
      url.port ||
      !(
        url.hostname === 'commons.wikimedia.org' ||
        (url.hostname === 'giphy.com' && /^\/(gifs|stickers)\/[\w-]+\/?$/.test(url.pathname))
      )
    )
      continue;
    result[key] = Object.freeze({
      title: text(item.title, 200) || 'GIF',
      author: text(item.author, 200) || 'Autor na fonte',
      license: text(item.license, 80) || 'Ver licença na fonte',
      source,
      license_url: safeUrl(item.license_url) ?? '',
    });
  }
  return Object.freeze(result);
}
export function readProfilePersonalization(value: unknown): ProfilePersonalization {
  const data = record(value) ? value : {};
  const number = (key: string, fallback: number, min: number, max: number): number => {
    const n = data[key];
    return typeof n === 'number' && Number.isFinite(n)
      ? Math.round(Math.min(max, Math.max(min, n)))
      : fallback;
  };
  const handle = text(data.handle, 24).replace(/^@/, '');
  return Object.freeze({
    handle: /^[a-z0-9_]{3,24}$/i.test(handle) ? handle : '',
    bio: text(data.bio, 300),
    status: text(data.status, 100),
    emoji: text(data.emoji, 12),
    tags: Object.freeze(
      Array.isArray(data.tags)
        ? [
            ...new Set(
              data.tags
                .slice(0, 12)
                .map((tag: unknown) => text(tag, 24))
                .filter(Boolean),
            ),
          ]
        : [],
    ),
    links: links(data.links),
    cover_file_id: file(data.cover_file_id),
    background_file_id: file(data.background_file_id),
    accent:
      typeof data.accent === 'string' && /^#[0-9a-f]{6}$/i.test(data.accent)
        ? data.accent
        : '#7865ff',
    darkness: number('darkness', 60, 0, 90),
    blur: number('blur', 0, 0, 20),
    opacity: number('opacity', 90, 40, 100),
    reduce_motion: data.reduce_motion === true,
    cover_position: number('cover_position', 50, 0, 100),
    cover_zoom: number('cover_zoom', 100, 100, 250),
    media_credits: credits(data.media_credits),
  });
}
const date = (value: unknown): string | null =>
  typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value))
    ? value
    : null;
export function readMemberProfile(value: unknown): MemberProfile {
  if (!record(value) || typeof value.nickname !== 'string' || !value.nickname.trim())
    throw new Error('Resposta de perfil inválida.');
  return Object.freeze({
    id: profileId(value.id),
    nickname: text(value.nickname, 80),
    avatar_preset: normalizePreset(value.avatar_preset),
    avatar_file_id: file(value.avatar_file_id),
    created_at: date(value.created_at),
    personalization: readProfilePersonalization(value.personalization),
  });
}
export function readRegisteredAccountsPage(value: unknown): RegisteredAccountsPage {
  if (
    !record(value) ||
    !Array.isArray(value.accounts) ||
    value.accounts.length > 50 ||
    typeof value.hasMore !== 'boolean' ||
    typeof value.nextOffset !== 'number' ||
    !Number.isSafeInteger(value.nextOffset) ||
    value.nextOffset < 0 ||
    value.nextOffset > 1_000_050
  )
    throw new Error('Resposta de contas inválida.');
  const accounts = value.accounts.map((item: unknown): RegisteredAccount => {
    if (
      !record(item) ||
      typeof item.nickname !== 'string' ||
      typeof item.email !== 'string' ||
      item.email.length > 320 ||
      typeof item.confirmed !== 'boolean'
    )
      throw new Error('Resposta de contas inválida.');
    return Object.freeze({
      id: profileId(item.id),
      nickname: text(item.nickname, 80),
      email: item.email,
      confirmed: item.confirmed,
      created_at: date(item.created_at),
    });
  });
  return Object.freeze({
    accounts: Object.freeze(accounts),
    hasMore: value.hasMore,
    nextOffset: value.nextOffset,
  });
}
