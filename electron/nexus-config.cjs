'use strict';

// Public URLs only. Update the playable iframe source here for both clients.
const pageUrl = 'https://semchakra10.itch.io/nexus-mn';
const embedUrl = 'https://itch.io/embed-upload/19926871?color=333333';
function isEmbedURL(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      ((url.hostname === 'itch.io' && /^\/embed-upload\/\d+\/?$/.test(url.pathname)) ||
        (url.hostname === 'html-classic.itch.zone' &&
          /^\/html\/\d+\/index\.html$/.test(url.pathname)))
    );
  } catch {
    return false;
  }
}
const nexusConfig = Object.freeze({
  pageUrl,
  embedUrl: isEmbedURL(embedUrl) ? embedUrl : '',
  pvpUrl: 'wss://nexus-pvp.onrender.com/pvp',
  isEmbedURL,
});

module.exports = { nexusConfig };
