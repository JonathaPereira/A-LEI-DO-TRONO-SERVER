const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('A Lei do Trono standalone frontend structure is intact', () => {
  const indexHtml = path.join(root, 'frontend', 'index.html');
  const styleCss = path.join(root, 'frontend', 'style.css');
  const appJs = path.join(root, 'frontend', 'app.js');

  assert.ok(fs.existsSync(indexHtml), 'index.html must exist');
  assert.ok(fs.existsSync(styleCss), 'style.css must exist');
  assert.ok(fs.existsSync(appJs), 'app.js must exist');

  const htmlContent = fs.readFileSync(indexHtml, 'utf8');
  assert.ok(htmlContent.includes('A LEI DO TRONO'), 'Must contain game title');
  assert.ok(htmlContent.includes('playerHand'), 'Must contain hand element');
  assert.ok(htmlContent.includes('trickCards'), 'Must contain trick cards element');
});
