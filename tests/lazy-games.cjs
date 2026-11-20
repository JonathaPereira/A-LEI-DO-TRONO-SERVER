const test = require('node:test');
const assert = require('node:assert/strict');

test('LazyRegistry defers game initialization until explicit property access', async () => {
  const { createLazyRegistry } = await import('../src/lib/games/lazy-registry.ts');

  const registry = createLazyRegistry();
  let azulInitCalls = 0;
  let rogueliteInitCalls = 0;

  registry.register('TronoAzul', (target) => {
    azulInitCalls++;
    target.TronoAzul = { open: () => 'azul-opened', ready: true };
  });

  registry.register('TronoRoguelite', (target) => {
    rogueliteInitCalls++;
    target.TronoRoguelite = { open: () => 'roguelite-opened', ready: true };
  });

  const mockWindow = {};
  const uninstall = registry.install(mockWindow);

  // Before access: neither game should be initialized
  assert.equal(registry.isInitialized(mockWindow, 'TronoAzul'), false);
  assert.equal(registry.isInitialized(mockWindow, 'TronoRoguelite'), false);
  assert.equal(azulInitCalls, 0);
  assert.equal(rogueliteInitCalls, 0);

  // Access only TronoAzul
  const azul = mockWindow.TronoAzul;
  assert.ok(azul);
  assert.equal(azul.open(), 'azul-opened');
  assert.equal(azulInitCalls, 1);
  assert.equal(registry.isInitialized(mockWindow, 'TronoAzul'), true);

  // TronoRoguelite must STILL NOT be initialized
  assert.equal(registry.isInitialized(mockWindow, 'TronoRoguelite'), false);
  assert.equal(rogueliteInitCalls, 0);

  // Repeated access to TronoAzul must not reinitialize
  const azulAgain = mockWindow.TronoAzul;
  assert.equal(azulAgain, azul);
  assert.equal(azulInitCalls, 1);

  // Now access TronoRoguelite
  const roguelite = mockWindow.TronoRoguelite;
  assert.ok(roguelite);
  assert.equal(roguelite.open(), 'roguelite-opened');
  assert.equal(rogueliteInitCalls, 1);
  assert.equal(registry.isInitialized(mockWindow, 'TronoRoguelite'), true);

  // Uninstall cleans up properties
  uninstall();
  assert.equal(mockWindow.TronoAzul, undefined);
  assert.equal(mockWindow.TronoRoguelite, undefined);
});

test('LazyRegistry ensureInitialized pre-warms a target without waiting for getter', async () => {
  const { createLazyRegistry } = await import('../src/lib/games/lazy-registry.ts');

  const registry = createLazyRegistry();
  let initialized = false;

  registry.register('TronoNexus', (target) => {
    initialized = true;
    target.TronoNexus = { launched: true };
  });

  const mockWindow = {};
  registry.install(mockWindow);

  assert.equal(registry.isInitialized(mockWindow, 'TronoNexus'), false);
  registry.ensureInitialized(mockWindow, 'TronoNexus');
  assert.equal(registry.isInitialized(mockWindow, 'TronoNexus'), true);
  assert.equal(initialized, true);
  assert.equal(mockWindow.TronoNexus.launched, true);
});
