// Inventory every distinct 16x16 stamp across all gex-rendered maze PNGs in
// assets/mazes/, clustered by SHAPE (palette-independent).
//
// Each stamp is converted to a 16x16 binary fingerprint by thresholding
// luminance at 50% of the stamp's mean. Stamps with the same fingerprint cluster
// together regardless of palette. The contact sheet shows one exemplar per
// cluster, sorted by total occurrence count.
import fs from "node:fs";
import path from "node:path";
import { PNG } from "/tmp/pt/node_modules/pngjs/lib/png.js";

const SRC_DIR = "assets/mazes";
const OUT     = "/tmp/maze-stamps-shape.png";

const STAMP   = 16;
const BORDER  = 16;
const GRID    = 33;

const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith(".png")).sort();

function lum(d, i) { return (d[i] + d[i+1] + d[i+2]) / 3; }

function shapeKey(png, x0, y0) {
  // Average luminance of the stamp
  let sum = 0;
  for (let y = 0; y < STAMP; y++) {
    for (let x = 0; x < STAMP; x++) {
      sum += lum(png.data, ((y0 + y) * png.width + (x0 + x)) << 2);
    }
  }
  const mean = sum / (STAMP * STAMP);
  // Threshold around the mean — robust to palette shifts
  const threshold = mean;
  const bits = new Uint8Array(32); // 256 bits = 32 bytes
  for (let y = 0; y < STAMP; y++) {
    for (let x = 0; x < STAMP; x++) {
      const v = lum(png.data, ((y0 + y) * png.width + (x0 + x)) << 2);
      if (v > threshold) {
        const bit = y * STAMP + x;
        bits[bit >> 3] |= (1 << (bit & 7));
      }
    }
  }
  return Buffer.from(bits).toString("base64");
}

const counts = new Map();
const exemplar = new Map();

for (const f of files) {
  let png;
  try {
    png = PNG.sync.read(fs.readFileSync(path.join(SRC_DIR, f)));
  } catch (e) {
    console.warn(`skip ${f}: ${e.message}`);
    continue;
  }
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      const x0 = BORDER + cx * STAMP, y0 = BORDER + cy * STAMP;
      const key = shapeKey(png, x0, y0);
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!exemplar.has(key)) exemplar.set(key, { png, x0, y0, mazeName: f });
    }
  }
}

const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
console.log("Shape-clustered distinct stamps:", entries.length);
console.log("Top 50 by frequency:");
for (let i = 0; i < Math.min(50, entries.length); i++) {
  const [key, n] = entries[i];
  const ex = exemplar.get(key);
  console.log(`  #${i.toString().padStart(2)}  count=${n.toString().padStart(6)}  from ${ex.mazeName} @ (${ex.x0},${ex.y0})`);
}

const cols = 32;
const rows = Math.ceil(entries.length / cols);
const sheet = new PNG({ width: cols * STAMP, height: rows * STAMP });
sheet.data.fill(0);
for (let i = 0; i < entries.length; i++) {
  const [key] = entries[i];
  const ex = exemplar.get(key);
  const dx = (i % cols) * STAMP, dy = Math.floor(i / cols) * STAMP;
  for (let y = 0; y < STAMP; y++) {
    for (let x = 0; x < STAMP; x++) {
      const si = ((ex.y0 + y) * ex.png.width + (ex.x0 + x)) << 2;
      const di = ((dy + y) * sheet.width + (dx + x)) << 2;
      sheet.data[di]   = ex.png.data[si];
      sheet.data[di+1] = ex.png.data[si+1];
      sheet.data[di+2] = ex.png.data[si+2];
      sheet.data[di+3] = 255;
    }
  }
}
fs.writeFileSync(OUT, PNG.sync.write(sheet));
console.log("Contact sheet:", OUT, `${cols * STAMP}x${rows * STAMP}`);
