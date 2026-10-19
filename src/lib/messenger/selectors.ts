import type { DirectPerson, MessengerSnapshot } from '../../types/messenger';
export function directPerson(state: MessengerSnapshot, id: string | null) {
  return (
    state.members.find((row) => row.id === id) ??
    state.friends.find((row) => row.id === id) ??
    state.threads.find((row) => row.id === id)
  );
}
export function directUnread(state: MessengerSnapshot) {
  return (
    state.threads.reduce((sum, row) => sum + row.unread, 0) +
    state.friends.filter((row) => row.state === 'pending' && row.incoming).length
  );
}
export function directPeople(state: MessengerSnapshot) {
  const peers = new Map<string, DirectPerson & { readonly unread: number }>();
  for (const entry of [
    ...state.threads,
    ...state.friends.filter((row) => row.state === 'accepted'),
  ]) {
    if (!peers.has(entry.id))
      peers.set(
        entry.id,
        Object.freeze({
          ...entry,
          ...directPerson(state, entry.id),
          unread: state.threads.find((row) => row.id === entry.id)?.unread ?? 0,
        }),
      );
  }
  return Object.freeze([...peers.values()]);
}
