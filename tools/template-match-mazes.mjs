// Reconstruct the original Atari Gauntlet 1 maze layouts from the gex-rendered
// reference PNGs in assets/mazes/.
//
// Each input is a 560x560 PNG: 16-px outer border + 33x33 grid of 16x16 tile
// stamps. Each tile is one of: wall, floor, void, exit, generator, monster,
// or treasure.
//
// Per-maze pipeline:
//
//  1. Calibrate the wall colour from cell (0,0) (always wall).
//  2. Calibrate the floor colour by histogramming the mean colour of every
//     interior cell and picking the most common bucket that's far from wall
//     colour and not void.
//  3. For each cell:
//       - mean colour ~= wall colour              -> WALL
//       - mean colour ~= floor colour             -> FLOOR
//       - >85% near-black                         -> VOID
//       - else (something exotic)                 -> ENTITY
//  4. EXIT detection: cells where the literal "EXIT" text is rendered (a
//     dense bright-white pixel band across two horizontally-adjacent cells).
//  5. Entity sub-classification by the brightest exotic pixel's hue.
//  6. The first walkable (FLOOR) cell becomes the player START.
//  7. If no exit was detected, force the last floor cell to be the exit so
//     the level is completable.
//
// Output: assets/levels-rom/mazeNNN.png — a 33x33 pixel PNG using the existing
// PIXEL encoding the level loader already understands.

import fs from "node:fs";
import path from "node:path";
import { PNG } from "/tmp/pt/node_modules/pngjs/lib/png.js";

const SRC_DIR  = "assets/mazes";
const OUT_DIR  = "assets/levels-rom";
const STAMP    = 16;
const BORDER   = 16;
const GRID     = 33;

const PX = {
  WALL:      0x404000,
  GENERATOR: 0xF00000,
  MONSTER:   0x400000,
  TREASURE:  0x008000,
  START:     0x00F000,
  EXIT:      0x004000,
};

const MON  = { GHOST: 0, DEMON: 1, GRUNT: 2, SORCERER: 3, LOBBER: 4, DEATH: 5, THIEF: 6 };
const TRE  = { HEALTH: 0, POISON: 1, FOOD1: 2, FOOD2: 3, FOOD3: 4, KEY: 5, POTION: 6, GOLD: 7, CHEST: 8 };

function lum(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function rgbDist(a, b) { return Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]); }

function meanColor(png, x0, y0) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < STAMP; y++) {
    for (let x = 0; x < STAMP; x++) {
      const i = ((y0 + y) * png.width + (x0 + x)) << 2;
      r += png.data[i]; g += png.data[i+1]; b += png.data[i+2]; n++;
    }
  }
  return [r / n, g / n, b / n];
}

function lumVariance(png, x0, y0) {
  let s = 0, s2 = 0, n = 0;
  for (let y = 0; y < STAMP; y++) {
    for (let x = 0; x < STAMP; x++) {
      const i = ((y0 + y) * png.width + (x0 + x)) << 2;
      const L = lum(png.data[i], png.data[i+1], png.data[i+2]);
      s += L; s2 += L * L; n++;
    }
  }
  return Math.max(0, s2 / n - (s / n) ** 2);
}

function voidFraction(png, x0, y0) {
  let v = 0, n = 0;
  for (let y = 0; y < STAMP; y++) {
    for (let x = 0; x < STAMP; x++) {
      const i = ((y0 + y) * png.width + (x0 + x)) << 2;
      const L = lum(png.data[i], png.data[i+1], png.data[i+2]);
      if (L < 14) v++;
      n++;
    }
  }
  return v / n;
}

// Bright-white pixel count in a cell — used for "EXIT" text detection.
function whitePixelCount(png, x0, y0) {
  let count = 0;
  const xs = new Set();
  for (let y = 2; y <= 12; y++) {
    for (let x = 1; x < STAMP - 1; x++) {
      const i = ((y0 + y) * png.width + (x0 + x)) << 2;
      const r = png.data[i], g = png.data[i+1], b = png.data[i+2];
      if (r > 220 && g > 220 && b > 220) { count++; xs.add(x); }
    }
  }
  return { count, distinctX: xs.size };
}

// Brightest exotic pixel = pixel that's far from both wall and floor colours.
function brightestExotic(png, x0, y0, wallColor, floorColor) {
  let best = null, bestL = -1;
  for (let y = 0; y < STAMP; y++) {
    for (let x = 0; x < STAMP; x++) {
      const i = ((y0 + y) * png.width + (x0 + x)) << 2;
      const r = png.data[i], g = png.data[i+1], b = png.data[i+2];
      if (rgbDist([r,g,b], wallColor)  < 60) continue;
      if (rgbDist([r,g,b], floorColor) < 50) continue;
      const L = lum(r, g, b);
      if (L < 60) continue;
      if (L > bestL) { bestL = L; best = [r, g, b]; }
    }
  }
  return best;
}

function classifyExotic(rgb) {
  if (!rgb) return { type: "M", sub: MON.GHOST };
  const [r, g, b] = rgb;
  const m = Math.max(r, g, b), mn = Math.min(r, g, b);
  const sat = m - mn;
  // Pure white-ish = ghost or potion. Default to ghost (more common).
  if (r > 220 && g > 220 && b > 220 && sat < 30) return { type: "M", sub: MON.GHOST };
  // Pure yellow = gold treasure
  if (r > 200 && g > 160 && b < 100) return { type: "T", sub: TRE.GOLD };
  // Cyan / pale blue = potion
  if (b > 180 && g > 140 && r < 150)   return { type: "T", sub: TRE.POTION };
  // Magenta / pink = sorcerer
  if (r > 180 && b > 130 && g < 130)   return { type: "M", sub: MON.SORCERER };
  // Saturated green that's not floor = generator
  if (g > 180 && r < 140 && b < 140 && sat > 60) return { type: "G", sub: MON.GHOST };
  // Bright orange = demon
  if (r > 200 && g > 90 && g < 180 && b < 110)   return { type: "M", sub: MON.DEMON };
  // Bright blue = lobber
  if (b > 180 && r < 130 && g < 160)   return { type: "M", sub: MON.LOBBER };
  // Bright tan/khaki = grunt
  if (r > 150 && g > 110 && b < 110 && sat > 40) return { type: "M", sub: MON.GRUNT };
  // Generic monster fallback
  return { type: "M", sub: MON.GHOST };
}

function cellPos(cx, cy) {
  return { x0: BORDER + cx * STAMP, y0: BORDER + cy * STAMP };
}

function classifyMaze(png) {
  // 1. Wall palette: collect every quantised colour present in cell (0,0).
  const wallSample = cellPos(0, 0);
  const wallColor  = meanColor(png, wallSample.x0, wallSample.y0);
  const wallVariance = lumVariance(png, wallSample.x0, wallSample.y0);

  function quant(r, g, b) { return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4); }
  // Sample several border cells — they're all guaranteed wall — to capture
  // the full wall palette across stamp variants (plain run, corner, T-int).
  const wallSet = new Set();
  {
    const hist = new Map();
    const samples = [
      [0, 0], [1, 0], [GRID - 2, 0], [GRID - 1, 0],
      [0, 1], [0, GRID - 2], [GRID - 1, GRID - 1],
      [16, 0], [0, 16], [16, GRID - 1], [GRID - 1, 16],
    ];
    for (const [cx, cy] of samples) {
      const { x0, y0 } = cellPos(cx, cy);
      for (let y = 0; y < STAMP; y++) {
        for (let x = 0; x < STAMP; x++) {
          const i = ((y0 + y) * png.width + (x0 + x)) << 2;
          if (png.data[i] + png.data[i+1] + png.data[i+2] < 24) continue;
          const k = quant(png.data[i], png.data[i+1], png.data[i+2]);
          hist.set(k, (hist.get(k) || 0) + 1);
        }
      }
    }
    for (const [k, n] of hist) if (n >= 6) wallSet.add(k);
  }

  // 2. Floor: find the cell whose mean colour is the most common interior
  // mean colour that's NOT in the wall set. Then use that cell's quantised
  // palette as the floor set.
  const floorBuckets = new Map();
  for (let cy = 1; cy < GRID - 1; cy++) {
    for (let cx = 1; cx < GRID - 1; cx++) {
      const { x0, y0 } = cellPos(cx, cy);
      if (voidFraction(png, x0, y0) > 0.85) continue;
      const c = meanColor(png, x0, y0);
      // Skip cells whose mean colour reads as wall (too close to wall mean OR
      // dominated by wall palette).
      if (rgbDist(c, wallColor) < 24) continue;
      const key = `${(c[0]/10)|0}_${(c[1]/10)|0}_${(c[2]/10)|0}`;
      const list = floorBuckets.get(key) || [];
      list.push({ cx, cy });
      floorBuckets.set(key, list);
    }
  }
  let floorKey = null, floorPicks = null, floorBest = -1;
  for (const [k, picks] of floorBuckets) if (picks.length > floorBest) { floorKey = k; floorPicks = picks; floorBest = picks.length; }
  const floorSet = new Set();
  let floorColor;
  if (floorPicks && floorPicks.length) {
    // Build the floor palette by unioning the palettes of up to 6 sample
    // cells from this bucket — captures small floor texture variation.
    const sample = floorPicks.slice(0, 6);
    const hist = new Map();
    for (const { cx, cy } of sample) {
      const { x0, y0 } = cellPos(cx, cy);
      for (let y = 0; y < STAMP; y++) {
        for (let x = 0; x < STAMP; x++) {
          const i = ((y0 + y) * png.width + (x0 + x)) << 2;
          const k = quant(png.data[i], png.data[i+1], png.data[i+2]);
          hist.set(k, (hist.get(k) || 0) + 1);
        }
      }
    }
    for (const [k, n] of hist) if (n >= 6) floorSet.add(k);
    const { x0, y0 } = cellPos(sample[0].cx, sample[0].cy);
    floorColor = meanColor(png, x0, y0);
  } else {
    floorColor = [Math.max(0, wallColor[0] - 60), Math.max(0, wallColor[1] - 60), Math.max(0, wallColor[2] - 60)];
  }
  // Floor and wall palettes can overlap on shared mortar/shadow colours —
  // keep them in BOTH sets; that's fine because we only care about whether
  // a pixel is "exotic" (in NEITHER set).

  // 3. Per-cell labels — each pixel is classified into wall/floor/void/exotic
  // by RGB proximity, then the cell takes the majority bucket. Boundary cells
  // (where wall meets floor) are no longer mistaken for entities because we
  // count actual wall + floor pixels rather than the cell's mean colour.
  const labels = new Array(GRID * GRID);
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      const idx = cy * GRID + cx;
      const { x0, y0 } = cellPos(cx, cy);

      let wPix = 0, fPix = 0, vPix = 0, ePix = 0, total = 0;
      for (let y = 0; y < STAMP; y++) {
        for (let x = 0; x < STAMP; x++) {
          const i = ((y0 + y) * png.width + (x0 + x)) << 2;
          const r = png.data[i], g = png.data[i+1], b = png.data[i+2];
          total++;
          const L = lum(r, g, b);
          if (L < 14) { vPix++; continue; }
          const k = quant(r, g, b);
          const inW = wallSet.has(k);
          const inF = floorSet.has(k);
          if (inW && !inF) { wPix++; continue; }
          if (inF && !inW) { fPix++; continue; }
          if (inW && inF)  {
            // Shared palette colour — break tie by mean-colour proximity.
            const dW = rgbDist([r, g, b], wallColor);
            const dF = rgbDist([r, g, b], floorColor);
            if (dW < dF) wPix++; else fPix++;
            continue;
          }
          ePix++;
        }
      }

      if (vPix / total > 0.85) { labels[idx] = { type: "V" }; continue; }

      // Real entity: at least 12% of the cell is "exotic" (not wall, not
      // floor, not void). Below that threshold the exotic pixels are
      // anti-aliasing on a wall/floor boundary.
      if (ePix / total >= 0.12) {
        const ex = brightestExotic(png, x0, y0, wallColor, floorColor);
        labels[idx] = classifyExotic(ex);
        continue;
      }

      // No real entity — pick whichever of wall/floor has more pixels.
      labels[idx] = (wPix >= fPix) ? { type: "W" } : { type: "F" };
    }
  }

  // 4. EXIT detection — pairs of horizontally adjacent cells with dense
  // bright-white pixel content (the rendered "EXIT" label).
  const exitCells = new Set();
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx + 1 < GRID; cx++) {
      const a = cellPos(cx, cy), b = cellPos(cx + 1, cy);
      const wa = whitePixelCount(png, a.x0, a.y0);
      const wb = whitePixelCount(png, b.x0, b.y0);
      // Each half-cell of a 4-letter "EXIT" has ~12-20 white pixels across
      // 6-10 distinct X columns. Tight thresholds avoid stray-bright matches.
      if (wa.count >= 12 && wa.distinctX >= 6 &&
          wb.count >= 12 && wb.distinctX >= 6 &&
          wa.count + wb.count >= 35) {
        // Place the EXIT marker on whichever of the two cells is currently
        // labelled WALL (the door under the text), or the first cell if
        // both are walls.
        for (const cc of [cx, cx + 1]) {
          const idx = cy * GRID + cc;
          if (labels[idx].type === "W") { exitCells.add(idx); break; }
        }
      }
    }
  }
  for (const idx of exitCells) labels[idx] = { type: "X" };

  // 5. Cleanup pass: dissolve "wall edge bleed" — cells classified as entities
  // that sit at a wall/floor boundary, where the gex render anti-aliased the
  // wall texture across a few pixels of the floor cell. We rely on the fact
  // that real entities are interior decorations: they have OPEN floor on at
  // least 2 cardinal sides. A spurious entity cell wedged between two walls
  // is dissolved into wall; one with a single wall neighbour and floor
  // elsewhere is dissolved into floor.
  const N4 = (cx, cy, kinds) => {
    let n = 0;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
      if (kinds.includes(labels[ny * GRID + nx].type)) n++;
    }
    return n;
  };
  // 8-neighbour helper for the broader cleanup pass.
  const N8 = (cx, cy, kinds) => {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
        if (kinds.includes(labels[ny * GRID + nx].type)) n++;
      }
    }
    return n;
  };
  // Iterate a few times so each pass propagates info from neighbours
  // already cleaned up in the previous pass.
  for (let pass = 0; pass < 4; pass++) {
    for (let cy = 1; cy < GRID - 1; cy++) {
      for (let cx = 1; cx < GRID - 1; cx++) {
        const idx = cy * GRID + cx;
        const lab = labels[idx];
        if (lab.type !== "M" && lab.type !== "T" && lab.type !== "G") continue;
        const w8 = N8(cx, cy, ["W"]);
        const f8 = N8(cx, cy, ["F"]);
        // If most neighbours are walls (>= 4 of 8), this is wall texture
        // bleed — fold the cell into the wall.
        if (w8 >= 4 && w8 > f8)        labels[idx] = { type: "W" };
        // If a strong floor majority and at least 1 wall edge (so it's likely
        // a floor cell next to a wall, not a real interior decoration), fold
        // into floor. Real interior entities tend to have mostly-floor
        // neighbours AND zero wall edges (they sit in the middle of rooms).
        else if (f8 >= 5 && w8 >= 1)   labels[idx] = { type: "F" };
        // Isolated entity surrounded entirely by other entities — keep as
        // entity (might be a generator-spawned monster pile).
      }
    }
  }

  // 6. Player START — first floor cell in raster order.
  let startIdx = -1;
  outer:
  for (let cy = 1; cy < GRID - 1; cy++) {
    for (let cx = 1; cx < GRID - 1; cx++) {
      if (labels[cy * GRID + cx].type === "F") { startIdx = cy * GRID + cx; break outer; }
    }
  }

  // 7. Ensure at least one exit. Pick the floor cell furthest from start.
  if ([...labels].every(l => l.type !== "X")) {
    const sx = startIdx % GRID, sy = (startIdx / GRID) | 0;
    let best = -1, bestD = -1;
    for (let i = 0; i < labels.length; i++) {
      if (labels[i].type !== "F") continue;
      const dx = (i % GRID) - sx, dy = ((i / GRID) | 0) - sy;
      const d = dx*dx + dy*dy;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best >= 0) labels[best] = { type: "X" };
  }

  return { labels, startIdx };
}

function encodeLabel(lab, isStart) {
  if (isStart) return [(PX.START >> 16) & 255, (PX.START >> 8) & 255, PX.START & 255];
  switch (lab.type) {
    case "V": return [0, 0, 0];
    case "W": return [(PX.WALL >> 16) & 255, (PX.WALL >> 8) & 255, PX.WALL & 255];
    case "F": return [0xa0, 0x80, 0x60];
    case "X": return [(PX.EXIT >> 16) & 255, (PX.EXIT >> 8) & 255, PX.EXIT & 255];
    case "M": {
      const v = PX.MONSTER | ((lab.sub & 0xF) << 4);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    case "G": {
      const v = PX.GENERATOR | ((lab.sub & 0xF) << 4);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    case "T": {
      const v = PX.TREASURE | ((lab.sub & 0xF) << 4);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    default: return [0xa0, 0x80, 0x60];
  }
}

function writeLevelPng(file, labels, startIdx) {
  const out = new PNG({ width: GRID, height: GRID });
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      const idx = cy * GRID + cx;
      const [r, g, b] = encodeLabel(labels[idx], idx === startIdx);
      const i = idx << 2;
      out.data[i] = r; out.data[i+1] = g; out.data[i+2] = b; out.data[i+3] = 255;
    }
  }
  fs.writeFileSync(file, PNG.sync.write(out));
}

// ---------------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const f of fs.readdirSync(OUT_DIR)) {
  if (f.endsWith(".png")) fs.unlinkSync(path.join(OUT_DIR, f));
}

const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith(".png")).sort();
let okCount = 0, skipCount = 0;
for (const f of files) {
  let png;
  try {
    png = PNG.sync.read(fs.readFileSync(path.join(SRC_DIR, f)));
  } catch (e) {
    console.warn(`skip ${f}: ${e.message}`);
    skipCount++;
    continue;
  }
  const { labels, startIdx } = classifyMaze(png);
  const num = f.match(/maze(\d+)/)[1];
  const out = path.join(OUT_DIR, `maze${num}.png`);
  writeLevelPng(out, labels, startIdx);
  okCount++;

  if (okCount <= 5 || okCount % 25 === 0) {
    const counts = {};
    for (const l of labels) counts[l.type] = (counts[l.type] || 0) + 1;
    console.log(`${f}`, counts);
  }
}
console.log(`\nProcessed ${okCount} mazes, skipped ${skipCount}.`);
