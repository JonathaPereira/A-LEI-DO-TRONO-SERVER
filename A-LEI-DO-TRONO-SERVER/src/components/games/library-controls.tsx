'use client';
import type { ButtonHTMLAttributes } from 'react';
import type { GameDestination, GameLibrary } from '../../lib/games/library';

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
