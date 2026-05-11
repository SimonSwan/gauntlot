/**
 * src/assets.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Asset loader for Gauntlet (1985) recreation.
 *
 * Loads ALL sprites from the assets/sprites/ directory.
 * All sprite files in that directory come from mbeisser1/gauntlet_mame_gfx v1.1.0
 * PLUS gate-horizontal.png and gate-vertical.png extracted from all-monster.png
 * by tools/setup-assets.mjs.
 *
 * HOW IT WORKS:
 *   1. Call Assets.load(basePath) — returns a Promise that resolves when
 *      every image and audio file is loaded.
 *   2. Access loaded images via Assets.img['key'] → HTMLImageElement.
 *   3. Access loaded audio via Assets.sfx['key'] → HTMLAudioElement.
 *
 * All images are keyed by short names defined in MANIFEST below.
 * The renderer (render.js) uses these exact key names — do not rename.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { MON } from './constants.js';

// ── Image manifest ────────────────────────────────────────────────────────────
// Every entry: { key, file }
// key  = name used by renderer/entities to look up the image
// file = path relative to basePath (typically 'assets/')

const IMAGE_MANIFEST = [
  // ── Player sprites ─────────────────────────────────────────────────────────
  // warrior: 216×192px, 9 cols × 8 rows, 24×24px frames  [CONFIRMED SPR]
  { key: 'warrior',          file: 'sprites/player-warrior-sprite-sheet.png' },
  { key: 'warrior_weapon',   file: 'sprites/player-warrior-weapon-sprite-sheet.png' },
  { key: 'warrior_exit',     file: 'sprites/player-warrior-exit-sprite-sheet.png' },
  // valkyrie: 216×192px, 9×8, 24px  [CONFIRMED SPR]
  { key: 'valkyrie',         file: 'sprites/player-valkyrie-sprite-sheet.png' },
  { key: 'valkyrie_weapon',  file: 'sprites/player-valkyrie-weapon-sprite-sheet.png' },
  { key: 'valkyrie_exit',    file: 'sprites/player-valkyrie-exit-sprite-sheet.png' },
  // elf: 192×192px, 8×8, 24px  [CONFIRMED SPR]
  { key: 'elf',              file: 'sprites/player-elf-sprite-sheet.png' },
  { key: 'elf_weapon',       file: 'sprites/player-elf-weapon-sprite-sheet.png' },
  { key: 'elf_exit',         file: 'sprites/player-elf-exit-sprite-sheet.png' },
  // wizard: 144×192px, 6×8, 24px  [CONFIRMED SPR]
  { key: 'wizard',           file: 'sprites/player-wizard-sprite-sheet.png' },
  { key: 'wizard_weapon',    file: 'sprites/player-wizard-weapon-sprite-sheet.png' },
  { key: 'wizard_exit',      file: 'sprites/player-wizard-exit-sprite-sheet.png' },
  // spawn animation: 168×24px, 7 frames, 24px  [CONFIRMED SPR]
  { key: 'spawn',            file: 'sprites/player-spawn-sprite-sheet.png' },

  // ── Monster sprites ────────────────────────────────────────────────────────
  // Ghost: 96×192px, 4 cols × 8 rows, 24px  [CONFIRMED SPR]
  // 3 themes = 3 dungeon colour palettes
  { key: 'ghost1',           file: 'sprites/monster-ghost1-sprite-sheet.png' },
  { key: 'ghost2',           file: 'sprites/monster-ghost2-sprite-sheet.png' },
  { key: 'ghost3',           file: 'sprites/monster-ghost3-sprite-sheet.png' },
  // Grunt: 120×192px, 5×8, 24px  [CONFIRMED SPR]
  { key: 'grunt1',           file: 'sprites/monster-grunt1-sprite-sheet.png' },
  { key: 'grunt2',           file: 'sprites/monster-grunt2-sprite-sheet.png' },
  { key: 'grunt3',           file: 'sprites/monster-grunt3-sprite-sheet.png' },
  // Grunt alt: 144×192px, 6×8, 24px  [CONFIRMED SPR]
  { key: 'grunt1_alt',       file: 'sprites/monster-grunt1-alt-sprite-sheet.png' },
  { key: 'grunt2_alt',       file: 'sprites/monster-grunt2-alt-sprite-sheet.png' },
  { key: 'grunt3_alt',       file: 'sprites/monster-grunt3-alt-sprite-sheet.png' },
  // Demon: 192×192px, 8×8, 24px  [CONFIRMED SPR]
  { key: 'demon1',           file: 'sprites/monster-demon1-sprite-sheet.png' },
  { key: 'demon2',           file: 'sprites/monster-demon2-sprite-sheet.png' },
  { key: 'demon3',           file: 'sprites/monster-demon3-sprite-sheet.png' },
  // Sorcerer: 144×192px, 6×8, 24px  [CONFIRMED SPR]
  { key: 'sorcerer1',        file: 'sprites/monster-sorcerer1-sprite-sheet.png' },
  { key: 'sorcerer2',        file: 'sprites/monster-sorcerer2-sprite-sheet.png' },
  { key: 'sorcerer3',        file: 'sprites/monster-sorcerer3-sprite-sheet.png' },
  // Lobber: 120×128px, ~5×5, 24px  [CONFIRMED SPR]
  { key: 'lobber1',          file: 'sprites/monster-lobber1-sprite-sheet.png' },
  { key: 'lobber2',          file: 'sprites/monster-lobber2-sprite-sheet.png' },
  { key: 'lobber3',          file: 'sprites/monster-lobber3-sprite-sheet.png' },
  // Lobber explosion: 48×16px, 3 frames, 16px  [CONFIRMED SPR]
  { key: 'lobber_expl',      file: 'sprites/monster-lobber-exlosion-sprite-sheet.png' },
  // Death: 72×192px, 3×8, 24px (only 1 theme — Death is unique)  [CONFIRMED SPR]
  { key: 'death',            file: 'sprites/monster-death.png' },
  // Thief: 216×192px, 9×8, 24px (only 1 theme)  [CONFIRMED SPR]
  { key: 'thief',            file: 'sprites/monster-thief-sprite-sheet.png' },

  // ── Generator sprites ──────────────────────────────────────────────────────
  // Ghost generator (skull cage): 72×24px, 3 frames (L1/L2/L3)  [CONFIRMED SPR]
  // Frame 0 = L1 (1-shot to destroy), frame 1 = L2, frame 2 = L3
  { key: 'ghost_gen',        file: 'sprites/monster-ghost-generator.png' },
  // Stone cage (all non-ghost generators): 72×24px, 3 frames  [CONFIRMED SPR]
  { key: 'monster_gen',      file: 'sprites/monster-monster-generator.png' },

  // ── Playfield background tiles (ROM-extracted via MAME save-state dump) ───
  // Generated by tools/build-arcade-bg.mjs from the spr_tiles ROM region +
  // palette RAM dump of Level 1 attract mode.  See that tool for tile sourcing.
  { key: 'arcade_wall',      file: 'sprites/arcade-wall.png' },        // 16×16px
  { key: 'arcade_wall_body', file: 'sprites/arcade-wall-body.png' },   // 16×16px
  { key: 'arcade_floor',     file: 'sprites/arcade-floor.png' },       // 16×16px
  // Gate sprites — ROM-extracted via MAME MOB RAM dump.
  // Horizontal: code 0x1d48 (Level 1 row 21 horizontal gate, captured live).
  // Vertical:   code 0x1d94 (Level 4 vertical gates, same color-0 palette).
  { key: 'arcade_gate_h',    file: 'sprites/arcade-gate-h.png' },      // 16×16px
  { key: 'arcade_gate_v',    file: 'sprites/arcade-gate-v.png' },      // 16×16px

  // ── Gate sprites ───────────────────────────────────────────────────────────
  // Extracted from all-monster.png (row 2, right section) by setup-assets.mjs.
  // $03 = horizontal gate bar, confirmed Level 1 row21 col15  [CONFIRMED VIS]
  // $04 = vertical gate post, confirmed Level 1 row31 col9    [CONFIRMED VIS]
  // These are NOT stone walls — they are the blue bar/grate graphics.
  // Stone wall tile graphics require chars ROM decode (not yet done).
  { key: 'gate_h',           file: 'sprites/gate-horizontal.png' },  // 29×66px
  { key: 'gate_v',           file: 'sprites/gate-vertical.png' },    // 12×161px

  // ── Exit sprites  [CONFIRMED SPR] ─────────────────────────────────────────
  { key: 'exit',             file: 'sprites/dungeon-exit.png' },           // 16×16px
  { key: 'exit_4',           file: 'sprites/dungeon-exit-to-4.png' },      // 16×16px
  { key: 'exit_8',           file: 'sprites/dungeon-exit-to-8.png' },      // 16×16px

  // ── Key sprites  [CONFIRMED VIS Level1 row31 col3] ────────────────────────
  { key: 'key',              file: 'sprites/dungeon-key.png' },            // 16×16px
  { key: 'keyring',          file: 'sprites/dungeon-keyring.png' },        // 24×16px

  // ── Food sprites  [food_turkey CONFIRMED VIS Level1 row26 col31] ──────────
  { key: 'food_turkey',      file: 'sprites/dungeon-food-turkey.png' },    // 24×24px
  { key: 'food_drumstick',   file: 'sprites/dungeon-food-drumstick.png' }, // 24×24px
  { key: 'food_ham',         file: 'sprites/dungeon-food-ham.png' },       // 24×24px
  { key: 'food_jug',         file: 'sprites/dungeon-food-jug.png' },       // 24×24px

  // ── Potion sprites  [potion_blue CONFIRMED VIS Level1 row1 col5] ──────────
  { key: 'potion_blue',      file: 'sprites/dungeon-potion-blue.png' },    // 16×16px
  { key: 'potion_orange',    file: 'sprites/dungeon-potion-orange.png' },  // 16×16px
  { key: 'invisibility',     file: 'sprites/dungeon-limited-invisibility.png' }, // 24×24px

  // ── Power-up sprites  [HYPOTHESIS - $2F–$34 each in 1 level only] ─────────
  { key: 'plus_armor',       file: 'sprites/dungeon-potion-extra-armor.png' },      // 16×16px
  { key: 'plus_speed',       file: 'sprites/dungeon-potion-extra-speed.png' },      // 16×16px
  { key: 'plus_magic',       file: 'sprites/dungeon-potion-extra-magic.png' },      // 16×16px
  { key: 'plus_shot_pow',    file: 'sprites/dungeon-potion-extra-shot-power.png' }, // 16×16px
  { key: 'plus_shot_spd',    file: 'sprites/dungeon-potion-extra-shot-speed.png' }, // 16×16px
  { key: 'plus_fight',       file: 'sprites/dungeon-potion-weapon.png' },           // 16×16px

  // ── Treasure sprites  [treasure_chest CONFIRMED VIS Level1 row2 col10] ────
  { key: 'treasure_chest',   file: 'sprites/dungeon-treasure-chest-sprite-sheet.png' }, // 72×24px, 3fr
  { key: 'treasure_bag',     file: 'sprites/dungeon-treasure-bag.png' },               // 24×24px

  // ── Effect sprites ─────────────────────────────────────────────────────────
  { key: 'teleport',         file: 'sprites/dungeon-teleport-sprite-sheet.png' },     // 96×16px, 6fr
  { key: 'collision_expl',   file: 'sprites/explosion-collision-sprite-sheet.png' },  // 48×16px, 3fr
  { key: 'teleport_expl',    file: 'sprites/explosion-teleport-sprite-sheet.png' },   // 144×24px, 6fr

  // ── HUD icons ──────────────────────────────────────────────────────────────
  { key: 'icon_key',         file: 'sprites/icon-key.png' },      // 8×8px
  { key: 'icon_potion',      file: 'sprites/icon-potion.png' },   // 8×8px
  { key: 'icon_upgrades',    file: 'sprites/icon-upgrades.png' }, // 48×8px, 6 icons

  // ── Title / UI ─────────────────────────────────────────────────────────────
  { key: 'text_gauntlet',    file: 'sprites/text-gauntlet.png' }, // 80×24px
  { key: 'text_points',      file: 'sprites/text-points.png' },   // 24×80px
];

// ── Level manifest ────────────────────────────────────────────────────────────
// The ROM-decoded levels are stored as individual PNG files.
// This function fetches the manifest JSON generated by tools/rom-decoder.mjs.

async function loadLevelManifest(basePath) {
  const url = `${basePath}mazes/rom/manifest.json`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (e) {
    console.warn(`[Assets] ROM level manifest not found at ${url}.`, e.message);
    console.warn('[Assets] ROM-decoded levels will not be available.');
    console.warn('[Assets] Run: node tools/rom-decoder.mjs <rom-dir> to generate them.');
    return null;
  }
}

// ── Asset store ───────────────────────────────────────────────────────────────

export const Assets = {
  /** @type {Object.<string, HTMLImageElement>} */
  img: {},

  /** @type {string|null} base path used for loading */
  basePath: null,

  /** @type {Object|null} ROM level manifest (from mazes/rom/manifest.json) */
  levelManifest: null,

  /**
   * Load all assets.
   * @param {string} basePath  Path prefix for all asset files (e.g. 'assets/').
   *                           Must end with '/'.
   * @returns {Promise<void>}  Resolves when every image is loaded.
   *                           Logs warnings for any missing files (does not reject).
   */
  async load(basePath = 'assets/') {
    this.basePath = basePath;
    console.log(`[Assets] Loading from ${basePath} …`);

    // Load all images in parallel
    const results = await Promise.allSettled(
      IMAGE_MANIFEST.map(({ key, file }) => this._loadImage(key, basePath + file))
    );

    let ok = 0, fail = 0;
    for (const r of results) {
      if (r.status === 'fulfilled') ok++;
      else fail++;
    }

    console.log(`[Assets] Images: ${ok} loaded, ${fail} failed`);
    if (fail > 0) {
      console.warn('[Assets] Missing sprites will show as coloured rectangles.');
      console.warn('[Assets] Run tools/setup-assets.mjs to copy sprites into place.');
    }

    // Load ROM level manifest (optional)
    this.levelManifest = await loadLevelManifest(basePath);
    if (this.levelManifest) {
      console.log(`[Assets] ROM levels: ${this.levelManifest.count} levels available`);
    }
  },

  /**
   * Load a single image and store it under the given key.
   * @private
   */
  _loadImage(key, url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => { this.img[key] = img; resolve(); };
      img.onerror = () => {
        console.warn(`[Assets] Failed to load: ${url}`);
        reject(new Error(`Cannot load ${url}`));
      };
      img.src = url;
    });
  },

  // ── Convenience getters ─────────────────────────────────────────────────────

  /**
   * Get the correct monster sprite sheet key for a given monster type and theme.
   * @param {number} monType   One of MON.* constants
   * @param {number} theme     Dungeon theme 0/1/2 (for monsters with 3 variants)
   * @returns {string} Image key for Assets.img lookup
   */
  monsterSheetKey(monType, theme = 0) {
    const t = Math.max(0, Math.min(2, theme));
    switch (monType) {
      case MON.GHOST:    return `ghost${t + 1}`;
      case MON.GRUNT:    return `grunt${t + 1}`;
      case MON.DEMON:    return `demon${t + 1}`;
      case MON.SORCERER: return `sorcerer${t + 1}`;
      case MON.LOBBER:   return `lobber${t + 1}`;
      case MON.DEATH:    return 'death';   // Only one theme
      case MON.THIEF:    return 'thief';   // Only one theme
      default:           return `grunt${t + 1}`; // Fallback
    }
  },

  /**
   * Get the generator sprite sheet key.
   * @param {number} monType  The monster type this generator spawns
   * @returns {string} Image key
   */
  generatorSheetKey(monType) {
    return monType === MON.GHOST ? 'ghost_gen' : 'monster_gen';
  },

  /**
   * Get the player sprite sheet key.
   * @param {string} heroId  'warrior', 'valkyrie', 'elf', or 'wizard'
   * @returns {string} Image key
   */
  heroSheetKey(heroId) {
    return heroId; // The hero id IS the image key
  },
};
