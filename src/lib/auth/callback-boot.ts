/** Classic beforeInteractive entry. Captures one-use credentials and sanitizes the current URL. */
(() => {
  type CallbackWindow = Window & { TronoAuthCallback?: import('../../types/auth').AuthCallback };
  const target = window as CallbackWindow;
  function capture(): boolean {
    const url = new URL(target.location.href),
      hash = new URLSearchParams(url.hash.slice(1));
    const tokenHash = url.searchParams.get('token_hash'),
      access = hash.get('access_token');
    if (!tokenHash && !access && !hash.get('error') && !url.searchParams.get('error')) return false;
    target.TronoAuthCallback = Object.freeze({
      token_hash: tokenHash,
      type:
        url.searchParams.get('type') ||
        (url.searchParams.get('auth') === 'recovery' ? 'recovery' : 'signup'),
      access_token: access,
      refresh_token: hash.get('refresh_token'),
      expires_at: hash.get('expires_at'),
      hashType: hash.get('type'),
      error: hash.get('error') || url.searchParams.get('error'),
    });
    for (const key of ['token_hash', 'type', 'auth', 'error', 'error_code', 'error_description'])
      url.searchParams.delete(key);
    url.hash = '';
    target.history.replaceState(null, '', url.pathname + url.search);
    return true;
  }
  const changed = () => {
    if (capture()) target.dispatchEvent(new Event('trono-auth-callback'));
  };
  capture();
  target.addEventListener('hashchange', changed);
  target.addEventListener(
    'pagehide',
    () => {
      target.removeEventListener('hashchange', changed);
      delete target.TronoAuthCallback;
    },
    { once: true },
  );
})();
