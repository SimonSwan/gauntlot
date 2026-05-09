// Convert pre-rendered Gauntlet 1 maze PNGs (extracted from the original ROM
// via the gex tool) into our PIXEL-encoded level format.
//
// Each gex maze PNG is 560×560 with a 32×32 tile grid of 16×16 stamps and a
// 16px border. The classifier runs two passes:
//
//  1. Per-tile candidate classification by colour + variance (wall / floor /
//     out-of-bounds / exotic-cluster-with-dominant-hue).
//  2. Connectivity cleanup: a "wall" candidate with fewer than 2 cardinal
//     wall neighbours is re-classified as a generator (because real walls
//     come in connected runs; isolated brick-coloured cells are almost
//     always the brown "spinning generator" sprite).
//
// Output: assets/levels-rom/mazeNNN.png — pixel-encoded levels the game's
// PNG level loader already knows how to load.

import fs from "node:fs";
import path from "node:path";
import { PNG } from "/tmp/pt/node_modules/pngjs/lib/png.js";

const SRC_DIR = "assets/mazes";
const OUT_DIR = "assets/levels-rom";
const STAMP = 16;
const GRID = 32;
const BORDER = 16;

const PX = {
  NOTHING: 0x000000,
  WALL:    0x404000,
  DOOR:    0xC0C000,
  START:   0x00F000,
  EXIT:    0x004000,
  FLOOR:   0x202020, // anything non-wall, non-nothing is treated as walkable floor
  GEN:    (sub) => 0xF00000 | (sub << 4),
  MON:    (sub) => 0x400000 | (sub << 4),
  TREAS:  (sub) => 0x008000 | (sub << 4),
};

const M = { GHOST: 0, DEMON: 1, GRUNT: 2, SORCERER: 3, LOBBER: 4, DEATH: 5, THIEF: 6 };
const T = { HEALTH: 0, POISON: 1, FOOD1: 2, FOOD2: 3, FOOD3: 4, KEY: 5, POTION: 6, GOLD: 7, CHEST: 8 };

// Internal candidate codes — translated to PX.* in the final pass.
const CAND = { WALL: "W", FLOOR: "F", VOID: "V", EXIT: "E", SPECIAL: "S" };

function regionStats(png, x, y, w, h) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const i = (yy * png.width + xx) << 2;
    r += png.data[i]; g += png.data[i+1]; b += png.data[i+2]; n++;
  }
  r/=n; g/=n; b/=n;
  let v = 0;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const i = (yy * png.width + xx) << 2;
    v += (png.data[i]-r)**2 + (png.data[i+1]-g)**2 + (png.data[i+2]-b)**2;
  }
  return { r, g, b, lum: (r+g+b)/3, var: v/n };
}

function brightestPixel(png, x, y, w, h) {
  let best = { r: 0, g: 0, b: 0, lum: 0 };
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const i = (yy * png.width + xx) << 2;
    const r = png.data[i], g = png.data[i+1], b = png.data[i+2];
    const lum = (r + g + b) / 3;
    if (lum > best.lum) best = { r, g, b, lum };
  }
  return best;
}

// Counts how many pixels in a region are above a luminance threshold.
function brightFraction(png, x, y, w, h, threshold) {
  let bright = 0, total = 0;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const i = (yy * png.width + xx) << 2;
    if ((png.data[i] + png.data[i+1] + png.data[i+2]) / 3 >= threshold) bright++;
    total++;
  }
  return bright / total;
}

// Quick first-pass classification ignoring connectivity.
function candidate(png, tx, ty) {
  const x = BORDER + tx * STAMP, y = BORDER + ty * STAMP;
  if (x + STAMP > png.width || y + STAMP > png.height) return CAND.VOID;
  const a = regionStats(png, x, y, STAMP, STAMP);
  if (a.lum < 12 && a.var < 600) return CAND.VOID;

  const peak = brightestPixel(png, x, y, STAMP, STAMP);
  const peakSat = Math.max(peak.r, peak.g, peak.b) - Math.min(peak.r, peak.g, peak.b);
  const brightFrac = brightFraction(png, x, y, STAMP, STAMP, 100);

  // Wall first: dense mid-bright textured surface. A wall has lots of medium-bright
  // pixels (mortar / brick highlights) covering most of the cell, not just a small
  // sprite peak.
  //   - mean luminance ≥ 50 (excludes dark floor)
  //   - >35% of pixels are bright   (excludes sprite-on-floor, which is sparse)
  //   - high textural variance      (excludes flat-colour items)
  // Includes brown brick, gray cobble, and teal/blue force-field walls.
  if (a.lum >= 50 && brightFrac >= 0.35 && a.var >= 1200) return CAND.WALL;

  // EXIT text: nearly-pure-white peak on a dark cell. Restricted to maze-edge
  // bands later in postprocess; we just flag the candidate here.
  const isPureWhite = peak.r > 220 && peak.g > 220 && peak.b > 220;
  const isNearEdge = (tx <= 1 || tx >= GRID - 2 || ty <= 1 || ty >= GRID - 2);
  if (isPureWhite && a.lum < 50 && isNearEdge) return CAND.EXIT;

  // Sprite / item: a saturated bright peak on an otherwise dark cell.
  // Require a small bright fraction to distinguish from textured walls.
  if (peak.lum > 170 && peakSat > 60 && a.lum < 65 && brightFrac < 0.30) return CAND.SPECIAL;

  return CAND.FLOOR;
}

function classifySpecial(png, tx, ty) {
  // Decide which sub-type a SPECIAL tile is by its dominant bright hue.
  const x = BORDER + tx * STAMP, y = BORDER + ty * STAMP;
  const peak = brightestPixel(png, x, y, STAMP, STAMP);
  const a = regionStats(png, x, y, STAMP, STAMP);
  const { r, g, b } = peak;

  // Treasure: blue potion — strong blue
  if (b > 180 && r < 130 && g < 150) return PX.TREAS(T.HEALTH);
  // Yellow key
  if (r > 200 && g > 180 && b < 120) return PX.TREAS(T.KEY);
  // Green / forcefield = potion
  if (g > 180 && r < 160 && b < 160) return PX.TREAS(T.POTION);
  // Magenta / pink = sorcerer
  if (r > 160 && b > 130 && g < 120) return PX.MON(M.SORCERER);
  // Bright red = demon
  if (r > 200 && g < 100 && b < 100) return PX.MON(M.DEMON);
  // White / light gray = ghost
  if (r > 180 && g > 180 && b > 180) return PX.MON(M.GHOST);
  // Brown spinning circle ≈ generator. Average lum mid, peak warm.
  if (r > 140 && g > 80 && g < 160 && b < 100) return PX.GEN(M.GHOST);
  // Default fallback: gold
  return PX.TREAS(T.GOLD);
}

function neighbourCount(grid, w, h, x, y, value) {
  let c = 0;
  if (x > 0   && grid[y*w + (x-1)]   === value) c++;
  if (x < w-1 && grid[y*w + (x+1)]   === value) c++;
  if (y > 0   && grid[(y-1)*w + x]   === value) c++;
  if (y < h-1 && grid[(y+1)*w + x]   === value) c++;
  return c;
}

function ensureStart(grid, w, h) {
  for (let y = 1; y < h-1; y++) for (let x = 1; x < w-1; x++) {
    const i = y*w + x;
    if (grid[i] !== PX.FLOOR) continue;
    if (grid[i-1] === PX.FLOOR && grid[i+1] === PX.FLOOR &&
        grid[i-w] === PX.FLOOR && grid[i+w] === PX.FLOOR) {
      grid[i] = PX.START; return;
    }
  }
  for (let i = 0; i < grid.length; i++) if (grid[i] === PX.FLOOR) { grid[i] = PX.START; return; }
}

function ensureExit(grid, w, h) {
  for (let i = 0; i < grid.length; i++) if (grid[i] === PX.EXIT) return;
  // pick a corner-ish floor cell as exit
  for (let r = 0; r < 6; r++) {
    for (let y = 1 + r; y < h - 1 - r; y++) for (let x = 1 + r; x < w - 1 - r; x++) {
      if (x !== 1 + r && x !== w - 2 - r && y !== 1 + r && y !== h - 2 - r) continue;
      const i = y*w + x;
      if (grid[i] === PX.FLOOR) { grid[i] = PX.EXIT; return; }
    }
  }
}

async function loadPng(file) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(file).pipe(new PNG()).on("parsed", function() { resolve(this); }).on("error", reject);
  });
}

function writePng(file, grid, w, h) {
  const out = new PNG({ width: w, height: h });
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i];
    const j = i << 2;
    out.data[j]   = (v >> 16) & 0xff;
    out.data[j+1] = (v >> 8) & 0xff;
    out.data[j+2] = v & 0xff;
    out.data[j+3] = 0xff;
  }
  return new Promise(resolve => out.pack().pipe(fs.createWriteStream(file)).on("finish", resolve));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = fs.readdirSync(SRC_DIR).filter(f => /^maze\d+\.png$/.test(f)).sort();
  console.log(`Converting ${files.length} mazes from ${SRC_DIR}`);

  for (const f of files) {
    const png = await loadPng(path.join(SRC_DIR, f));

    // Pass 1: candidate per-tile classification
    const cand = new Array(GRID * GRID);
    for (let ty = 0; ty < GRID; ty++) for (let tx = 0; tx < GRID; tx++) {
      cand[ty * GRID + tx] = candidate(png, tx, ty);
    }

    // Pass 2: connectivity cleanup. A "wall" tile with no orthogonal wall
    // neighbour is almost certainly an isolated sprite (generator / monster
    // / item / treasure pile). Demote it to SPECIAL so it becomes an entity
    // rather than a stray invisible-feeling wall in the middle of a corridor.
    const cleaned = cand.slice();
    for (let ty = 1; ty < GRID-1; ty++) for (let tx = 1; tx < GRID-1; tx++) {
      const i = ty * GRID + tx;
      if (cand[i] !== CAND.WALL) continue;
      const wn = neighbourCount(cand, GRID, GRID, tx, ty, CAND.WALL);
      const vn = neighbourCount(cand, GRID, GRID, tx, ty, CAND.VOID);
      if (wn + vn < 2) cleaned[i] = CAND.SPECIAL;
    }

    // Optional pass 3: fill 1-tile holes inside wall blocks.
    for (let ty = 1; ty < GRID-1; ty++) for (let tx = 1; tx < GRID-1; tx++) {
      const i = ty * GRID + tx;
      if (cleaned[i] === CAND.WALL) continue;
      const wn = neighbourCount(cleaned, GRID, GRID, tx, ty, CAND.WALL);
      if (wn === 4 && cleaned[i] === CAND.FLOOR) cleaned[i] = CAND.WALL;
    }

    // Pass 4: encode to PIXEL output
    const grid = new Array(GRID * GRID);
    for (let i = 0; i < cleaned.length; i++) {
      const c = cleaned[i];
      switch (c) {
        case CAND.WALL:    grid[i] = PX.WALL; break;
        case CAND.VOID:    grid[i] = PX.NOTHING; break;
        case CAND.EXIT:    grid[i] = PX.EXIT; break;
        case CAND.SPECIAL: {
          const tx = i % GRID, ty = (i / GRID) | 0;
          grid[i] = classifySpecial(png, tx, ty);
          break;
        }
        default:           grid[i] = PX.FLOOR;
      }
    }

    // Force a hard wall border (some mazes have the gex EXIT text bleed past
    // the edge — we still want the playfield enclosed).
    for (let i = 0; i < GRID; i++) {
      if (grid[i] !== PX.EXIT) grid[i] = PX.WALL;
      const bot = (GRID-1) * GRID + i;
      if (grid[bot] !== PX.EXIT) grid[bot] = PX.WALL;
      const left = i * GRID;
      if (grid[left] !== PX.EXIT) grid[left] = PX.WALL;
      const right = i * GRID + (GRID-1);
      if (grid[right] !== PX.EXIT) grid[right] = PX.WALL;
    }

    ensureStart(grid, GRID, GRID);
    ensureExit(grid, GRID, GRID);

    await writePng(path.join(OUT_DIR, f), grid, GRID, GRID);
  }
  console.log("Done.");
}
main().catch(e => { console.error(e); process.exit(1); });
