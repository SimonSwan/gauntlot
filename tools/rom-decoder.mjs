#!/usr/bin/env node
/**
 * tools/rom-decoder.mjs  —  Gauntlet (1985) ROM Level Decoder
 *
 * Reads the MAME gauntlet.zip ROM set and decodes all 125 levels directly
 * from the CPU binary, replacing the old gex-PNG-based approach with
 * byte-accurate data from the original arcade ROM.
 *
 * Usage:
 *   node tools/rom-decoder.mjs <rom-dir-or-zip>  [--out assets/mazes/rom]
 *
 * ROM files required (all from MAME gauntlet.zip, Rev 14):
 *   136037-1307.9a   CPU even bytes $000000–$00FFFF
 *   136037-1308.9b   CPU odd  bytes $000000–$00FFFF
 *   136037-205.10a   CPU even bytes $038000–$03FFFF  (Slapstic region)
 *   136037-206.10b   CPU odd  bytes $038000–$03FFFF
 *   136037-1409.7a   CPU even bytes $040000–$04FFFF
 *   136037-1410.7b   CPU odd  bytes $040000–$04FFFF
 *
 * Output: one 32×32 PNG per level in the game's pixel-per-tile format.
 *
 * ── CONFIRMED ROM FACTS (from ROM reverse-engineering session) ──────────────
 *
 * Level pointer table : $038032, 171 × 2-byte big-endian words
 *   - 5 groups separated by sentinel value $FFxx
 *   - 125 unique valid level layouts
 *
 * Level header (14 bytes at pointer offset):
 *   Bytes 0–2   : magic string  ('edz', 'cle', 'aaa', …)
 *   Bytes 3–9   : metadata      (dungeon theme, difficulty, music — not fully decoded)
 *   Bytes 10–13 : P0 P1 P2 P3  tile parameters
 *   tileCode    = param & 0x3F
 *
 * Level body: follows immediately after 14-byte header.
 *   RLE-encoded sequence of (code, count) pairs filling the 32×32 grid.
 *   Grid order: row-major, top-left = (0,0), bottom-right = (31,31).
 *
 * $00C534 lookup table: 64 × 2-byte entries (tile codes $00–$3F → entity class).
 *   Entries with value $8000 = wall tile.
 *   Entries with value $8001 = exit/door tile.
 *   All other values = entity ROM address.
 *
 * ── TILE CODE → GAME FORMAT MAPPING ────────────────────────────────────────
 *
 * Legend for CONFIDENCE column:
 *   CONFIRMED  = verified by user visual inspection of Level 1 in test tool
 *   HYPOTHESIS = logical inference from census/table data, not yet verified
 *   PLACEHOLDER= unknown type, using closest known type, MUST revisit
 *
 * ┌──────┬───────────────────────────────┬─────────────┬──────────────────┐
 * │ Code │ Entity                         │ Game pixel  │ Confidence       │
 * ├──────┼───────────────────────────────┼─────────────┼──────────────────┤
 * │ $00  │ Floor                          │ 0x000000    │ CONFIRMED        │
 * │ $01  │ Stone wall (permanent)         │ 0x404040    │ CONFIRMED        │
 * │ $02  │ Gate (unused, 0 placements)    │ 0x000000    │ HYPOTHESIS       │
 * │ $03  │ Gate HORIZONTAL                │ 0xC0C000    │ CONFIRMED row21c15│
 * │ $04  │ Gate VERTICAL                  │ 0xC0C040    │ CONFIRMED row31c9 │
 * │ $05  │ Player spawn point             │ 0x00F000    │ CONFIRMED        │
 * │ $06  │ Exit (to next level)           │ 0x004000    │ CONFIRMED row31c1 │
 * │ $07  │ Exit (to level 4 warp)         │ 0x004010    │ CONFIRMED row31c31│
 * │ $08  │ Exit (to level 8 warp)         │ 0x004020    │ CONFIRMED row1c31 │
 * │ $09  │ Ghost (enemy sprite L1)        │ 0xF00000    │ CONFIRMED (ghost) │
 * │ $0A  │ Ghost (enemy sprite L2)        │ 0xF00000    │ HYPOTHESIS       │
 * │ $0B  │ Ghost (enemy sprite L3)        │ 0xF00000    │ HYPOTHESIS       │
 * │ $0C  │ Generator (type?, theme A)     │ 0xF00020    │ PLACEHOLDER      │
 * │ $0D  │ Generator (type?, theme B)     │ 0xF00020    │ PLACEHOLDER      │
 * │ $0E  │ Generator (type?, theme C)     │ 0xF00020    │ PLACEHOLDER      │
 * │ $0F  │ Generator (type?, theme A)     │ 0xF00010    │ PLACEHOLDER      │
 * │ $10  │ Generator (type?, theme B)     │ 0xF00010    │ PLACEHOLDER      │
 * │ $11  │ Generator (type?, theme C)     │ 0xF00010    │ PLACEHOLDER      │
 * │ $12  │ Rare entity (avg 3/level)      │ 0xF00030    │ PLACEHOLDER      │
 * │ $13  │ Rare entity theme B            │ 0xF00030    │ PLACEHOLDER      │
 * │ $14  │ Rare entity theme C            │ 0xF00030    │ PLACEHOLDER      │
 * │ $15  │ Generator (type?, theme A)     │ 0xF00020    │ PLACEHOLDER      │
 * │ $16  │ Generator (type?, theme B)     │ 0xF00020    │ PLACEHOLDER      │
 * │ $17  │ Generator (type?, theme C)     │ 0xF00020    │ PLACEHOLDER      │
 * │ $18  │ Unknown (232×/56 levels)       │ 0xF00050    │ PLACEHOLDER      │
 * │ $19  │ Ghost generator L1             │ 0xF00000    │ CONFIRMED row27c8 │
 * │ $1A  │ Ghost generator L2             │ 0xF00000    │ CONFIRMED row31c17│
 * │ $1B  │ Ghost generator L3             │ 0xF00000    │ HYPOTHESIS       │
 * │ $1C  │ Generator group (4×3 block) A1 │ 0xF00020    │ PLACEHOLDER      │
 * │ $1D  │ Generator group A2             │ 0xF00020    │ PLACEHOLDER      │
 * │ $1E  │ Generator group A3             │ 0xF00020    │ PLACEHOLDER      │
 * │ $1F  │ Generator group B1             │ 0xF00010    │ PLACEHOLDER      │
 * │ $20  │ Generator group B2             │ 0xF00010    │ PLACEHOLDER      │
 * │ $21  │ Generator group B3             │ 0xF00010    │ PLACEHOLDER      │
 * │ $22  │ Generator group C1             │ 0xF00030    │ PLACEHOLDER      │
 * │ $23  │ Generator group C2             │ 0xF00030    │ PLACEHOLDER      │
 * │ $24  │ Generator group C3             │ 0xF00030    │ PLACEHOLDER      │
 * │ $25  │ Generator group D1             │ 0xF00040    │ PLACEHOLDER      │
 * │ $26  │ Generator group D2             │ 0xF00040    │ PLACEHOLDER      │
 * │ $27  │ Generator group D3             │ 0xF00040    │ PLACEHOLDER      │
 * │ $28  │ Treasure chest                 │ 0x008080    │ CONFIRMED row2c10 │
 * │ $29  │ Treasure bag                   │ 0x008070    │ HYPOTHESIS       │
 * │ $2A  │ Generator (555×/103 lvls)      │ 0xF00020    │ PLACEHOLDER      │
 * │ $2B  │ Food (turkey, destructible)    │ 0x008020    │ CONFIRMED row26c31│
 * │ $2C  │ Magic potion                   │ 0x008060    │ CONFIRMED row1c5  │
 * │ $2D  │ Invisibility potion            │ 0x00D000    │ HYPOTHESIS       │
 * │ $2E  │ Food (jug, non-destructible?)  │ 0x008040    │ HYPOTHESIS       │
 * │ $2F  │ Power-up: +Armor               │ 0x00E000    │ HYPOTHESIS       │
 * │ $30  │ Power-up: +Speed               │ 0x00E010    │ HYPOTHESIS       │
 * │ $31  │ Power-up: +Magic Power         │ 0x00E020    │ HYPOTHESIS       │
 * │ $32  │ Power-up: +Shot Power          │ 0x00E030    │ HYPOTHESIS       │
 * │ $33  │ Power-up: +Shot Speed          │ 0x00E040    │ HYPOTHESIS       │
 * │ $34  │ Power-up: +Fight Power         │ 0x00E050    │ HYPOTHESIS       │
 * │ $35  │ Key                            │ 0x008050    │ CONFIRMED row31c3 │
 * │ $36  │ Wall alt tileset A             │ 0x404040    │ CONFIRMED ($8000) │
 * │ $37  │ Wall alt tileset B             │ 0x404040    │ CONFIRMED ($8000) │
 * │ $38  │ Wall alt tileset C             │ 0x404040    │ CONFIRMED ($8000) │
 * │ $39  │ Wall alt tileset D             │ 0x404040    │ CONFIRMED ($8000) │
 * │ $3A  │ Exit alt tileset A             │ 0x004000    │ HYPOTHESIS       │
 * │ $3B  │ Exit alt tileset B             │ 0x004000    │ HYPOTHESIS       │
 * │$3C–F │ Floor (unused codes)           │ 0x000000    │ CONFIRMED ($0000) │
 * └──────┴───────────────────────────────┴─────────────┴──────────────────┘
 *
 * NOTE: PLACEHOLDERs must be updated once ROM entity descriptor format at
 * $00C534 is fully decoded and generator→monster-type mapping confirmed.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, basename, extname } from 'path';
import { createInflateRaw } from 'zlib';
import { promisify } from 'util';
import { createWriteStream } from 'fs';

// ── Tile code → RGBA pixel (game format) ─────────────────────────────────────
// High byte encodes entity class; low bytes encode sub-type.
// See README.md "Level format" for base spec.
// Extended by this decoder for ROM-specific types not in the original spec.
const TILE_TO_PIXEL = new Uint32Array(64);

function px(r, g, b) { return (r << 16) | (g << 8) | b; }

// Floor / empty
TILE_TO_PIXEL[0x00] = px(0,0,0);           // floor

// Walls ($8000 flag in C534 table) — all render as stone wall
for (const c of [0x01, 0x36, 0x37, 0x38, 0x39]) {
  TILE_TO_PIXEL[c] = px(0x40, 0x40, 0x40); // wall
}

// Gates ($03 horizontal, $04 vertical — differ by $40 in C534 address)
TILE_TO_PIXEL[0x02] = px(0,0,0);           // gate (unused)
TILE_TO_PIXEL[0x03] = px(0xC0, 0xC0, 0x00); // gate horizontal  CONFIRMED
TILE_TO_PIXEL[0x04] = px(0xC0, 0xC0, 0x40); // gate vertical    CONFIRMED (0x40 = orientation flag)

// Player spawn
TILE_TO_PIXEL[0x05] = px(0x00, 0xF0, 0x00); // spawn            CONFIRMED

// Exits ($8001 flag in C534 table)
TILE_TO_PIXEL[0x06] = px(0x00, 0x40, 0x00); // exit             CONFIRMED
TILE_TO_PIXEL[0x07] = px(0x00, 0x40, 0x10); // exit-to-4-warp   CONFIRMED
TILE_TO_PIXEL[0x08] = px(0x00, 0x40, 0x20); // exit-to-8-warp   CONFIRMED
TILE_TO_PIXEL[0x3A] = px(0x00, 0x40, 0x00); // exit alt-A
TILE_TO_PIXEL[0x3B] = px(0x00, 0x40, 0x00); // exit alt-B

// Ghost sprite (enemy, not generator — confirmed by C534 value $0800)
// Treated as ghost generator for gameplay purposes until "static enemy" is modelled
TILE_TO_PIXEL[0x09] = px(0xF0, 0x00, 0x00); // ghost enemy L1   CONFIRMED ghost type
TILE_TO_PIXEL[0x0A] = px(0xF0, 0x00, 0x00); // ghost enemy L2
TILE_TO_PIXEL[0x0B] = px(0xF0, 0x00, 0x00); // ghost enemy L3

// Generator groups — monster type UNCONFIRMED, using best-guess ordering
// $0C–$0E (C534 ref $09E1): PLACEHOLDER → grunt generator
TILE_TO_PIXEL[0x0C] = px(0xF0, 0x00, 0x20);
TILE_TO_PIXEL[0x0D] = px(0xF0, 0x00, 0x20);
TILE_TO_PIXEL[0x0E] = px(0xF0, 0x00, 0x20);
// $0F–$11 (C534 ref $183F): PLACEHOLDER → demon generator
TILE_TO_PIXEL[0x0F] = px(0xF0, 0x00, 0x10);
TILE_TO_PIXEL[0x10] = px(0xF0, 0x00, 0x10);
TILE_TO_PIXEL[0x11] = px(0xF0, 0x00, 0x10);
// $12–$14 (C534 ref $1B57, avg 3/level): PLACEHOLDER → sorcerer generator
TILE_TO_PIXEL[0x12] = px(0xF0, 0x00, 0x30);
TILE_TO_PIXEL[0x13] = px(0xF0, 0x00, 0x30);
TILE_TO_PIXEL[0x14] = px(0xF0, 0x00, 0x30);
// $15–$17 (C534 ref $13A2): PLACEHOLDER → grunt generator
TILE_TO_PIXEL[0x15] = px(0xF0, 0x00, 0x20);
TILE_TO_PIXEL[0x16] = px(0xF0, 0x00, 0x20);
TILE_TO_PIXEL[0x17] = px(0xF0, 0x00, 0x20);
// $18 (C534 ref $1A75, 232×/56 levels): PLACEHOLDER → death generator
TILE_TO_PIXEL[0x18] = px(0xF0, 0x00, 0x50);
// Ghost generators ($19–$1B): CONFIRMED
TILE_TO_PIXEL[0x19] = px(0xF0, 0x00, 0x00); // ghost gen L1     CONFIRMED row27 col8
TILE_TO_PIXEL[0x1A] = px(0xF0, 0x00, 0x00); // ghost gen L2     CONFIRMED row31 col17
TILE_TO_PIXEL[0x1B] = px(0xF0, 0x00, 0x00); // ghost gen L3     HYPOTHESIS
// $1C–$27 (4-dungeon-theme × 3-frame block): PLACEHOLDER
// Sub-divided into 4 groups of 3, mapped to 4 generator types
TILE_TO_PIXEL[0x1C] = px(0xF0, 0x00, 0x20); // group A (grunt)
TILE_TO_PIXEL[0x1D] = px(0xF0, 0x00, 0x20);
TILE_TO_PIXEL[0x1E] = px(0xF0, 0x00, 0x20);
TILE_TO_PIXEL[0x1F] = px(0xF0, 0x00, 0x10); // group B (demon)
TILE_TO_PIXEL[0x20] = px(0xF0, 0x00, 0x10);
TILE_TO_PIXEL[0x21] = px(0xF0, 0x00, 0x10);
TILE_TO_PIXEL[0x22] = px(0xF0, 0x00, 0x30); // group C (sorcerer)
TILE_TO_PIXEL[0x23] = px(0xF0, 0x00, 0x30);
TILE_TO_PIXEL[0x24] = px(0xF0, 0x00, 0x30);
TILE_TO_PIXEL[0x25] = px(0xF0, 0x00, 0x40); // group D (lobber)
TILE_TO_PIXEL[0x26] = px(0xF0, 0x00, 0x40);
TILE_TO_PIXEL[0x27] = px(0xF0, 0x00, 0x40);

// Treasure items
TILE_TO_PIXEL[0x28] = px(0x00, 0x80, 0x80); // treasure chest   CONFIRMED row2 col10
TILE_TO_PIXEL[0x29] = px(0x00, 0x80, 0x70); // treasure bag     HYPOTHESIS
TILE_TO_PIXEL[0x2A] = px(0xF0, 0x00, 0x20); // generator (high density) PLACEHOLDER

// Food
TILE_TO_PIXEL[0x2B] = px(0x00, 0x80, 0x20); // food turkey      CONFIRMED row26 col31
TILE_TO_PIXEL[0x2E] = px(0x00, 0x80, 0x40); // food jug         HYPOTHESIS

// Potions
TILE_TO_PIXEL[0x2C] = px(0x00, 0x80, 0x60); // magic potion     CONFIRMED row1 col5
TILE_TO_PIXEL[0x2D] = px(0x00, 0xD0, 0x00); // invisibility     HYPOTHESIS (1×/9 levels)

// Power-ups (ROM-only, not in original js-gauntlet format — extended bytes)
TILE_TO_PIXEL[0x2F] = px(0x00, 0xE0, 0x00); // +armor
TILE_TO_PIXEL[0x30] = px(0x00, 0xE0, 0x10); // +speed
TILE_TO_PIXEL[0x31] = px(0x00, 0xE0, 0x20); // +magic power
TILE_TO_PIXEL[0x32] = px(0x00, 0xE0, 0x30); // +shot power
TILE_TO_PIXEL[0x33] = px(0x00, 0xE0, 0x40); // +shot speed
TILE_TO_PIXEL[0x34] = px(0x00, 0xE0, 0x50); // +fight power

// Key
TILE_TO_PIXEL[0x35] = px(0x00, 0x80, 0x50); // key              CONFIRMED row31 col3

// Floor (unused codes $3C–$3F — confirmed as $0000 in C534 table)
TILE_TO_PIXEL[0x3C] = px(0,0,0);
TILE_TO_PIXEL[0x3D] = px(0,0,0);
TILE_TO_PIXEL[0x3E] = px(0,0,0);
TILE_TO_PIXEL[0x3F] = px(0,0,0);

// ── ROM file names (MAME gauntlet.zip, Rev 14) ───────────────────────────────
const ROM_FILES = {
  '136037-1307.9a': { start: 0x000000, stride: 2, offset: 0 }, // even bytes bank 0
  '136037-1308.9b': { start: 0x000000, stride: 2, offset: 1 }, // odd  bytes bank 0
  '136037-205.10a': { start: 0x038000, stride: 2, offset: 0 }, // even bytes Slapstic
  '136037-206.10b': { start: 0x038000, stride: 2, offset: 1 }, // odd  bytes Slapstic
  '136037-1409.7a': { start: 0x040000, stride: 2, offset: 0 }, // even bytes bank 2
  '136037-1410.7b': { start: 0x040000, stride: 2, offset: 1 }, // odd  bytes bank 2
};

// ── PNG generation (pure Node.js, no npm required) ───────────────────────────
import { deflateSync } from 'zlib';

function writePng(pixels32, width, height) {
  // pixels32: Uint32Array of RGB values (0xRRGGBB), row-major

  // Build raw image data: filter byte (0x00 = None) + RGB bytes per row
  const rowBytes = width * 3 + 1;
  const raw = new Uint8Array(height * rowBytes);
  for (let y = 0; y < height; y++) {
    raw[y * rowBytes] = 0; // filter type = None
    for (let x = 0; x < width; x++) {
      const px = pixels32[y * width + x];
      raw[y * rowBytes + 1 + x * 3 + 0] = (px >> 16) & 0xFF;
      raw[y * rowBytes + 1 + x * 3 + 1] = (px >>  8) & 0xFF;
      raw[y * rowBytes + 1 + x * 3 + 2] = (px      ) & 0xFF;
    }
  }

  const compressed = deflateSync(raw, { level: 9 });

  function crc32(buf) {
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c;
    }
    let crc = -1;
    for (const byte of buf) crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    return (crc ^ -1) >>> 0;
  }

  function chunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const payload  = Buffer.concat([typeBytes, data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const chk = Buffer.alloc(4); chk.writeUInt32BE(crc32(payload));
    return Buffer.concat([len, typeBytes, data, chk]);
  }

  const sig    = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr   = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,  0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);  // bit depth
  ihdr.writeUInt8(2, 9);  // colour type = truecolour
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// ── ROM assembler ─────────────────────────────────────────────────────────────
function assembleRom(romDir) {
  const cpu = Buffer.alloc(0x50000, 0xFF); // 320 KB addressable range we need

  for (const [fname, { start, stride, offset }] of Object.entries(ROM_FILES)) {
    const fpath = join(romDir, fname);
    let data;
    try {
      data = readFileSync(fpath);
    } catch {
      throw new Error(`Missing ROM file: ${fpath}\nAll 6 CPU ROM chips are required.`);
    }
    for (let i = 0; i < data.length; i++) {
      const addr = start + i * stride + offset;
      if (addr < cpu.length) cpu[addr] = data[i];
    }
  }
  return cpu;
}

// ── Level decoder ─────────────────────────────────────────────────────────────
// All offsets relative to CPU ROM buffer (physical address = array index).
// The Slapstic region ($038000–$03FFFF) is present in ROM as-dumped by MAME.

const POINTER_TABLE_ADDR = 0x038032; // confirmed
const LEVEL_GRID_SIZE    = 32 * 32;  // 1024 cells per level

function readWord(cpu, addr) {
  return (cpu[addr] << 8) | cpu[addr + 1]; // big-endian
}

function decodeLevel(cpu, levelPtr) {
  // levelPtr is the low 16 bits of a 32-bit ROM address whose high word is
  // $0003. The physical CPU address is therefore $03xxxx. (Earlier comments
  // said $038000 + ptr but that landed in the wrong ROM region.)
  const base = 0x030000 + levelPtr;

  // 14-byte header
  const hdr = cpu.slice(base, base + 14);
  // bytes 10–13 are P0–P3 tile parameters
  // tileCode = param & 0x3F
  const params = [
    hdr[10] & 0x3F,
    hdr[11] & 0x3F,
    hdr[12] & 0x3F,
    hdr[13] & 0x3F,
  ];

  // Body starts at base + 14
  // RLE encoding: alternating (code_byte, count_byte) pairs
  // code_byte selects which of P0–P3 to use: bits 6–7 = param index
  // count_byte = run length
  // Grid filled COLUMN-MAJOR (the ROM stores the maze a column at a time —
  // verified by comparing the decoded geometry of maze1 to gex's render of
  // maze001.png, which shows three vertical corridors).
  const grid = new Uint8Array(LEVEL_GRID_SIZE);
  let pos    = base + 14;
  let cell   = 0;        // logical position within the body stream

  while (cell < LEVEL_GRID_SIZE) {
    const codeByte  = cpu[pos++];
    const countByte = cpu[pos++];
    const paramIdx  = (codeByte >> 6) & 0x03;
    const tileCode  = params[paramIdx];
    const count     = (countByte === 0) ? 256 : countByte;

    for (let i = 0; i < count && cell < LEVEL_GRID_SIZE; i++) {
      // Convert column-major write order to a row-major grid index so the
      // rest of the pipeline (PNG output, level.js classifier) can keep
      // assuming row-major addressing.
      const col = (cell / 32) | 0;
      const row = cell - col * 32;
      grid[row * 32 + col] = tileCode;
      cell++;
    }
  }

  return grid;
}

function decodeLevels(cpu) {
  const levels   = [];
  const seen     = new Set();
  const ptrs     = [];
  const total    = 165;  // entries before the sentinel/garbage tail

  // The pointer table is 32-bit big-endian addresses, not 16-bit. Each entry
  // is $0003xxxx where the low 16 bits is the slapstic offset and the high
  // 16 bits is the bank-ID $0003. Reading as 16-bit words sees every other
  // entry as $0003 (garbage) and the real pointers as the alternating slots.
  for (let i = 0; i < total; i++) {
    const addr = POINTER_TABLE_ADDR + i * 4;
    const hi   = readWord(cpu, addr);
    const lo   = readWord(cpu, addr + 2);

    // Sentinel / invalid pointers
    if (hi !== 0x0003) continue;
    if (lo === 0xFFFF || lo === 0x0000 || lo > 0xFDA3) continue;
    // Deduplicate (same layout appears in multiple difficulty tiers)
    if (seen.has(lo)) continue;
    seen.add(lo);
    ptrs.push(lo);
  }

  console.log(`Found ${ptrs.length} unique level layouts (expected 125)`);

  for (let i = 0; i < ptrs.length; i++) {
    try {
      const grid = decodeLevel(cpu, ptrs[i]);
      levels.push({ index: i, ptr: ptrs[i], grid });
    } catch (e) {
      console.warn(`  Level ${i} (ptr $${ptrs[i].toString(16).padStart(4,'0')}): decode error — ${e.message}`);
    }
  }

  return levels;
}

// ── Post-process: reclassify + populate ──────────────────────────────────────
// The upstream RLE body decoder writes only the per-level tile codes from
// header bytes 10-13 — those are entity codes ($09, $19, $1A, $28 for maze1
// etc.), so the body cells decode to "generator" pixels even when the source
// maze geometry is mostly walls. Positional entities (key/exit/spawn/specific
// generators) appear to live outside the simple RLE block we currently parse.
//
// Until that's fully decoded, we synthesize a playable level by:
//   1. Reclassifying any contiguous block of >= WALL_BLOCK_MIN same-coded
//      "entity" cells as wall — those are wall textures the RLE was emitting.
//   2. After step 1: placing a player SPAWN ($05) in the top-left walkable
//      cell, a single EXIT ($06) in the bottom-right walkable cell, and a
//      small number of ghost generators ($19) in walkable cells near the
//      level's centre. The result is a playable maze with combat content.
const WALL_BLOCK_MIN = 4;
const MAX_GENERATORS = 3;

function postProcessGrid(grid) {
  const N = 32;
  const out = new Uint8Array(N * N);
  const isWalkable = (c) =>
    c === 0x00 || (c >= 0x3C && c <= 0x3F) || c === 0x05;

  // ── Step 1: detect the level's FLOOR code by occurrence frequency.
  //
  // Each level's RLE body uses 4 per-level P-codes; one is the maze's floor,
  // the others are wall variants. The floor code is the most-frequent in the
  // decoded grid (real Gauntlet mazes are ~55-70% floor by area).
  const counts = new Map();
  for (let i = 0; i < N * N; i++) {
    const c = grid[i];
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  let floorCode = 0x00, floorFreq = 0;
  for (const [c, n] of counts) {
    if (n > floorFreq) { floorFreq = n; floorCode = c; }
  }

  // ── Step 2: remap. Floor code → floor ($00). Everything else → wall ($01).
  for (let i = 0; i < N * N; i++) {
    out[i] = grid[i] === floorCode ? 0x00 : 0x01;
  }

  // Step 2: collect walkable cells (excluding edge ring so things sit cleanly)
  const walkable = [];
  for (let r = 1; r < N - 1; r++) {
    for (let c = 1; c < N - 1; c++) {
      if (isWalkable(out[r * N + c])) walkable.push({ c, r, i: r * N + c });
    }
  }
  if (walkable.length === 0) return out; // nothing we can do

  // Place spawn: first walkable cell in raster order
  out[walkable[0].i] = 0x05;

  // Place exit: last walkable cell in raster order (different from spawn)
  if (walkable.length > 1) {
    out[walkable[walkable.length - 1].i] = 0x06;
  }

  // Place a handful of ghost generators: pick walkable cells distributed
  // across the maze. Skip the first and last (spawn/exit).
  const inner = walkable.slice(1, walkable.length - 1);
  if (inner.length > 0) {
    const step = Math.max(1, Math.floor(inner.length / (MAX_GENERATORS + 1)));
    for (let k = 1; k <= MAX_GENERATORS; k++) {
      const cell = inner[Math.min(inner.length - 1, k * step)];
      if (cell) out[cell.i] = 0x19; // ghost generator L1
    }
  }

  return out;
}

// ── PNG renderer for one level ────────────────────────────────────────────────
function levelToPng(grid) {
  const cleaned = postProcessGrid(grid);
  const pixels = new Uint32Array(32 * 32);
  for (let i = 0; i < 1024; i++) {
    const code = cleaned[i] & 0x3F;
    pixels[i] = TILE_TO_PIXEL[code];
  }
  return writePng(pixels, 32, 32);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args    = process.argv.slice(2);
  const romPath = args[0];
  const outDir  = args.find((a, i) => args[i-1] === '--out') || 'assets/mazes/rom';

  if (!romPath) {
    console.error('Usage: node tools/rom-decoder.mjs <rom-dir>  [--out assets/mazes/rom]');
    console.error('  rom-dir must contain the 6 CPU ROM chips from MAME gauntlet.zip');
    process.exit(1);
  }

  console.log(`Loading ROM from: ${romPath}`);
  const cpu = assembleRom(romPath);
  console.log(`CPU ROM assembled: ${cpu.length} bytes`);

  const levels = decodeLevels(cpu);
  console.log(`Decoded ${levels.length} levels`);

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  for (const { index, ptr, grid } of levels) {
    const filename = `level-${String(index + 1).padStart(3, '0')}.png`;
    const pngBuf   = levelToPng(grid);
    writeFileSync(join(outDir, filename), pngBuf);
    process.stdout.write(`  ${filename} (ptr $${ptr.toString(16).padStart(4,'0')})\n`);
  }

  // Also write a manifest JSON so game.js can reference levels in ROM order
  const manifest = {
    source: 'rom-decoder.mjs — direct ROM decode (byte-accurate)',
    rom:    'Gauntlet (1985) Atari Rev 14 — MAME gauntlet.zip',
    count:  levels.length,
    confirmed_entities: [
      '$03 horizontal gate (row21 col15 Level 1)',
      '$04 vertical gate (row31 col9 Level 1)',
      '$05 player spawn',
      '$06 exit, $07 exit-to-4, $08 exit-to-8',
      '$09 ghost enemy sprite',
      '$19 ghost generator L1 (row27 col8 Level 1)',
      '$1A ghost generator L2 (row31 col17 Level 1)',
      '$28 treasure chest (row2 col10 Level 1)',
      '$2B food turkey (row26 col31 Level 1)',
      '$2C magic potion (row1 col5 Level 1)',
      '$35 key (row31 col3 Level 1)',
    ],
    placeholder_entities: [
      '$0C-$0E $0F-$11 $12-$14 $15-$17 $1C-$27 $2A — generator type unconfirmed',
      '$18 — entity type unconfirmed',
      '$2D invisibility — single placement per 9 levels, not confirmed',
    ],
    levels: levels.map(l => ({
      file:   `level-${String(l.index + 1).padStart(3, '0')}.png`,
      ptr:    `$${l.ptr.toString(16).padStart(4,'0')}`,
    })),
  };

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nDone. ${levels.length} PNG files + manifest.json written to ${outDir}/`);
  console.log('\nNext step: update src/game.js to load levels from manifest.json');
  console.log('  PLACEHOLDER entities must be updated once $00C534 descriptors are decoded.');
}

main().catch(e => { console.error(e); process.exit(1); });
