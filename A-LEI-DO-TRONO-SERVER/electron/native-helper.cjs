'use strict';

const path = require('node:path');

/** One location for the helper shared by application audio and activity discovery. */
function nativeHelperPath(app, resourcesPath = process.resourcesPath) {
  return app.isPackaged
    ? path.join(resourcesPath, 'native/MN-Application-Audio.exe')
    : path.resolve(__dirname, '../artifacts/native-audio/Release/MN-Application-Audio.exe');
}

module.exports = { nativeHelperPath };
