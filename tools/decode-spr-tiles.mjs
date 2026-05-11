#!/usr/bin/env node
/**
 * tools/decode-spr-tiles.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Decode the Gauntlet (1985) spr_tiles ROM region into an 8192-tile sheet PNG.
 *
 * Per src/mame/atari/gauntlet.cpp:
 *   ROM_REGION( 0x40000, "spr_tiles", ROMREGION_INVERT )
 *   ROM_LOAD( "136037-111.1a",   0x000000, 0x008000, ... )
 *   ROM_LOAD( "136037-112.1b",   0x008000, 0x008000, ... )
 *   ROM_LOAD( "136037-113.1l",   0x010000, 0x008000, ... )
 *   ROM_LOAD( "136037-114.1mn",  0x018000, 0x008000, ... )
 *   ROM_LOAD( "136037-115.2a",   0x020000, 0x008000, ... )
 *   ROM_LOAD( "136037-116.2b",   0x028000, 0x008000, ... )
 *   ROM_LOAD( "136037-117.2l",   0x030000, 0x008000, ... )
 *   ROM_LOAD( "136037-118.2mn",  0x038000, 0x008000, ... )
 *
 *   GFXDECODE_ENTRY( "spr_tiles", 0, gfx_8x8x4_planar, 256, 32 )
 *
 * gfx_8x8x4_planar layout (from MAME src/devices/video/gfxdecode.cpp):
 *   8 x 8 pixels, 4 bpp.
 *   Plane offsets (in bits): RGN_FRAC(3,4), RGN_FRAC(2,4), RGN_FRAC(1,4), RGN_FRAC(0,4)
 *   That is, the 4 bitplanes are at the 3/4, 2/4, 1/4, 0/4 quarters of the region.
 *   For our 256 KB region that means plane bytes 0..65535 = plane 3 (MSB),
 *   65536..131071 = plane 2, 131072..196607 = plane 1, 196608..262143 = plane 0.
 *   X offsets: bit 0..7 within the byte (MSB = leftmost pixel)
 *   Y offsets: row r at byte offset r*8 (one byte per row in each plane)
 *   So tile N row R uses bytes plane[i][N*8 + R].
 *
 *   pixel(x, y) = ((plane3 >> (7-x)) & 1) << 3
 *               | ((plane2 >> (7-x)) & 1) << 2
 *               | ((plane1 >> (7-x)) & 1) << 1
 *               | ((plane0 >> (7-x)) & 1);
 *
 *   ROMREGION_INVERT: XOR every byte with 0xFF on load.
 *
 * Output:
 *   A 1024 x 512 PNG (128 tiles wide x 64 tiles tall = 8192 tiles, 8 px each).
 *   Pixel value 0..15 mapped to a generic 16-shade palette (intensity ramp),
 *   so the tile shapes are visible without runtime palette RAM.
 *
 * Usage:
 *   node tools/decode-spr-tiles.mjs <rom-dir>  [--out assets/sprites/playfield-tiles.png]
 */
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ROMS = [
  ['136037-111.1a',  0x000000],
  ['136037-112.1b',  0x008000],
  ['136037-113.1l',  0x010000],
  ['136037-114.1mn', 0x018000],
  ['136037-115.2a',  0x020000],
  ['136037-116.2b',  0x028000],
  ['136037-117.2l',  0x030000],
  ['136037-118.2mn', 0x038000],
];
const REGION_BYTES = 0x40000;          // 256 KB
const TILE_COUNT   = 8192;             // 64 KB / 8 bytes-per-tile
const TILE_PX      = 8;

function loadRegion(romDir) {
  const region = Buffer.alloc(REGION_BYTES);
  for (const [name, offset] of ROMS) {
    const p = path.join(romDir, name);
    if (!fs.existsSync(p)) throw new Error(`Missing ROM: ${p}`);
    const data = fs.readFileSync(p);
    if (data.length !== 0x8000) {
      throw new Error(`${name}: expected 0x8000 bytes, got 0x${data.length.toString(16)}`);
    }
    data.copy(region, offset);
  }
  // ROMREGION_INVERT
  for (let i = 0; i < region.length; i++) region[i] ^= 0xFF;
  return region;
}

// Decode tile N to an 8x8 array of pixel values (0..15).
//
// Per `gfx_8x8x4_planar` in src/emu/video/generic.cpp:
//   plane_offsets[k] = bit offset into the region for OUTPUT bitplane k.
//   { RGN_FRAC(3,4), RGN_FRAC(2,4), RGN_FRAC(1,4), RGN_FRAC(0,4) }
// In bytes (region is 0x40000): { 196608, 131072, 65536, 0 }.
// MAME convention: plane[k] -> pixel bit k (plane[0] = LSB, plane[3] = MSB).
// Within each plane: 1 byte per row of 8 pixels, bit 0 of layout = MSB of byte.
function decodeTile(region, n) {
  const out = new Uint8Array(TILE_PX * TILE_PX);
  const planeBase = [196608, 131072, 65536, 0]; // plane[0..3] byte base
  for (let row = 0; row < 8; row++) {
    const bytes = [
      region[planeBase[0] + n * 8 + row],
      region[planeBase[1] + n * 8 + row],
      region[planeBase[2] + n * 8 + row],
      region[planeBase[3] + n * 8 + row],
    ];
    for (let x = 0; x < 8; x++) {
      const bit = 7 - x; // x_offsets STEP8(0,1) with MAME-bit-0 = MSB
      const v =
        (((bytes[0] >> bit) & 1) << 0) |  // plane[0] -> pixel bit 0
        (((bytes[1] >> bit) & 1) << 1) |  // plane[1] -> pixel bit 1
        (((bytes[2] >> bit) & 1) << 2) |  // plane[2] -> pixel bit 2
        (((bytes[3] >> bit) & 1) << 3);   // plane[3] -> pixel bit 3
      out[row * 8 + x] = v;
    }
  }
  return out;
}

// 16-shade greyscale palette with a black background so we can see the tile
// outlines clearly.  Replace with arcade palette RAM once that's dumped.
function palette(v) {
  const shade = Math.round((v / 15) * 255);
  return [shade, shade, shade, 255];
}

function buildSheet(region, cols = 64, rows = 128, zoom = 2) {
  const tileSize = TILE_PX * zoom;
  const w = cols * tileSize;
  const h = rows * tileSize;
  const png = new PNG({ width: w, height: h });
  png.data.fill(0); png.data[3] = 0;
  // Set all pixels to opaque black initially
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
  let n = 0;
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      if (n >= TILE_COUNT) break;
      const tile = decodeTile(region, n);
      for (let py = 0; py < 8; py++) {
        for (let px = 0; px < 8; px++) {
          const v = tile[py * 8 + px];
          const [r, g, b] = palette(v);
          for (let zy = 0; zy < zoom; zy++) {
            for (let zx = 0; zx < zoom; zx++) {
              const xx = tx * tileSize + px * zoom + zx;
              const yy = ty * tileSize + py * zoom + zy;
              const i = (yy * w + xx) * 4;
              png.data[i  ] = r;
              png.data[i+1] = g;
              png.data[i+2] = b;
              png.data[i+3] = 255;
            }
          }
        }
      }
      n++;
    }
  }
  return PNG.sync.write(png);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('usage: node tools/decode-spr-tiles.mjs <rom-dir> [--out path]');
    process.exit(1);
  }
  const romDir = argv[0];
  let outPath = path.join(ROOT, 'assets/sprites/playfield-tiles.png');
  const outIdx = argv.indexOf('--out');
  if (outIdx >= 0 && argv[outIdx + 1]) outPath = argv[outIdx + 1];

  console.log(`[spr_tiles] Loading region from ${romDir}…`);
  const region = loadRegion(romDir);
  console.log(`[spr_tiles] Region size: 0x${region.length.toString(16)}`);
  console.log(`[spr_tiles] Decoding ${TILE_COUNT} tiles…`);
  const png = buildSheet(region);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, png);
  console.log(`[spr_tiles] Wrote ${outPath} (${(png.length / 1024).toFixed(1)} KB)`);
}

main();
