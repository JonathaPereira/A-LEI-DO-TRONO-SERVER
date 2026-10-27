'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  tools = path.join(root, 'artifacts/godot-tools');
const version = '4.6.3';
const filenames = {
  win32: `Godot_v${version}-stable_win64.exe.zip`,
  linux: `Godot_v${version}-stable_linux.x86_64.zip`,
};
const sums = {
  'Godot_v4.6.3-stable_export_templates.tpz':
    'da606b61c10157844f8300172df374472665f95015495cb1a7cd132c40ede404faa96cc1016a4b9662db9909ddea69632c4948b2cd11163438dad4808881fb68',
  'Godot_v4.6.3-stable_linux.x86_64.zip':
    'a035258da32b77f966a5376f9fa29c30a6adde826a85ba918e1605bd1fc9823eba7d85f1dd5e748956bd2ba72827c0025ffa11bb82aec91128c407a2e723c99c',
  'Godot_v4.6.3-stable_win64.exe.zip':
    'd44ea7ef5bab754cacd49d581b6062836b2eea12a82e1d183aebfad9cd8c7db2bd82513337bd657d6d2d5c04d46239c0570b029faf1343e81e8a2fa7b85dd83b',
};
if (!filenames[process.platform]) throw Error('Godot build requires Windows or Linux.');
fs.mkdirSync(tools, { recursive: true });
for (const name of [filenames[process.platform], `Godot_v${version}-stable_export_templates.tpz`]) {
  const file = path.join(tools, name);
  if (!fs.existsSync(file))
    execFileSync(
      'curl',
      [
        '--fail',
        '--silent',
        '--show-error',
        '--location',
        '--max-time',
        '240',
        `https://github.com/godotengine/godot-builds/releases/download/${version}-stable/${name}`,
        '--output',
        file,
      ],
      { stdio: 'inherit' },
    );
  const hash = crypto.createHash('sha512'),
    buffer = Buffer.alloc(1024 * 1024);
  const descriptor = fs.openSync(file, 'r');
  try {
    let size;
    while ((size = fs.readSync(descriptor, buffer, 0, buffer.length, null)))
      hash.update(buffer.subarray(0, size));
  } finally {
    fs.closeSync(descriptor);
  }
  const actual = hash.digest('hex');
  if (actual !== sums[name]) throw Error(`Godot checksum mismatch: ${name}`);
}
execFileSync(
  process.platform === 'win32' ? 'python' : 'python3',
  [
    '-c',
    `
import zipfile,pathlib,sys
root=pathlib.Path(sys.argv[1]); version=sys.argv[2]
with zipfile.ZipFile(root/sys.argv[3]) as z: z.extractall(root/'editor')
target=root/'data'/'Godot'/'export_templates'/(version+'.stable') if sys.platform=='win32' else root/'data'/'godot'/'export_templates'/(version+'.stable')
target.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(root/('Godot_v'+version+'-stable_export_templates.tpz')) as z:
 for name in ['version.txt','web_nothreads_release.zip','web_nothreads_debug.zip']:
  (target/name).write_bytes(z.read('templates/'+name))
`,
    tools,
    version,
    filenames[process.platform],
  ],
  { stdio: 'inherit' },
);
const editor = fs
  .readdirSync(path.join(tools, 'editor'))
  .find((name) =>
    process.platform === 'win32'
      ? name.endsWith('.exe') && !name.endsWith('_console.exe')
      : name.endsWith('.x86_64'),
  );
const binary = path.join(tools, 'editor', editor);
if (process.platform !== 'win32') fs.chmodSync(binary, 0o755);
fs.writeFileSync(
  path.join(tools, 'runtime.json'),
  JSON.stringify({ binary, data: path.join(tools, 'data') }),
);
console.log('Godot editor and web templates ready.');
