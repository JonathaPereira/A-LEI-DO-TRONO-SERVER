interface BotPlayer {
  readonly name?: string;
  readonly bot?: boolean;
  readonly ai?: boolean;
}
export const names = Object.freeze(['Epaminondas', 'Bonifácio', 'Cícero']);
/** Shared by local games and tabletop services; human names do not reserve bot names. */
export function next(players: readonly BotPlayer[] = []): string {
  const used = new Set(
    players.filter((player) => player.bot || player.ai).map((player) => player.name),
  );
  for (let group = 0; ; group++)
    for (const base of names) {
      const name = base + (group ? ' ' + (group + 1) : '');
      if (!used.has(name)) return name;
    }
}
export const at = (index: number): string =>
  names[index % names.length] +
  (index >= names.length ? ' ' + (Math.floor(index / names.length) + 1) : '');
