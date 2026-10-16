'use strict';
// Preferences follow the signed-in account, never a nickname or socket ID.
window.TronoPersonal = (() => {
  let owner = null,
    values = {};
  function current() {
    const id = window.TronoAuth?.user?.id || null;
    if (id !== owner) {
      owner = id;
      values = {};
      if (id)
        try {
          const saved = JSON.parse(localStorage.getItem('mn-personal:' + id) || '{}');
          if (saved && typeof saved === 'object' && !Array.isArray(saved)) values = saved;
        } catch {}
    }
    return values;
  }
  function get(key, fallback) {
    return current()[key] ?? fallback;
  }
  function set(key, value) {
    current();
    if (!owner) return;
    if (value === undefined) delete values[key];
    else values[key] = value;
    try {
      localStorage.setItem('mn-personal:' + owner, JSON.stringify(values));
    } catch {}
    window.dispatchEvent(new CustomEvent('trono-personal-change', { detail: { key } }));
  }
  return { get, set };
})();
