// Render side-by-side comparisons of source maze PNGs (gex renders) and our
// reconstructions. Each row is one maze: left half is the source downsampled
// to 132x132, right half is the reconstructed level rendered as a 33x33
// colour-coded grid (4x scale = 132x132).

import fs from "node:fs";
import path from "node:path";
import { PNG } from "/tmp/pt/node_modules/pngjs/lib/png.js";

const SRC_DIR = "assets/mazes";
const REC_DIR = "assets/levels-rom";
const OUT     = "/tmp/maze-compare.png";

const TILE = 4;
const GRID = 33;
const PANEL = GRID * TILE;          // 132
const GAP   = 8;

const COLOURS = {
  WALL:      [180, 100, 60],
  FLOOR:     [60, 40, 20],
  EXIT:      [120, 220, 140],
  START:     [80, 255, 80],
  GENERATOR: [220, 80, 60],
  MONSTER:   [200, 60, 200],
  TREASURE:  [240, 220, 80],
  DOOR:      [200, 200, 60],
  VOID:      [0, 0, 0],
};

function classify(p) {
  if (p === 0) return "VOID";
  const t = p & 0xFFFF00;
  if (t === 0x404000) return "WALL";
  if (t === 0xC0C000) return "DOOR";
  if (t === 0x00F000) return "START";
  if (t === 0x004000) return "EXIT";
  if (t === 0xF00000) return "GENERATOR";
  if (t === 0x400000) return "MONSTER";
  if (t === 0x008000) return "TREASURE";
  return "FLOOR";
}

const recFiles = fs.readdirSync(REC_DIR).filter(f => f.endsWith(".png")).sort();
const items = [];
for (const f of recFiles) {
  const num = f.match(/maze(\d+)/)[1];
  const srcPath = path.join(SRC_DIR, `maze${num}.png`);
  if (!fs.existsSync(srcPath)) continue;
  let src;
  try {
    src = PNG.sync.read(fs.readFileSync(srcPath));
  } catch { continue; }
  const rec = PNG.sync.read(fs.readFileSync(path.join(REC_DIR, f)));
  items.push({ num, src, rec });
}

// Sample only every 3rd maze to keep the sheet manageable (~38 rows).
const sample = items.filter((_, i) => i % 3 === 0);

const W = PANEL * 2 + GAP;
const H = (PANEL + GAP) * sample.length;
const sheet = new PNG({ width: W, height: H });
sheet.data.fill(0);

function putPixel(p, x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= p.width || y >= p.height) return;
  const i = (y * p.width + x) << 2;
  p.data[i] = r; p.data[i+1] = g; p.data[i+2] = b; p.data[i+3] = 255;
}

for (let i = 0; i < sample.length; i++) {
  const { src, rec } = sample[i];
  const yOff = i * (PANEL + GAP);

  // Left panel: source downsampled by 4 (560x560 -> 132x132 ish, we crop to PANEL).
  const srcScale = src.width / PANEL;
  for (let y = 0; y < PANEL; y++) {
    for (let x = 0; x < PANEL; x++) {
      const sx = (x * srcScale) | 0, sy = (y * srcScale) | 0;
      const si = (sy * src.width + sx) << 2;
      putPixel(sheet, x, yOff + y, src.data[si], src.data[si+1], src.data[si+2]);
    }
  }

  // Right panel: reconstructed level, each tile 4x4 px.
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      const i = (cy * GRID + cx) << 2;
      const v = (rec.data[i] << 16) | (rec.data[i+1] << 8) | rec.data[i+2];
      const cls = classify(v);
      const c = COLOURS[cls] || COLOURS.FLOOR;
      for (let dy = 0; dy < TILE; dy++) {
        for (let dx = 0; dx < TILE; dx++) {
          putPixel(sheet, PANEL + GAP + cx * TILE + dx, yOff + cy * TILE + dy, c[0], c[1], c[2]);
        }
      }
    }
  }
}

fs.writeFileSync(OUT, PNG.sync.write(sheet));
console.log("Wrote", OUT, `${W}x${H}`);
