import { object } from './http-api.ts';
export function readSocketEnvelope(
  value: unknown,
): (Record<string, unknown> & { type: string }) | null {
  if (!object(value) || typeof value.type !== 'string' || !value.type || value.type.length > 80)
    return null;
  if (
    value.requestId !== undefined &&
    (typeof value.requestId !== 'string' || value.requestId.length > 80)
  )
    return null;
  return { ...value, type: value.type };
}
export function readSocketGuest(value: Record<string, unknown>) {
  if (value.name !== undefined && (typeof value.name !== 'string' || value.name.length > 160))
    return null;
  if (value.ticket !== undefined && (typeof value.ticket !== 'string' || value.ticket.length > 256))
    return null;
  return { name: value.name as string | undefined, ticket: value.ticket as string | undefined };
}
export function socketFailure(error: unknown, fallback = 'AUTH_UNAVAILABLE') {
  const known =
    object(error) && typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,80}$/.test(error.code);
  return {
    status:
      object(error) &&
      typeof error.status === 'number' &&
      Number.isInteger(error.status) &&
      error.status >= 400 &&
      error.status <= 599
        ? error.status
        : 503,
    code: known ? (error.code as string) : fallback,
    message:
      known && typeof error.message === 'string'
        ? error.message.slice(0, 500)
        : 'Não foi possível entrar.',
  };
}
