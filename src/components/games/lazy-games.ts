import { createLazyRegistry } from '../../lib/games/lazy-registry.ts';
import { initializeAzul } from './azul-runtime.tsx';
import { initializeSplendor } from './splendor-runtime.tsx';
import { initializeLoveLetter } from './love-letter-runtime.tsx';
import { initializeSimilo } from './similo-runtime.tsx';
import { initializeTicketToRide } from '../../lib/games/ticket-to-ride.ts';
import { initializeRoguelite } from './roguelite-runtime.tsx';
import { initializeNexus } from '../../lib/games/nexus.ts';
import { initializeAtalaia } from '../../lib/games/atalaia.ts';

export type GameFacadeName =
  | 'TronoAzul'
  | 'TronoSplendor'
  | 'TronoLoveLetter'
  | 'TronoSimilo'
  | 'TronoTicketToRide'
  | 'TronoRoguelite'
  | 'TronoNexus'
  | 'TronoAtalaia';

const registry = createLazyRegistry<GameFacadeName>();

registry.register('TronoAzul', initializeAzul);
registry.register('TronoSplendor', initializeSplendor);
registry.register('TronoLoveLetter', initializeLoveLetter);
registry.register('TronoSimilo', initializeSimilo);
registry.register('TronoTicketToRide', initializeTicketToRide);
registry.register('TronoRoguelite', initializeRoguelite);
registry.register('TronoNexus', initializeNexus);
registry.register('TronoAtalaia', initializeAtalaia);

export function isGameInitialized(target: Window, propertyName: GameFacadeName): boolean {
  return registry.isInitialized(target, propertyName);
}

export function ensureGameInitialized(target: Window, propertyName: GameFacadeName): void {
  registry.ensureInitialized(target, propertyName);
}

export function initializeLazyGames(target: Window): () => void {
  return registry.install(target);
}
