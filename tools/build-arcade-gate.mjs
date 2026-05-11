#!/usr/bin/env node
/**
 * tools/build-arcade-gate.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Generate arcade-accurate Gauntlet locked-gate PNGs by combining:
 *   1) the decoded spr_tiles ROM region (same 8x8x4 planar layout used by
 *      build-arcade-bg.mjs)
 *   2) a MAME save-state palette dump showing Level 1 with the gate VISIBLE
 *
 * Capture method (gauntlet attract mode never shows the gate, so we have to
 * drive a real game):
 *   - 5 coin pulses through the "COIN 1" port → Warrior auto-joins with 3500 hp
 *   - P1 BUTTON 2 (magic) tapped once to start the level
 *   - Hold P1 DOWN to walk south through the left corridor
 *   - Dump MOB RAM at $902000-$904000 after ~25 seconds
 *
 * The MOB list at that point contains the closed horizontal gate as a long
 * line of 2x2-tile sprites at y=160 with code 0x1d48 (mid section) and
 * color 0 (= MOB palette base 0x100, i.e. palette entries 256..271).
 *
 * Per gauntlet.cpp's s_mob_config:
 *   {{ 0x7fff,0,0,0 }} // code mask
 *   {{ 0,0x000f,0,0 }} // color mask
 *   {{ 0,0,0x0038,0 }} // width (in tiles)
 *   {{ 0,0,0x0007,0 }} // height
 *   base palette entry = 0x100
 *
 * atari_motion_objects::draw_render() lays out an NxM tile block in
 * COLUMN-major order: code+0 is top-left, code+1 is row-down, then move right.
 *
 * Output:
 *   assets/sprites/arcade-gate-h.png  – 16x16 px, ROM tile 0x1d48 (mid 2x2)
 *   assets/sprites/arcade-gate-v.png  – 16x16 px, ROM tile 0x1d94 (mid 2x2)
 *
 * The vertical gate code was found by playing the warrior through to Level 4
 * (which has vertical gates at col 19 rows 19-22) and inspecting MOB RAM:
 * code 0x1d94 appeared twice with the same x and stacked y, color 0 — the
 * signature of a vertical-gate body.
 */
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROMS = [
  ['136037-111.1a',0x000000],['136037-112.1b',0x008000],
  ['136037-113.1l',0x010000],['136037-114.1mn',0x018000],
  ['136037-115.2a',0x020000],['136037-116.2b',0x028000],
  ['136037-117.2l',0x030000],['136037-118.2mn',0x038000],
];

function loadRegion(romDir) {
  const region = Buffer.alloc(0x40000);
  for (const [name, offset] of ROMS) {
    fs.readFileSync(path.join(romDir, name)).copy(region, offset);
  }
  for (let i = 0; i < region.length; i++) region[i] ^= 0xFF;
  return region;
}

function decodeTile(region, n) {
  const out = new Uint8Array(64);
  const base = [196608, 131072, 65536, 0];
  for (let row = 0; row < 8; row++) {
    const b0 = region[base[0] + n*8 + row];
    const b1 = region[base[1] + n*8 + row];
    const b2 = region[base[2] + n*8 + row];
    const b3 = region[base[3] + n*8 + row];
    for (let x = 0; x < 8; x++) {
      const bit = 7 - x;
      out[row*8 + x] =
        (((b0 >> bit) & 1) << 0) |
        (((b1 >> bit) & 1) << 1) |
        (((b2 >> bit) & 1) << 2) |
        (((b3 >> bit) & 1) << 3);
    }
  }
  return out;
}

function irgb4444ToRgb(word) {
  const r4 = (word >> 8) & 0xf;
  const g4 = (word >> 4) & 0xf;
  const b4 =  word       & 0xf;
  return [ (r4<<4)|r4, (g4<<4)|g4, (b4<<4)|b4 ];
}

function loadPalette(palBin) {
  const buf = fs.readFileSync(palBin);
  const N = buf.length / 2;
  const out = new Array(N);
  for (let i = 0; i < N; i++) {
    out[i] = irgb4444ToRgb((buf[i*2] << 8) | buf[i*2+1]);
  }
  return out;
}

// Render a multi-tile sprite block, atari_motion_objects column-major layout.
// `code` is the top-left tile; widthTiles/heightTiles give the block size.
function renderSprite(region, palette, palBase, code, widthTiles, heightTiles) {
  const png = new PNG({ width: widthTiles*8, height: heightTiles*8 });
  // Column-major: iterate columns, within each column iterate rows.
  // tile(col, row) = code + col*heightTiles + row.
  for (let col = 0; col < widthTiles; col++) {
    for (let row = 0; row < heightTiles; row++) {
      const tileCode = code + col*heightTiles + row;
      const tile = decodeTile(region, tileCode);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const v = tile[y*8 + x];
        const [R,G,B] = palette[palBase + v];
        const alpha = v === 0 ? 0 : 255; // pen 0 = transparent for MOBs
        const i = ((row*8+y) * png.width + (col*8+x)) * 4;
        png.data[i]=R; png.data[i+1]=G; png.data[i+2]=B; png.data[i+3]=alpha;
      }
    }
  }
  return PNG.sync.write(png);
}

function rotate90(pngBytes) {
  const src = PNG.sync.read(pngBytes);
  const dst = new PNG({ width: src.height, height: src.width });
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const si = (y * src.width + x) * 4;
    // Rotate 90° clockwise: (x, y) -> (src.height - 1 - y, x)
    const dx = src.height - 1 - y;
    const dy = x;
    const di = (dy * dst.width + dx) * 4;
    dst.data[di] = src.data[si];
    dst.data[di+1] = src.data[si+1];
    dst.data[di+2] = src.data[si+2];
    dst.data[di+3] = src.data[si+3];
  }
  return PNG.sync.write(dst);
}

function main() {
  const [romDir, palBin] = process.argv.slice(2);
  if (!romDir || !palBin) {
    console.error('usage: build-arcade-gate.mjs <rom-dir> <pal-bin>');
    process.exit(1);
  }
  const region  = loadRegion(romDir);
  const palette = loadPalette(palBin);

  // Per gauntlet.cpp:
  //   atari_motion_objects_config s_mob_config: base palette entry 0x100, transparent pen 0.
  //   MOB color field 4 bits -> 16 sub-palettes of 16 colours.
  // The horizontal gate's MOBs all have color=0, so palette base = 0x100 (256).
  const palBase = 0x100;
  const outDir  = path.join(ROOT, 'assets/sprites');
  fs.mkdirSync(outDir, { recursive: true });

  // Horizontal gate mid section: code 0x1d48, 2 wide × 2 tall.
  const hGate = renderSprite(region, palette, palBase, 0x1d48, 2, 2);
  fs.writeFileSync(path.join(outDir, 'arcade-gate-h.png'), hGate);

  // Vertical gate mid section: code 0x1d94, 2 wide × 2 tall.
  // Found by playing into Level 4 (which has 4 vertical gates at col 19, rows 19-22)
  // and inspecting MOB RAM — code 0x1d94 appeared in stacked Y positions, color 0.
  const vGate = renderSprite(region, palette, palBase, 0x1d94, 2, 2);
  fs.writeFileSync(path.join(outDir, 'arcade-gate-v.png'), vGate);

  console.log('Wrote arcade-gate-h.png and arcade-gate-v.png to', outDir);
}

main();
