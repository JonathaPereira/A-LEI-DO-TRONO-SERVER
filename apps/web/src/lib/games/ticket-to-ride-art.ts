import { trackSlots, pieceFrames } from './ticket-to-ride-track-layout.ts';

import type { TicketToRideCardColor, TicketToRideRoute } from '../../types/ticket-to-ride';

export const base = 'assets/ticket-to-ride/';

// Coordinates belong to the supplied 1024 × 683 board, independently of game rules.
export const cities: Record<string, readonly [number, number]> = {
  Vancouver: [109, 105],
  Seattle: [105, 160],
  Portland: [83, 211],
  'San Francisco': [69, 408],
  'Los Angeles': [147, 512],
  Calgary: [239, 88],
  Helena: [340, 220],
  'Salt Lake City': [268, 344],
  'Las Vegas': [212, 454],
  Phoenix: [267, 519],
  Winnipeg: [464, 99],
  Duluth: [577, 214],
  Omaha: [546, 306],
  Denver: [398, 375],
  'Santa Fe': [391, 466],
  'El Paso': [386, 556],
  'Sault St. Marie': [704, 148],
  Toronto: [813, 170],
  Chicago: [699, 276],
  'Kansas City': [567, 357],
  'Oklahoma City': [547, 444],
  Dallas: [567, 532],
  Houston: [608, 572],
  'Saint Louis': [653, 358],
  'Little Rock': [637, 448],
  'New Orleans': [701, 560],
  Nashville: [747, 397],
  Atlanta: [798, 432],
  Miami: [924, 597],
  Charleston: [892, 439],
  Raleigh: [864, 374],
  Pittsburgh: [830, 261],
  Washington: [923, 307],
  'New York': [914, 216],
  Boston: [967, 142],
  Montreal: [896, 83],
};

export const cards: Record<TicketToRideCardColor, readonly [number, number, number, number]> = {
  purple: [32, 27, 300, 461],
  white: [365, 27, 297, 461],
  blue: [691, 27, 303, 461],
  yellow: [32, 524, 300, 464],
  orange: [365, 524, 297, 464],
  black: [691, 524, 303, 464],
  red: [32, 1021, 300, 474],
  green: [365, 1021, 297, 474],
  loco: [691, 1021, 303, 474],
};

export type TicketToRidePieceSpriteKey = 'red' | 'blue' | 'green' | 'yellow';

export const pieces: Record<TicketToRidePieceSpriteKey, readonly [number, number, number, number]> =
  {
    red: [0, 0, 768, 512],
    blue: [768, 0, 768, 512],
    green: [0, 512, 768, 512],
    yellow: [768, 512, 768, 512],
  };

export const playerColors = ['#d83836', '#238ee5', '#2dba59', '#e3b92c', '#ad79cf'] as const;

export type TicketToRidePlayerPieceColor = TicketToRidePieceSpriteKey | 'purple';

export const playerPieces: readonly TicketToRidePlayerPieceColor[] = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
];

export interface TicketToRideRoutePoint {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export interface TicketToRideRouteWagon extends TicketToRideRoutePoint {
  readonly width: number;
}

export interface TicketToRideRouteGeometry {
  readonly path: string;
  readonly middle: TicketToRideRoutePoint;
  readonly wagons: TicketToRideRouteWagon[];
}

export function geometry(
  route: Pick<TicketToRideRoute, 'a' | 'b' | 'group' | 'double' | 'lane' | 'length'>,
): TicketToRideRouteGeometry {
  const slots = trackSlots['r' + route.group + '-' + route.lane];
  if (!slots || slots.length !== route.length)
    throw new Error('Route missing from the supplied board calibration.');
  const wagons = slots.map(([x, y, angle, width], i) => {
    const before = slots[i - 1] ?? cities[route.a];
    const after = slots[i + 1] ?? cities[route.b];
    const radians = (angle * Math.PI) / 180;
    if (Math.cos(radians) * (after[0] - before[0]) + Math.sin(radians) * (after[1] - before[1]) < 0)
      angle += 180;
    return { x, y, angle, width: Math.max(28, Math.min(34, width - 2)) };
  });
  const path = wagons
    .flatMap((w, i) => {
      const radians = (w.angle * Math.PI) / 180;
      const dx = (Math.cos(radians) * w.width) / 2;
      const dy = (Math.sin(radians) * w.width) / 2;
      return [
        (i ? 'L' : 'M') + (w.x - dx).toFixed(2) + ' ' + (w.y - dy).toFixed(2),
        'L' + (w.x + dx).toFixed(2) + ' ' + (w.y + dy).toFixed(2),
      ];
    })
    .join(' ');
  const middle = wagons[Math.floor(wagons.length / 2)];
  return { path, middle, wagons };
}

export const TicketToRideArt = {
  base,
  board: base + 'board-usa.jpg',
  fronts: base + 'train-cards.webp',
  back: base + 'train-back.webp',
  destinations: base + 'destination-back.webp',
  wagons: base + 'wagons.webp',
  cities,
  cards,
  pieces,
  playerColors,
  playerPieces,
  pieceFrames,
  geometry,
};

(
  globalThis as typeof globalThis & {
    TicketToRideArt?: typeof TicketToRideArt;
  }
).TicketToRideArt = TicketToRideArt;
