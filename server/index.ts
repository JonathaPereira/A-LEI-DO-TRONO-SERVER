import type { BackendApplication, ApplicationOptions } from './app';

const { createApplication } = require('./app.ts') as typeof import('./app');
const { version } = require('../package.json') as { version: string };

function startApplication(options: ApplicationOptions = {}): BackendApplication {
  const port = Number(process.env.PORT || 10000);
  const host = process.env.HOST || '0.0.0.0';
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT must be an integer between 0 and 65535.');
  }

  const backend = createApplication(options);
  backend.app.disable('x-powered-by');
  backend.server.once('error', (error) => {
    console.error(error.message);
    void backend.close().finally(() => {
      process.exitCode = 1;
    });
  });
  backend.server.listen(port, host, () => {
    console.log(`A Lei do Trono backend ${version} em http://${host}:${port}`);
  });

  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 5000);
    deadline.unref();
    try {
      await backend.close();
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  }

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  return backend;
}
module.exports = { startApplication };
if (require.main === module) startApplication();
