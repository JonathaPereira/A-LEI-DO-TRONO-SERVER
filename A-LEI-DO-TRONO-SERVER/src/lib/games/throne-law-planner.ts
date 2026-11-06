import { throneLaws, type ThroneLaw } from '../../types/throne-choices.ts';

interface LawPlan {
  readonly lawUsage: Readonly<Record<ThroneLaw, number>>;
  readonly currentLaw: ThroneLaw;
  readonly decree: { readonly id: string } | null;
}
/** The local engine and server offer only laws that allow all ten tricks to finish. */
export function safeThroneLawChoices(game: LawPlan, nextTrick: number): ThroneLaw[] {
  if (
    !Number.isInteger(nextTrick) ||
    nextTrick < 2 ||
    nextTrick > 11 ||
    !throneLaws.includes(game.currentLaw) ||
    throneLaws.some(
      (law) =>
        !Number.isInteger(game.lawUsage[law]) || game.lawUsage[law] < 0 || game.lawUsage[law] > 2,
    )
  )
    throw new Error('Estado inválido para planejar as Leis.');
  if (nextTrick === 11) return [];
  const remaining = Object.fromEntries(
    throneLaws.map((law) => [law, 2 - game.lawUsage[law]]),
  ) as Record<ThroneLaw, number>;
  const reserve = game.decree?.id === 'reserva';
  const memo = new Map<string, boolean>();
  function eligible(law: ThroneLaw, trick: number) {
    const hand = reserve ? (trick === 10 ? 1 : 10 - trick) : 11 - trick;
    return law !== 'usurpacao' || hand >= 4;
  }
  function canFinish(last: ThroneLaw, trick: number): boolean {
    if (trick > 10) return throneLaws.every((law) => remaining[law] === 0);
    const key = `${trick}|${last}|${throneLaws.map((law) => remaining[law]).join(',')}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    for (const law of throneLaws) {
      if (remaining[law] <= 0 || law === last || !eligible(law, trick)) continue;
      remaining[law]--;
      const possible = canFinish(law, trick + 1);
      remaining[law]++;
      if (possible) {
        memo.set(key, true);
        return true;
      }
    }
    memo.set(key, false);
    return false;
  }
  return throneLaws.filter((law) => {
    if (remaining[law] <= 0 || law === game.currentLaw || !eligible(law, nextTrick)) return false;
    remaining[law]--;
    const possible = canFinish(law, nextTrick + 1);
    remaining[law]++;
    return possible;
  });
}
