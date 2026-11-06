import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

// A project site runs below a URL prefix, unlike the development server.
const prefix = "/PROJETO-NEXUS/";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
};
let server, browser, origin;
const errors = [];
const requests = new Set();
before(async () => {
  server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      if (!pathname.startsWith(prefix)) throw Error("Outside project site");
      const relative = decodeURIComponent(pathname.slice(prefix.length)) || "index.html";
      const file = resolve(root, relative);
      if (!file.startsWith(root.endsWith(sep) ? root : root + sep))
        throw Error("Outside site directory");
      const content = await readFile(file);
      res.writeHead(200, { "Content-Type": mime[extname(file)] || "text/plain" });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${server.address().port}${prefix}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  await mkdir("artifacts", { recursive: true });
});
after(async () => {
  await browser?.close();
  if (server?.listening) await new Promise((done) => server.close(done));
  assert.deepEqual(errors, [], "No browser errors, failed resources or requests outside the project site");
});
async function open(viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  await context.addInitScript(() =>
    localStorage.setItem("nexus-v1", JSON.stringify({ reduced: true })),
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    requests.add(r.url());
    if (!r.url().startsWith(origin)) errors.push(`Outside project: ${r.url()}`);
  });
  page.on("response", (r) => {
    if (!r.ok()) errors.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  page.on("requestfailed", (r) => errors.push(`Failed: ${r.url()}`));
  await page.goto(origin);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".fighter")).toHaveCount(6);
  return { context, page };
}
test("static project site loads its artwork and fonts, all 20 heroes, and a player/AI turn", { timeout: 30000 }, async () => {
  const { context, page } = await open({ width: 1440, height: 1060 });
  try {
    assert.equal(await page.locator(".brand").getAttribute("href"), "./");
    const decoded = await page.evaluate(async () => {
      const images = await Promise.all(["heroes.png", "arena.png"].map(async (name) => {
        const img = new Image();
        img.src = new URL(`assets/${name}`, location.href).href;
        await img.decode();
        return [name, img.naturalWidth, img.naturalHeight];
      }));
      return { images, fonts: ["Cinzel", "Manrope"].map((font) =>
        document.fonts.check(`16px ${font}`)) };
    });
    assert.deepEqual(decoded.images, [["heroes.png", 1024, 1536], ["arena.png", 1672, 941]]);
    assert.deepEqual(decoded.fonts, [true, true]);
    for (const file of ["src/app.js", "src/art.js", "src/data.js", "src/engine.js", "src/balance.json", "styles.css", "assets/cinzel.ttf", "assets/manrope.ttf", "assets/heroes.png", "assets/arena.png"])
      assert(requests.has(origin + file), `Loaded separate resource: ${file}`);
    await expect(page.locator(".hero-art image").first()).toHaveAttribute("href", origin + "assets/heroes.png");
    await page.locator('.nav-link[data-act="roster"]').click();
    await expect(page.locator(".hero-card")).toHaveCount(20);
    await page.keyboard.press("Escape");
    await page.locator('[data-act="start"]').click();
    await page.locator('[data-unit="1-vesper"]').click();
    await page.locator('[data-act="execute"]').click();
    await expect(page.locator(".log-message.action")).toHaveCount(2, { timeout: 10000 });
    const hpText = await page.locator('[data-unit="1-vesper"] .fighter-tag>small').textContent();
    const [hp, max] = hpText.split("/").map(Number);
    assert(hp < max);
    await page.screenshot({ path: "artifacts/site-desktop.png", fullPage: true });
    await page.locator(".brand").click();
    await expect(page).toHaveURL(origin);
    await expect(page.locator('[data-act="start"]')).toBeVisible();
  } finally { await context.close(); }
});
test("static project site remains usable on mobile", { timeout: 20000 }, async () => {
  const { context, page } = await open({ width: 390, height: 844 });
  try {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    await page.locator('.nav-link[data-act="roster"]').click();
    await expect(page.locator(".hero-card")).toHaveCount(20);
    await page.locator('[data-filter="arcano"]').click();
    await expect(page.locator(".hero-card")).toHaveCount(4);
    await page.locator(".mobile-detail-open").click();
    await expect(page.locator(".hero-detail .detail-skills")).toBeVisible();
    await page.screenshot({ path: "artifacts/site-mobile.png", fullPage: true });
  } finally { await context.close(); }
});
