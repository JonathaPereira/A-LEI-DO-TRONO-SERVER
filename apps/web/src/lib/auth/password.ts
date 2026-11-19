/** Existing password contract, shared by the browser and authoritative server validation. */
const SYMBOLS = '!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~';
export function passwordChecks(password: unknown) {
  const p = typeof password === 'string' ? password : '';
  return {
    length: [...p].length >= 8,
    lowercase: /[a-z]/.test(p),
    uppercase: /[A-Z]/.test(p),
    number: /[0-9]/.test(p),
    symbol: [...p].some((c) => SYMBOLS.includes(c)),
  };
}
export function validPassword(password: unknown) {
  return (
    typeof password === 'string' &&
    Object.values(passwordChecks(password)).every(Boolean) &&
    new TextEncoder().encode(password).length <= 72
  );
}
