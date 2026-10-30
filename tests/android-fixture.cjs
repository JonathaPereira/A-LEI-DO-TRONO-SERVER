'use strict';
const { startFixture } = require('./auth-fixture');
(async () => {
  const fixture = await startFixture({ port: 10000, appOrigin: 'http://127.0.0.1:18880', allowedOrigins: ['https://localhost'] });
  const email = 'android-native@example.test';
  await fixture.call('signup', { email, nickname: 'Android Teste', password: 'Senha12!' });
  await fixture.call('verify', { token_hash: [...fixture.links.keys()].at(-1), type: 'signup' });
  console.log('Android fixture ready');
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await fixture.stop(); process.exit(0); });
})().catch(error => { console.error(error); process.exit(1); });
