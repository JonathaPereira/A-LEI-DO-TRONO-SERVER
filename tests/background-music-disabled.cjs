'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createAudioPlayer } = require('../src/lib/audio/player.ts');
const { createPreferenceStorage } = require('../src/lib/storage/preferences.ts');

function fakeContext() {
  const sources = [];
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
  });
  const node = () => Object.assign(new EventTarget(), { connect() {}, disconnect() {} });
  const source = () => {
    const s = Object.assign(node(), { frequency: param(), start() {}, stop() {} });
    sources.push(s);
    return s;
  };
  return {
    sources,
    state: 'running',
    currentTime: 0,
    sampleRate: 48000,
    destination: node(),
    createGain: () => Object.assign(node(), { gain: param() }),
    createOscillator: source,
    createBufferSource: source,
    createBiquadFilter: () => Object.assign(node(), { frequency: param() }),
    createBuffer: (_c, length) => ({ getChannelData: () => new Float32Array(length) }),
    async resume() {},
    async close() {},
  };
}

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('background music stays permanently disabled even if enabled in storage, while game SFX remain active', async () => {
  const values = new Map([
    ['tronoMusicEnabled', '1'],
    ['tronoSfxEnabled', '1'],
  ]);
  const storage = createPreferenceStorage(() => ({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }));
  const media = {
    paused: true,
    muted: false,
    volume: 1,
    src: '',
    dataset: {},
    loads: 0,
    plays: 0,
    pauses: 0,
    load() {
      this.loads++;
    },
    pause() {
      this.pauses++;
      this.paused = true;
    },
    async play() {
      this.plays++;
      this.paused = false;
    },
  };
  const contexts = [];
  const owner = createAudioPlayer({
    storage,
    desktop: true,
    href: 'https://app.test/',
    player: () => media,
    createContext: () => {
      const ctx = fakeContext();
      contexts.push(ctx);
      return ctx;
    },
    events: new EventTarget(),
  });

  owner.start();
  assert.equal(owner.musicEnabled, false);
  assert.equal(media.loads, 0);
  assert.equal(media.plays, 0);
  assert.equal(media.src, '');

  assert.equal(await owner.setMusicEnabled(true), false);
  assert.equal(await owner.toggleMusic(), false);
  assert.equal(owner.musicEnabled, false);
  assert.equal(media.plays, 0);
  assert.equal(media.loads, 0);

  // Game SFX remain 100% active and functional
  assert.equal(owner.sfxEnabled, true);
  await owner.ensureAudio();
  assert.equal(contexts.length, 1);
  owner.playSfx('splendor-card');
  assert.ok(contexts[0].sources.length > 0, 'game sound effects must still synthesize');
  owner.setGameVolume('azul', 55);
  assert.equal(owner.gameVolume('azul'), 55);
  await owner.dispose();
});

test('UI components remove background music elements and controls while preserving game SFX controls', () => {
  const gameSurface = read('src/components/application/game-surface.tsx');
  const gameSettings = read('src/components/application/game-settings.tsx');
  const audioPrefs = read('src/components/voice/audio-preferences.tsx');
  const musicControls = read('src/components/audio/music-controls.tsx');

  assert.equal(gameSurface.includes('<BgMusic'), false);
  assert.equal(gameSettings.includes('Música de fundo'), false);
  assert.equal(gameSettings.includes('Volume da música'), false);
  assert.equal(gameSettings.includes('Efeitos dos jogos'), true);
  assert.equal(audioPrefs.includes('voiceMusicBtn'), false);
  assert.equal(audioPrefs.includes('voiceMusicTrackSelect'), false);
  assert.equal(audioPrefs.includes('voiceMusicVolume'), false);
  assert.equal(audioPrefs.includes('voiceSfxBtn'), true);
  assert.equal(musicControls.includes('portalMusicBtn'), false);
  assert.equal(musicControls.includes('lobbyMusicBtn'), false);
});
