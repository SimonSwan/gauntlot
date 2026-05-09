// Slice the user-supplied 1536x1024 sprite sheet (assets/nostromo/source-spritesheet.png)
// into per-actor PNGs that drop into the renderer's existing sheet layout.
//
// The source is a "showcase" sheet with one pose per actor, so we synthesise the
// renderer's 8-direction × N-frame layout by:
//   - cropping the actor's bounding box from the source,
//   - downsampling to 24x24 (sprites) or 16x16 (pickups),
//   - mirroring horizontally for left-facing rows,
//   - adding a 1-px vertical bob across walk frames,
//   - adding a muzzle flash for "fire" frames where applicable,
//   - flipping/squishing for the death frame.
//
// Tiles.png is rebuilt by sampling representative wall/floor tiles out of the
// source and painting them across the renderer's 16x8 mask atlas.

import fs from "node:fs";
import path from "node:path";
import { PNG } from "/tmp/pt/node_modules/pngjs/lib/png.js";

const SRC = "assets/nostromo/source-spritesheet.png";
const OUT = "assets/nostromo";

const src = PNG.sync.read(fs.readFileSync(SRC));
const SW = src.width, SH = src.height, sd = src.data;

// ---------------------------------------------------------------------------
// Region map — pulled from analyze-source-sheet.mjs output, then nudged to
// give each actor a square crop with a few px of padding.
// ---------------------------------------------------------------------------
const PLAYERS = {
  marine:    { x: 25,  y: 40, w: 95,  h: 145 },
  tech:      { x: 155, y: 40, w: 100, h: 145 },
  smuggler:  { x: 285, y: 40, w: 100, h: 145 },
  synthetic: { x: 415, y: 40, w: 95,  h: 145 },
};

const MONSTERS = {
  // Pulled mostly from the ENEMIES grid; some sprites are split into two
  // colour-distinct creatures, so we map renderer slots to specific source
  // poses:
  //   drone (ghost slot)         -> "Drone" enemy (xenomorph silhouette)
  //   spitter (demon slot)       -> "Spitter" enemy
  //   runner (grunt slot)        -> "Runner" enemy
  //   praetorian (lobber slot)   -> "Praetorian" enemy
  //   protoXeno (death slot)     -> "Proto-Xenomorph" boss
  //   synthSecurity (sorcerer)   -> "Synth Security" enemy
  //   workerAndroid (thief)      -> "Worker Android" enemy
  drone:         { x: 130, y: 430, w: 110, h: 145 },
  runner:        { x: 260, y: 445, w: 110, h: 130 },
  spitter:       { x: 388, y: 442, w: 120, h: 135 },
  praetorian:    { x: 518, y: 430, w: 115, h: 140 },
  synthSecurity: { x: 650, y: 455, w: 85,  h: 110 },
  workerAndroid: { x: 400, y: 615, w: 100, h: 120 },
  protoXeno:     { x: 1130, y: 700, w: 190, h: 150 },
};

const PICKUPS = {
  oxygen:     { x: 595, y: 38,  w: 60, h: 90 },
  medkit:     { x: 685, y: 42,  w: 70, h: 85 },
  ammo:       { x: 776, y: 48,  w: 75, h: 80 },
  emp:        { x: 590, y: 178, w: 60, h: 80 },
  adrenaline: { x: 678, y: 175, w: 75, h: 80 },
  accessCard: { x: 685, y: 322, w: 70, h: 50 },
  credits:    { x: 583, y: 312, w: 82, h: 70 },
  dataCore:   { x: 783, y: 313, w: 65, h: 70 },
  // No "poison" in the source sheet — reuse the orange "Drone Parts" canister
  // (visually distinct from the other pickups, fits the harm/contamination
  // gameplay slot).
  poison:     { x: 870, y: 173, w: 75, h: 78 },
};

// LEVEL TILES — the source has 7 cols × 4 rows of 64x64-ish tiles starting at
// roughly (985, 40), stride 75 px. We only need a few representative cells:
const TILE_CELL = (col, row) => ({ x: 985 + col*75, y: 40 + row*75, w: 64, h: 64 });
const TILE_PICKS = {
  // Two wall themes drawn from the metallic-panel rows
  wall1:  TILE_CELL(0, 0),  // grey vent panel
  wall2:  TILE_CELL(2, 0),  // grated panel
  wall3:  TILE_CELL(0, 1),  // crate / hazard
  wall4:  TILE_CELL(3, 1),  // door grate
  wall5:  TILE_CELL(0, 2),  // bio veins
  wall6:  TILE_CELL(3, 2),  // dark vent
  // Floor tiles — pick the tiles that read as "floor not wall" in the source
  floor0: TILE_CELL(1, 0),
  floor1: TILE_CELL(4, 0),
  floor2: TILE_CELL(5, 0),
  floor3: TILE_CELL(6, 0),
  floor4: TILE_CELL(1, 1),
  floor5: TILE_CELL(2, 1),
  floor6: TILE_CELL(4, 2),
  floor7: TILE_CELL(5, 2),
  floor8: TILE_CELL(6, 2),
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function newPng(w, h) {
  const p = new PNG({ width: w, height: h });
  p.data.fill(0);
  return p;
}
function getPx(d, w, x, y) {
  if (x < 0 || y < 0 || x >= w) return [0,0,0,0];
  const i = (y * w + x) << 2;
  return [d[i], d[i+1], d[i+2], d[i+3]];
}
function setPx(p, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= p.width || y >= p.height) return;
  const i = (y * p.width + x) << 2;
  p.data[i] = r; p.data[i+1] = g; p.data[i+2] = b; p.data[i+3] = a;
}
function getPxP(p, x, y) {
  if (x < 0 || y < 0 || x >= p.width || y >= p.height) return [0,0,0,0];
  const i = (y * p.width + x) << 2;
  return [p.data[i], p.data[i+1], p.data[i+2], p.data[i+3]];
}

// Crop a rectangle from the source PNG. Background black pixels become alpha=0
// so downstream draws cleanly composite onto the sheet.
function cropMasked(rect) {
  const { x, y, w, h } = rect;
  const out = newPng(w, h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const sx = x + px, sy = y + py;
      const i = (sy * SW + sx) << 2;
      const r = sd[i], g = sd[i+1], b = sd[i+2];
      const lum = (r + g + b) / 3;
      // The sheet's panel background is essentially black; treat anything
      // dimmer than 14 as transparent so we don't paint the void.
      if (lum < 14) {
        setPx(out, px, py, 0, 0, 0, 0);
      } else {
        setPx(out, px, py, r, g, b, 255);
      }
    }
  }
  return out;
}

// Bilinear-ish downsample with alpha support. `dst` is `dstW × dstH`.
function resize(srcPng, dstW, dstH) {
  const out = newPng(dstW, dstH);
  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      const sxF = (dx + 0.5) * srcPng.width / dstW - 0.5;
      const syF = (dy + 0.5) * srcPng.height / dstH - 0.5;
      const sx0 = Math.floor(sxF), sy0 = Math.floor(syF);
      const fx = sxF - sx0, fy = syF - sy0;
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let oy = 0; oy < 2; oy++) {
        for (let ox = 0; ox < 2; ox++) {
          const wx = ox ? fx : 1 - fx;
          const wy = oy ? fy : 1 - fy;
          const w = wx * wy;
          const [pr, pg, pb, pa] = getPxP(srcPng, sx0 + ox, sy0 + oy);
          if (pa > 0) {
            r += pr * w * pa;
            g += pg * w * pa;
            b += pb * w * pa;
            a += pa * w;
            wsum += w * pa;
          }
        }
      }
      if (a > 12) {
        out.data[(dy*dstW + dx)<<2] = r / wsum;
        out.data[(dy*dstW + dx)<<2 | 1] = g / wsum;
        out.data[(dy*dstW + dx)<<2 | 2] = b / wsum;
        out.data[(dy*dstW + dx)<<2 | 3] = Math.min(255, a);
      }
    }
  }
  return out;
}

function flipH(srcPng) {
  const out = newPng(srcPng.width, srcPng.height);
  for (let y = 0; y < srcPng.height; y++) {
    for (let x = 0; x < srcPng.width; x++) {
      const [r, g, b, a] = getPxP(srcPng, srcPng.width - 1 - x, y);
      setPx(out, x, y, r, g, b, a);
    }
  }
  return out;
}

// Paste src onto dst at (dx, dy). dy can be a sub-pixel float — we clamp.
function paste(dst, src, dx, dy) {
  dx |= 0; dy |= 0;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const [r, g, b, a] = getPxP(src, x, y);
      if (a > 0) setPx(dst, dx + x, dy + y, r, g, b, a);
    }
  }
}

// Solid rectangle fill (overwrites alpha).
function fillRect(p, x, y, w, h, r, g, b, a = 255) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) setPx(p, px, py, r, g, b, a);
  }
}

// Tint a copy of `src` toward `[r,g,b]` by `amount` (0..1). Preserves alpha.
function tinted(src, r, g, b, amount) {
  const out = newPng(src.width, src.height);
  const inv = 1 - amount;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const [pr, pg, pb, pa] = getPxP(src, x, y);
      if (pa === 0) continue;
      setPx(out, x, y, pr*inv + r*amount, pg*inv + g*amount, pb*inv + b*amount, pa);
    }
  }
  return out;
}

// Squish vertically by `factor` (0..1) — useful for the death frame.
function squishY(src, factor) {
  const newH = Math.max(1, Math.floor(src.height * factor));
  const sized = resize(src, src.width, newH);
  const out = newPng(src.width, src.height);
  paste(out, sized, 0, src.height - newH);
  return out;
}

async function writePng(file, png) {
  const buf = PNG.sync.write(png);
  fs.writeFileSync(file, buf);
}

// ---------------------------------------------------------------------------
// Build a player sheet: 9 cols × 8 rows of 24×24 frames.
// Direction rows (matching renderer/DIR enum):
//   0 UP  1 UPRIGHT  2 RIGHT  3 DOWNRIGHT
//   4 DOWN  5 DOWNLEFT  6 LEFT  7 UPLEFT
// Cols:
//   0       idle
//   1..7    walk (renderer cycles cols 1..(cols-2) for movement)
//   8       death
// The renderer's animation math doesn't care which exact frame is which — it
// only needs the cell to look "alive" and the death cell to look "dead".
// We synthesise the walk cycle by bobbing the source pose.
// ---------------------------------------------------------------------------
const SP = 24;

function buildActorSheet(srcPose, cols, rows) {
  const right = srcPose;
  const left  = flipH(srcPose);
  const sheet = newPng(cols * SP, rows * SP);
  for (let r = 0; r < rows; r++) {
    // Direction → use mirrored pose for left-leaning rows
    const isLeft = (r === 5 || r === 6 || r === 7);
    const pose = isLeft ? left : right;
    for (let c = 0; c < cols; c++) {
      // Bob phase (simulate gait): col 0 idle = no bob
      const bobPhase = c % 4;
      const bob = (c === 0) ? 0 : ([0, -1, 0, 1][bobPhase]);
      // Death column: vertical squish + slight tint toward red.
      if (c === cols - 1 && cols >= 5) {
        const dyingPose = squishY(tinted(pose, 120, 20, 20, 0.35), 0.55);
        paste(sheet, dyingPose, c * SP, r * SP);
        continue;
      }
      // Default frame: paste the pose with a 1px bob for liveliness.
      paste(sheet, pose, c * SP, r * SP + bob);
      // Muzzle flash on the "firing" frames (renderer uses cols 1..3 when
      // firing). Adds a small bright dot near the front of the rifle.
      if (c >= 1 && c <= 3) {
        // Direction-aware flash position
        const flash = directionMuzzle(r);
        if (flash) {
          fillRect(sheet, c*SP + flash.x,     r*SP + flash.y + bob,     flash.w, flash.h, 255, 230, 120);
          fillRect(sheet, c*SP + flash.x - 1, r*SP + flash.y + bob - 1, flash.w + 2, 1,    255, 240, 200, 180);
        }
      }
    }
  }
  return sheet;
}

function directionMuzzle(row) {
  // Approximate where the rifle muzzle ends up for each direction.
  // 8-dir layout: 0 UP, 1 UR, 2 R, 3 DR, 4 D, 5 DL, 6 L, 7 UL
  const M = {
    0: { x: 14, y:  3, w: 2, h: 3 },
    1: { x: 18, y:  6, w: 3, h: 2 },
    2: { x: 20, y: 10, w: 3, h: 2 },
    3: { x: 18, y: 16, w: 3, h: 2 },
    4: { x: 11, y: 20, w: 2, h: 3 },
    5: { x:  3, y: 16, w: 3, h: 2 },
    6: { x:  1, y: 10, w: 3, h: 2 },
    7: { x:  3, y:  6, w: 3, h: 2 },
  };
  return M[row] || M[4];
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });

console.log("Slicing players…");
for (const [name, rect] of Object.entries(PLAYERS)) {
  const crop = cropMasked(rect);
  const pose = resize(crop, SP, SP);
  const sheet = buildActorSheet(pose, 9, 8);
  await writePng(path.join(OUT, `player-${name}-sprite-sheet.png`), sheet);
}

console.log("Slicing monsters…");
for (const [name, rect] of Object.entries(MONSTERS)) {
  const crop = cropMasked(rect);
  const pose = resize(crop, SP, SP);
  const sheet = buildActorSheet(pose, 4, 8);
  await writePng(path.join(OUT, `monster-${name}-sprite-sheet.png`), sheet);
}

console.log("Slicing pickups…");
for (const [name, rect] of Object.entries(PICKUPS)) {
  const crop = cropMasked(rect);
  const pickup = resize(crop, 16, 16);
  await writePng(path.join(OUT, `pickup-${name}.png`), pickup);
}

// ---------------------------------------------------------------------------
// TILES atlas — 16 cols × 8 rows × 32px (renderer expects this layout).
//   row 0 cols 1..9: 9 floor variants (we just paint the same floor at each;
//                    different levels reference different theme indices)
//   rows 1..6:       6 wall themes; for each row, cols 0..15 = mask variants.
//                    We paint the same source wall in every cell, then add
//                    crisp pixel highlights/shadows on the unconnected edges
//                    based on the mask bits (bit 0=top, 1=right, 2=bottom,
//                    3=left).
//   row 7 cols 0..7: shadow overlays — soft black gradient against walls.
// ---------------------------------------------------------------------------
const TS = 32;

console.log("Building tile atlas…");
{
  const atlas = newPng(16 * TS, 8 * TS);

  const tileFor = (key) => resize(cropMasked(TILE_PICKS[key]), TS, TS);
  const floors = [
    tileFor("floor0"), tileFor("floor1"), tileFor("floor2"),
    tileFor("floor3"), tileFor("floor4"), tileFor("floor5"),
    tileFor("floor6"), tileFor("floor7"), tileFor("floor8"),
  ];
  const walls = [
    tileFor("wall1"), tileFor("wall2"), tileFor("wall3"),
    tileFor("wall4"), tileFor("wall5"), tileFor("wall6"),
  ];

  // Cell (0,0) is the void. Fill with solid black.
  fillRect(atlas, 0, 0, TS, TS, 0, 0, 0, 255);

  // Floors at row 0 cols 1..9
  for (let i = 0; i < 9; i++) {
    paste(atlas, floors[i % floors.length], (i + 1) * TS, 0);
  }

  // Walls: 6 themes × 16 mask variants. We paint the base tile in every cell
  // and then apply edge highlights on unconnected sides.
  for (let row = 0; row < 6; row++) {
    for (let mask = 0; mask < 16; mask++) {
      paste(atlas, walls[row], mask * TS, (row + 1) * TS);
      const dx = mask * TS, dy = (row + 1) * TS;
      // Bit 0 = wall above? If NOT, draw a 1px highlight on the top edge.
      if (!(mask & 1)) fillRect(atlas, dx, dy, TS, 1, 220, 230, 255, 110);
      // Bit 3 = wall left
      if (!(mask & 8)) fillRect(atlas, dx, dy, 1, TS, 220, 230, 255, 90);
      // Bit 2 = wall below
      if (!(mask & 4)) fillRect(atlas, dx, dy + TS - 1, TS, 1, 0, 0, 0, 200);
      // Bit 1 = wall right
      if (!(mask & 2)) fillRect(atlas, dx + TS - 1, dy, 1, TS, 0, 0, 0, 180);
    }
  }

  // Shadow overlays at row 7 (cols 0..7). The renderer multiplies `c.shadow`
  // by TS to pick a column. Each shadow type occludes a different part of the
  // floor cell that abuts a wall.
  for (let mask = 0; mask < 8; mask++) {
    const dy = 7 * TS;
    const dx = mask * TS;
    if (mask & 1) fillRect(atlas, dx,         dy,         6,  TS,  0, 0, 0, 110); // wall on left
    if (mask & 4) fillRect(atlas, dx,         dy + TS-6,  TS, 6,   0, 0, 0, 110); // wall below
    if (mask & 2) fillRect(atlas, dx,         dy + TS-6,  6,  6,   0, 0, 0, 150); // bottom-left corner
  }

  await writePng(path.join(OUT, "tiles.png"), atlas);
}

console.log("Done. Wrote new art into", OUT);
