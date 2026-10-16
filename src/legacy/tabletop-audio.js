'use strict';
window.TronoTabletopAudio = (() => {
  const labels = {
      throne: 'A Lei do Trono',
      azul: 'Azul',
      splendor: 'Splendor',
      'love-letter': 'Love Letter',
    },
    last = new Map();
  function control(key) {
    const host = document.createElement('details');
    host.className = 'tt-audio';
    host.dataset.gameAudio = key;
    const summary = document.createElement('summary');
    summary.setAttribute('aria-label', 'Volume dos efeitos de ' + labels[key]);
    summary.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></svg><span>Som</span>';
    host.append(summary);
    const panel = document.createElement('div');
    panel.className = 'tt-audio-panel';
    const label = document.createElement('label');
    label.textContent = 'Efeitos · ' + labels[key];
    const row = document.createElement('div');
    row.className = 'tt-audio-row';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.setAttribute('aria-label', 'Volume dos efeitos de ' + labels[key]);
    const out = document.createElement('output');
    row.append(input, out);
    label.append(row);
    const tools = document.createElement('div');
    tools.className = 'tt-audio-tools';
    const mute = document.createElement('button');
    mute.type = 'button';
    const test = document.createElement('button');
    test.type = 'button';
    test.textContent = 'Ouvir';
    test.dataset.noClickSfx = '1';
    tools.append(mute, test);
    const note = document.createElement('small');
    const global = document.createElement('button');
    global.type = 'button';
    global.className = 'tt-audio-enable';
    global.textContent = 'Ativar efeitos gerais';
    global.onclick = () => window.TronoAudio.setSfxEnabled(true);
    panel.append(label, tools, note, global);
    host.append(panel);
    const sync = () => {
      const v = window.TronoAudio.gameVolume(key);
      input.value = v;
      out.value = v + '%';
      mute.textContent = v ? 'Silenciar' : 'Restaurar';
      summary.classList.toggle('tt-muted', !v || !window.TronoAudio.sfxEnabled);
      note.textContent = window.TronoAudio.sfxEnabled
        ? 'Somente os efeitos deste jogo.'
        : 'Os efeitos gerais estão silenciados.';
      global.hidden = window.TronoAudio.sfxEnabled;
    };
    input.oninput = () => {
      window.TronoAudio.setGameVolume(key, input.value);
    };
    mute.onclick = () => {
      const v = window.TronoAudio.gameVolume(key);
      if (v) last.set(key, v);
      window.TronoAudio.setGameVolume(key, v ? 0 : last.get(key) || 80);
    };
    test.onclick = async () => {
      await window.TronoAudio.ensureAudio();
      window.TronoAudio.playSfx(
        key === 'azul' ? 'azul-place' : key === 'throne' ? 'card' : key + '-card',
        key,
      );
    };
    window.addEventListener('trono-game-volume', sync);
    window.addEventListener('trono-audio-state', sync);
    host.addEventListener('toggle', () => {
      if (host.open)
        for (const n of document.querySelectorAll('.tt-audio[open]'))
          if (n !== host) n.open = false;
    });
    sync();
    return host;
  }
  window.addEventListener('trono:ready', () => {
    for (const [selector, key] of [
      ['#gameScreen .topbar', 'throne'],
      ['.az-heading-actions', 'azul'],
      ['.sp-heading-actions', 'splendor'],
      ['.ll-heading-actions', 'love-letter'],
    ])
      document.querySelector(selector)?.append(control(key));
    document.addEventListener('pointerdown', (e) => {
      for (const n of document.querySelectorAll('.tt-audio[open]'))
        if (!n.contains(e.target)) n.open = false;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape')
        for (const n of document.querySelectorAll('.tt-audio[open]')) n.open = false;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden)
        for (const n of document.querySelectorAll('.tt-audio[open]')) n.open = false;
    });
  });
  return { control };
})();
