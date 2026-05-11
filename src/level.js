/**
 * src/level.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Level loader and parser for Gauntlet (1985) recreation.
 *
 * LEVEL FORMAT:
 *   Each level is stored as a 32×32 PNG image where each pixel = one tile.
 *   The PNG is decoded by reading pixel RGBA values and classifying them.
 *
 * SUPPORTED FORMATS:
 *   1. Original javascript-gauntlet format (17 hand-crafted trainer levels).
 *      Same pixel encoding — loads without modification.
 *   2. ROM-decoded format (125 levels from tools/rom-decoder.mjs).
 *      Superset of the original format — adds gate orientation, warp exits,
 *      power-ups, invisibility.  All new pixel values listed below.
 *
 * PIXEL CLASSIFICATION (see PIXEL in constants.js for exact values):
 *
 *   0x000000              → FLOOR (transparent / walkable)
 *   0x3x3x3x              → WALL (stone, colour-filled only — chars ROM pending)
 *   0xC0C000 / 0xC0C040   → GATE (horizontal / vertical)
 *                           The blue channel byte ($00 vs $40) encodes orientation.
 *                           Mirrors the $40 bit difference in ROM C534 addresses
 *                           ($9D3C for H-gate vs $9D7C for V-gate).
 *   0x00F000              → SPAWN (player start point)
 *   0x004000              → EXIT
 *   0x004010              → EXIT to warp 4
 *   0x004020              → EXIT to warp 8
 *   0xF000nn              → GENERATOR (nn = monster type byte, see MON.*)
 *   0x0080nn              → ITEM (nn = item sub-type)
 *   0x00E0nn              → POWER-UP (nn = 0–5, see TILE.POWERUP_*)
 *   0x00D0xx              → INVISIBILITY POTION
 *
 * ITEM SUB-TYPE byte (nn in 0x0080nn):
 *   0x00 = health food (generic)
 *   0x10 = poison food
 *   0x20 = food turkey    CONFIRMED $2B
 *   0x30 = food ham
 *   0x40 = food jug       HYPOTHESIS $2E
 *   0x50 = key            CONFIRMED $35
 *   0x60 = magic potion   CONFIRMED $2C
 *   0x70 = treasure bag
 *   0x80 = treasure chest CONFIRMED $28
 *
 * POWER-UP SUB-TYPE byte (nn in 0x00E0nn):
 *   0x00 = +Armor         HYPOTHESIS $2F
 *   0x10 = +Speed         HYPOTHESIS $30
 *   0x20 = +Magic Power   HYPOTHESIS $31
 *   0x30 = +Shot Power    HYPOTHESIS $32
 *   0x40 = +Shot Speed    HYPOTHESIS $33
 *   0x50 = +Fight Power   HYPOTHESIS $34
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { TILE, WALL_CODES, EXIT_CODES, GATE_CODES, FLOOR_CODES, MON, CELL } from './constants.js';

// ── Tile type constants (internal to level.js) ────────────────────────────────
// These are the tile TYPE values stored in Level.grid[i].type.
// Separate from the ROM tile codes (TILE.*) — these are the game's internal
// representation after parsing the PNG.

export const T = Object.freeze({
  FLOOR:      0,
  WALL:       1,
  GATE_H:     2,  // Horizontal gate — CONFIRMED $03
  GATE_V:     3,  // Vertical gate   — CONFIRMED $04
  SPAWN:      4,
  EXIT:       5,
  EXIT_WARP4: 6,
  EXIT_WARP8: 7,
  // Generators: store monster type in .monType field
  GENERATOR:  8,
  // Items: store item sub-type in .itemType field
  ITEM:       9,
  POWER_UP:   10,
  INVIS:      11,
});

// Item sub-type values (matching pixel 0x0080nn byte nn)
export const ITEM_T = Object.freeze({
  FOOD_GENERIC:  0x00,
  FOOD_POISON:   0x10,
  FOOD_TURKEY:   0x20,  // CONFIRMED $2B
  FOOD_HAM:      0x30,
  FOOD_JUG:      0x40,  // HYPOTHESIS $2E
  KEY:           0x50,  // CONFIRMED $35
  POTION_MAGIC:  0x60,  // CONFIRMED $2C
  TREASURE_BAG:  0x70,
  TREASURE_CHEST:0x80,  // CONFIRMED $28
});

// Power-up sub-type values (matching pixel 0x00E0nn byte nn)
export const PWR_T = Object.freeze({
  ARMOR:    0x00,
  SPEED:    0x10,
  MAGIC:    0x20,
  SHOT_POW: 0x30,
  SHOT_SPD: 0x40,
  FIGHT:    0x50,
});

// ── Pixel classifier ──────────────────────────────────────────────────────────
// Reads one pixel (r, g, b) and returns a tile descriptor object.
// This is the single point of truth for PNG → tile conversion.

function classifyPixel(r, g, b) {
  // ── Floor (pure black) ────────────────────────────────────────────────────
  if (r === 0 && g === 0 && b === 0) return { type: T.FLOOR };

  // ── Wall (grey range: all channels ~equal and in 0x20–0x70) ───────────────
  // ROM-decoded walls use 0x404040.  Legacy levels may use other greys.
  if (r >= 0x20 && r <= 0x70 &&
      Math.abs(r - g) < 0x15 &&
      Math.abs(g - b) < 0x15) {
    return { type: T.WALL };
  }

  // ── Spawn (bright green: G >= 0xE0, R < 0x10, B < 0x10) ─────────────────
  if (r < 0x10 && g >= 0xE0 && b < 0x10) return { type: T.SPAWN };

  // ── Exit (dark green: G in 0x30–0x60, R < 0x10) ──────────────────────────
  if (r < 0x10 && g >= 0x30 && g <= 0x60) {
    // Blue channel encodes warp destination
    if (b >= 0x18 && b < 0x28) return { type: T.EXIT_WARP4 }; // CONFIRMED $07
    if (b >= 0x28 && b < 0x38) return { type: T.EXIT_WARP8 }; // CONFIRMED $08
    return { type: T.EXIT };                                    // CONFIRMED $06
  }

  // ── Gate (yellow: R ~= G ~= 0xC0, B < 0x80) ─────────────────────────────
  // Horizontal gate: B near 0x00  (ROM tile $03, C534 address $9D3C)
  // Vertical gate:   B near 0x40  (ROM tile $04, C534 address $9D7C)
  // The $40 difference mirrors the orientation flag in the ROM entity descriptor.
  if (r >= 0xA0 && g >= 0xA0 && Math.abs(r - g) < 0x30 && b < 0x80) {
    if (b < 0x20) return { type: T.GATE_H }; // CONFIRMED horizontal
    return { type: T.GATE_V };               // CONFIRMED vertical
  }

  // ── Generator (high red: R >= 0xE0, G < 0x10) ────────────────────────────
  // Pixel: 0xF000TT where TT = monster type (matches MON.* values × 0x10)
  if (r >= 0xE0 && g < 0x10) {
    const monType = Math.floor(b / 0x10); // 0=ghost, 1=demon, 2=grunt, etc.
    return { type: T.GENERATOR, monType };
  }

  // ── Power-up (mid-green: G == 0xE0 range, R < 0x10) ─────────────────────
  if (r < 0x10 && g >= 0xD5 && g <= 0xEB) {
    return { type: T.POWER_UP, pwrType: b };
  }

  // ── Invisibility potion (G == 0xD0 range, R < 0x10, distinct from power-up)
  if (r < 0x10 && g >= 0xC5 && g <= 0xD4) {
    return { type: T.INVIS };
  }

  // ── Item (G == 0x80, R < 0x10) ────────────────────────────────────────────
  // Pixel: 0x0080TT where TT = item sub-type (ITEM_T.* values)
  if (r < 0x10 && g >= 0x75 && g <= 0x8A) {
    return { type: T.ITEM, itemType: b };
  }

  // Unknown — treat as floor (don't crash on unrecognised pixels)
  console.warn(`[Level] Unrecognised pixel rgb(${r},${g},${b}) — treating as floor`);
  return { type: T.FLOOR };
}

// ── Level class ───────────────────────────────────────────────────────────────

export class Level {
  /**
   * @param {number}   index     Level index (0-based)
   * @param {string}   url       URL of the 32×32 PNG file
   * @param {string}   [source]  'handcrafted' | 'rom-decoded'
   */
  constructor(index, url, source = 'handcrafted') {
    this.index  = index;
    this.url    = url;
    this.source = source;
    this.cols   = 32;
    this.rows   = 32;

    /** @type {Array<{type:number, monType?:number, itemType?:number, pwrType?:number}>} */
    this.grid = null;   // Set after load()

    /** Player spawn positions (may be multiple in multiplayer maps) */
    this.spawns = [];

    /** Exit tile positions */
    this.exits = [];

    /** Gate tile positions (need key to open) */
    this.gates = [];

    /** Generator positions (with monster type) */
    this.generators = [];
  }

  /**
   * Load and parse the level PNG.
   * @returns {Promise<Level>} Resolves with `this` when parsing is complete.
   */
  async load() {
    const img = await this._loadImage(this.url);
    this._parseImage(img);
    return this;
  }

  /**
   * @private
   */
  _loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => resolve(img);
      img.onerror = () => reject(new Error(`Cannot load level: ${url}`));
      img.src = url;
    });
  }

  /**
   * Parse the PNG image into the tile grid.
   * Uses an offscreen canvas to read pixel data.
   * @private
   */
  _parseImage(img) {
    // Validate image size — must be exactly 32×32
    if (img.width !== this.cols || img.height !== this.rows) {
      console.warn(
        `[Level ${this.index}] Expected ${this.cols}×${this.rows} but got ` +
        `${img.width}×${img.height}.  Will attempt to parse anyway.`
      );
    }

    const canvas = document.createElement('canvas');
    canvas.width  = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;

    this.grid       = [];
    this.spawns     = [];
    this.exits      = [];
    this.gates      = [];
    this.generators = [];

    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const i = (row * this.cols + col) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // Alpha channel is ignored — all tiles are fully opaque in the format

        const tile = classifyPixel(r, g, b);
        tile.col = col;
        tile.row = row;
        // World pixel position of this tile's top-left corner (16px per tile)
        tile.wx = col * CELL;
        tile.wy = row * CELL;

        this.grid.push(tile);

        // Build index lists for fast lookup
        switch (tile.type) {
          case T.SPAWN:
            this.spawns.push({ col, row });
            break;
          case T.EXIT:
          case T.EXIT_WARP4:
          case T.EXIT_WARP8:
            this.exits.push({ col, row, exitType: tile.type });
            break;
          case T.GATE_H:
          case T.GATE_V:
            this.gates.push({ col, row, gateType: tile.type, locked: true });
            break;
          case T.GENERATOR:
            this.generators.push({ col, row, monType: tile.monType });
            break;
        }
      }
    }

    // If no spawn found, place in top-left walkable cell as fallback
    if (this.spawns.length === 0) {
      console.warn(`[Level ${this.index}] No spawn tile found — using (1,1) fallback`);
      this.spawns.push({ col: 1, row: 1 });
    }

    console.log(
      `[Level ${this.index}] Parsed (${this.source}): ` +
      `${this.spawns.length} spawn, ${this.exits.length} exit, ` +
      `${this.gates.length} gate, ${this.generators.length} generator`
    );
  }

  // ── Tile accessors ──────────────────────────────────────────────────────────

  /**
   * Get the tile at (col, row).  Returns null if out of bounds.
   */
  tileAt(col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return null;
    return this.grid[row * this.cols + col];
  }

  /**
   * True if the tile at (col, row) blocks movement.
   * Walls and LOCKED gates block.  Unlocked gates are passable.
   */
  isBlocked(col, row) {
    const tile = this.tileAt(col, row);
    if (!tile) return true; // Out of bounds = blocked
    if (tile.type === T.WALL) return true;
    if ((tile.type === T.GATE_H || tile.type === T.GATE_V) && tile.locked) return true;
    return false;
  }

  /**
   * True if the tile blocks even ghosts (only stone walls; ghosts pass through gates).
   */
  isHardWall(col, row) {
    const tile = this.tileAt(col, row);
    return !tile || tile.type === T.WALL;
  }

  /**
   * Unlock a gate at the given position (player used a key).
   * Returns true if a gate was unlocked.
   */
  unlockGate(col, row) {
    const tile = this.tileAt(col, row);
    if (!tile) return false;
    if ((tile.type === T.GATE_H || tile.type === T.GATE_V) && tile.locked) {
      tile.locked = false;
      // Update the gates index
      const gi = this.gates.findIndex(g => g.col === col && g.row === row);
      if (gi >= 0) this.gates[gi].locked = false;
      return true;
    }
    return false;
  }

  /**
   * Convert world pixel position to tile (col, row).
   * Uses the centre of the entity for tile lookup.
   */
  worldToTile(wx, wy) {
    return {
      col: Math.floor(wx / CELL),
      row: Math.floor(wy / CELL),
    };
  }
}

// ── LevelLoader ───────────────────────────────────────────────────────────────
// Manages the full list of levels (trainer + ROM-decoded) and loads them on demand.

export const LevelLoader = {
  /** @type {Level[]} */
  levels: [],

  /**
   * Initialise with asset base path and the level manifest.
   * Call this once after Assets.load() completes.
   *
   * @param {string}      basePath        e.g. 'assets/'
   * @param {Object|null} romManifest     From assets/mazes/rom/manifest.json
   *                                      (null if ROM decoder hasn't been run)
   */
  init(basePath, romManifest) {
    this.levels = [];

    // ── ROM-decoded levels (the real game) ────────────────────────────────
    // 127 levels decoded directly from Gauntlet Rev 14 ROM binary.
    // Index 0 = level-001.png = real ROM Level 1.
    if (romManifest && romManifest.levels) {
      for (const entry of romManifest.levels) {
        const url = `${basePath}mazes/rom/${entry.file}`;
        const idx = this.levels.length;
        this.levels.push(new Level(idx, url, 'rom-decoded'));
      }
    } else {
      console.warn('[LevelLoader] No ROM levels available.  Run tools/rom-decoder.mjs.');
    }

    // ── Trainer / hand-crafted levels (legacy fallback) ───────────────────
    // Kept on the tail of the playlist so an unlikely 127-level run still
    // lands somewhere; not reached in normal play.
    const TRAINER_LEVELS = [
      'trainer-1.png', 'trainer-2.png', 'trainer-3.png',
      'trainer-4.png', 'trainer-5.png', 'trainer-6.png', 'trainer-7.png',
      'dungeon-1.png',  'dungeon-2.png',  'dungeon-3.png',  'dungeon-4.png',
      'dungeon-5.png',  'dungeon-6.png',  'dungeon-7.png',  'dungeon-8.png',
      'dungeon-9.png',  'dungeon-10.png',
    ];

    for (const file of TRAINER_LEVELS) {
      const url = `${basePath}mazes/${file}`;
      const idx = this.levels.length;
      this.levels.push(new Level(idx, url, 'handcrafted'));
    }

    console.log(`[LevelLoader] Total levels: ${this.levels.length}`);
  },

  /**
   * Load a specific level (by total index across trainer + ROM levels).
   * @param {number} index
   * @returns {Promise<Level>}
   */
  async loadLevel(index) {
    if (index < 0 || index >= this.levels.length) {
      throw new Error(`Level ${index} does not exist (max: ${this.levels.length - 1})`);
    }
    const level = this.levels[index];
    if (level.grid) return level; // Already loaded
    return level.load();
  },

  /** Total number of levels available */
  get count() { return this.levels.length; },
};
