'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { isGameTest } = require('./test.cjs');

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
  /^(?:next|tsconfig|postcss)\.config\.[^/]+$/i,
  /^tsconfig(?:\.[^/]+)?\.json$/i,
  /^\.gitattributes$/i,
  /^\.github\/workflows\/windows-app\.yml$/i,
  /^supabase\//i,
  /^server\/(?:app|index|http-api|socket-gateway|socket-protocol|socket-command|capabilities|storage-database|abortable)\.ts$/i,
  /^src\/lib\/(?:http|socket|layout)\//i,
  /^src\/app\/(?:application-runtime\.tsx|api\/)/i,
  /^electron\/(?:main|preload|policy|content-security|development|native-helper)\.cjs$/i,
  /^electron\/native-audio\//i,
  /^scripts\/desktop\/(?:build-native|prepare-ffmpeg)\.cjs$/i,
];

const PACKAGE_MANIFEST_PATTERN = /^(?:electron\/)?package(?:-lock)?\.json$/i;

const SLICE_RULES = [
  {
    name: 'release-packaging',
    games: false,
    patterns: [
      /^electron\/LEIA-ME-WINDOWS\.txt$/i,
      /^electron\/updates\.cjs$/i,
      /^scripts\/desktop\/(?:approved-build|download-retention|failure-summary|package-site|prepare-downloads|publish-build|release-installer)\.cjs$/i,
      /^scripts\/(?:prepare-renderer|prepare-static-html|select-tests|test)\.cjs$/i,
      /^tests\/(?:suites|release)\.json$/i,
      /^\.github\/workflows\/(?:surge-package|frontend-publish)\.yml$/i,
      /^tests\/(?:build-downloads|download-retention|site-package|static-html|test-command|test-selection|desktop-update-controls|desktop-updates)\.(?:c?js)$/i,
    ],
    core: [
      'tests/build-downloads.js',
      'tests/desktop-update-controls.cjs',
      'tests/download-retention.js',
      'tests/site-package.js',
      'tests/static-html.cjs',
      'tests/test-command.cjs',
      'tests/test-selection.cjs',
    ],
    browser: [],
    desktop: ['tests/desktop-updates.js'],
  },
  {
    name: 'ui-theme-and-shell',
    games: false,
    patterns: [
      /^src\/styles\/(?!games\/)/i,
      /^src\/components\/(?:application|profiles|navigation)\//i,
      /^src\/components\/application\.tsx$/i,
      /^src\/lib\/(?:profiles|preferences|settings|navigation)\//i,
      /^src\/app\/(?:layout\.tsx|page\.tsx|globals\.css)$/i,
      /^src\/types\/(?:profiles|profile-[^/]+|call-navigation|domain)\.ts$/i,
      /^tests\/(?:christmas-theme-browser|appearance-preferences(?:-browser)?|profile-[^/]+|application-shell-browser|mobile-browser|hover-tooltip|personal-preferences|giphy-provider|member-profiles|responsive-layout|settings|styles|app-layout-browser|member-profile-browser|portal-browser|portal-navigation|settings-portrait-browser|frontend-browser)\.(?:c?js)$/i,
    ],
    core: [
      'tests/appearance-preferences.cjs',
      'tests/call-navigation-view.cjs',
      'tests/call-navigation.cjs',
      'tests/giphy-provider.js',
      'tests/hover-tooltip.cjs',
      'tests/member-profiles.js',
      'tests/personal-preferences.cjs',
      'tests/portal-navigation.cjs',
      'tests/profile-decorations.cjs',
      'tests/profile-editor.cjs',
      'tests/profile-gif-picker.cjs',
      'tests/profile-media.js',
      'tests/profile-reader.cjs',
      'tests/profile-validation.cjs',
      'tests/responsive-layout.cjs',
      'tests/settings.cjs',
      'tests/styles.cjs',
    ],
    browser: [
      'tests/christmas-theme-browser.js',
      'tests/appearance-preferences-browser.cjs',
      'tests/application-shell-browser.cjs',
      'tests/profile-editor-browser.cjs',
      'tests/portal-browser.cjs',
      'tests/mobile-browser.cjs',
    ],
    desktop: [],
  },
  {
    name: 'chat-channels-community',
    games: false,
    patterns: [
      /^src\/components\/(?:channels|chat|messenger|modals)\//i,
      /^src\/lib\/(?:channels|chat|community|messenger|notifications)\//i,
      /^src\/types\/(?:channel[^/]*|chat|community|messenger|notifications)\.ts$/i,
      /^server\/(?:channel-[^/]+|chat-[^/]+|community[^/]*|social-[^/]+|management-[^/]+|roles|mobile-push)\.ts$/i,
      /^tests\/(?:activity-presence|channels?|channel-management|channel-service|chat-[^/]+|community-[^/]+|dm-members-browser|direct-attachments-[^/]+|messenger[^/]*|notifications[^/]*|social-[^/]+|text-voice-channels|server-community|server-social)\.(?:c?js)$/i,
    ],
    core: [
      'tests/activity-presence.js',
      'tests/channel-management.cjs',
      'tests/channel-service.cjs',
      'tests/channels.cjs',
      'tests/chat-composer.cjs',
      'tests/chat-history-sql.js',
      'tests/chat-links.cjs',
      'tests/chat-messages.cjs',
      'tests/chat-moderation-sql.js',
      'tests/chat-moderation-ws.js',
      'tests/chat-service.cjs',
      'tests/community-controller.cjs',
      'tests/community-management-models.cjs',
      'tests/community-management.js',
      'tests/community-navigation.cjs',
      'tests/community-sql.js',
      'tests/direct-attachments-sql.js',
      'tests/messenger.cjs',
      'tests/notifications.cjs',
      'tests/server-community.cjs',
      'tests/server-social.cjs',
      'tests/social-sql.js',
      'tests/text-voice-channels.js',
    ],
    browser: [
      'tests/channels-browser.cjs',
      'tests/chat-composer-browser.cjs',
      'tests/chat-moderation-browser.js',
      'tests/community-browser.cjs',
      'tests/dm-members-browser.cjs',
      'tests/messenger-enhancements-browser.js',
      'tests/notifications-browser.cjs',
      'tests/social-browser.js',
    ],
    desktop: [],
  },
  {
    name: 'voice-call-and-clips',
    games: false,
    patterns: [
      /^src\/lib\/(?:voice|call|audio|clips|sfu|soundboard|noise|recording)\//i,
      /^src\/components\/(?:call|voice|clips|audio|recording|soundboard)\//i,
      /^src\/types\/(?:voice[^/]*|clips|application-audio|desktop-capture|peer-signal|sfu)\.ts$/i,
      /^src\/workers\//i,
      /^public\/worklets\//i,
      /^electron\/(?:application-audio|audio-priority|clip-files|remote-input|replay-[^/]+)\.cjs$/i,
      /^server\/(?:realtime-[^/]+|voice-[^/]+|soundboard|ice|remote-pc)\.ts$/i,
      /^tests\/.*(?:voice|call|clip|sfu|soundboard|noise|recording|audio|camera|microphone|media|screen-|speaking|stream-|video-freeze|remote-pc|remote-coop|remote-media|p2p-).*\.(?:c?js)$/i,
    ],
    core: [
      'tests/app-audio.cjs',
      'tests/application-audio.cjs',
      'tests/audio-playback.cjs',
      'tests/audio-preferences.cjs',
      'tests/audio-worklets.cjs',
      'tests/call-audio.cjs',
      'tests/call-lifecycle.cjs',
      'tests/call-stability.js',
      'tests/call-stage.cjs',
      'tests/call-toolbar.cjs',
      'tests/camera.cjs',
      'tests/clip-audio.cjs',
      'tests/clip-desktop-bridge.cjs',
      'tests/clip-library.cjs',
      'tests/clip-local-capture.cjs',
      'tests/clip-native-policy.cjs',
      'tests/clip-pcm.cjs',
      'tests/clip-preferences.cjs',
      'tests/clip-replay.cjs',
      'tests/clip-session.cjs',
      'tests/clip-worker.cjs',
      'tests/connection-diagnostics.cjs',
      'tests/desktop-audio-priority.js',
      'tests/device-publication.cjs',
      'tests/manual-recording.cjs',
      'tests/media-dialogs.cjs',
      'tests/media-focus.cjs',
      'tests/media-interest.cjs',
      'tests/microphone-processor.cjs',
      'tests/microphone.cjs',
      'tests/noise-processors.cjs',
      'tests/p2p-peers.cjs',
      'tests/realtime-configuration.cjs',
      'tests/realtime-policy.cjs',
      'tests/remote-coop.js',
      'tests/remote-media.cjs',
      'tests/remote-pc.js',
      'tests/screen-capture.cjs',
      'tests/screen-publication.cjs',
      'tests/screen-sharing.cjs',
      'tests/server-realtime.cjs',
      'tests/sfu-recovery.js',
      'tests/sfu-session.cjs',
      'tests/soundboard.cjs',
      'tests/speaking-indicators.cjs',
      'tests/stream-controls.cjs',
      'tests/video-freeze-recovery.cjs',
      'tests/voice-controls.cjs',
      'tests/voice-moderation.js',
      'tests/voice-quality.cjs',
      'tests/voice-reception.js',
      'tests/voice-roster.cjs',
      'tests/voice-settings.cjs',
      'tests/voice-soundboard.cjs',
      'tests/voice-telemetry.cjs',
      'tests/voice-transport.cjs',
    ],
    browser: [
      'tests/voice-recovery-browser.cjs',
      'tests/voice-moderation-browser.js',
      'tests/voice-reception-browser.js',
      'tests/call-controls-browser.js',
      'tests/noise-processing.js',
      'tests/soundboard-browser.cjs',
      'tests/clip-native-rate-browser.cjs',
      'tests/clip-local-browser.cjs',
      'tests/manual-recording-browser.cjs',
      'tests/stream-controls-browser.cjs',
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
    name: 'auth-and-sessions',
    games: false,
    patterns: [
      /^src\/components\/auth\//i,
      /^src\/lib\/auth\//i,
      /^src\/types\/auth\.ts$/i,
      /^server\/(?:auth[^/]*|sessions|rate-limit)\.ts$/i,
      /^tests\/(?:auth[^/]*|portal-name-check|registered-accounts[^/]*|server-auth)\.(?:c?js)$/i,
    ],
    core: [
      'tests/auth-callback.cjs',
      'tests/auth-forms.cjs',
      'tests/auth-session.cjs',
      'tests/auth.js',
      'tests/portal-name-check.cjs',
      'tests/registered-accounts.cjs',
      'tests/server-auth.cjs',
    ],
    browser: ['tests/auth-browser.cjs', 'tests/registered-accounts-browser.cjs'],
    desktop: ['tests/auth-desktop.cjs'],
  },
  {
    name: 'files-and-storage',
    games: false,
    patterns: [
      /^src\/components\/files\//i,
      /^src\/lib\/(?:files|storage)\//i,
      /^src\/types\/files\.ts$/i,
      /^server\/(?:file[^/]*|storage-r2)\.ts$/i,
      /^public\/downloads\//i,
      /^tests\/.*(?:file-library|files-|channel-files|download|storage-r2).*\.(?:c?js)$/i,
    ],
    core: [
      'tests/channel-files.cjs',
      'tests/file-library.cjs',
      'tests/files-client.cjs',
      'tests/files-soundboard.js',
      'tests/server-files.cjs',
      'tests/storage-r2.cjs',
    ],
    browser: ['tests/file-library-browser.cjs', 'tests/channel-files-browser.cjs'],
    desktop: [],
  },
  {
    name: 'desktop-host-ui',
    games: false,
    patterns: [
      /^src\/components\/desktop\//i,
      /^src\/lib\/desktop\//i,
      /^src\/types\/desktop-[^/]+\.ts$/i,
      /^electron\/(?:activity|notifications|preferences)\.cjs$/i,
      /^tests\/desktop-(?:activity|capture|notices|notifications|policy|preferences|remote-input|renderer-policy|shell|startup|window).*\.(?:c?js)$/i,
    ],
    core: [
      'tests/desktop-activity-controls.cjs',
      'tests/desktop-activity.js',
      'tests/desktop-capture.cjs',
      'tests/desktop-notifications.js',
      'tests/desktop-policy.js',
      'tests/desktop-preferences.js',
      'tests/desktop-renderer-policy.cjs',
      'tests/desktop-window.cjs',
    ],
    browser: [
      'tests/desktop-activity-browser.cjs',
      'tests/desktop-capture-browser.cjs',
      'tests/desktop-notices-controls-browser.js',
      'tests/desktop-shell-browser.cjs',
    ],
    desktop: [
      'tests/desktop-activity-native.cjs',
      'tests/desktop-startup-sync.cjs',
      'tests/desktop-runtime.js',
    ],
  },
  {
    name: 'android-mobile',
    games: false,
    patterns: [
      /^android\//i,
      /^capacitor\.config\.json$/i,
      /^src\/lib\/mobile\//i,
      /^src\/components\/application\/mobile/i,
      /^src\/types\/mobile\.d\.ts$/i,
      /^\.github\/workflows\/android-app\.yml$/i,
      /^tests\/(?:android-|mobile-).*\.(?:c?js)$/i,
    ],
    core: [
      'tests/android-push-registration.cjs',
      'tests/android-host.cjs',
      'tests/mobile-push.cjs',
    ],
    browser: ['tests/mobile-browser.cjs', 'tests/notifications-browser.cjs'],
    desktop: [],
  },
  {
    name: 'similo',
    games: true,
    patterns: [
      /^src\/(?:components\/games\/similo|lib\/games\/similo)\//i,
      /^src\/components\/games\/similo-[^/]+$/i,
      /^src\/types\/similo\.ts$/i,
      /^server\/similo-[^/]+\.ts$/i,
      /^games\/similo\//i,
      /^scripts\/build-similo-art\.cjs$/i,
      /^tests\/similo/i,
    ],
    core: ['tests/similo-rules.cjs', 'tests/similo-service.cjs', 'tests/similo-controller.cjs'],
    browser: ['tests/similo-browser.cjs', 'tests/similo-crowd-browser.cjs'],
    desktop: [],
  },
  {
    name: 'throne',
    games: true,
    patterns: [
      /^src\/components\/games\/throne-[^/]+$/i,
      /^src\/lib\/games\/throne-[^/]+$/i,
      /^src\/types\/throne-[^/]+\.ts$/i,
      /^server\/throne-[^/]+\.ts$/i,
      /^tests\/throne/i,
    ],
    core: [
      'tests/throne-choices.cjs',
      'tests/throne-controls.cjs',
      'tests/throne-effects.cjs',
      'tests/throne-events.cjs',
      'tests/throne-hand.cjs',
      'tests/throne-history.cjs',
      'tests/throne-law-planner.cjs',
      'tests/throne-lobby.cjs',
      'tests/throne-local-choices.cjs',
      'tests/throne-local-engine.cjs',
      'tests/throne-local-hand.cjs',
      'tests/throne-local-lifecycle.cjs',
      'tests/throne-match.cjs',
      'tests/throne-navigation.cjs',
      'tests/throne-private.cjs',
      'tests/throne-seats.cjs',
      'tests/throne-service.cjs',
      'tests/throne-table.cjs',
    ],
    browser: [
      'tests/throne-lobby-browser.cjs',
      'tests/throne-history-browser.cjs',
      'tests/throne-choices-browser.cjs',
      'tests/throne-court-layout.cjs',
    ],
    desktop: [],
  },
  {
    name: 'azul',
    games: true,
    patterns: [
      /^src\/components\/games\/azul-[^/]+$/i,
      /^src\/lib\/games\/azul[^/]*$/i,
      /^src\/types\/azul\.ts$/i,
      /^server\/azul-[^/]+\.ts$/i,
      /^tests\/azul/i,
    ],
    core: [
      'tests/azul-controller.cjs',
      'tests/azul-presentation.js',
      'tests/azul-rules.js',
      'tests/azul-service.cjs',
      'tests/azul-sql.js',
      'tests/azul-ws.js',
    ],
    browser: ['tests/azul-browser.js'],
    desktop: [],
  },
  {
    name: 'love-letter',
    games: true,
    patterns: [
      /^src\/components\/games\/love-letter-[^/]+$/i,
      /^src\/lib\/games\/love-letter[^/]*$/i,
      /^src\/types\/love-letter\.ts$/i,
      /^server\/love-letter-[^/]+\.ts$/i,
      /^tests\/love-letter/i,
    ],
    core: [
      'tests/love-letter-controller.cjs',
      'tests/love-letter-rules.js',
      'tests/love-letter-service.cjs',
      'tests/love-letter-ws.js',
    ],
    browser: ['tests/love-letter-browser.js'],
    desktop: [],
  },
  {
    name: 'splendor',
    games: true,
    patterns: [
      /^src\/components\/games\/splendor-[^/]+$/i,
      /^src\/lib\/games\/splendor[^/]*$/i,
      /^src\/types\/splendor\.ts$/i,
      /^server\/splendor-[^/]+\.ts$/i,
      /^tests\/splendor/i,
    ],
    core: [
      'tests/splendor-controller.cjs',
      'tests/splendor-rules.js',
      'tests/splendor-service.cjs',
      'tests/splendor-sql.js',
      'tests/splendor-ws.js',
    ],
    browser: ['tests/splendor-browser.js'],
    desktop: [],
  },
  {
    name: 'ticket-to-ride',
    games: true,
    patterns: [
      /^src\/components\/games\/ticket-to-ride[^/]*$/i,
      /^src\/lib\/games\/ticket-to-ride[^/]*$/i,
      /^src\/types\/ticket-to-ride\.ts$/i,
      /^server\/ticket-to-ride-[^/]+\.ts$/i,
      /^tests\/ticket-to-ride/i,
    ],
    core: [
      'tests/ticket-to-ride-art.cjs',
      'tests/ticket-to-ride-rules.js',
      'tests/ticket-to-ride-ws.js',
    ],
    browser: ['tests/ticket-to-ride-browser.js'],
    desktop: [],
  },
  {
    name: 'atalaia-roguelite',
    games: true,
    patterns: [
      /^games\/atalaia\//i,
      /^electron\/atalaia-config\.cjs$/i,
      /^src\/components\/games\/(?:atalaia|roguelite)-[^/]+$/i,
      /^src\/lib\/games\/(?:atalaia|roguelite)[^/]*$/i,
      /^scripts\/(?:prepare-godot|build-atalaia)\.cjs$/i,
      /^tests\/(?:atalaia|roguelite|court-)/i,
    ],
    core: ['tests/atalaia.cjs', 'tests/roguelite-host.cjs', 'tests/court-fullscreen.cjs'],
    browser: ['tests/roguelite-browser.js', 'tests/court-browser.js'],
    desktop: ['tests/desktop-cinzas-runtime.js'],
  },
  {
    name: 'nexus',
    games: true,
    patterns: [
      /^electron\/nexus[^/]*\.cjs$/i,
      /^src\/components\/games\/nexus-[^/]+$/i,
      /^src\/lib\/games\/nexus[^/]*$/i,
      /^tests\/nexus/i,
    ],
    core: ['tests/nexus.js'],
    browser: ['tests/nexus-browser.js'],
    desktop: [],
  },
  {
    name: 'shared-games-host',
    games: true,
    patterns: [
      /^games\/registry\.json$/i,
      /^scripts\/(?:build-men-games|build-trono-communication|build-law-assets|build-manual|print-manual)\.c?js$/i,
      /^\.github\/workflows\/men-games-publish\.yml$/i,
      /^electron\/game-assets\.cjs$/i,
      /^server\/game-ranking\.ts$/i,
      /^src\/styles\/games\//i,
      /^src\/lib\/men-games\//i,
      /^src\/components\/games\/(?:court-fullscreen[^/]*|game-[^/]+|lazy-games|library-[^/]+|men-games-host[^/]*|room-screen|setup-screen|tabletop-audio[^/]*)\.[^/]+$/i,
      /^src\/lib\/games\/(?:bot-names|court-fullscreen|freeze|fullscreen|hand-layout|lazy-registry|library|tabletop-audio)\.ts$/i,
      /^tests\/(?:men-games-|lazy-games|game-|tabletop-audio|bot-names|style-cascade-browser)/i,
    ],
    core: [
      'tests/bot-names.js',
      'tests/court-fullscreen.cjs',
      'tests/game-assets.js',
      'tests/game-library.cjs',
      'tests/game-rounds.js',
      'tests/game-rules.js',
      'tests/game-voice-membership.js',
      'tests/lazy-games.cjs',
      'tests/men-games-distribution.cjs',
      'tests/men-games-registry.cjs',
      'tests/men-trono-communication.cjs',
      'tests/tabletop-audio.cjs',
    ],
    browser: ['tests/tabletop-audio-browser.js', 'tests/style-cascade-browser.cjs'],
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

function stripPackageVersion(data, file) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const copy = { ...data };
  delete copy.version;
  if (file.endsWith('package-lock.json') && copy.packages && typeof copy.packages === 'object') {
    const rootPkg = copy.packages[''];
    if (rootPkg && typeof rootPkg === 'object') {
      const rootCopy = { ...rootPkg };
      delete rootCopy.version;
      copy.packages = { ...copy.packages, '': rootCopy };
    }
  }
  return copy;
}

function isVersionOnlyPackageBump(file, base, head) {
  if (!base || /^0+$/.test(base) || !PACKAGE_MANIFEST_PATTERN.test(file)) return false;
  const before = spawnSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8' });
  if (before.status !== 0) return false;
  let afterText = '';
  if (head === 'WORKING_TREE') {
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) return false;
    afterText = fs.readFileSync(abs, 'utf8');
  } else {
    const after = spawnSync('git', ['show', `${head}:${file}`], { cwd: root, encoding: 'utf8' });
    if (after.status !== 0) return false;
    afterText = after.stdout;
  }
  try {
    const left = stripPackageVersion(JSON.parse(before.stdout), file);
    const right = stripPackageVersion(JSON.parse(afterText), file);
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function planFull({ includeGames, reason }) {
  return {
    mode: includeGames ? 'full' : 'platform',
    docsOnly: false,
    includeGames,
    runCore: true,
    coreMode: includeGames ? 'full' : 'platform',
    coreFilter: '',
    coreTests: [],
    browserMode: includeGames ? 'release' : 'platform',
    browserFilter: '',
    browserTests: [],
    desktopMode: includeGames ? 'release' : 'platform',
    desktopFilter: '',
    desktopTests: [],
    reasons: [reason],
  };
}

function planForChangedFiles({
  files = [],
  full = false,
  includeGames = false,
  versionOnlyFiles = [],
  base = '',
  head = 'HEAD',
  suites = require('../tests/suites.json'),
} = {}) {
  const normalized = files.map(normalizePath).filter(Boolean);
  const versionOnlySet = new Set(versionOnlyFiles.map(normalizePath));
  const knownCore = new Set(suites.core || []);
  const knownBrowser = new Set(suites.browser || []);
  const knownDesktop = new Set(suites.desktop || []);

  if (full || !normalized.length) {
    return planFull({
      includeGames: Boolean(includeGames),
      reason: full ? 'explicit-full' : 'no-changed-files',
      suites,
    });
  }

  if (
    normalized.every((file) => DOCS_ONLY_PATTERN.test(file) && !DOCS_EXCEPTION_PATTERN.test(file))
  ) {
    return {
      mode: 'docs-only',
      docsOnly: true,
      includeGames: false,
      runCore: false,
      coreMode: 'skip',
      coreFilter: '',
      coreTests: [],
      browserMode: 'skip',
      browserFilter: '',
      browserTests: [],
      desktopMode: 'skip',
      desktopFilter: '',
      desktopTests: [],
      reasons: ['docs-only'],
    };
  }

  let touchedGames = Boolean(includeGames) || normalized.some((file) => isGameTest(file));
  if (!touchedGames) {
    for (const file of normalized) {
      if (SLICE_RULES.some((rule) => rule.games && rule.patterns.some((p) => p.test(file)))) {
        touchedGames = true;
        break;
      }
    }
  }

  for (const file of normalized) {
    if (PACKAGE_MANIFEST_PATTERN.test(file)) {
      const versionOnly = versionOnlySet.has(file) || isVersionOnlyPackageBump(file, base, head);
      if (!versionOnly) {
        return planFull({
          includeGames: touchedGames,
          reason: `full-trigger:${file}`,
          suites,
        });
      }
      continue;
    }
    if (FULL_TRIGGER_PATTERNS.some((pattern) => pattern.test(file))) {
      return planFull({
        includeGames: touchedGames,
        reason: `full-trigger:${file}`,
        suites,
      });
    }
  }

  const coreSet = new Set();
  const browserSet = new Set();
  const desktopSet = new Set();
  const reasons = new Set();

  for (const file of normalized) {
    let matchedAny = false;

    if (PACKAGE_MANIFEST_PATTERN.test(file)) {
      matchedAny = true;
      reasons.add('slice:release-packaging');
      for (const t of SLICE_RULES[0].core) if (knownCore.has(t)) coreSet.add(t);
      for (const t of SLICE_RULES[0].desktop) if (knownDesktop.has(t)) desktopSet.add(t);
      continue;
    }

    if (knownCore.has(file)) {
      coreSet.add(file);
      reasons.add(`direct-core:${file}`);
      matchedAny = true;
    }
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
        for (const t of rule.core || []) if (knownCore.has(t)) coreSet.add(t);
        for (const t of rule.browser || []) if (knownBrowser.has(t)) browserSet.add(t);
        for (const t of rule.desktop || []) if (knownDesktop.has(t)) desktopSet.add(t);
      }
    }

    if (!matchedAny) {
      return planFull({
        includeGames: touchedGames,
        reason: `unmapped:${file}`,
        suites,
      });
    }
  }

  if (!touchedGames) {
    for (const set of [coreSet, browserSet, desktopSet]) {
      for (const file of [...set]) {
        if (isGameTest(file)) set.delete(file);
      }
    }
  }

  const coreTests = [...coreSet].sort();
  const browserTests = [...browserSet].sort();
  const desktopTests = [...desktopSet].sort();

  return {
    mode: 'selective',
    docsOnly: false,
    includeGames: touchedGames,
    runCore: coreTests.length > 0,
    coreMode: coreTests.length ? 'filtered' : 'skip',
    coreFilter: buildRegex(coreTests),
    coreTests,
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
  const lines = result.stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!workingTree) return lines.map((line) => line.trim());
  return lines.map((line) => {
    const entry = line.slice(3).trim().replace(/^"|"$/g, '');
    const arrow = entry.indexOf(' -> ');
    return arrow >= 0 ? entry.slice(arrow + 4).replace(/^"|"$/g, '') : entry;
  });
}

function writeGithubOutput(plan, outputPath) {
  const lines = [
    `mode=${plan.mode}`,
    `docs_only=${String(plan.docsOnly)}`,
    `include_games=${String(plan.includeGames)}`,
    `run_core=${String(plan.runCore)}`,
    `core_mode=${plan.coreMode}`,
    `core_filter=${plan.coreFilter}`,
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
  let includeGames = false;
  let workingTree = false;
  let githubOutput = '';
  const files = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--full') full = true;
    else if (arg === '--include-games') includeGames = true;
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

  const plan = planForChangedFiles({
    files: changedFiles,
    full,
    includeGames,
    base: workingTree ? 'HEAD' : base,
    head: workingTree ? 'WORKING_TREE' : head,
  });
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

module.exports = { planForChangedFiles, readGitChangedFiles, isVersionOnlyPackageBump };
