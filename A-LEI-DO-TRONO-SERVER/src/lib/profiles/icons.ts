const drawings = {
  crown:
    '<path d="M5 12l6 5 5-10 5 10 6-5-3 13H8zM9 28h14"/><circle cx="5" cy="10" r="1"/><circle cx="16" cy="5" r="1"/><circle cx="27" cy="10" r="1"/>',
  scepter: '<path d="M16 11v16M12 28h8M12 18h8M16 3l4 5-4 5-4-5zM8 9c0 4 3 6 8 6s8-2 8-6"/>',
  key: '<circle cx="11" cy="11" r="7"/><circle cx="11" cy="11" r="2"/><path d="M16 16l12 12M23 23l4-4M20 20l3-3"/>',
  blade: '<path d="M19 5l8-1-1 8-12 12-6-6zM6 17l9 9M9 23l-5 5M3 26l3 3"/>',
  mask: '<path d="M4 9l12-4 12 4-2 11-10 8-10-8zM8 12l5 2-5 2zM24 12l-5 2 5 2zM12 22c2-2 6-2 8 0"/>',
  shield: '<path d="M16 3l11 4v10c0 6-7 10-11 13C12 27 5 23 5 17V7zM16 9v14M10 16h12"/>',
  knight:
    '<path d="M8 26c0-6 3-10 8-12l-5-3 3-7 9 3 3 6-5 5-1 8zM7 29h16M15 7l-1-4"/><circle cx="20" cy="11" r=".7"/>',
  dragon:
    '<path d="M7 26c-6-6-3-15 5-15l1-7 5 5 7-2-2 6 5 3-5 5-7-1c-4 0-5 4-2 7M16 10l-2 7 4 2M7 16l4 3M4 21l6 1M20 24l5 3"/><circle cx="20" cy="13" r=".7"/>',
  person: '<circle cx="16" cy="10" r="6"/><path d="M5 28v-3c0-5 5-8 11-8s11 3 11 8v3z"/>',
  cat: '<path d="M6 15V5l7 5h6l7-5v10c5 12-25 12-20 0zM14 21l2 2 2-2M16 23v3M3 19l7 2M29 19l-7 2M3 24l7-1M29 24l-7-1"/><circle cx="11" cy="17" r="1"/><circle cx="21" cy="17" r="1"/>',
  dog: '<path d="M10 7l-5-2-3 11 5 3 3-8M22 7l5-2 3 11-5 3-3-8M10 7c4-2 8-2 12 0v13c0 11-12 11-12 0zM14 21l2 2 2-2M16 23v4"/><circle cx="13" cy="15" r="1"/><circle cx="19" cy="15" r="1"/>',
  robot:
    '<rect x="6" y="8" width="20" height="20" rx="5"/><path d="M16 8V4M3 15v7M29 15v7M11 23h10M11 14v4M21 14v4"/><circle cx="16" cy="3" r="1"/>',
  star: '<path d="M16 3l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z"/>',
  moon: '<path d="M24 25A13 13 0 0111 3c-7 14 4 24 16 18l-3 4zM24 4v6M21 7h6"/>',
  gamepad:
    '<path d="M9 9h14c5 0 8 16 4 18-3 1-5-5-8-5h-6c-3 0-5 6-8 5-4-2-1-18 4-18zM10 13v8M6 17h8"/><circle cx="22" cy="14" r="1"/><circle cx="25" cy="18" r="1"/>',
  flower:
    '<circle cx="16" cy="14" r="4"/><path d="M12 10c-5-8 8-8 8 0 8-5 10 8 2 8 5 8-8 10-10 2-8 5-10-8-2-8M16 23v7M16 28c-8 0-8-7 0-3M16 28c8 0 8-7 0-3"/>',
} as const;

export type AvatarPreset = keyof typeof drawings;
export const AVATAR_PRESETS = Object.freeze({
  crown: 'Coroa',
  scepter: 'Cetro',
  key: 'Chave',
  blade: 'Lâmina',
  mask: 'Máscara',
  shield: 'Escudo',
  knight: 'Cavaleiro',
  dragon: 'Dragão',
  person: 'Pessoa',
  cat: 'Gato',
  dog: 'Cachorro',
  robot: 'Robô',
  star: 'Estrela',
  moon: 'Lua',
  gamepad: 'Controle',
  flower: 'Flor',
});
export function normalizePreset(value: unknown): AvatarPreset {
  return typeof value === 'string' && Object.hasOwn(drawings, value)
    ? (value as AvatarPreset)
    : 'crown';
}
export function avatarIcon(value: unknown): string {
  return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${drawings[normalizePreset(value)]}</svg>`;
}
