'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

/** Expand the single psql installation order for SQL editors and isolated tests; never connect to a database. */
function readInstallation(directory = path.join(root, 'supabase')) {
  const base = path.resolve(directory),
    files = [],
    seen = new Set();
  const sql = fs
    .readFileSync(path.join(base, 'install.sql'), 'utf8')
    .split(/\r?\n/)
    .map((line) => {
      if (line === '\\set ON_ERROR_STOP on') return '-- SQL editors stop on the first SQL error.';
      const include = /^\\ir ([a-zA-Z0-9_/-]+\.sql)$/.exec(line);
      if (!include) {
        if (line.startsWith('\\')) throw Error('Unsupported installation directive: ' + line);
        return line;
      }
      const name = include[1],
        file = path.resolve(base, name);
      if (!file.startsWith(base + path.sep) || seen.has(name) || name === 'install.sql')
        throw Error('Invalid installation include: ' + name);
      seen.add(name);
      files.push(name);
      return '\n-- Source: ' + name + '\n' + fs.readFileSync(file, 'utf8');
    })
    .join('\n');
  if (!files.length) throw Error('Empty installation order');
  return { sql, files };
}
if (require.main === module) {
  const installation = readInstallation(),
    directory = path.join(root, 'artifacts/database');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'fresh-install.sql'), installation.sql);
  console.log(
    `Prepared ${installation.files.length} SQL sources in artifacts/database/fresh-install.sql. No database connection was made.`,
  );
}
module.exports = { readInstallation };
