import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { HERO_BY_ID } from "../src/data.js";

const origin = process.env.NEXUS_TEST_BASE_URL || "http://127.0.0.1:5199";
let browser,
  server,
  serverOutput = "";
const errors = [];
before(async () => {
  if (!process.env.NEXUS_TEST_BASE_URL) {
    server = spawn(process.execPath, ["server.mjs"], {
      env: { ...process.env, PORT: "5199" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout.on("data", (b) => (serverOutput += b));
    server.stderr.on("data", (b) => (serverOutput += b));
  }
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(origin);
      if (r.ok) break;
    } catch {}
    if (i === 99) throw Error("Server did not start: " + serverOutput);
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_EXECUTABLE_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  await mkdir("artifacts", { recursive: true });
});
after(async () => {
  await browser?.close();
  if (server) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      if (server.exitCode !== null) resolve();
      else server.once("exit", resolve);
    });
  }
  assert.deepEqual(errors, [], "No uncaught browser errors");
});
async function fresh(viewport = { width: 1440, height: 1060 }) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
  });
  await context.addInitScript(() =>
    localStorage.setItem("nexus-v1", JSON.stringify({ reduced: true })),
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".fighter")).toHaveCount(6);
  return { context, page };
}
test(
  "saved local mode keeps equal attributes and malformed preferences fall back safely",
  { timeout: 20000 },
  async () => {
    for (const preferences of [
      null,
      { mode: "local", difficulty: "hard", reduced: true },
    ]) {
      const context = await browser.newContext();
      try {
        await context.addInitScript(
          (value) => localStorage.setItem("nexus-v1", JSON.stringify(value)),
          preferences,
        );
        const page = await context.newPage();
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(origin);
        await expect(page.locator(".fighter")).toHaveCount(6);
        const hp = await page
          .locator('[data-unit="1-vesper"] .fighter-tag>small')
          .textContent();
        assert.equal(Number(hp.split("/")[1]), HERO_BY_ID.vesper.hp);
        if (preferences)
          await expect(page.locator(".mode-button")).toContainText(
            "Duelo local",
          );
      } finally {
        await context.close();
      }
    }
  },
);
test(
  "formation builder filters all classes, enforces three distinct heroes, edits both teams and persists",
  { timeout: 30000 },
  async () => {
    const { page, context } = await fresh();
    try {
      await page.locator('.nav-link[data-act="roster"]').click();
      await expect(page.locator(".hero-card")).toHaveCount(24);
      await expect(page.locator(".hero-card.chosen")).toHaveCount(3);
      for (const id of [
        "igneo",
        "natural",
        "tecnico",
        "arcano",
        "sombrio",
        "lumi",
              ]) {
        await page.locator(`[data-filter="${id}"]`).click();
        await expect(page.locator(".hero-card")).toHaveCount(4);
      }
      await page.locator('[data-filter="all"]').click();
      await page.locator('[data-remove="veyra"]').click();
      await expect(page.locator('[data-act="save-team"]')).toBeDisabled();
      await page.locator('[data-hero="elyra"]').click();
      await expect(page.locator('[data-act="save-team"]')).toBeEnabled();
      await page.locator('[data-roster-side="1"]').click();
      await page.locator('[data-remove="kira"]').click();
      await page.locator('[data-hero="saira"]').click();
      await page.screenshot({ path: "artifacts/roster-desktop.png" });
      await page.locator('[data-act="save-team"]').click();
      await expect(page.locator("#overlay")).not.toBeVisible();
      const prefs = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("nexus-v1")),
      );
      assert.deepEqual(prefs.teams[0], ["axion", "astra", "elyra"]);
      assert.deepEqual(prefs.teams[1], ["vesper", "oren", "saira"]);
      // Remove only the test initializer so reload actually exercises the saved data.
      const persistedContext = await browser.newContext();
      await persistedContext.addInitScript(
        (p) => localStorage.setItem("nexus-v1", JSON.stringify(p)),
        prefs,
      );
      const reloaded = await persistedContext.newPage();
      await reloaded.goto(origin);
      await expect(reloaded.locator(".team-list")).toContainText("Elyra");
      await expect(reloaded.locator('[data-unit="1-saira"]')).toBeVisible();
      await persistedContext.close();
    } finally {
      await context.close();
    }
  },
);
test(
  "affinity guide, sound, reduced motion and keyboard-accessible native dialogs work",
  { timeout: 20000 },
  async () => {
    const { page, context } = await fresh();
    try {
      await page.locator('.nav-link[data-act="classes"]').click();
      await expect(page.locator(".class-guide-grid article")).toHaveCount(6);
      await expect(page.locator(".class-guide-grid")).toContainText("Ígneo");
      await page.keyboard.press("Escape");
      await expect(page.locator("#overlay")).not.toBeVisible();
      await page.locator('[data-act="help"]').first().click();
      await expect(page.locator("#motion-setting")).toBeChecked();
      await page.locator("#sound-setting").check();
      await page.locator('[data-act="close"]').first().click();
      assert.equal(
        await page.evaluate(
          () => JSON.parse(localStorage.getItem("nexus-v1")).sound,
        ),
        true,
      );
      await expect(page.locator('[data-act="sound"]')).toHaveAttribute(
        "aria-label",
        "Desativar som",
      );
    } finally {
      await context.close();
    }
  },
);
test(
  "player attack animates, deals damage, and the AI takes its own valid turn",
  { timeout: 30000 },
  async () => {
    const { page, context } = await fresh();
    try {
      await page.locator('[data-act="start"]').click();
      await expect(page.locator('[data-action="basic"]')).toBeEnabled();
      await expect(page.locator('[data-action="ultimate"]')).toBeDisabled();
      await page.locator('[data-unit="1-vesper"]').click();
      await page.locator('[data-act="execute"]').click();
      await expect(
        page.locator(".hit-effect.animation-sweep").first(),
      ).toBeAttached();
      await expect(page.locator(".log-message.action")).toHaveCount(2, {
        timeout: 10000,
      });
      await expect(page.locator('[data-action="basic"]')).toBeEnabled();
      await expect(page.locator(".active-hero h2")).toHaveText("Astra");
      const text = await page
        .locator('[data-unit="1-vesper"] .fighter-tag>small')
        .textContent();
      const [hp, max] = text.split("/").map(Number);
      assert(hp < max);
      await page.screenshot({
        path: "artifacts/battle-desktop.png",
        fullPage: true,
      });
      await page.keyboard.press("4");
      await expect(page.locator('[data-action="guard"]')).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await page.locator('[data-act="execute"]').click();
      await expect(page.locator(".log-message.guard")).toHaveCount(1);
      await page.locator('[data-act="restart"]').click();
      await expect(page.locator(".dialog-restart")).toBeVisible();
      await page.locator('[data-act="confirm-restart"]').click();
      await expect(page.locator('[data-act="start"]')).toBeVisible();
    } finally {
      await context.close();
    }
  },
);
test(
  "a complete two-player match reaches a result and replay restores both teams",
  { timeout: 120000 },
  async () => {
    const { page, context } = await fresh();
    try {
      await page.locator('[data-act="mode"]').click();
      await page.locator('[data-mode="local"]').click();
      await expect(page.locator(".mode-button")).toContainText("Duelo local");
      await page.locator('[data-act="start"]').click();
      let turns = 0;
      while (
        !(await page.locator(".dialog-result").isVisible()) &&
        turns < 260
      ) {
        await expect(page.locator(".arena")).not.toHaveClass(/animating/);
        const actorId = await page
            .locator(".fighter.acting")
            .getAttribute("data-unit"),
          hero = HERO_BY_ID[actorId.slice(2)];
        let chosen = "basic";
        for (const id of ["ultimate", "skill", "basic"])
          if (await page.locator(`[data-action="${id}"]`).isEnabled()) {
            chosen = id;
            break;
          }
        const actionButton = page.locator(`[data-action="${chosen}"]`);
        if ((await actionButton.getAttribute("aria-pressed")) !== "true")
          await actionButton.click();
        const candidates = await page
          .locator(".fighter.can-target")
          .evaluateAll((nodes) =>
            nodes.map((n) => {
              const [hp, max] = n
                .querySelector(".fighter-tag>small")
                .textContent.split("/")
                .map(Number);
              return { id: n.dataset.unit, hp, max };
            }),
          );
        assert(candidates.length > 0);
        const kind = hero[chosen].kind;
        candidates.sort((a, b) =>
          kind.startsWith("heal") ? a.hp / a.max - b.hp / b.max : a.hp - b.hp,
        );
        const targetButton = page.locator(
          `[data-target="${candidates[0].id}"]`,
        );
        if ((await targetButton.getAttribute("aria-pressed")) !== "true")
          await targetButton.click();
        await page.locator('[data-act="execute"]').click();
        turns++;
        await expect(page.locator(".arena")).not.toHaveClass(/animating/);
        // The result appears after a short animation; actor can otherwise be defeated at game end.
        if ((await page.locator('[data-act="execute"]').count()) === 0)
          await expect(page.locator(".dialog-result")).toBeVisible();
      }
      assert(
        turns > 6 && turns < 260,
        `A real match must complete; performed ${turns} actions`,
      );
      await expect(page.locator(".dialog-result")).toBeVisible();
      await expect(page.locator(".dialog-result h2")).toHaveText("Vitória.");
      await page.screenshot({ path: "artifacts/victory.png" });
      await page.locator('[data-act="play-again"]').click();
      await expect(page.locator(".dialog-result")).not.toBeVisible();
      await expect(page.locator(".fighter.fallen")).toHaveCount(0);
      assert.equal(await page.locator(".log-message.action").count(), 0);
    } finally {
      await context.close();
    }
  },
);
test(
  "mobile layout has no overflow; hero details and battle controls remain usable",
  { timeout: 30000 },
  async () => {
    const { page, context } = await fresh({ width: 390, height: 844 });
    try {
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
        0,
      );
      await page.screenshot({
        path: "artifacts/battle-mobile.png",
        fullPage: true,
      });
      await page.locator('.nav-link[data-act="roster"]').click();
      await expect(page.locator(".hero-card")).toHaveCount(24);
      await page.locator('[data-filter="arcano"]').click();
      await expect(page.locator(".hero-card")).toHaveCount(4);
      await page.locator(".mobile-detail-open").click();
      await expect(page.locator(".hero-detail")).toBeVisible();
      await expect(page.locator(".hero-detail .detail-skills")).toBeVisible();
      await page.screenshot({ path: "artifacts/hero-mobile.png" });
      await page.locator(".mobile-detail-back").click();
      await expect(page.locator(".hero-grid")).toBeVisible();
      await page.keyboard.press("Escape");
      await page.locator('[data-act="start"]').click();
      await page.locator('[data-action="skill"]').click();
      await expect(page.locator('[data-act="execute"]')).toBeEnabled();
      await page.locator('[data-act="execute"]').click();
      await expect(page.locator(".log-message.action")).toHaveCount(2, {
        timeout: 10000,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
        0,
      );
    } finally {
      await context.close();
    }
  },
);
