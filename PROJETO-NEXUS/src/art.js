import { CLASS_BY_ID } from "./data.js";
const heroAtlas = new URL("../assets/heroes.png", import.meta.url).href;
const paths = {
  flame:
    "M12 3c1 5 6 5 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 0 4 2 5 3 6 2-3 1-6 0-10Z",
  leaf: "M20 3C8 2 3 7 5 14c2 7 13 7 15-11ZM5 21 16 9M9 17l-1-5m5 1 5 1",
  gear: "m9 3 1-1h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 2-1 2H9l-1-3-3-1-2 1-2-4 2-2v-3L1 8l2-4 3 1 3-2Zm3 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  spark:
    "m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7L12 2ZM19 2v4m-2-2h4",
  moon: "M19 17A9 9 0 0 1 9 3a9 9 0 1 0 10 14Zm-3-9 1-3 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z",
  sun: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-6v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2",
  swords:
    "m4 3 11 11m-5 2 6-6m-4 6 7 5 2-2-5-7M20 3 9 14m-5-4 6 6m-4-4-5 7 2 2 7-5",
  shield: "M12 2 3 6v6c0 6 9 10 9 10s9-4 9-10V6l-9-4Zm0 4v12",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  close: "m6 6 12 12M6 18 18 6",
  volume: "m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14",
  muted: "m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6",
  help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 6a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01",
  reset: "M3 10a9 9 0 1 1 1 7M3 3v7h7",
  check: "m5 12 4 4L20 5",
  plus: "M12 4v16M4 12h16",
  people:
    "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-7a4 4 0 0 1 0 8M2 22v-3a7 7 0 0 1 14 0v3m2-7c3 0 4 2 4 4v3",
  bolt: "m13 2-9 12h7l-1 8 10-13h-7l1-7",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  crown: "m3 6 4 4 5-6 5 6 4-4-2 13H5L3 6Z",
  scroll:
    "M6 3h13a3 3 0 0 1 3 3v1h-6m3-4a3 3 0 0 0-3 3v12a3 3 0 0 1-6 0v-1H2v1a3 3 0 0 0 3 3h8M6 3v14m3-9h4m-4 4h4",
  flag: "M4 22V3c7-5 9 5 16 0v12c-7 5-9-5-16 0",
  diamond: "m12 2 9 10-9 10L3 12l9-10Zm-9 10h18M12 2v20",
  skull: "M7 17v4h10v-4a9 9 0 1 0-10 0Zm0-8v3m10-3v3m-6 4h2",
  target:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-8v6m0 12v6M0 12h6m12 0h6",
};
export function icon(name, extra = "") {
  return `<svg viewBox="0 0 24 24" class="icon ${extra}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name] || paths.spark}"/></svg>`;
}
export function classIcon(classId, extra = "") {
  const c = CLASS_BY_ID[classId];
  return `<span class="affinity-icon ${extra}" style="--affinity:${c.color}" title="${c.name}">${icon(c.icon)}</span>`;
}
export function heroArt(hero, portrait = false) {
  const col = hero.index % 4,
    row = Math.floor(hero.index / 4);
  const box = portrait
    ? `${col * 256 + 42} ${row * 256 + 4} 172 160`
    : `${col * 256 + 10} ${row * 256 + 8} 236 240`;
  const width = portrait ? 172 : 236,
    height = portrait ? 160 : 240;
  // The inner viewport clips the atlas before the outer SVG is letterboxed.
  // Without it, adjacent rows can bleed into a tall fighter's empty margins.
  return `<svg class="hero-art ${portrait ? "portrait-art" : ""}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><svg width="${width}" height="${height}" viewBox="${box}" overflow="hidden"><image href="${heroAtlas}" x="0" y="0" width="1024" height="1536"/></svg></svg>`;
}
export function crest() {
  return `<svg viewBox="0 0 64 64" class="crest" aria-hidden="true"><path d="M32 2 41 22 61 32 41 42 32 62 23 42 3 32 23 22Z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="m32 8 5 19 19 5-19 5-5 19-5-19-19-5 19-5Z" fill="currentColor" opacity=".2"/><path d="M24 42V22l16 20V22" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" stroke-width=".5"/></svg>`;
}
export const STATUS_LABELS = {
  darkmark:"Marca obscura", sentinel:"Sentinela", elementalWard:"Égide elemental",
  burn: "Queimadura",
  bleed: "Sangramento",
  regen: "Regeneração",
  weaken: "Ataque reduzido",
  expose: "Defesa exposta",
  empower:"Ataque +20%", fortify:"Dano recebido −15%", cover:"Proteção 25%", mirror:"Reflete dano", riposte:"Contra-ataque", taunt:"Provocação", emberguard:"Brasa reativa", focus:"Próximo golpe +25%", seed:"Próximo atacante cura 10%",
};
export function statusIcon(type) {
  return icon(
    { burn: "flame", bleed: "swords", regen: "leaf", weaken: "moon", expose: "target" }[type] || "spark",
  );
}
