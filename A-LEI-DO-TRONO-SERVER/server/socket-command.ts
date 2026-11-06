import { object } from './http-api.ts';

/** Correlation is bounded independently of each domain's command shape. */
export const readRequestId = (value: unknown): string | undefined =>
  object(value) &&
  typeof value.requestId === 'string' &&
  value.requestId.length > 0 &&
  value.requestId.length <= 128
    ? value.requestId
    : undefined;
