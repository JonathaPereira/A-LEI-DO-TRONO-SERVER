import type { ThroneDisclosure, ThroneIntelligence } from '../../types/throne-private';
import { record } from '../files/protocol.ts';
import { readThroneCard } from './throne-choice-protocol.ts';
import { freezeGame } from './freeze.ts';

const invalid = () => new Error('Informação privada de A Lei do Trono inválida.');
function name(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) throw invalid();
  return value;
}
export function readThroneIntelligence(value: unknown): ThroneIntelligence {
  if (
    !record(value) ||
    !Number.isInteger(value.target) ||
    (value.target as number) < 0 ||
    (value.target as number) > 3
  )
    throw invalid();
  return freezeGame({
    target: value.target as number,
    name: name(value.name),
    card: readThroneCard(value.card),
  });
}
export function readThroneDisclosure(value: unknown): ThroneDisclosure {
  if (!record(value)) throw invalid();
  if (value.kind === 'intelligence')
    return freezeGame({ kind: value.kind, clue: readThroneIntelligence(value.clue) });
  if (
    value.kind !== 'usurpation' ||
    !['shadow', 'target'].includes(String(value.role)) ||
    (value.returnedSameCard != null && value.returnedSameCard !== false)
  )
    throw invalid();
  const outgoing = readThroneCard(value.outgoing),
    incoming = readThroneCard(value.incoming);
  if (
    outgoing.id === incoming.id ||
    outgoing.publicReason === 'Corte Aberta' ||
    incoming.publicReason === 'Corte Aberta'
  )
    throw invalid();
  return freezeGame({
    kind: value.kind,
    role: value.role as 'shadow' | 'target',
    otherName: name(value.otherName),
    outgoing,
    incoming,
  });
}
