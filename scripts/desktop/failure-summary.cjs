'use strict';
const fs = require('node:fs');
const path = require('node:path');

const redact = (text) =>
  text.replace(/(access_token|refresh_token|authorization)[^\r\n]*/gi, '[credential omitted]');
const escapeCommand = (text) =>
  text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
function bounded(text, bytes) {
  if (Buffer.byteLength(text, 'utf8') <= bytes) return text;
  const marker = '\n[diagnóstico truncado; consulte o artefato]';
  return (
    Buffer.from(text)
      .subarray(0, bytes - Buffer.byteLength(marker) - 3)
      .toString('utf8') + marker
  );
}

function summarizeFailure(text) {
  if (!/not ok [0-9]+|testCodeFailure/.test(text)) return null;
  const lines = redact(text).split(/\r?\n/),
    blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const failure = /^(\s*)not ok \d+\b/.exec(lines[i]);
    if (!failure) continue;
    const indent = failure[1].length;
    let end = i + 1;
    while (end < lines.length) {
      const line = lines[end];
      if (line.trim() && line.search(/\S/) <= indent) break;
      end++;
    }
    const diagnostic = lines.slice(i, end).join('\n');
    blocks.push(bounded(diagnostic, 7000));
    if (blocks.length === 6) {
      blocks.push('[limite de falhas no resumo; consulte o artefato completo]');
      break;
    }
  }
  return bounded(
    [...blocks, 'Final do log:', bounded(lines.slice(-20).join('\n'), 5000)].join('\n'),
    48000,
  );
}

function formatNotice(name, text) {
  const summary = summarizeFailure(text);
  if (summary === null) return null;
  const title = escapeCommand(path.basename(name)).replace(/:/g, '%3A').replace(/,/g, '%2C');
  return `::notice title=${title}::${escapeCommand(summary)}`;
}

if (require.main === module) {
  const directory = process.argv[2] || path.resolve(__dirname, '../../artifacts');
  for (const name of fs.readdirSync(directory).sort()) {
    if (!/^windows-.*\.log$/.test(name)) continue;
    const notice = formatNotice(name, fs.readFileSync(path.join(directory, name), 'utf8'));
    if (notice) process.stdout.write(notice + '\n');
  }
}

module.exports = { summarizeFailure, formatNotice };
