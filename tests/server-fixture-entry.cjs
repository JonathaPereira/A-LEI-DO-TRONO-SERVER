'use strict';
// Explicit fixture composition. Production index never loads these dependencies or flags.
const options = {};
const storage =
  process.env.MN_TEST_DIRECT_ATTACHMENTS === 'true'
    ? require('./direct-attachments-adapter.cjs')()
    : null;
if (storage) options.objectStorage = storage.objectStorage;
if (process.env.TRONO_TEST_DECREE) Object.assign(options, require('./game-test-clock.cjs')());
if (process.env.MN_TEST_LOVE_LETTER_SEED)
  options.loveLetterRandom = require('./love-letter-seed.cjs');
const backend = require('../server/index.ts').startApplication(options);
storage?.install(backend.app);
