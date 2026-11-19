/** Account and guest names share the existing authoritative backend contract. */
export function validNickname(name: unknown): name is string {
  return typeof name === 'string' && /^[\p{L}\p{N} _.-]{2,20}$/u.test(name) && name === name.trim();
}
