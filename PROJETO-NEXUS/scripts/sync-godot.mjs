import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { HEROES, ARCHIVED_HEROES, CLASS_BY_ID, DEFAULT_TEAMS, GUARD } from "../src/data.js";

import { BUILD } from "../server/pvp-loadout.mjs";

const destination = new URL("../godot/", import.meta.url);
await mkdir(new URL("data/", destination), { recursive: true });
await mkdir(new URL("assets/", destination), { recursive: true });
await writeFile(new URL("data/catalog.json", destination), JSON.stringify({
  schemaVersion: 1, heroes: HEROES, archivedHeroes: ARCHIVED_HEROES, classes: Object.values(CLASS_BY_ID),
  defaultTeams: DEFAULT_TEAMS, guard: GUARD,
}, null, 2) + "\n");
// src/balance.json is the single editable source for shared formula parameters.
await copyFile(new URL("../src/balance.json", import.meta.url), new URL("data/combat-rules.json", destination));
await copyFile(new URL("../src/pvp-rules.json", import.meta.url), new URL("data/pvp-rules.json", destination));
await writeFile(new URL("data/pvp-build.json", destination), JSON.stringify({protocol:1,build:BUILD})+"\n");
// Godot character art has its own cutouts/atlas; don't overwrite the refined art.
for (const file of ["arena.png", "cinzel.ttf", "manrope.ttf", "favicon.svg", "Cinzel-LICENSE.txt", "Manrope-LICENSE.txt"])
  await copyFile(new URL(`../assets/${file}`, import.meta.url), new URL(`assets/${file}`, destination));
console.log(`Catálogo, fórmulas e recursos sincronizados: ${fileURLToPath(destination)}`);
