// Probe the user-supplied sprite sheet: find every connected, non-background
// region, dump bounding boxes so we can map them to actor names.
import fs from "node:fs";
import { PNG } from "/tmp/pt/node_modules/pngjs/lib/png.js";

const src = "assets/nostromo/source-spritesheet.png";
const png = PNG.sync.read(fs.readFileSync(src));
const W = png.width, H = png.height, d = png.data;
const lum = (i) => (d[i] + d[i+1] + d[i+2]) / 3;

// 1 = lit pixel, 0 = background. Threshold low so dim sprite edges survive.
const lit = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) << 2;
    if (lum(i) > 14) lit[y * W + x] = 1;
  }
}

// Dilate by 4 px so each sprite's anti-aliased edges + nearby internal holes
// merge into one connected blob without bridging neighbouring sprites.
function dilate(in_, r) {
  const out = new Uint8Array(W * H);
  const tmp = new Uint8Array(W * H);
  // Horizontal
  for (let y = 0; y < H; y++) {
    let count = 0;
    for (let x = 0; x < W + r; x++) {
      if (x < W && in_[y*W + x]) count++;
      if (x - 2*r - 1 >= 0 && in_[y*W + (x - 2*r - 1)]) count--;
      const cx = x - r;
      if (cx >= 0 && cx < W) tmp[y*W + cx] = count > 0 ? 1 : 0;
    }
  }
  // Vertical
  for (let x = 0; x < W; x++) {
    let count = 0;
    for (let y = 0; y < H + r; y++) {
      if (y < H && tmp[y*W + x]) count++;
      if (y - 2*r - 1 >= 0 && tmp[(y - 2*r - 1)*W + x]) count--;
      const cy = y - r;
      if (cy >= 0 && cy < H) out[cy*W + x] = count > 0 ? 1 : 0;
    }
  }
  return out;
}

const fat = dilate(lit, 4);

// Connected components on the dilated mask
const id = new Int32Array(W * H).fill(-1);
const boxes = [];
const stack = new Int32Array(W * H);
for (let y0 = 0; y0 < H; y0++) {
  for (let x0 = 0; x0 < W; x0++) {
    const off0 = y0 * W + x0;
    if (!fat[off0] || id[off0] >= 0) continue;
    const cid = boxes.length;
    let sp = 0;
    stack[sp++] = off0;
    id[off0] = cid;
    let minX = x0, maxX = x0, minY = y0, maxY = y0, area = 0, litCount = 0;
    while (sp) {
      const off = stack[--sp];
      const y = (off / W) | 0, x = off - y * W;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      area++;
      if (lit[off]) litCount++;
      const neigh = [off-1, off+1, off-W, off+W];
      const xs    = [x-1, x+1, x, x];
      const ys    = [y, y, y-1, y+1];
      for (let k = 0; k < 4; k++) {
        const nx = xs[k], ny = ys[k];
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const noff = neigh[k];
        if (fat[noff] && id[noff] < 0) { id[noff] = cid; stack[sp++] = noff; }
      }
    }
    boxes.push({ minX, maxX, minY, maxY, area, litCount,
                 w: maxX - minX + 1, h: maxY - minY + 1 });
  }
}

// Filter: keep "sprite-sized" components (>= 16x16, lit-pixel density > 5%)
const keep = boxes
  .filter(b => b.w >= 16 && b.h >= 16 && b.litCount / b.area > 0.04)
  .sort((a, b) => a.minY - b.minY || a.minX - b.minX);

console.log("Total components:", boxes.length, " kept:", keep.length);
for (const b of keep.slice(0, 200)) {
  console.log(
    `  x=${b.minX.toString().padStart(4)} y=${b.minY.toString().padStart(4)}  ${b.w}x${b.h}   lit=${b.litCount}`
  );
}
