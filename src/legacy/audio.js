'use strict';
window.TronoStorage = (() => {
  const memory = new Map();
  let persistent = null;
  try {
    persistent = window.localStorage;
  } catch {}
  return {
    getItem(key) {
      if (memory.has(key)) return memory.get(key);
      try {
        return persistent?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      memory.set(key, String(value));
      try {
        persistent?.setItem(key, String(value));
      } catch {}
    },
    removeItem(key) {
      memory.set(key, null);
      try {
        persistent?.removeItem(key);
      } catch {}
    },
  };
})();
window.TronoAudio = (() => {
  const $ = (id) => document.getElementById(id),
    storage = window.TronoStorage;
  // Áudio procedural original (Web Audio). Funciona offline: trilha medieval + efeitos.
  let audioCtx = null;
  let masterBus = null;
  let musicMaster = null;
  let sfxMaster = null;
  const gameBuses = new Map(),
    gameKeys = ['throne', 'azul', 'splendor', 'love-letter'];
  const gameVolumes = Object.fromEntries(
    gameKeys.map((key) => [
      key,
      Math.max(
        0,
        Math.min(
          100,
          Number(storage.getItem('mnGameVolume:' + key) ?? (key === 'splendor' ? 90 : 80)),
        ),
      ),
    ]),
  );
  function gameVolume(key) {
    return gameVolumes[key] ?? 80;
  }
  function setGameVolume(key, value) {
    if (!gameKeys.includes(key)) return;
    gameVolumes[key] = Math.max(0, Math.min(100, Number(value) || 0));
    storage.setItem('mnGameVolume:' + key, gameVolumes[key]);
    const bus = gameBuses.get(key);
    if (bus && audioCtx)
      bus.gain.setTargetAtTime(gameVolumes[key] / 100, audioCtx.currentTime, 0.02);
    window.dispatchEvent(
      new CustomEvent('trono-game-volume', { detail: { key, value: gameVolumes[key] } }),
    );
  }
  function gameBus(key) {
    if (!gameKeys.includes(key)) return sfxMaster;
    let bus = gameBuses.get(key);
    if (!bus) {
      bus = audioCtx.createGain();
      bus.gain.value = gameVolume(key) / 100;
      bus.connect(sfxMaster);
      gameBuses.set(key, bus);
    }
    return bus;
  }
  let musicEnabled = window.TronoDesktop
    ? storage.getItem('tronoMusicEnabled') === '1'
    : storage.getItem('tronoMusicEnabled') !== '0';
  let sfxEnabled = storage.getItem('tronoSfxEnabled') !== '0';
  let musicStep = 0;
  let musicRequest = 0;
  const MUSIC_TRACKS = {
    // Faixas modernas liberadas em CC0/Public Domain pelo próprio autor no OpenGameArt.
    // Cada faixa possui fallback local original do protótipo para evitar silêncio caso a origem externa esteja indisponível.
    lofi: {
      label: 'Lo-fi',
      artist: 'omfgdude',
      license: 'CC0',
      src: 'https://opengameart.org/sites/default/files/lofiagain.ogg',
      fallback: 'assets/audio/classical_piano_nocturne.mp3',
    },
    edm: {
      label: 'EDM',
      artist: 'MintoDog',
      license: 'CC0',
      src: 'https://opengameart.org/sites/default/files/joyfully_loop_bpm170.mp3',
      fallback: 'assets/audio/electronic_summer_nights.mp3',
    },
    rock: {
      label: 'Rock',
      artist: 'Kistol',
      license: 'CC0',
      src: 'https://opengameart.org/sites/default/files/Codename%20Granny%20II_0.ogg',
      fallback: 'assets/audio/rock_guitar_solo.mp3',
    },
    electronic: {
      label: 'Eletrônica',
      artist: 'vitalezzz',
      license: 'CC0',
      src: 'https://opengameart.org/sites/default/files/claimed_by_the_void_loop.mp3',
      fallback: 'assets/audio/electronic_summer_nights.mp3',
    },
  };
  const LEGACY_MUSIC_TRACKS = { tavern: 'lofi', classical: 'lofi' };
  let currentMusicTrack = storage.getItem('tronoMusicTrack') || 'lofi';
  currentMusicTrack = LEGACY_MUSIC_TRACKS[currentMusicTrack] || currentMusicTrack;
  if (!MUSIC_TRACKS[currentMusicTrack]) currentMusicTrack = 'lofi';
  window.TRONO_MUSIC_TRACKS = MUSIC_TRACKS;

  async function ensureAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !audioCtx) {
      try {
        audioCtx = new AC();
        masterBus = audioCtx.createGain();
        musicMaster = audioCtx.createGain();
        sfxMaster = audioCtx.createGain();
        masterBus.gain.value = 0.82;
        musicMaster.gain.value = 0.0001;
        sfxMaster.gain.value = 0.78;
        musicMaster.connect(masterBus);
        sfxMaster.connect(masterBus);
        masterBus.connect(audioCtx.destination);
      } catch (err) {
        audioCtx = null;
        console.warn('Efeitos de áudio indisponíveis neste navegador:', err);
      }
    }
    try {
      if (audioCtx?.state === 'suspended')
        void audioCtx.resume().catch((e) => console.warn('O áudio aguarda interação.', e));
    } catch {}
    if (musicEnabled) void startBackgroundMusic();
    updateMusicButton();
    return !audioCtx || audioCtx.state === 'running';
  }

  function loadMusicSource(el, track, { fallback = false } = {}) {
    if (!el || !track) return;
    const source = fallback ? track.fallback : track.src;
    if (!source) return;
    const expected = new URL(source, location.href).href;
    if (el.src !== expected) {
      el.pause();
      el.src = source;
      el.dataset.musicFallback = fallback ? '1' : '0';
      el.load();
    }
  }
  function setMusicPlaybackStatus(message = '') {
    for (const id of ['portalMusicStatus', 'voiceMusicStatus']) {
      const el = $(id);
      if (el) el.textContent = message;
    }
  }
  async function startBackgroundMusic() {
    const el = $('bgMusic');
    if (!el) return false;
    const track = MUSIC_TRACKS[currentMusicTrack] || MUSIC_TRACKS.lofi;
    const expected = new URL(track.src, location.href).href;
    const fallbackExpected = track.fallback ? new URL(track.fallback, location.href).href : '';
    if (el.src !== expected && el.src !== fallbackExpected) loadMusicSource(el, track);
    const vol =
      Number(
        $('musicVolume')?.value ??
          $('lobbyMusicVolume')?.value ??
          $('portalMusicVolume')?.value ??
          32,
      ) / 100;
    el.volume = musicEnabled ? Math.max(0, Math.min(1, vol)) : 0;
    el.muted = !musicEnabled;
    if (!el.paused) {
      setMusicPlaybackStatus();
      return true;
    }
    const request = ++musicRequest;
    setMusicPlaybackStatus('Carregando música…');
    try {
      await el.play();
      if (request === musicRequest) setMusicPlaybackStatus();
      return true;
    } catch (e) {
      if (request === musicRequest)
        setMusicPlaybackStatus(
          e.name === 'NotAllowedError'
            ? 'O navegador bloqueou a música. Clique em uma faixa para liberar.'
            : 'Não foi possível tocar a faixa. Tente outra música.',
        );
      console.info('A música aguardará a próxima interação do jogador.', e);
      return false;
    }
  }
  function syncVolumeControls(value) {
    for (const id of ['musicVolume', 'lobbyMusicVolume', 'portalMusicVolume', 'voiceMusicVolume']) {
      const input = $(id);
      if (input && String(input.value) !== String(value)) input.value = value;
    }
    for (const id of [
      'musicVolumeValue',
      'lobbyMusicVolumeValue',
      'portalMusicVolumeValue',
      'voiceMusicVolumeValue',
    ]) {
      const out = $(id);
      if (out) out.textContent = `${value}%`;
    }
  }
  function setMusicVolume(v) {
    const value = Math.max(0, Math.min(100, Number(v) || 0));
    const el = $('bgMusic');
    if (el) {
      el.volume = value / 100;
      el.muted = !musicEnabled || value === 0;
    }
    syncVolumeControls(value);
    storage.setItem('tronoMusicVolume', String(value));
  }
  function setMusicTrack(id, { play = true } = {}) {
    if (!MUSIC_TRACKS[id]) return;
    currentMusicTrack = id;
    storage.setItem('tronoMusicTrack', id);
    document
      .querySelectorAll('.track-btn')
      .forEach((b) => b.classList.toggle('active', b.dataset.track === id));
    const el = $('bgMusic');
    if (el) loadMusicSource(el, MUSIC_TRACKS[id]);
    window.dispatchEvent(
      new CustomEvent('trono-music-track', { detail: { id, ...MUSIC_TRACKS[id] } }),
    );
    if (musicEnabled && play) void ensureAudio().catch(() => {});
  }
  function tone(
    freq,
    when,
    dur = 0.45,
    vol = 0.08,
    type = 'triangle',
    destination = musicMaster,
    attack = 0.018,
    cutoff = 1800,
  ) {
    if (!audioCtx || !destination) return;
    const osc = audioCtx.createOscillator(),
      gain = audioCtx.createGain(),
      filter = audioCtx.createBiquadFilter();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    osc.start(when);
    osc.stop(when + dur + 0.06);
  }
  function noiseHit(when, dur = 0.1, vol = 0.03, destination = musicMaster, cutoff = 700) {
    if (!audioCtx || !destination) return;
    const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
    const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate),
      data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audioCtx.createBufferSource(),
      filter = audioCtx.createBiquadFilter(),
      gain = audioCtx.createGain();
    src.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    src.start(when);
    src.stop(when + dur);
  }
  function scheduleTavernBar() {
    if (!audioCtx || audioCtx.state !== 'running' || !musicEnabled || !musicMaster) return;
    const now = audioCtx.currentTime + 0.08;
    // Frase original em Ré menor/dórico: alaúde, bordão e percussão leve.
    const phraseA = [
      293.66, 349.23, 392, 440, 392, 349.23, 329.63, 293.66, 261.63, 293.66, 349.23, 392, 349.23,
      329.63, 293.66, 261.63,
    ];
    const phraseB = [
      293.66, 329.63, 349.23, 392, 440, 392, 349.23, 293.66, 261.63, 293.66, 329.63, 349.23, 392,
      349.23, 329.63, 293.66,
    ];
    const melody = musicStep % 2 === 0 ? phraseA : phraseB;
    const bassRoots = [146.83, 130.81, 174.61, 146.83];
    for (let i = 0; i < 16; i++) {
      const t = now + i * 0.46;
      tone(melody[i], t, 0.33, 0.095, i % 4 === 0 ? 'triangle' : 'sine', musicMaster, 0.014, 1450);
      if (i % 4 === 0) {
        const root = bassRoots[(musicStep + i / 4) % bassRoots.length];
        tone(root, t, 0.92, 0.055, 'triangle', musicMaster, 0.025, 750);
        tone(root * 1.5, t + 0.02, 0.58, 0.025, 'sine', musicMaster, 0.025, 950);
        noiseHit(t, 0.075, 0.018, musicMaster, 520);
      } else if (i % 2 === 0) noiseHit(t, 0.045, 0.008, musicMaster, 1200);
    }
    musicStep = (musicStep + 1) % 8;
  }
  function playSfx(kind, gameOverride = null) {
    if (!sfxEnabled || !audioCtx || audioCtx.state !== 'running' || !sfxMaster) return;
    const key =
      gameOverride ||
      (kind.startsWith('love-letter-')
        ? 'love-letter'
        : kind.startsWith('splendor-')
          ? 'splendor'
          : kind.startsWith('azul-')
            ? 'azul'
            : ['card', 'crown', 'shadow', 'influence', 'decree', 'turn'].includes(kind)
              ? 'throne'
              : null);
    if (key && gameVolume(key) === 0) return;
    const destination = gameBus(key),
      t = audioCtx.currentTime + 0.01;
    if (kind === 'splendor-card' || kind === 'love-letter-card') {
      noiseHit(t, 0.16, 0.095, destination, 4200);
      noiseHit(t + 0.11, 0.12, 0.065, destination, 3000);
      noiseHit(t + 0.23, 0.065, 0.035, destination, 1900);
      tone(180, t + 0.22, 0.13, 0.035, 'triangle', destination, 0.004, 1100);
    } else if (kind === 'splendor-chip') {
      tone(1580, t, 0.18, 0.052, 'sine', destination, 0.002, 3600);
      tone(2250, t + 0.065, 0.22, 0.04, 'sine', destination, 0.002, 4200);
      noiseHit(t, 0.035, 0.014, destination, 2700);
    } else if (kind === 'splendor-score' || kind === 'love-letter-score') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(f, t + i * 0.11, 0.45, 0.032, 'sine', destination, 0.006, 3600),
      );
    } else if (kind === 'splendor-noble') {
      [392, 493.88, 587.33, 783.99].forEach((f, i) =>
        tone(f, t + i * 0.13, 0.65, 0.035, 'triangle', destination, 0.015, 2600),
      );
    } else if (kind === 'azul-pick') {
      // Short original ceramic taps, routed through the existing effects bus.
      tone(1840, t, 0.11, 0.045, 'sine', destination, 0.002, 4200);
      tone(2460, t + 0.025, 0.09, 0.018, 'sine', destination, 0.002, 4800);
    } else if (kind === 'azul-place') {
      tone(1230, t, 0.14, 0.045, 'triangle', destination, 0.003, 3000);
      tone(820, t + 0.025, 0.18, 0.025, 'sine', destination, 0.003, 2400);
    } else if (kind === 'azul-score') {
      tone(659.25, t, 0.3, 0.055, 'sine', destination, 0.008, 3300);
      tone(987.77, t + 0.1, 0.4, 0.045, 'sine', destination, 0.008, 3800);
      tone(1318.51, t + 0.2, 0.48, 0.028, 'sine', destination, 0.012, 4200);
    } else if (kind === 'azul-penalty') {
      tone(392, t, 0.22, 0.04, 'triangle', destination, 0.006, 1800);
      tone(293.66, t + 0.1, 0.35, 0.035, 'sine', destination, 0.008, 1600);
    } else if (kind === 'click') {
      tone(720, t, 0.055, 0.025, 'sine', destination, 0.004, 2600);
      tone(520, t + 0.025, 0.045, 0.012, 'triangle', destination, 0.003, 1800);
    } else if (kind === 'card') {
      noiseHit(t, 0.055, 0.055, destination, 1700);
      tone(170, t, 0.1, 0.035, 'triangle', destination, 0.006, 900);
    } else if (kind === 'crown') {
      tone(293.66, t, 0.75, 0.14, 'triangle', destination, 0.02, 2200);
      tone(369.99, t + 0.11, 0.78, 0.12, 'triangle', destination, 0.02, 2400);
      tone(440, t + 0.24, 1.05, 0.13, 'sine', destination, 0.025, 2600);
      tone(587.33, t + 0.42, 0.85, 0.08, 'sine', destination, 0.02, 2800);
    } else if (kind === 'shadow') {
      tone(174.61, t, 1.25, 0.13, 'sawtooth', destination, 0.04, 900);
      tone(146.83, t + 0.18, 1.45, 0.11, 'triangle', destination, 0.04, 700);
      noiseHit(t + 0.05, 0.7, 0.028, destination, 420);
    } else if (kind === 'influence') {
      tone(659.25, t, 0.48, 0.11, 'sine', destination, 0.01, 3000);
      tone(783.99, t + 0.13, 0.58, 0.1, 'sine', destination, 0.01, 3200);
    } else if (kind === 'decree') {
      noiseHit(t, 0.22, 0.035, destination, 850);
      tone(220, t, 0.42, 0.06, 'triangle', destination, 0.02, 1200);
    } else if (kind === 'turn') {
      // Arauto curto, mais audível: três notas ascendentes + sino agudo.
      tone(392.0, t, 0.24, 0.12, 'triangle', destination, 0.006, 2200);
      tone(523.25, t + 0.1, 0.32, 0.13, 'sine', destination, 0.006, 2800);
      tone(659.25, t + 0.22, 0.38, 0.12, 'triangle', destination, 0.006, 3200);
      tone(783.99, t + 0.35, 0.48, 0.075, 'sine', destination, 0.008, 3600);
    }
  }
  async function setMusicEnabled(next) {
    musicEnabled = !!next;
    storage.setItem('tronoMusicEnabled', musicEnabled ? '1' : '0');
    const el = $('bgMusic');
    if (musicEnabled) {
      if (el) {
        el.muted = false;
        setMusicVolume(storage.getItem('tronoMusicVolume') ?? 32);
      }
      void ensureAudio().catch(() => {});
    } else {
      musicRequest++;
      if (el) {
        el.muted = true;
        el.pause();
      }
      setMusicPlaybackStatus('Música silenciada.');
    }
    updateMusicButton();
    window.dispatchEvent(
      new CustomEvent('trono-audio-state', { detail: { musicEnabled, sfxEnabled } }),
    );
    return musicEnabled;
  }
  async function toggleMusic() {
    return setMusicEnabled(!musicEnabled);
  }
  function setSfxEnabled(next) {
    sfxEnabled = !!next;
    storage.setItem('tronoSfxEnabled', sfxEnabled ? '1' : '0');
    window.dispatchEvent(
      new CustomEvent('trono-audio-state', { detail: { musicEnabled, sfxEnabled } }),
    );
    return sfxEnabled;
  }
  function toggleSfx() {
    return setSfxEnabled(!sfxEnabled);
  }
  function updateMusicButton(unsupported = false) {
    for (const id of ['musicBtn', 'lobbyMusicBtn', 'portalMusicBtn']) {
      const btn = $(id);
      if (!btn) continue;
      btn.disabled = false;
      btn.setAttribute('aria-pressed', String(musicEnabled));
      if (unsupported) {
        btn.textContent = '♫ Áudio indisponível';
        btn.classList.add('muted');
        continue;
      }
      btn.textContent = musicEnabled ? '♫ Música ligada' : '♫ Música silenciada';
      btn.classList.toggle('muted', !musicEnabled);
      btn.classList.toggle('music-active', musicEnabled);
    }
    document
      .querySelectorAll('.track-btn')
      .forEach((b) => b.classList.toggle('active', b.dataset.track === currentMusicTrack));
  }

  function bind() {
    setMusicVolume(storage.getItem('tronoMusicVolume') ?? 32);
    setMusicTrack(currentMusicTrack, { play: false });
    updateMusicButton();
    for (const id of ['musicVolume', 'lobbyMusicVolume', 'portalMusicVolume'])
      $(id)?.addEventListener('input', (e) => setMusicVolume(e.target.value));
    for (const id of ['musicBtn', 'lobbyMusicBtn', 'portalMusicBtn'])
      $(id)?.addEventListener('click', toggleMusic);
    document
      .querySelectorAll('.track-btn')
      .forEach((btn) => btn.addEventListener('click', () => setMusicTrack(btn.dataset.track)));
    $('bgMusic')?.addEventListener('error', () => {
      const el = $('bgMusic'),
        track = MUSIC_TRACKS[currentMusicTrack];
      if (!el || !track?.fallback || el.dataset.musicFallback === '1') return;
      loadMusicSource(el, track, { fallback: true });
      if (musicEnabled) void startBackgroundMusic();
    });
    window.addEventListener(
      'pointerdown',
      () => {
        if (musicEnabled || sfxEnabled) void ensureAudio().catch(() => {});
      },
      { once: true },
    );
    document.addEventListener(
      'click',
      (e) => {
        const target = e.target?.closest?.(
          'button,[role="button"],a[href],select,input[type="checkbox"],input[type="radio"],summary,.hand-card,.room-card',
        );
        if (
          !target ||
          target.matches(':disabled') ||
          target.dataset.noClickSfx === '1' ||
          !sfxEnabled
        )
          return;
        const screen = target.closest('#gameScreen,#azulScreen,#splendorScreen,#loveLetterScreen'),
          key =
            {
              gameScreen: 'throne',
              azulScreen: 'azul',
              splendorScreen: 'splendor',
              loveLetterScreen: 'love-letter',
            }[screen?.id] || null;
        void ensureAudio()
          .then(() => playSfx('click', key))
          .catch(() => {});
      },
      true,
    );
  }
  window.addEventListener('trono:ready', bind);
  return {
    ensureAudio,
    playSfx,
    gameVolume,
    setGameVolume,
    toggleMusic,
    setMusicEnabled,
    toggleSfx,
    setSfxEnabled,
    setMusicTrack,
    setMusicVolume,
    get currentTrack() {
      return currentMusicTrack;
    },
    get musicEnabled() {
      return musicEnabled;
    },
    get sfxEnabled() {
      return sfxEnabled;
    },
    get musicVolume() {
      return Number(storage.getItem('tronoMusicVolume') ?? 32);
    },
  };
})();
