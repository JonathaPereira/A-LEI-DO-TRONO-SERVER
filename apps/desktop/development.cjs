'use strict';

/** The development renderer is explicit, local-only, and disabled in packaged apps. */
function developmentOrigin({ packaged, value }) {
  if (packaged || !value) return null;
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !url.port
  ) {
    throw new Error('desktop-dev-url must be an HTTP origin on 127.0.0.1 with an explicit port.');
  }
  return url.origin;
}

module.exports = { developmentOrigin };
