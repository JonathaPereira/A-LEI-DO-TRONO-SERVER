'use client';
import { useSyncExternalStore } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import type { GameDestination, GameLibrary } from '../../lib/games/library';
import { GAME_LINKS } from '../../lib/games/library';

/** Library/game controls delegate to the single navigation owner installed by bootstrap. */
export function GameAction({
  destination,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { destination: GameDestination }) {
  return (
    <button
      type="button"
      {...props}
      onClick={() =>
        void (window as Window & { TronoGameLibrary?: GameLibrary }).TronoGameLibrary?.open(
          destination,
        )
      }
    />
  );
}
export function LibraryNavigation({ controller }: { controller: GameLibrary }) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return (
    <>
      <strong>Sua ludoteca</strong>
      {GAME_LINKS.map((link) => (
        <button
          key={link.id}
          type="button"
          className="az-button"
          aria-current={state.destination === link.id ? 'page' : undefined}
          onClick={() => void controller.open(link.id)}
        >
          {link.label}
        </button>
      ))}
      <small>Escolha uma mesa e continue na chamada.</small>
    </>
  );
}
