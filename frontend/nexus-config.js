'use strict';
// Public URLs only. Never put Supabase keys or account tokens here.
(() => {
  const pageUrl = 'https://semchakra10.itch.io/nexus-mn';
  // Paste ONLY the src of the playable "Embed game" iframe here.
  // Leave empty to launch the official itch.io page in a new tab/window.
  const embedUrl = 'https://itch.io/embed-upload/19915488?color=333333';
  function isEmbedURL(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !url.port && (
        url.hostname === 'itch.io' && /^\/embed-upload\/\d+\/?$/.test(url.pathname) ||
        url.hostname === 'html-classic.itch.zone' && /^\/html\/\d+\/index\.html$/.test(url.pathname)
      );
    } catch { return false; }
  }
  const config = Object.freeze({pageUrl, embedUrl: isEmbedURL(embedUrl) ? embedUrl : '', pvpUrl: 'wss://nexus-pvp.onrender.com/pvp', isEmbedURL});
  if (typeof module === 'object' && module.exports) module.exports = config;
  else window.TronoNexusConfig = config;
})();
