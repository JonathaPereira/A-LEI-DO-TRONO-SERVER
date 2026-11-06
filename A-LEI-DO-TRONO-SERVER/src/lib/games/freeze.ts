/** Freeze owned DTOs recursively; callers must parse or copy external objects first. */
export function freezeGame<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeGame(child);
    Object.freeze(value);
  }
  return value;
}
