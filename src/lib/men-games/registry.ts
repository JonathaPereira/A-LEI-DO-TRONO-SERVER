import type { GameDestination } from '../games/library';
import type { MenGameManifest } from './types';

export const MEN_GAMES_REGISTRY: readonly MenGameManifest[] = Object.freeze([
  {
    id: 'throne',
    destination: 'throne',
    title: 'A Lei do Trono',
    tag: 'ESTRATÉGIA · CARTAS',
    description: 'A Corte espera sua próxima jogada. Votação de leis, blefe e influência.',
    version: '0.14.0',
    category: 'strategy',
    launchMode: 'embedded-stage',
    entryUrl: '/assets/cards/',
    image: '/assets/games/throne-cover.webp',
    assetsSize: 5129637,
    authRequired: true,
    fullscreen: true,
    multiplayer: true,
    status: 'available',
  },
  {
    id: 'azul',
    destination: 'azul',
    title: 'Azul',
    tag: 'ESTRATÉGIA · 2–4 JOGADORES',
    description: 'Uma cor de cada vez. Uma obra só sua na parede do palácio.',
    version: '1.0.0',
    category: 'tabletop',
    launchMode: 'embedded-stage',
    entryUrl: '/assets/azul/',
    image: '/assets/azul/box-cover.webp',
    assetsSize: 8892000,
    authRequired: true,
    fullscreen: true,
    multiplayer: true,
    status: 'available',
  },
  {
    id: 'splendor',
    destination: 'splendor',
    title: 'Splendor',
    tag: 'ESTRATÉGIA · 2–4 JOGADORES',
    description: 'Gemas, prestígio e uma boa oportunidade para mercadores.',
    version: '1.0.0',
    category: 'tabletop',
    launchMode: 'embedded-stage',
    entryUrl: '/assets/splendor/',
    image: '/assets/games/splendor-cover.webp',
    assetsSize: 840000,
    authRequired: true,
    fullscreen: true,
    multiplayer: true,
    status: 'available',
  },
  {
    id: 'similo',
    destination: 'similo',
    title: 'Similo',
    tag: 'DEDUÇÃO COOPERATIVA · 2–8 JOGADORES',
    description: 'Uma pista, mil conexões. Misture temas e descubra o personagem secreto.',
    version: '1.0.0',
    category: 'deduction',
    launchMode: 'embedded-stage',
    entryUrl: 'https://similo-mn.surge.sh/',
    image: '/assets/similo/cover.svg',
    assetsSize: 13780053,
    authRequired: true,
    fullscreen: true,
    multiplayer: true,
    status: 'available',
  },
  {
    id: 'love-letter',
    destination: 'love-letter',
    title: 'Love Letter',
    tag: 'DEDUÇÃO · 2–6 JOGADORES',
    description: 'Poucas cartas. Muitas intenções para entregar a carta à Princesa.',
    version: '1.0.0',
    category: 'card',
    launchMode: 'embedded-stage',
    entryUrl: '/assets/love-letter/',
    image: '/assets/love-letter/table.webp',
    assetsSize: 460000,
    authRequired: true,
    fullscreen: true,
    multiplayer: true,
    status: 'available',
  },
  {
    id: 'ticket-to-ride',
    destination: 'ticket-to-ride',
    title: 'Ticket to Ride',
    tag: 'ESTRATÉGIA · 2–5 JOGADORES',
    description: 'Conecte cidades através de trilhos ferroviários. Planeje seu caminho.',
    version: '1.0.0',
    category: 'tabletop',
    launchMode: 'embedded-stage',
    entryUrl: '/assets/ticket-to-ride/',
    image: '/assets/ticket-to-ride/board-usa.jpg',
    assetsSize: 1340000,
    authRequired: true,
    fullscreen: true,
    multiplayer: true,
    status: 'available',
  },
  {
    id: 'roguelite',
    destination: 'roguelite',
    title: 'Cinzas do Abismo',
    tag: 'AÇÃO · SOLO',
    description: 'Roguelite de ação 2D visceral. Uma nova jornada a cada tentativa.',
    version: '0.5.2',
    category: 'action',
    launchMode: 'isolated-iframe',
    entryUrl: '/roguelite/',
    image: '/roguelite/assets/catalogue-cover.png',
    assetsSize: 22441566,
    authRequired: false,
    fullscreen: true,
    multiplayer: false,
    status: 'available',
  },
  {
    id: 'atalaia',
    destination: 'atalaia',
    title: 'Atalaia',
    tag: 'TOWER DEFENSE · SOLO',
    description: 'Quinze ondas para defender o cristal sagrado contra as hordas.',
    version: '0.2.1',
    category: 'strategy',
    launchMode: 'external-window',
    entryUrl: 'https://atalaia-mn.surge.sh/',
    image: '/assets/games/atalaia-cover.jpg',
    assetsSize: 18586052,
    authRequired: false,
    fullscreen: true,
    multiplayer: false,
    status: 'available',
  },
  {
    id: 'nexus',
    destination: 'nexus',
    title: 'Nexus',
    tag: 'AVENTURA · JOGO EXTERNO',
    description: 'Ecos do Crepúsculo, na sua próxima aventura de RPG tático por turnos.',
    version: '0.16.0',
    category: 'rpg',
    launchMode: 'external-window',
    entryUrl: 'https://nexus-mn.surge.sh/',
    image: '/assets/games/nexus-cover.webp',
    assetsSize: 87200000,
    authRequired: true,
    fullscreen: true,
    multiplayer: true,
    status: 'available',
  },
]);

export const MEN_GAMES_ORIGIN = 'https://men-games.surge.sh';
export const MEN_GAMES_REGISTRY_URL = `${MEN_GAMES_ORIGIN}/registry.json`;
export const MEN_GAMES_CACHE_KEY = 'mn-games-registry-cache-v1';

const LOCAL_GAME_COVER_PATHS = new Set<string>(MEN_GAMES_REGISTRY.map((game) => game.image));

let latestIndexedGames: readonly MenGameManifest[] = MEN_GAMES_REGISTRY;

function defaultStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readCachedGamesRegistry(
  storage: Pick<Storage, 'getItem'> | null = defaultStorage(),
): readonly MenGameManifest[] | null {
  try {
    const rawJson = storage?.getItem(MEN_GAMES_CACHE_KEY);
    if (!rawJson) {
      return null;
    }
    const parsed = JSON.parse(rawJson) as
      Partial<MenGameManifest>[] | { games?: Partial<MenGameManifest>[] };
    const entries = Array.isArray(parsed) ? parsed : parsed?.games;
    if (!Array.isArray(entries) || entries.length === 0) {
      return null;
    }
    const localById = new Map<string, MenGameManifest>(
      MEN_GAMES_REGISTRY.map((game) => [game.id, game]),
    );
    const normalized: MenGameManifest[] = [];
    for (const rawGame of entries) {
      const id = typeof rawGame?.id === 'string' ? rawGame.id.trim() : '';
      const entry = normalizeRemoteGameManifest(rawGame ?? {}, id ? localById.get(id) : undefined);
      if (entry) {
        normalized.push(entry);
      }
    }
    return normalized.length > 0 ? Object.freeze(normalized) : null;
  } catch {
    return null;
  }
}

export function writeCachedGamesRegistry(
  games: readonly MenGameManifest[],
  storage: Pick<Storage, 'setItem'> | null = defaultStorage(),
): void {
  try {
    if (storage && games.length > 0) {
      storage.setItem(MEN_GAMES_CACHE_KEY, JSON.stringify(games));
    }
  } catch {
    // Ignore storage quota or restricted context errors
  }
}

export function getCachedOrRegisteredGames(
  storage: Pick<Storage, 'getItem'> | null = defaultStorage(),
): readonly MenGameManifest[] {
  return readCachedGamesRegistry(storage) ?? MEN_GAMES_REGISTRY;
}

function resolveRemoteUrl(value: string, origin: string): string {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  const normalizedPath = value.startsWith('/') ? value : `/${value}`;
  return `${origin}${normalizedPath}`;
}

export function normalizeRemoteGameManifest(
  raw: Partial<MenGameManifest>,
  fallback?: MenGameManifest,
): MenGameManifest | null {
  const rawId = typeof raw.id === 'string' ? raw.id.trim() : '';
  const id = (rawId || fallback?.id || '') as GameDestination;
  const destination = (
    typeof raw.destination === 'string' && raw.destination.trim()
      ? raw.destination.trim()
      : fallback?.destination || id
  ) as GameDestination;
  const title =
    typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : fallback?.title || '';
  if (!id || !title) {
    return null;
  }
  const launchMode = raw.launchMode ?? fallback?.launchMode ?? 'isolated-iframe';
  const rawEntryUrl =
    typeof raw.entryUrl === 'string' && raw.entryUrl.trim()
      ? raw.entryUrl.trim()
      : fallback?.entryUrl || `/${id}/index.html`;
  const entryUrl =
    !fallback || launchMode === 'isolated-iframe' || launchMode === 'external-window'
      ? resolveRemoteUrl(rawEntryUrl, MEN_GAMES_ORIGIN)
      : rawEntryUrl;
  const rawImage =
    typeof raw.image === 'string' && raw.image.trim()
      ? raw.image.trim()
      : fallback?.image || '/assets/games/cover.svg';
  const image =
    rawImage.startsWith('/') && !LOCAL_GAME_COVER_PATHS.has(rawImage)
      ? resolveRemoteUrl(rawImage, MEN_GAMES_ORIGIN)
      : rawImage;

  return {
    id,
    destination,
    title,
    tag: typeof raw.tag === 'string' && raw.tag.trim() ? raw.tag.trim() : fallback?.tag || 'JOGO',
    description:
      typeof raw.description === 'string' ? raw.description : fallback?.description || '',
    version:
      typeof raw.version === 'string' && raw.version.trim()
        ? raw.version.trim()
        : fallback?.version || '1.0.0',
    category: raw.category ?? fallback?.category ?? 'strategy',
    launchMode,
    entryUrl,
    image,
    assetsSize: typeof raw.assetsSize === 'number' ? raw.assetsSize : fallback?.assetsSize,
    authRequired:
      typeof raw.authRequired === 'boolean' ? raw.authRequired : (fallback?.authRequired ?? false),
    fullscreen:
      typeof raw.fullscreen === 'boolean' ? raw.fullscreen : (fallback?.fullscreen ?? true),
    multiplayer:
      typeof raw.multiplayer === 'boolean' ? raw.multiplayer : (fallback?.multiplayer ?? false),
    status: raw.status ?? fallback?.status ?? 'available',
  };
}

export async function fetchRemoteGamesRegistry(
  fetchImpl: typeof fetch = fetch,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = defaultStorage(),
): Promise<readonly MenGameManifest[]> {
  try {
    const response = await fetchImpl(MEN_GAMES_REGISTRY_URL, { cache: 'no-store' });
    if (!response || !response.ok) {
      return readCachedGamesRegistry(storage) ?? latestIndexedGames;
    }
    const payload = (await response.json()) as { games?: Partial<MenGameManifest>[] };
    if (!payload || !Array.isArray(payload.games) || payload.games.length === 0) {
      return readCachedGamesRegistry(storage) ?? latestIndexedGames;
    }
    const localById = new Map<string, MenGameManifest>(
      MEN_GAMES_REGISTRY.map((game) => [game.id, game]),
    );
    const normalized: MenGameManifest[] = [];
    for (const rawGame of payload.games) {
      const id = typeof rawGame?.id === 'string' ? rawGame.id.trim() : '';
      const entry = normalizeRemoteGameManifest(rawGame ?? {}, id ? localById.get(id) : undefined);
      if (entry) {
        normalized.push(entry);
      }
    }
    if (normalized.length > 0) {
      latestIndexedGames = Object.freeze(normalized);
      writeCachedGamesRegistry(latestIndexedGames, storage);
    }
  } catch {
    return readCachedGamesRegistry(storage) ?? latestIndexedGames;
  }
  return latestIndexedGames;
}

export function getAllRegisteredGames(): readonly MenGameManifest[] {
  return MEN_GAMES_REGISTRY;
}

export function getIndexedGame(id: string): MenGameManifest | undefined {
  return (
    latestIndexedGames.find((game) => game.id === id || game.destination === id) ??
    getRegisteredGame(id)
  );
}

export function getRegisteredGame(id: string): MenGameManifest | undefined {
  return MEN_GAMES_REGISTRY.find((game) => game.id === id || game.destination === id);
}

export function getGameByDestination(destination: GameDestination): MenGameManifest | undefined {
  return MEN_GAMES_REGISTRY.find((game) => game.destination === destination);
}
