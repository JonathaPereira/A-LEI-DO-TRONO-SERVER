'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { transformSync } = require('next/dist/compiled/babel/core');
const traverse = require('next/dist/compiled/babel/traverse').default;
const sourceRoot = path.resolve(__dirname, '../src');
const factories = {
  createCallAudio: 'call-audio',
  createCallAlerts: 'call-alerts',
  createAudioPreferences: 'audio-preferences',
  createSfuSession: 'sfu-session',
  createAudioPlayback: 'audio-playback',
  createRemoteMedia: 'remote-media',
  createCallQuality: 'quality',
  createVoiceTelemetry: 'telemetry',
  createSpeakingIndicators: 'speaking-indicators',
  createScreenPublication: 'screen-publication',
  createDevicePublication: 'device-publication',
};

/** Compile fixture modules in Node; no test exports, files or loader ship in the renderer. */
async function installVoiceTestModules(page, names) {
  if (!names.length || names.some((name) => !Object.hasOwn(factories, name)))
    throw new Error('Unknown voice test factory');
  const modules = new Map(),
    dependencies = {};
  const idOf = (filename) => path.relative(sourceRoot, filename).replaceAll(path.sep, '/');
  async function collect(filename) {
    if (modules.has(filename)) return;
    if (!filename.startsWith(sourceRoot + path.sep) || path.extname(filename) !== '.ts')
      throw new Error('Voice fixture imports must stay in src/');
    modules.set(filename, '');
    const source = await fs.readFile(filename, 'utf8');
    const transformed = transformSync(source, {
      filename,
      babelrc: false,
      configFile: false,
      ast: true,
      presets: [require.resolve('next/dist/compiled/babel/preset-typescript')],
      plugins: [require.resolve('next/dist/compiled/babel/plugin-transform-modules-commonjs')],
    });
    modules.set(filename, transformed.code);
    const imports = new Set();
    traverse(transformed.ast, {
      CallExpression(expression) {
        const { callee, arguments: args } = expression.node;
        if (
          callee.type === 'Identifier' &&
          callee.name === 'require' &&
          args[0]?.type === 'StringLiteral'
        )
          imports.add(args[0].value);
      },
    });
    const resolved = {};
    for (const name of imports) {
      if (!name.startsWith('.'))
        throw new Error('Unexpected external voice fixture import: ' + name);
      let dependency = path.resolve(path.dirname(filename), name.replace(/\.js$/, '.ts'));
      if (!path.extname(dependency)) dependency += '.ts';
      resolved[name] = idOf(dependency);
      await collect(dependency);
    }
    dependencies[idOf(filename)] = resolved;
  }
  const entries = {};
  for (const name of [...new Set(names)]) {
    const filename = path.join(sourceRoot, 'lib/voice', factories[name] + '.ts');
    await collect(filename);
    entries[name] = idOf(filename);
  }
  // These are function literals executed as fixture code by Playwright, without
  // eval/new Function inside the page or relaxing Electron's content policy.
  const definitions = [...modules]
    .map(
      ([filename, source]) =>
        JSON.stringify(idOf(filename)) + ': (module, exports, require) => {\n' + source + '\n}',
    )
    .join(',\n');
  await page.evaluate(`(() => {
    const definitions = {${definitions}}, dependencies = ${JSON.stringify(dependencies)}, cache = {};
    function load(id) {
      if (!cache[id]) {
        const module = {exports: {}}; cache[id] = module;
        definitions[id](module, module.exports, name => load(dependencies[id][name]));
      }
      return cache[id].exports;
    }
    const entries = ${JSON.stringify(entries)};
    window.__voiceTestModules = Object.assign(window.__voiceTestModules || {},
      Object.fromEntries(Object.entries(entries).map(([name, id]) => [name, load(id)[name]])));
  })()`);
}
module.exports = { installVoiceTestModules };
