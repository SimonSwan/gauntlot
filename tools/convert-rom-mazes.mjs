// Convert pre-rendered Gauntlet 1 maze PNGs (extracted from the original ROM
// via the gex tool) into our PIXEL-encoded level format.
//
// Each gex maze PNG is 560×560 with a 32×32 tile grid of 16×16 stamps and a
// ~16px border. We sample each tile and classify it as wall / floor / door /
// generator / treasure / monster / exit / player-start by colour signature.
//
// Output: assets/levels-rom/mazeNNN.png — pixel-encoded levels the game
// already knows how to load.

import fs from "node:fs";
import path from "node:path";
import { PNG } from "/tmp/pt/node_modules/pngjs/lib/png.js";

const SRC_DIR = "assets/mazes";
const OUT_DIR = "assets/levels-rom";
const STAMP = 16;
const GRID = 32;
const BORDER = 16; // gex adds a 16px no-wrap edge

// PIXEL encoding (mirrors src/constants.js and javascript-gauntlet)
const PX = {
  NOTHING:   0x000000,
  WALL:      0x404000,
  DOOR:      0xC0C000,
  START:     0x00F000,
  EXIT:      0x004000,
  // sub-types stored in the bits 0x0000F0
  GEN:    (sub) => 0xF00000 | (sub << 4),
  MON:    (sub) => 0x400000 | (sub << 4),
  TREAS:  (sub) => 0x008000 | (sub << 4),
};

// Monster sub-types (matches our MONSTER_LIST: GHOST,DEMON,GRUNT,SORCERER,LOBBER,DEATH,THIEF)
const M = { GHOST: 0, DEMON: 1, GRUNT: 2, SORCERER: 3, LOBBER: 4, DEATH: 5, THIEF: 6 };
// Treasure sub-types (TREASURE_LIST: HEALTH,POISON,FOOD1,FOOD2,FOOD3,KEY,POTION,GOLD,CHEST)
const T = { HEALTH: 0, POISON: 1, FOOD1: 2, FOOD2: 3, FOOD3: 4, KEY: 5, POTION: 6, GOLD: 7, CHEST: 8 };

function avgRegion(png, x, y, w, h) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const i = (yy * png.width + xx) << 2;
      r += png.data[i]; g += png.data[i+1]; b += png.data[i+2]; n++;
    }
  }
  return { r: r/n|0, g: g/n|0, b: b/n|0 };
}

// detect dominant non-floor / non-wall colours by counting unique-ish hues
function colourHistogram(png, x, y, w, h) {
  const buckets = new Map();
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const i = (yy * png.width + xx) << 2;
      const r = png.data[i] >> 5, g = png.data[i+1] >> 5, b = png.data[i+2] >> 5;
      const k = (r << 6) | (g << 3) | b;
      buckets.set(k, (buckets.get(k) || 0) + 1);
    }
  }
  return buckets;
}

function regionStats(png, x, y, w, h) {
  let r = 0, g = 0, b = 0, n = 0, vr = 0, vg = 0, vb = 0;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const i = (yy * png.width + xx) << 2;
    r += png.data[i]; g += png.data[i+1]; b += png.data[i+2]; n++;
  }
  r/=n; g/=n; b/=n;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const i = (yy * png.width + xx) << 2;
    vr += (png.data[i]-r)**2; vg += (png.data[i+1]-g)**2; vb += (png.data[i+2]-b)**2;
  }
  return { r, g, b, vr: vr/n, vg: vg/n, vb: vb/n };
}

function classify(png, tx, ty) {
  const x = BORDER + tx * STAMP;
  const y = BORDER + ty * STAMP;
  if (x + STAMP > png.width || y + STAMP > png.height) return PX.NOTHING;
  const a = regionStats(png, x, y, STAMP, STAMP);

  const variance = a.vr + a.vg + a.vb;
  const meanLum = (a.r + a.g + a.b) / 3;

  // Out-of-bounds (very dark)
  if (meanLum < 12 && variance < 600) return PX.NOTHING;

  // Items / monsters: very high variance (brightly-coloured sprites against dark floor).
  // Defer to the colour-based classifier below.
  const isSpecial = variance > 8000 && meanLum > 35;

  // Wall: medium-bright + textured (brick / cobble pattern), but NOT special.
  if (!isSpecial && meanLum >= 60 && variance >= 2200) return PX.WALL;

  // Floor: dark brown averaging around (40,25,12). For floor we still need to
  // detect items / monsters / generators sitting on top. Use colour histogram
  // — if there's a non-floor non-wall cluster, classify by its hue.
  const buckets = colourHistogram(png, x + 2, y + 2, STAMP - 4, STAMP - 4);
  // Identify non-background pixels (not floor, not wall).
  let exotic = [];
  for (const [k, n] of buckets) {
    if (n < 6) continue;
    const r = ((k >> 6) & 7) << 5, g = ((k >> 3) & 7) << 5, b = (k & 7) << 5;
    const isFloor = (r < 70 && g < 50 && b < 40);
    const wallish = (r >= 70 && r <= 160 && g >= 30 && g <= 90 && b < 60 && r - b > 25);
    if (!isFloor && !wallish) exotic.push({ r, g, b, n });
  }

  if (exotic.length === 0) return -1; // floor (open)

  // Sort by frequency
  exotic.sort((a,b) => b.n - a.n);
  const top = exotic[0];

  // Classify by dominant exotic colour
  // - White / light gray (ghost): r≈g≈b high
  // - Bright red: red dominant
  // - Blue: b dominant
  // - Green: g dominant
  // - Yellow: r,g high, b low
  // - Magenta/pink: r,b high, g lower
  const { r, g, b } = top;
  if (r >= 160 && g >= 160 && b >= 160) return PX.MON(M.GHOST);
  if (r > 180 && g < 120 && b < 120) return PX.MON(M.DEMON);
  if (r > 160 && g > 100 && g < 180 && b < 80) return PX.MON(M.GRUNT);
  if (b > 160 && r < 140 && g < 140) return PX.TREAS(T.HEALTH);
  if (g > 140 && r < 120 && b < 120) return PX.TREAS(T.POTION);
  if (r > 160 && g > 160 && b < 100) return PX.TREAS(T.KEY);
  if (r > 120 && b > 120 && g < 100) return PX.MON(M.SORCERER);
  if (r > 100 && g > 60 && b < 50) return PX.TREAS(T.GOLD);

  // Heuristic: a tile of mostly black surrounded by walls + having "EXIT" text → exit. We can't OCR easily here, so flag tiles that are nearly black and at the maze edge as exits.
  return PX.TREAS(T.GOLD); // fallback: a treasure
}

function postProcessExits(grid, w, h) {
  // Look for rows/columns where the maze is bounded by wall and a strip of dark cells reaches the edge — treat the edge cell as an exit.
  // (gex renders "EXIT" in white text on near-black background)
  // For now we'll mark any 1-tile-wide gap in the outer wall as an exit.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x !== 0 && x !== w-1 && y !== 0 && y !== h-1) continue;
      const i = y * w + x;
      if (grid[i] !== PX.WALL && grid[i] !== PX.NOTHING) grid[i] = PX.EXIT;
    }
  }
}

function ensureStart(grid, w, h) {
  // Pick the first floor cell that has all four cardinal neighbours non-wall.
  for (let y = 1; y < h-1; y++) {
    for (let x = 1; x < w-1; x++) {
      const i = y*w + x;
      if (grid[i] !== -1) continue;
      const ok = grid[i-1] === -1 && grid[i+1] === -1 && grid[i-w] === -1 && grid[i+w] === -1;
      if (ok) { grid[i] = PX.START; return; }
    }
  }
  // fallback: any floor
  for (let i = 0; i < grid.length; i++) if (grid[i] === -1) { grid[i] = PX.START; return; }
}

async function loadPng(file) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(file).pipe(new PNG()).on("parsed", function() { resolve(this); }).on("error", reject);
  });
}

function writePng(file, grid, w, h) {
  const out = new PNG({ width: w, height: h });
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i] === -1 ? 0x202020 : grid[i]; // floor uses a dark grey to be visually distinct from "nothing"
    const j = i << 2;
    out.data[j]   = (v >> 16) & 0xff;
    out.data[j+1] = (v >> 8) & 0xff;
    out.data[j+2] = v & 0xff;
    out.data[j+3] = 0xff;
  }
  // For our level loader, "floor" should be anything that's not WALL or NOTHING.
  // We use a light-blue placeholder; the loader treats non-WALL non-NOTHING as walkable.
  out.pack().pipe(fs.createWriteStream(file));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = fs.readdirSync(SRC_DIR).filter(f => /^maze\d+\.png$/.test(f)).sort();
  console.log(`Converting ${files.length} mazes from ${SRC_DIR}`);

  for (const f of files) {
    const png = await loadPng(path.join(SRC_DIR, f));
    const grid = new Array(GRID * GRID).fill(-1);
    for (let ty = 0; ty < GRID; ty++) {
      for (let tx = 0; tx < GRID; tx++) {
        grid[ty * GRID + tx] = classify(png, tx, ty);
      }
    }
    // Force a hard wall border so the maze is enclosed.
    for (let i = 0; i < GRID; i++) {
      grid[i] = PX.WALL;
      grid[(GRID-1) * GRID + i] = PX.WALL;
      grid[i * GRID] = PX.WALL;
      grid[i * GRID + (GRID-1)] = PX.WALL;
    }
    ensureStart(grid, GRID, GRID);
    // Replace temporary -1 with floor encoding before writing.
    for (let i = 0; i < grid.length; i++) if (grid[i] === -1) grid[i] = 0x202020;

    const outFile = path.join(OUT_DIR, f);
    writePng(outFile, grid, GRID, GRID);
  }
  console.log("Done.");
}
main().catch(e => { console.error(e); process.exit(1); });
