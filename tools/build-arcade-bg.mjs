#!/usr/bin/env node
/**
 * tools/build-arcade-bg.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Generate arcade-accurate Gauntlet wall + floor PNGs by combining
 *   1) the decoded spr_tiles ROM region (8 ROMs, gfx_8x8x4_planar)
 *   2) a MAME save-state dump of palette RAM at $910000 (IRGB_4444)
 *
 * Both inputs were verified against MAME's attract-mode screenshot of Level 1:
 *   - tile_bank = 0  =>  spr_tiles index = (data & 0xfff) ^ 0x800
 *   - color = 0x18 + ((data >> 12) & 7)  =>  palette base = 0x18..0x1f
 *
 * Outputs:
 *   assets/sprites/arcade-floor.png  – 16x16 px, one 2x2 floor stamp
 *   assets/sprites/arcade-wall.png   – 16x16 px, one 2x2 wall body stamp
 *
 * The 2x2 layouts mirror what the playfield dump shows at Level 1 (1,12) for
 * floor and (3,0) for wall body.
 *
 * Usage:
 *   node tools/build-arcade-bg.mjs <rom-dir> <palette-dump-bin>
 */
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ROMS = [
  ['136037-111.1a',  0x000000], ['136037-112.1b',  0x008000],
  ['136037-113.1l',  0x010000], ['136037-114.1mn', 0x018000],
  ['136037-115.2a',  0x020000], ['136037-116.2b',  0x028000],
  ['136037-117.2l',  0x030000], ['136037-118.2mn', 0x038000],
];
const REGION_BYTES = 0x40000;

function loadRegion(romDir) {
  const region = Buffer.alloc(REGION_BYTES);
  for (const [name, offset] of ROMS) {
    const data = fs.readFileSync(path.join(romDir, name));
    if (data.length !== 0x8000) throw new Error(`${name}: bad size`);
    data.copy(region, offset);
  }
  for (let i = 0; i < region.length; i++) region[i] ^= 0xFF; // ROMREGION_INVERT
  return region;
}

// Decode one tile (8x8, 4bpp) from the planar region.
function decodeTile(region, n) {
  const out = new Uint8Array(64);
  const base = [196608, 131072, 65536, 0]; // plane[0..3]
  for (let row = 0; row < 8; row++) {
    const b0 = region[base[0] + n * 8 + row];
    const b1 = region[base[1] + n * 8 + row];
    const b2 = region[base[2] + n * 8 + row];
    const b3 = region[base[3] + n * 8 + row];
    for (let x = 0; x < 8; x++) {
      const bit = 7 - x;
      out[row * 8 + x] =
        (((b0 >> bit) & 1) << 0) |
        (((b1 >> bit) & 1) << 1) |
        (((b2 >> bit) & 1) << 2) |
        (((b3 >> bit) & 1) << 3);
    }
  }
  return out;
}

// IRGB_4444 -> RGB888.  Format (per MAME palette.cpp):
//   bit15..12 = intensity bias
//   bit11..8  = R, bit7..4 = G, bit3..0 = B
//   Each colour component c is c<<4 | c (so 4-bit -> 8-bit).
//   The 'I' bias is a bit subtle; for raw RGB approximation we just expand.
// We use the simple expand (i<<4 | i) and ignore the high nibble for now —
// gauntlet's palette RAM nibble 0..3 is the actual visible colour data.
function irgb4444ToRgb(word) {
  // bits 11..8 = R, 7..4 = G, 3..0 = B; bits 15..12 are an intensity tweak
  const r4 = (word >> 8) & 0xf;
  const g4 = (word >> 4) & 0xf;
  const b4 =  word       & 0xf;
  // 4-bit -> 8-bit expand
  return [
    (r4 << 4) | r4,
    (g4 << 4) | g4,
    (b4 << 4) | b4,
  ];
}

function loadPalette(palBin) {
  // palette RAM = 1024 16-bit words BE (gauntlet PALETTE size = 1024)
  const buf = fs.readFileSync(palBin);
  const N = buf.length / 2;
  const palRgb = new Array(N);
  for (let i = 0; i < N; i++) {
    const w = (buf[i*2] << 8) | buf[i*2+1];
    palRgb[i] = irgb4444ToRgb(w);
  }
  return palRgb;
}

// Draw one tile (8x8) at (px,py) into out PNG, using palette starting at
// palBase (16 colours).  Pixel value 0 = colour palBase+0 (typically background).
function drawTile(out, px, py, tile, palette, palBase) {
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const v = tile[y*8 + x];
      const [r,g,b] = palette[palBase + v];
      const i = ((py+y) * out.width + (px+x)) * 4;
      out.data[i] = r; out.data[i+1] = g; out.data[i+2] = b; out.data[i+3] = 255;
    }
  }
}

function buildStamp(region, palette, codes, palBase) {
  // codes: 2x2 array of hardware-data words (low 12 bits = code, top 4 = palette nibble)
  const png = new PNG({ width: 16, height: 16 });
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const data = codes[r][c];
      const tileCode = (data & 0xfff) ^ 0x800; // tile_bank=0
      const palNib   = (data >> 12) & 7;
      const base = palBase + palNib * 16;
      const tile = decodeTile(region, tileCode);
      drawTile(png, c*8, r*8, tile, palette, base);
    }
  }
  return PNG.sync.write(png);
}

function main() {
  const [romDir, palBin] = process.argv.slice(2);
  if (!romDir || !palBin) {
    console.error('usage: node tools/build-arcade-bg.mjs <rom-dir> <pal-bin>');
    process.exit(1);
  }
  const region  = loadRegion(romDir);
  const palette = loadPalette(palBin);

  // Per MAME gauntlet.cpp: color = 0x10 + (color_bank * 8) + (data>>12 & 7).
  // color_bank = 1 for gauntlet, so palette index is 0x18..0x1f.
  // GFXDECODE_ENTRY( "spr_tiles", 0, ..., 256, 32 )  =>  base 256.
  // Each "color" in MAME = 16 consecutive palette entries.
  // So per-tile palette base in palette RAM = 256 + color*16.
  // For us: 256 + 0x18*16 = 256 + 384 = 640.  +palNib*16 follows.
  const palBase = 256 + 0x18 * 16;

  // Wall body / floor body stamps come from the MAME-dumped playfield RAM
  // for attract-mode Level 1.  Cross-referenced sample positions:
  //   floor body  (1,12) hw: 0071 0072 / 0073 0074
  //   wall body — interior of horizontal wall section, e.g. (1,3+)
  //               hw: 11c5 11c5 / 11c6 11c6  ─ top-row "lit" + body fill
  //   wall body — interior of vertical wall section, e.g. col 0 row 4+
  //               hw: 11c9 11ca / 11c9 11ca  ─ pure vertical edges
  //
  // We use the top-row pair (0x1c5/0x1c5/0x1c6/0x1c6) as the generic wall
  // stamp: the top edge has a 1-px highlight (col 2) and the body is the
  // solid col-6 fill — when tiled vertically this gives Gauntlet's
  // brick-with-shadow look without per-cell autotiling.
  const wallCodes = [
    [0x11c5, 0x11c5],
    [0x11c6, 0x11c6],
  ];

  const floorCodes = [
    [0x0071, 0x0072],
    [0x0073, 0x0074],
  ];

  // Also emit a per-tile "wall body only" stamp using 0x1c6×4: useful for
  // future autotiling once neighbour-aware rendering lands.
  const wallBodyCodes = [
    [0x11c6, 0x11c6],
    [0x11c6, 0x11c6],
  ];

  const outDir = path.join(ROOT, 'assets/sprites');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'arcade-wall.png'),
    buildStamp(region, palette, wallCodes, palBase));
  fs.writeFileSync(path.join(outDir, 'arcade-wall-body.png'),
    buildStamp(region, palette, wallBodyCodes, palBase));
  fs.writeFileSync(path.join(outDir, 'arcade-floor.png'),
    buildStamp(region, palette, floorCodes, palBase));
  console.log('Wrote arcade-wall.png, arcade-wall-body.png and arcade-floor.png to', outDir);
}

main();
