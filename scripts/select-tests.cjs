'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

function normalizePath(file) {
  return String(file || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

const DOCS_ONLY_PATTERN =
  /^(?:docs\/.*|[^/]+\.md|\.gitignore|\.prettier(?:ignore|rc.*)|LICENSE(?:\.txt)?|.*\.txt)$/i;
const DOCS_EXCEPTION_PATTERN = /^electron\/LEIA-ME-WINDOWS\.txt$/i;

const FULL_TRIGGER_PATTERNS = [
  /^package(?:-lock)?\.json$/i,
  /^electron\/package(?:-lock)?\.json$/i,
  /^(?:next|tsconfig|postcss)\.config\.[^/]+$/i,
  /^tsconfig\.json$/i,
  /^\.gitattributes$/i,
  /^\.github\/workflows\/windows-app\.yml$/i,
  /^scripts\/(?:test|select-tests)\.cjs$/i,
  /^tests\/(?:suites|release)\.json$/i,
  /^supabase\//i,
  /^server\//i,
  /^src\/app\/api\//i,
  /^src\/lib\/(?:supabase|realtime|socket|network|auth)\//i,
  /^electron\//i,
  /^scripts\/desktop\//i,
];

const SLICE_RULES = [
  {
    name: 'ui-theme-and-shell',
    patterns: [
      /^src\/styles\//i,
      /^src\/components\/application\//i,
      /^src\/components\/profiles\//i,
      /^src\/lib\/profiles\//i,
      /^src\/app\/(?:layout\.tsx|page\.tsx|globals\.css)$/i,
      /^src\/components\/ui\//i,
      /^tests\/(?:christmas-theme-browser|appearance-preferences(?:-browser)?|profile-[^/]+|social-[^/]+|style-cascade-browser|application-shell-browser|chat-composer-browser|dm-members-browser|mobile-browser)\.(?:c?js)$/i,
    ],
    browser: [
      'tests/christmas-theme-browser.js',
      'tests/appearance-preferences-browser.cjs',
      'tests/application-shell-browser.cjs',
      'tests/profile-editor-browser.cjs',
      'tests/social-browser.js',
      'tests/style-cascade-browser.cjs',
      'tests/chat-composer-browser.cjs',
      'tests/dm-members-browser.cjs',
      'tests/mobile-browser.cjs',
      'tests/voice-moderation-browser.js',
    ],
    desktop: [],
  },
  {
    name: 'voice-call-and-clips',
    patterns: [
      /^src\/lib\/(?:voice|call|audio|clips|sfu|soundboard|noise)\//i,
      /^src\/components\/(?:call|voice|clips)\//i,
      /^src\/workers\//i,
      /^public\/worklets\//i,
      /^tests\/.*(?:voice|call|clip|sfu|soundboard|noise|recording|audio).*\.(?:c?js)$/i,
    ],
    browser: [
      'tests/voice-recovery-browser.cjs',
      'tests/voice-moderation-browser.js',
      'tests/voice-reception-browser.js',
      'tests/noise-processing.js',
      'tests/soundboard-browser.cjs',
      'tests/clip-native-rate-browser.cjs',
      'tests/clip-local-browser.cjs',
      'tests/manual-recording-browser.cjs',
      'tests/application-shell-browser.cjs',
    ],
    desktop: [
      'tests/clip-native-pipeline.cjs',
      'tests/clip-local-desktop.cjs',
      'tests/application-call-desktop.cjs',
      'tests/desktop-background-voice.js',
      'tests/desktop-audio.js',
    ],
  },
  {
    name: 'files-and-downloads',
    patterns: [
      /^src\/lib\/(?:files|storage)\//i,
      /^public\/downloads\//i,
      /^tests\/.*(?:file-library|channel-files|download).*\.(?:c?js)$/i,
    ],
    browser: [
      'tests/file-library-browser.cjs',
      'tests/channel-files-browser.cjs',
      'tests/application-shell-browser.cjs',
    ],
    desktop: [],
  },
  {
    name: 'similo',
    patterns: [/^src\/(?:lib|components)\/similo\//i, /^games\/similo\//i, /^tests\/similo/i],
    browser: ['tests/similo-browser.cjs', 'tests/similo-crowd-browser.cjs'],
    desktop: [],
  },
  {
    name: 'throne',
    patterns: [/^src\/(?:lib|components)\/throne\//i, /^tests\/throne/i],
    browser: [
      'tests/throne-lobby-browser.cjs',
      'tests/throne-history-browser.cjs',
      'tests/throne-choices-browser.cjs',
      'tests/throne-court-layout.cjs',
    ],
    desktop: [],
  },
  {
    name: 'love-letter',
    patterns: [/^src\/(?:lib|components)\/love-letter\//i, /^tests\/love-letter/i],
    browser: ['tests/love-letter-browser.js'],
    desktop: [],
  },
  {
    name: 'azul',
    patterns: [/^src\/(?:lib|components)\/azul\//i, /^tests\/azul/i],
    browser: ['tests/azul-browser.js'],
    desktop: [],
  },
  {
    name: 'splendor',
    patterns: [/^src\/(?:lib|components)\/splendor\//i, /^tests\/splendor/i],
    browser: ['tests/splendor-browser.js'],
    desktop: [],
  },
  {
    name: 'ticket-to-ride',
    patterns: [/^src\/(?:lib|components)\/ticket-to-ride\//i, /^tests\/ticket-to-ride/i],
    browser: ['tests/ticket-to-ride-browser.js'],
    desktop: [],
  },
  {
    name: 'atalaia-and-roguelite',
    patterns: [
      /^games\/atalaia\//i,
      /^src\/(?:lib|components)\/roguelite\//i,
      /^tests\/roguelite/i,
    ],
    browser: ['tests/roguelite-browser.js', 'tests/court-browser.js'],
    desktop: [],
  },
  {
    name: 'core-unit-test-only',
    patterns: [/^tests\/[^/]+\.(?:c?js)$/i],
    browser: [],
    desktop: [],
  },
  {
    name: 'build-and-release-scripts',
    patterns: [/^scripts\/(?:prepare-godot|build-atalaia|build-similo-art)\.cjs$/i],
    browser: ['tests/similo-browser.cjs', 'tests/court-browser.js'],
    desktop: [],
  },
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRegex(files) {
  if (!files.length) return '';
  return files
    .map((file) => path.posix.basename(file))
    .map(escapeRegex)
    .join('|');
}

function planForChangedFiles({
  files = [],
  full = false,
  suites = require('../tests/suites.json'),
} = {}) {
  const normalized = files.map(normalizePath).filter(Boolean);
  if (full || !normalized.length) {
    return {
      mode: 'full',
      docsOnly: false,
      runCore: true,
      browserMode: 'release',
      browserFilter: '',
      browserTests: [],
      desktopMode: 'release',
      desktopFilter: '',
      desktopTests: [],
      reasons: [full ? 'explicit-full' : 'no-changed-files'],
    };
  }

  if (
    normalized.every((file) => DOCS_ONLY_PATTERN.test(file) && !DOCS_EXCEPTION_PATTERN.test(file))
  ) {
    return {
      mode: 'docs-only',
      docsOnly: true,
      runCore: false,
      browserMode: 'skip',
      browserFilter: '',
      browserTests: [],
      desktopMode: 'skip',
      desktopFilter: '',
      desktopTests: [],
      reasons: ['docs-only'],
    };
  }

  for (const file of normalized) {
    if (FULL_TRIGGER_PATTERNS.some((pattern) => pattern.test(file))) {
      return {
        mode: 'full',
        docsOnly: false,
        runCore: true,
        browserMode: 'release',
        browserFilter: '',
        browserTests: [],
        desktopMode: 'release',
        desktopFilter: '',
        desktopTests: [],
        reasons: [`full-trigger:${file}`],
      };
    }
  }

  const browserSet = new Set();
  const desktopSet = new Set();
  const reasons = new Set();
  const knownBrowser = new Set(suites.browser || []);
  const knownDesktop = new Set(suites.desktop || []);

  for (const file of normalized) {
    let matchedAny = false;
    if (knownBrowser.has(file)) {
      browserSet.add(file);
      reasons.add(`direct-browser:${file}`);
      matchedAny = true;
    }
    if (knownDesktop.has(file)) {
      desktopSet.add(file);
      reasons.add(`direct-desktop:${file}`);
      matchedAny = true;
    }

    for (const rule of SLICE_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(file))) {
        matchedAny = true;
        reasons.add(`slice:${rule.name}`);
        for (const testFile of rule.browser) {
          if (knownBrowser.has(testFile)) browserSet.add(testFile);
        }
        for (const testFile of rule.desktop) {
          if (knownDesktop.has(testFile)) desktopSet.add(testFile);
        }
      }
    }

    if (!matchedAny) {
      return {
        mode: 'full',
        docsOnly: false,
        runCore: true,
        browserMode: 'release',
        browserFilter: '',
        browserTests: [],
        desktopMode: 'release',
        desktopFilter: '',
        desktopTests: [],
        reasons: [`unmapped:${file}`],
      };
    }
  }

  const browserTests = [...browserSet].sort();
  const desktopTests = [...desktopSet].sort();

  return {
    mode: 'selective',
    docsOnly: false,
    runCore: true,
    browserMode: browserTests.length ? 'filtered' : 'skip',
    browserFilter: buildRegex(browserTests),
    browserTests,
    desktopMode: desktopTests.length ? 'filtered' : 'skip',
    desktopFilter: buildRegex(desktopTests),
    desktopTests,
    reasons: [...reasons].sort(),
  };
}

function readGitChangedFiles({ base = '', head = 'HEAD', workingTree = false } = {}) {
  const args = workingTree
    ? ['status', '--porcelain', '-uall']
    : ['diff', '--name-only', base, head];
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return null;
  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!workingTree) return lines;
  return lines.map((line) => {
    const entry = line.slice(3).trim();
    const arrow = entry.indexOf(' -> ');
    return arrow >= 0 ? entry.slice(arrow + 4) : entry;
  });
}

function writeGithubOutput(plan, outputPath) {
  const lines = [
    `mode=${plan.mode}`,
    `docs_only=${String(plan.docsOnly)}`,
    `run_core=${String(plan.runCore)}`,
    `browser_mode=${plan.browserMode}`,
    `browser_filter=${plan.browserFilter}`,
    `desktop_mode=${plan.desktopMode}`,
    `desktop_filter=${plan.desktopFilter}`,
    `reasons=${plan.reasons.join(',')}`,
  ];
  fs.appendFileSync(outputPath, lines.join('\n') + '\n', 'utf8');
}

function main(argv) {
  let base = '';
  let head = 'HEAD';
  let full = false;
  let workingTree = false;
  let githubOutput = '';
  const files = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--full') full = true;
    else if (arg === '--working-tree') workingTree = true;
    else if (arg === '--base') base = argv[++i] || '';
    else if (arg === '--head') head = argv[++i] || 'HEAD';
    else if (arg === '--github-output') githubOutput = argv[++i] || '';
    else if (arg === '--files') {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) files.push(argv[++i]);
    } else {
      throw new Error(`Opção desconhecida: ${arg}`);
    }
  }

  let changedFiles = files;
  if (!changedFiles.length && !full) {
    if (workingTree) {
      changedFiles = readGitChangedFiles({ workingTree: true }) || [];
    } else if (base && !/^0+$/.test(base)) {
      changedFiles = readGitChangedFiles({ base, head }) || [];
    } else {
      full = true;
    }
  }

  const plan = planForChangedFiles({ files: changedFiles, full });
  if (githubOutput) writeGithubOutput(plan, githubOutput);
  console.log(JSON.stringify(plan, null, 2));
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { planForChangedFiles, readGitChangedFiles };
