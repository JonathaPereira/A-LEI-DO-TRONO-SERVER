import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, process.argv.includes("--pages") ? "docs" : "dist");
// Explicit public files only: no ZIP, generated inline executable, dependency,
// credential, development server, test fixture or private browser profile.
const files = [
  "index.html", "styles.css",
  "src/app.js", "src/art.js", "src/data.js", "src/engine.js", "src/kits.js", "src/balance.json",
  "assets/arena.png", "assets/heroes.png", "assets/favicon.svg",
  "assets/cinzel.ttf", "assets/manrope.ttf",
  "assets/Cinzel-LICENSE.txt", "assets/Manrope-LICENSE.txt",
];
for (const file of files) {
  const destination = resolve(output, file);
  await mkdir(dirname(destination), {recursive: true});
  await copyFile(resolve(root, file), destination);
}
await writeFile(resolve(output, ".nojekyll"), "");
console.log(`Site estático preparado em ${output}; ${files.length} arquivos separados, sem empacotamento ou minificação.`);
