'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const distRoot = path.join(root, 'artifacts/men-games-distribution');
const registryFile = path.join(root, 'games/registry.json');
const MEN_GAMES_ORIGIN = 'https://men-games.surge.sh';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildMenGamesDistribution() {
  console.log('Building MeN Games index distribution hub...');

  if (!fs.existsSync(registryFile)) {
    throw new Error('games/registry.json not found!');
  }

  fs.rmSync(distRoot, { recursive: true, force: true });
  fs.mkdirSync(distRoot, { recursive: true });

  fs.copyFileSync(registryFile, path.join(distRoot, 'registry.json'));

  const coversSrc = path.join(root, 'public/assets/games');
  if (fs.existsSync(coversSrc)) {
    fs.cpSync(coversSrc, path.join(distRoot, 'assets/games'), { recursive: true });
  }

  const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
  const launcherHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MeN Games · Hub Central de Jogos</title>
  <style>
    :root {
      --bg: #0b0d13;
      --card-bg: #141824;
      --gold: #d4af37;
      --gold-hover: #ffd700;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --border: #232936;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); padding: 2rem; min-height: 100vh; }
    header { max-width: 1200px; margin: 0 auto 2.5rem; text-align: center; }
    h1 { color: var(--gold); font-size: 2.25rem; margin-bottom: 0.5rem; letter-spacing: 1px; }
    p.lead { color: var(--text-muted); font-size: 1.05rem; }
    .catalog-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1.75rem;
      max-width: 1200px;
      margin: 0 auto;
    }
    .game-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .card-body { padding: 1.25rem; display: flex; flex-direction: column; flex: 1; }
    .tag { font-size: 0.75rem; color: var(--gold); font-weight: 700; text-transform: uppercase; margin-bottom: 0.4rem; }
    .title { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; }
    .desc { font-size: 0.875rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 1.25rem; flex: 1; }
    .btn-play {
      background: var(--gold);
      color: #000;
      text-decoration: none;
      padding: 0.65rem 1rem;
      border-radius: 6px;
      text-align: center;
      font-weight: 700;
      font-size: 0.9rem;
    }
    .btn-play:hover { background: var(--gold-hover); }
  </style>
</head>
<body>
  <header>
    <h1>MeN GAMES</h1>
    <p class="lead">Catálogo indexado dinamicamente do repositório MENGAMES (${escapeHtml(MEN_GAMES_ORIGIN)})</p>
  </header>
  <main class="catalog-grid">
    ${registry.games
      .map((g) => {
        const href = /^https?:\/\//.test(g.entryUrl)
          ? g.entryUrl
          : `${MEN_GAMES_ORIGIN}/${encodeURIComponent(g.id === 'throne' ? 'lei-do-trono' : g.id === 'roguelite' ? 'cinzas-do-abismo' : g.id)}/`;
        return `
      <div class="game-card" data-game="${escapeHtml(g.id)}">
        <div class="card-body">
          <span class="tag">${escapeHtml(g.tag)}</span>
          <h2 class="title">${escapeHtml(g.title)}</h2>
          <p class="desc">${escapeHtml(g.description)}</p>
          <a href="${escapeHtml(href)}" class="btn-play">Jogar Agora</a>
        </div>
      </div>
    `;
      })
      .join('')}
  </main>
</body>
</html>`;

  fs.writeFileSync(path.join(distRoot, 'index.html'), launcherHtml);
  console.log(
    'MeN Games index distribution created successfully at artifacts/men-games-distribution/',
  );
}

if (require.main === module) {
  buildMenGamesDistribution();
}

module.exports = { buildMenGamesDistribution };
