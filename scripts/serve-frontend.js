'use strict';
const express = require('express'),
  path = require('node:path');
const fs = require('node:fs');
const renderer = path.resolve(__dirname, '../out');
if (!fs.existsSync(path.join(renderer, 'index.html'))) {
  throw new Error('Compile a interface com npm run build antes de servir os arquivos estáticos.');
}
const port = Number(process.env.FRONTEND_PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error('FRONTEND_PORT must be a valid TCP port');
const app = express();
app.disable('x-powered-by');
app.use(express.static(renderer, { maxAge: 0 }));
const server = app.listen(port, '127.0.0.1', () =>
  console.log('Frontend development server ready on port ' + port),
);
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
