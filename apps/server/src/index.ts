import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertProductionConfig,
  createApplication,
  type ApplicationOptions,
  type BackendApplication,
} from './app.ts';

function readPackageVersion(): string {
  try {
    const raw = fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' && parsed.version ? parsed.version : '1.0.0';
  } catch {
    return '1.0.0';
  }
}

export function startApplication(options: ApplicationOptions = {}): BackendApplication {
  assertProductionConfig(process.env);
  const port = Number(process.env.PORT || 10000);
  const host = process.env.HOST || '0.0.0.0';
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT must be an integer between 0 and 65535.');
  }

  const version = readPackageVersion();
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

const isEntrypoint =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  startApplication();
}
