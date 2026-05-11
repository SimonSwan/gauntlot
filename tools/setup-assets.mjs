#!/usr/bin/env node
/**
 * tools/setup-assets.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE-TIME SETUP SCRIPT.
 *
 * Copies all sprite files from the mbeisser1/gauntlet_mame_gfx v1.1.0 zip
 * into the game's assets/sprites/ directory, and extracts the gate sprites
 * from all-monster.png.
 *
 * USAGE:
 *   node tools/setup-assets.mjs <path-to-sprite-zip>
 *
 * WHERE TO GET THE ZIP:
 *   https://github.com/mbeisser1/gauntlet_mame_gfx/releases/tag/v1.1.0
 *   Filename: gauntlet-sprites-v1_1_0_.zip  (or similar)
 *
 * WHAT THIS SCRIPT DOES:
 *   1. Extracts sprite-sheets/*.png from the zip into assets/sprites/
 *   2. Extracts gate-horizontal.png from all-monster.png (row 2, right side)
 *   3. Extracts gate-vertical.png from all-monster.png (row 2, right side)
 *
 * WHY GATES COME FROM all-monster.png:
 *   The gate bar graphics live in the sprite sheet's second row, right section.
 *   Tile code $03 = horizontal gate (CONFIRMED Level 1 row21 col15).
 *   Tile code $04 = vertical gate   (CONFIRMED Level 1 row31 col9).
 *   The ROM C534 addresses differ by $40 ($9D3C vs $9D7C) — this $40 is the
 *   orientation flag in the entity descriptor.
 *
 * IMPORTANT — WHAT dungeon-wall-*.png ARE:
 *   dungeon-wall-corners.png, dungeon-wall-horizontal.png, dungeon-wall-vertical.png
 *   are the GATE bar graphics, NOT the stone wall tile graphics.
 *   The stone wall tile graphics are in the chars ROM (136037-104.6p),
 *   which has NOT been decoded yet.  Do NOT use these files for stone walls.
 *   They are copied to assets/sprites/ but should only be used for gates.
 *
 * AFTER RUNNING THIS SCRIPT:
 *   All 69 sprite files will be in assets/sprites/.
 *   Then run the ROM decoder: node tools/rom-decoder.mjs <rom-dir>
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createReadStream, createWriteStream, mkdirSync, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { join, basename } from 'path';
import { createUnzip } from 'zlib';

// ── Sharp (image processing) ───────────────────────────────────────────────────
// We use the 'sharp' npm package for PNG manipulation.
// Install with: npm install sharp
// If sharp is not available, the gate extraction step will be skipped
// and you'll need to copy gate-horizontal.png and gate-vertical.png manually.

let sharp = null;
try {
  const mod = await import('sharp');
  sharp = mod.default;
} catch {
  console.warn('[setup-assets] "sharp" not installed — gate sprite extraction skipped.');
  console.warn('[setup-assets] Install with: npm install sharp');
}

// ── Paths ─────────────────────────────────────────────────────────────────────

const SPRITES_OUT = 'assets/sprites';
const ROM_LEVELS_OUT = 'assets/mazes/rom';

// ── Gate sprite extraction parameters ────────────────────────────────────────
// These coordinates are CONFIRMED by ROM analysis + visual inspection.
// all-monster.png dimensions: 1128×624px  [CONFIRMED SPR]
// Gate section: second row, right side
// Gate content bounds: x=960–1128, y=180–440  [CONFIRMED by pixel scan]

const GATE_H = {
  // Horizontal gate ($03) — 6 bars, each 29×11px, stacked vertically
  // Bars at y offsets from GY=258: (6,17),(22,33),(38,49),(54,65),(70,81),(86,97)
  // Final composite: 29×66px
  srcX: 960 + 2, srcY: 258,
  bars: [
    { y1: 6,  y2: 17 },
    { y1: 22, y2: 33 },
    { y1: 38, y2: 49 },
    { y1: 54, y2: 65 },
    { y1: 70, y2: 81 },
    { y1: 86, y2: 97 },
  ],
  barW: 29,
  outFile: 'gate-horizontal.png',
};

const GATE_V = {
  // Vertical gate ($04) — 6 segments, variable height, stacked vertically
  // Segments at y offsets from GY=258: (4,22),(27,70),(73,94),(95,118),(123,150),(153,182)
  // Final composite: 12×161px
  srcX: 960 + 38, srcY: 258,
  segs: [
    { y1: 4,   y2: 22  },
    { y1: 27,  y2: 70  },
    { y1: 73,  y2: 94  },
    { y1: 95,  y2: 118 },
    { y1: 123, y2: 150 },
    { y1: 153, y2: 182 },
  ],
  segW: 12,
  outFile: 'gate-vertical.png',
};

// ── Zip extraction ─────────────────────────────────────────────────────────────

async function extractZip(zipPath, outDir) {
  console.log(`[setup-assets] Extracting sprites from ${zipPath} …`);

  // Use the built-in unzip via child_process (no npm dep)
  const { spawnSync } = await import('child_process');

  // Extract only sprite-sheets/*.png and all-monster.png
  const result = spawnSync('unzip', [
    '-o',               // overwrite existing files
    '-j',               // junk paths (put all files in same dir)
    zipPath,
    'sprite-sheets/*.png',
    'all-monster.png',
    '-d', outDir,
  ], { encoding: 'utf8' });

  if (result.status !== 0) {
    // Try alternative: extract everything then filter
    console.warn('[setup-assets] Selective extraction failed, trying full extraction…');
    const r2 = spawnSync('unzip', ['-o', zipPath, '-d', outDir + '_tmp'], { encoding: 'utf8' });
    if (r2.status !== 0) {
      throw new Error(`unzip failed: ${r2.stderr || r2.stdout}`);
    }
    // Copy PNG files from extracted dirs
    const { readdirSync, copyFileSync } = await import('fs');
    const { join: j } = await import('path');
    const tmpDir = outDir + '_tmp';
    function copyPngs(dir) {
      try {
        for (const f of readdirSync(dir, { withFileTypes: true })) {
          if (f.isDirectory()) copyPngs(j(dir, f.name));
          else if (f.name.endsWith('.png')) {
            copyFileSync(j(dir, f.name), j(outDir, f.name));
            console.log(`  Copied: ${f.name}`);
          }
        }
      } catch {}
    }
    copyPngs(tmpDir);
    // Clean up tmp
    spawnSync('rm', ['-rf', tmpDir]);
  }

  // Count what we got
  const { readdirSync } = await import('fs');
  const pngs = readdirSync(outDir).filter(f => f.endsWith('.png'));
  console.log(`[setup-assets] Extracted ${pngs.length} PNG files to ${outDir}/`);
  return pngs;
}

// ── Gate extraction ────────────────────────────────────────────────────────────

async function extractGates(spriteDir) {
  if (!sharp) {
    console.warn('[setup-assets] Skipping gate extraction (sharp not installed).');
    console.warn('[setup-assets] Manually copy gate-horizontal.png and gate-vertical.png');
    console.warn('[setup-assets] to assets/sprites/ — see tools/rom-decoder-notes.md');
    return;
  }

  const allMonsterPath = join(spriteDir, 'all-monster.png');
  if (!existsSync(allMonsterPath)) {
    console.warn(`[setup-assets] all-monster.png not found at ${allMonsterPath}`);
    return;
  }

  console.log('[setup-assets] Extracting gate sprites from all-monster.png …');

  // ── Horizontal gate ─────────────────────────────────────────────────────────
  {
    const { bars, srcX, srcY, barW, outFile } = GATE_H;
    const totalH = bars.reduce((s, b) => s + (b.y2 - b.y1), 0);
    const regions = bars.map(b => sharp(allMonsterPath).extract({
      left:   srcX,
      top:    srcY + b.y1,
      width:  barW,
      height: b.y2 - b.y1,
    }).toBuffer());
    const bufs = await Promise.all(regions);
    // Stack vertically
    const composites = [];
    let top = 0;
    for (const buf of bufs) {
      composites.push({ input: buf, top, left: 0 });
      const meta = await sharp(buf).metadata();
      top += meta.height;
    }
    await sharp({
      create: { width: barW, height: totalH, channels: 4, background: { r:0,g:0,b:0,alpha:0 } }
    }).composite(composites).png().toFile(join(spriteDir, outFile));
    console.log(`  gate-horizontal.png: ${barW}×${totalH}px`);
  }

  // ── Vertical gate ───────────────────────────────────────────────────────────
  {
    const { segs, srcX, srcY, segW, outFile } = GATE_V;
    const totalH = segs.reduce((s, b) => s + (b.y2 - b.y1), 0);
    const regions = segs.map(b => sharp(allMonsterPath).extract({
      left:   srcX,
      top:    srcY + b.y1,
      width:  segW,
      height: b.y2 - b.y1,
    }).toBuffer());
    const bufs = await Promise.all(regions);
    const composites = [];
    let top = 0;
    for (const buf of bufs) {
      composites.push({ input: buf, top, left: 0 });
      const meta = await sharp(buf).metadata();
      top += meta.height;
    }
    await sharp({
      create: { width: segW, height: totalH, channels: 4, background: { r:0,g:0,b:0,alpha:0 } }
    }).composite(composites).png().toFile(join(spriteDir, outFile));
    console.log(`  gate-vertical.png: ${segW}×${totalH}px`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const zipPath = process.argv[2];
  if (!zipPath) {
    console.error('Usage: node tools/setup-assets.mjs <path-to-gauntlet-sprites-v1_1_0_.zip>');
    console.error('');
    console.error('Get the zip from:');
    console.error('  https://github.com/mbeisser1/gauntlet_mame_gfx/releases/tag/v1.1.0');
    process.exit(1);
  }

  // Create output directories
  for (const dir of [SPRITES_OUT, ROM_LEVELS_OUT]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  // Extract sprites from zip
  await extractZip(zipPath, SPRITES_OUT);

  // Extract gate sprites from all-monster.png
  await extractGates(SPRITES_OUT);

  console.log('\n[setup-assets] Done!');
  console.log(`All ${SPRITES_OUT}/ files ready.`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Run ROM decoder to generate accurate level PNGs:');
  console.log('     node tools/rom-decoder.mjs <path-to-gauntlet-rom-dir>');
  console.log('  2. Start the game:');
  console.log('     python3 -m http.server 8765');
  console.log('     open http://localhost:8765');
}

main().catch(e => { console.error('[setup-assets] Error:', e.message); process.exit(1); });
