const dimensions = [
  'sidebar-width',
  'sidebar-height',
  'strip-height',
  'chat-width',
  'chat-height',
  'people-width',
  'people-height',
  'center-height',
] as const;

/** Remove only inline dimensions from the retired panel resizer, leaving stylesheet defaults. */
export function clearPanelDimensions(style: Pick<CSSStyleDeclaration, 'removeProperty'>) {
  for (const dimension of dimensions) style.removeProperty('--layout-' + dimension);
}
export function resetPanelPreferences(
  storage: Pick<Storage, 'removeItem'>,
  style: Pick<CSSStyleDeclaration, 'removeProperty'>,
  accountId: string | null,
) {
  clearPanelDimensions(style);
  try {
    storage.removeItem('mnPanelLayout:' + (accountId || 'guest'));
  } catch {
    // The visible reset also works when local storage is unavailable.
  }
}
