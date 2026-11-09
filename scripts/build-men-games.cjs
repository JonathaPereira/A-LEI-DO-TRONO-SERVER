'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const distRoot = path.join(root, 'artifacts/men-games-distribution');
const registryFile = path.join(root, 'games/registry.json');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function buildMenGamesDistribution() {
  console.log('Building MeN Games central distribution package...');

  if (!fs.existsSync(registryFile)) {
    throw new Error('games/registry.json not found!');
  }

  // Ensure clean dist directory
  fs.rmSync(distRoot, { recursive: true, force: true });
  fs.mkdirSync(distRoot, { recursive: true });

  // 1. Copy registry.json
  fs.copyFileSync(registryFile, path.join(distRoot, 'registry.json'));

  // 2. Distribute A Lei do Trono
  const leiDoTronoSrc = path.join(root, 'games/lei-do-trono');
  const leiDoTronoDist = path.join(distRoot, 'lei-do-trono');
  copyRecursive(path.join(leiDoTronoSrc, 'frontend'), leiDoTronoDist);
  copyRecursive(path.join(leiDoTronoSrc, 'assets'), path.join(leiDoTronoDist, 'assets'));
  copyRecursive(
    path.join(leiDoTronoSrc, 'documentation'),
    path.join(leiDoTronoDist, 'documentation'),
  );

  // 3. Distribute Cinzas do Abismo
  const cinzasSrc = path.join(root, 'games/cinzas-do-abismo');
  const cinzasDist = path.join(distRoot, 'cinzas-do-abismo');
  copyRecursive(path.join(cinzasSrc, 'frontend'), cinzasDist);
  copyRecursive(path.join(cinzasSrc, 'core'), path.join(cinzasDist, 'core'));
  // Mirror game assets into standalone distribution
  copyRecursive(path.join(root, 'public/roguelite/assets'), path.join(cinzasDist, 'assets'));
  copyRecursive(path.join(cinzasSrc, 'manifest.json'), path.join(cinzasDist, 'manifest.json'));

  // 4. Generate Central Launcher Hub
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
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .game-card:hover {
      transform: translateY(-4px);
      border-color: var(--gold);
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
      transition: background 0.15s ease;
    }
    .btn-play:hover { background: var(--gold-hover); }
  </style>
</head>
<body>
  <header>
    <h1>MeN GAMES</h1>
    <p class="lead">Centro de distribuição e execução de jogos da MeNCorp</p>
  </header>
  <main class="catalog-grid">
    ${registry.games
      .map(
        (g) => `
      <div class="game-card">
        <div class="card-body">
          <span class="tag">${g.tag}</span>
          <h2 class="title">${g.title}</h2>
          <p class="desc">${g.description}</p>
          <a href="${g.id === 'throne' ? './lei-do-trono/' : g.id === 'roguelite' ? './cinzas-do-abismo/' : g.entryUrl}" class="btn-play">Jogar Agora</a>
        </div>
      </div>
    `,
      )
      .join('')}
  </main>
</body>
</html>`;

  fs.writeFileSync(path.join(distRoot, 'index.html'), launcherHtml);
  console.log(
    'MeN Games central distribution package created successfully at artifacts/men-games-distribution/',
  );
}

if (require.main === module) {
  buildMenGamesDistribution();
}

module.exports = { buildMenGamesDistribution };
