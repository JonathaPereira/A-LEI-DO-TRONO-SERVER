'use strict';
const fs = require('node:fs');
const path = require('node:path');

/** Next hoists resource hints before metadata. Apply referrer policy before those hints in exported pages. */
function earlyReferrerPolicy(html) {
  const opening = /<head(?:\s[^>]*)?>/i.exec(html);
  if (!opening) throw Error('A página exportada não contém head.');
  const start = opening.index + opening[0].length,
    end = html.indexOf('</head>', start);
  if (end < 0) throw Error('A página exportada não encerra head.');
  const head = html
    .slice(start, end)
    .replace(/<meta\b[^>]*\bname\s*=\s*(["'])referrer\1[^>]*>/gi, '');
  const charset = /^\s*<meta\b(?=[^>]*\bcharset\s*=)[^>]*>/i.exec(head);
  const at = charset?.[0].length ?? 0;
  return (
    html.slice(0, start) +
    head.slice(0, at) +
    '<meta name="referrer" content="no-referrer"/>' +
    head.slice(at) +
    html.slice(end)
  );
}
function prepare(directory) {
  if (!fs.existsSync(path.join(directory, 'index.html')))
    throw Error('Compile a exportação estática antes de preparar o HTML.');
  const pages = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'));
  for (const page of pages) {
    const file = path.join(directory, page.name),
      html = fs.readFileSync(file, 'utf8'),
      prepared = earlyReferrerPolicy(html);
    if (prepared !== html) fs.writeFileSync(file, prepared);
  }
  return pages.length;
}
if (require.main === module)
  console.log(
    'Static referrer policy prepared for ' + prepare(path.resolve(__dirname, '../out')) + ' pages.',
  );
module.exports = { earlyReferrerPolicy, prepare };
