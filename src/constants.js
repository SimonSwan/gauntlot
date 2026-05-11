/**
 * src/constants.js
 * ─────────────────────────────────────────────────────────────────────────────
 * ALL game constants for Gauntlet (1985) arcade recreation.
 *
 * Every value in this file is marked with its confidence level:
 *   CONFIRMED  – verified by direct ROM byte analysis or attract-screen data
 *   HYPOTHESIS – strong logical inference, not yet byte-verified from ROM
 *   PLACEHOLDER – unknown; using nearest reasonable value; MUST revisit
 *
 * Sources:
 *   ROM  = Atari Gauntlet Rev 14, MAME gauntlet.zip, CPU binary analysis
 *   ATT  = Attract-screen damage tables observed in MAME gameplay
 *   SPR  = mbeisser1/gauntlet_mame_gfx v1.1.0 sprite zip, pixel-measured
 *   VIS  = User visual inspection of Level 1 in ROM analysis tool
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ═══════════════════════════════════════════════════════════════════════════════
// HARDWARE FACTS  [source: ROM analysis, MAME driver gauntlet.cpp]
// ═══════════════════════════════════════════════════════════════════════════════

export const HW = Object.freeze({
  // Playfield tile size in ROM pixels  [CONFIRMED ROM]
  TILE_PX:          8,
  // Logical metatile = 2×2 hardware tiles = 16×16px  [CONFIRMED ROM]
  META_PX:          16,
  // Hardware playfield grid size  [CONFIRMED ROM]
  HW_COLS:          64,
  HW_ROWS:          64,
  // Logical grid size (what the level decoder produces)  [CONFIRMED ROM]
  GRID_COLS:        32,
  GRID_ROWS:        32,
  // Arcade monitor viewport in pixels  [CONFIRMED ROM/hardware docs]
  VIEWPORT_W:       336,
  VIEWPORT_H:       240,
  // CPU clock  [CONFIRMED MAME driver]
  CPU_HZ:           7_159_090,
  // Sprite (motion object) frame size in pixels  [CONFIRMED SPR - measured]
  SPRITE_PX:        24,
  // Item sprite frame size  [CONFIRMED SPR - measured]
  ITEM_PX:          16,
});

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER SETTINGS  (our canvas renderer, not ROM hardware)
// ═══════════════════════════════════════════════════════════════════════════════

export const RENDER = Object.freeze({
  // Pixels per logical tile on our canvas
  CELL:             16,
  // Canvas scale factor (applied via CSS transform for sharp pixels)
  SCALE:            3,
  // Tiles visible in viewport (ceil to avoid black edges)
  VIEW_COLS:        22,
  VIEW_ROWS:        16,
  // HUD height in canvas pixels
  HUD_H:            32,
  // Frames per second target
  FPS:              60,
  // MS per frame
  MS_PER_FRAME:     1000 / 60,
});

// ═══════════════════════════════════════════════════════════════════════════════
// TILE CODES  (from ROM $00C534 lookup table, 64 × 2-byte entries)
// ═══════════════════════════════════════════════════════════════════════════════
//
// The C534 table maps each of the 64 possible tile codes (0x00–0x3F) to a
// 2-byte "entity class" value.  Key values:
//   $0000 = floor / transparent
//   $8000 = permanent stone wall
//   $8001 = exit / door
//   anything else = ROM address of entity descriptor
//
// Level decoder: tileCode = headerParam & 0x3F

export const TILE = Object.freeze({
  // ── Terrain ─────────────────────────────────────────────────────────────
  FLOOR:            0x00, // C534=$0000  CONFIRMED
  WALL:             0x01, // C534=$8000  CONFIRMED – stone wall, permanent
  GATE_UNUSED:      0x02, // C534=$1E09  CONFIRMED – 0 placements in 125 levels
  GATE_H:           0x03, // C534=$9D3C  CONFIRMED – horizontal gate, VIS Level1 row21 col15
  GATE_V:           0x04, // C534=$9D7C  CONFIRMED – vertical gate,   VIS Level1 row31 col9
                          //   NOTE: $9D7C - $9D3C = $40.  The $40 bit IS the orientation
                          //   flag inside the entity descriptor.  This is a ROM-confirmed fact.

  // ── Player / level structure ─────────────────────────────────────────────
  SPAWN:            0x05, // C534=$1E0D  CONFIRMED – player spawn point
  EXIT:             0x06, // C534=$8001  CONFIRMED – standard exit, VIS Level1 row31 col1
  EXIT_WARP_4:      0x07, // C534=$8001  CONFIRMED – warp to level 4, VIS Level1 row31 col31
  EXIT_WARP_8:      0x08, // C534=$8001  CONFIRMED – warp to level 8, VIS Level1 row1  col31

  // ── Ghost sprites (enemy sprite, NOT a generator)  ───────────────────────
  //    C534 value $0800 = entity address in ROM.
  //    The 3 codes = 3 dungeon themes (same ghost, different colour palette).
  //    These are wandering enemies placed directly on the map, not spawned.
  //    Treated as ghost generators for gameplay (see entities.js).
  GHOST_L1:         0x09, // C534=$0800  CONFIRMED – ghost enemy tile
  GHOST_L2:         0x0A, // C534=$0809  HYPOTHESIS – theme 2
  GHOST_L3:         0x0B, // C534=$0812  HYPOTHESIS – theme 3

  // ── Generator group A  ($09E1, 3 dungeon themes)  ────────────────────────
  //    Monster type: PLACEHOLDER (not yet confirmed from ROM descriptor)
  GEN_A1:           0x0C, // PLACEHOLDER – using grunt as best guess
  GEN_A2:           0x0D,
  GEN_A3:           0x0E,

  // ── Generator group B  ($183F, 3 dungeon themes)  ────────────────────────
  GEN_B1:           0x0F, // PLACEHOLDER – using demon as best guess
  GEN_B2:           0x10,
  GEN_B3:           0x11,

  // ── Generator group C  ($1B57, avg 3/level = rare)  ─────────────────────
  GEN_C1:           0x12, // PLACEHOLDER – using sorcerer as best guess
  GEN_C2:           0x13,
  GEN_C3:           0x14,

  // ── Generator group D  ($13A2, 3 dungeon themes)  ────────────────────────
  GEN_D1:           0x15, // PLACEHOLDER
  GEN_D2:           0x16,
  GEN_D3:           0x17,

  // ── Unknown entity  ($1A75, 232× in 56 levels)  ──────────────────────────
  UNKNOWN_18:       0x18, // PLACEHOLDER – using death generator as best guess

  // ── Ghost generators  (CONFIRMED from ROM analysis)  ─────────────────────
  //    Skull-cage sprite.  L1/L2/L3 = 1/2/3 shots to destroy.
  GHOST_GEN_L1:     0x19, // C534=$09AB  CONFIRMED – VIS Level1 row27 col8
  GHOST_GEN_L2:     0x1A, // C534=$09B4  CONFIRMED – VIS Level1 row31 col17
  GHOST_GEN_L3:     0x1B, // C534=$09BD  HYPOTHESIS

  // ── Generator 4-theme × 3-frame block  ($1C–$27)  ────────────────────────
  //    12 codes = 4 dungeon themes × 3 animation states.
  //    All are the SAME entity type; the code selects which cage art to show.
  //    Monster types are PLACEHOLDER until ROM descriptor format decoded.
  GEN_BLK_A1:      0x1C, GEN_BLK_A2: 0x1D, GEN_BLK_A3: 0x1E, // theme A
  GEN_BLK_B1:      0x1F, GEN_BLK_B2: 0x20, GEN_BLK_B3: 0x21, // theme B
  GEN_BLK_C1:      0x22, GEN_BLK_C2: 0x23, GEN_BLK_C3: 0x24, // theme C
  GEN_BLK_D1:      0x25, GEN_BLK_D2: 0x26, GEN_BLK_D3: 0x27, // theme D

  // ── Items ─────────────────────────────────────────────────────────────────
  TREASURE_CHEST:   0x28, // C534=$0987  CONFIRMED – VIS Level1 row2  col10
  TREASURE_BAG:     0x29, // C534=$09A2  HYPOTHESIS
  GEN_DENSE:        0x2A, // C534=$0963  PLACEHOLDER – 555×/103 levels (most common gen code)
  FOOD_TURKEY:      0x2B, // C534=$096C  CONFIRMED – VIS Level1 row26 col31
  POTION_MAGIC:     0x2C, // C534=$88FC  CONFIRMED – VIS Level1 row1  col5
  POTION_INVIS:     0x2D, // C534=$89FC  HYPOTHESIS – 1× per 9 levels
  FOOD_JUG:         0x2E, // C534=unknown HYPOTHESIS – non-destructible food
  POWERUP_ARMOR:    0x2F, // C534=$91FC  HYPOTHESIS – appears in 1 level only
  POWERUP_SPEED:    0x30, // C534=$92FC  HYPOTHESIS
  POWERUP_MAGIC:    0x31, // C534=$93FC  HYPOTHESIS
  POWERUP_SHOT_POW: 0x32, // C534=$94FC  HYPOTHESIS
  POWERUP_SHOT_SPD: 0x33, // C534=$95FC  HYPOTHESIS
  POWERUP_FIGHT:    0x34, // C534=$96FC  HYPOTHESIS
  KEY:              0x35, // C534=$8AFC  CONFIRMED – VIS Level1 row31 col3

  // ── Wall alt tilesets  ───────────────────────────────────────────────────
  //    Different visual style, same gameplay behaviour as WALL.
  //    C534 value $8000 = wall flag.  CONFIRMED.
  WALL_ALT_A:       0x36,
  WALL_ALT_B:       0x37,
  WALL_ALT_C:       0x38,
  WALL_ALT_D:       0x39,

  // ── Exit alt tilesets  ───────────────────────────────────────────────────
  EXIT_ALT_A:       0x3A, // HYPOTHESIS
  EXIT_ALT_B:       0x3B, // HYPOTHESIS

  // ── Unused floor codes  ──────────────────────────────────────────────────
  //    C534 value $0000.  CONFIRMED (same as FLOOR).
  FLOOR_C:          0x3C,
  FLOOR_D:          0x3D,
  FLOOR_E:          0x3E,
  FLOOR_F:          0x3F,
});

// Tile sets by category (used by level parser and renderer)
export const WALL_CODES  = new Set([0x01, 0x36, 0x37, 0x38, 0x39]);  // CONFIRMED
export const EXIT_CODES  = new Set([0x06, 0x07, 0x08, 0x3A, 0x3B]);  // CONFIRMED
export const GATE_CODES  = new Set([0x03, 0x04]);                      // CONFIRMED
export const FLOOR_CODES = new Set([0x00, 0x3C, 0x3D, 0x3E, 0x3F]);  // CONFIRMED

// ═══════════════════════════════════════════════════════════════════════════════
// MONSTER TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export const MON = Object.freeze({
  GHOST:    0, // Wall-blocked like everything else; cannot fight, no shoot
  DEMON:    1, // CONFIRMED – fights + shoots projectiles
  GRUNT:    2, // CONFIRMED – fights only (walks through other grunts)
  SORCERER: 3, // CONFIRMED – fights only (can pass through walls? HYPOTHESIS)
  LOBBER:   4, // CONFIRMED – lobs arcing projectile only, doesn't fight
  DEATH:    5, // CONFIRMED – neither fights nor shoots, pure HP drain on contact
  THIEF:    6, // CONFIRMED – fights, steals items from players
});

// Monster name strings (for HUD messages)
export const MON_NAME = ['Ghost', 'Demon', 'Grunt', 'Sorcerer', 'Lobber', 'Death', 'Thief'];

// ═══════════════════════════════════════════════════════════════════════════════
// DAMAGE VALUES  [source: ATT – attract-screen damage tables in MAME gameplay]
// ═══════════════════════════════════════════════════════════════════════════════
//
// Monster "level" (L1/L2/L3) is set by the generator that spawned them.
// Ghost levels map to: generator tile $19=L1, $1A=L2, $1B=L3.
//
// Damage per HIT (one contact frame):

export const DMG = Object.freeze({
  // Melee damage per hit  [ATT CONFIRMED]
  GHOST:    [10, 20, 30],   // L1/L2/L3.  Ghost cannot be fought back!
  GRUNT:    [ 5,  8, 10],   // CONFIRMED
  DEMON:    [ 5,  8, 10],   // CONFIRMED (melee component only)
  SORCERER: [ 5,  8, 10],   // CONFIRMED
  DEATH:    [200, 200, 200], // CONFIRMED "up to 200" – only magic kills Death
  THIEF:    [10, 10, 10],   // CONFIRMED

  // Projectile damage  [ATT CONFIRMED]
  DEMON_SHOT:   [10, 10, 10], // CONFIRMED – same all levels
  LOBBER_SHOT:  [ 3,  3,  3], // CONFIRMED – same all levels

  // Shots required to KILL a monster  [ATT CONFIRMED]
  // Indexed by monster level (0=L1, 1=L2, 2=L3)
  SHOTS_TO_KILL: [1, 2, 3],  // CONFIRMED – L1=1shot, L2=2shots, L3=3shots

  // Shots required to DESTROY a generator  [PLACEHOLDER]
  GEN_HP: [5, 10, 15],       // PLACEHOLDER – exact value not ROM-confirmed

  // Player shot base damage  [HYPOTHESIS]
  PLAYER_SHOT: 100,           // HYPOTHESIS – one-shots L1, two-shots L2, etc.

  // Coin gives this much HP  [ATT CONFIRMED]
  COIN_HP: 2000,              // CONFIRMED – "1 coin = 2000 health"

  // Food HP values  [HYPOTHESIS]
  FOOD_HP: 200,               // HYPOTHESIS

  // Magic potion effect radius in tiles  [PLACEHOLDER]
  MAGIC_RADIUS: 6,            // PLACEHOLDER
});

// ═══════════════════════════════════════════════════════════════════════════════
// TIMING  [HYPOTHESIS unless marked otherwise]
// ═══════════════════════════════════════════════════════════════════════════════

export const TIME = Object.freeze({
  // Passive HP drain: 1 HP every 0.5 seconds  [HYPOTHESIS – matches js-gauntlet]
  HEALTH_DRAIN_PER_SEC: 2,    // HP lost per second

  // Starting HP  [HYPOTHESIS]
  PLAYER_START_HP: 2000,

  // Invulnerability frames after taking damage  [HYPOTHESIS]
  INVULN_MS: 500,

  // Generator spawn interval (ms)  [PLACEHOLDER]
  GEN_SPAWN_INTERVAL_MS: 3000,

  // Max monsters spawned by one generator before it stops  [PLACEHOLDER]
  GEN_MAX_SPAWN: 99,

  // Monster walk speed in pixels per second  [PLACEHOLDER]
  GHOST_SPEED_PX:    48,  // Ghosts are wall-blocked like every other monster
  GRUNT_SPEED_PX:    40,
  DEMON_SPEED_PX:    44,
  SORCERER_SPEED_PX: 36,
  LOBBER_SPEED_PX:   32,
  DEATH_SPEED_PX:    28,  // Slow but dangerous
  THIEF_SPEED_PX:    96,  // Very fast

  // Player walk speed in pixels per second  [PLACEHOLDER]
  PLAYER_SPEED_PX:   80,

  // Projectile speed in pixels per second  [PLACEHOLDER]
  PLAYER_SHOT_SPEED: 200,
  DEMON_SHOT_SPEED:  120,
  LOBBER_PEAK_HEIGHT: 40, // Lobber arc peak in pixels  [PLACEHOLDER]

  // Animation frame duration in ms  [PLACEHOLDER]
  ANIM_FRAME_MS: 100,     // 10fps animation
});

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER / HERO DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════
//
// Sprite sheet sizes CONFIRMED by pixel measurement of mbeisser1 v1.1.0 zip.
// Stat multipliers PLACEHOLDER (relative values, not ROM-confirmed).
// Direction row layout in sprite sheets: HYPOTHESIS based on standard arcade
// conventions.  Rows 0-7 = S, SW, W, NW, N, NE, E, SE.

export const HEROES = Object.freeze([
  {
    id:         'warrior',
    name:       'Thor the Warrior',
    desc:       'Maximum fighting power, average shot power.',
    color:      '#4488ff',    // HUD/nameplate colour
    // Main walk/fight sprite sheet  [SPR CONFIRMED dimensions]
    sheet:      'sprites/player-warrior-sprite-sheet.png',
    sheetW:     216, sheetH: 192,  // 9 cols × 8 rows × 24px
    frameCols:  9,   frameRows: 8, frameSize: 24,
    // Weapon/shot sprite sheet  [SPR CONFIRMED dimensions]
    weapSheet:  'sprites/player-warrior-weapon-sprite-sheet.png',
    weapW:      256, weapH: 16,    // 16 frames × 16px
    weapCols:   16,  weapSize: 16,
    // Victory/exit animation  [SPR CONFIRMED dimensions]
    exitSheet:  'sprites/player-warrior-exit-sprite-sheet.png',
    exitW:      144, exitH: 24,    // 6 frames × 24px
    exitCols:   6,
    // Stat multipliers (1.0 = baseline)  [PLACEHOLDER]
    shotPower:  1.0,
    shotSpeed:  1.0,
    moveSpeed:  1.0,
    armour:     1.0,   // Warrior has good armour
    magic:      1.0,
    fight:      1.5,   // Best fighter
  },
  {
    id:         'valkyrie',
    name:       'Thyra the Valkyrie',
    desc:       'Maximum armour, excellent fighting power.',
    color:      '#ff8844',
    sheet:      'sprites/player-valkyrie-sprite-sheet.png',
    sheetW:     216, sheetH: 192,  // 9×8×24  [SPR CONFIRMED]
    frameCols:  9,   frameRows: 8, frameSize: 24,
    weapSheet:  'sprites/player-valkyrie-weapon-sprite-sheet.png',
    weapW:      128, weapH: 16,    // 8×16   [SPR CONFIRMED]
    weapCols:   8,   weapSize: 16,
    exitSheet:  'sprites/player-valkyrie-exit-sprite-sheet.png',
    exitW:      168, exitH: 24,    // 7×24   [SPR CONFIRMED]
    exitCols:   7,
    shotPower:  0.75, // PLACEHOLDER
    shotSpeed:  0.75, // PLACEHOLDER
    moveSpeed:  0.9,  // PLACEHOLDER
    armour:     1.5,  // Best armour  PLACEHOLDER
    magic:      0.75, // PLACEHOLDER
    fight:      1.25, // PLACEHOLDER
  },
  {
    id:         'elf',
    name:       'Questor the Elf',
    desc:       'Maximum shot and magic power, fastest movement.',
    color:      '#44ff44',
    sheet:      'sprites/player-elf-sprite-sheet.png',
    sheetW:     192, sheetH: 192,  // 8×8×24  [SPR CONFIRMED]
    frameCols:  8,   frameRows: 8, frameSize: 24,
    weapSheet:  'sprites/player-elf-weapon-sprite-sheet.png',
    weapW:      128, weapH: 16,    // 8×16  [SPR CONFIRMED]
    weapCols:   8,   weapSize: 16,
    exitSheet:  'sprites/player-elf-exit-sprite-sheet.png',
    exitW:      168, exitH: 24,    // 7×24  [SPR CONFIRMED]
    exitCols:   7,
    shotPower:  1.0,  // PLACEHOLDER
    shotSpeed:  1.5,  // Best shot speed  PLACEHOLDER
    moveSpeed:  1.25, // Fastest  PLACEHOLDER
    armour:     0.75, // Weakest armour  PLACEHOLDER
    magic:      1.5,  // Best magic  PLACEHOLDER
    fight:      0.75, // PLACEHOLDER
  },
  {
    id:         'wizard',
    name:       'Merlin the Wizard',
    desc:       'Maximum magic power, weakest in combat.',
    color:      '#ff44ff',
    sheet:      'sprites/player-wizard-sprite-sheet.png',
    sheetW:     144, sheetH: 192,  // 6×8×24  [SPR CONFIRMED]
    frameCols:  6,   frameRows: 8, frameSize: 24,
    weapSheet:  'sprites/player-wizard-weapon-sprite-sheet.png',
    weapW:      128, weapH: 32,    // 8×16 in 2 rows  [SPR CONFIRMED]
    weapCols:   8,   weapSize: 16,
    exitSheet:  'sprites/player-wizard-exit-sprite-sheet.png',
    exitW:      144, exitH: 24,    // 6×24  [SPR CONFIRMED]
    exitCols:   6,
    shotPower:  0.5,  // PLACEHOLDER
    shotSpeed:  1.0,  // PLACEHOLDER
    moveSpeed:  0.75, // Slowest  PLACEHOLDER
    armour:     0.5,  // Weakest  PLACEHOLDER
    magic:      2.0,  // Best magic  PLACEHOLDER
    fight:      0.5,  // PLACEHOLDER
  },
]);

// ═══════════════════════════════════════════════════════════════════════════════
// MONSTER SPRITE SHEETS  [SPR CONFIRMED dimensions]
// ═══════════════════════════════════════════════════════════════════════════════
//
// Each monster has 3 variants (dungeon themes 1/2/3 = different colour palettes).
// Frame grid: HYPOTHESIS layout (8 directions × N frames per direction).
//   Row 0 = South, Row 1 = SW, Row 2 = West, Row 3 = NW,
//   Row 4 = North, Row 5 = NE, Row 6 = East, Row 7 = SE.
//
// For 4-directional gameplay: use rows 0 (S), 2 (W), 4 (N), 6 (E).

export const MON_SPRITES = Object.freeze({
  [MON.GHOST]: {
    sheets:     ['sprites/monster-ghost1-sprite-sheet.png',
                 'sprites/monster-ghost2-sprite-sheet.png',
                 'sprites/monster-ghost3-sprite-sheet.png'],
    sheetW: 96, sheetH: 192,  // CONFIRMED
    cols: 4, rows: 8, size: 24, // 4 frames × 8 directions
  },
  [MON.GRUNT]: {
    sheets:     ['sprites/monster-grunt1-sprite-sheet.png',
                 'sprites/monster-grunt2-sprite-sheet.png',
                 'sprites/monster-grunt3-sprite-sheet.png'],
    altSheets:  ['sprites/monster-grunt1-alt-sprite-sheet.png',
                 'sprites/monster-grunt2-alt-sprite-sheet.png',
                 'sprites/monster-grunt3-alt-sprite-sheet.png'],
    sheetW: 120, sheetH: 192,    // CONFIRMED (main)
    altW:   144, altH:   192,    // CONFIRMED (alt = 6 cols vs 5)
    cols: 5, rows: 8, size: 24,
    altCols: 6,
  },
  [MON.DEMON]: {
    sheets:     ['sprites/monster-demon1-sprite-sheet.png',
                 'sprites/monster-demon2-sprite-sheet.png',
                 'sprites/monster-demon3-sprite-sheet.png'],
    sheetW: 192, sheetH: 192,  // CONFIRMED (8×8)
    cols: 8, rows: 8, size: 24,
  },
  [MON.SORCERER]: {
    sheets:     ['sprites/monster-sorcerer1-sprite-sheet.png',
                 'sprites/monster-sorcerer2-sprite-sheet.png',
                 'sprites/monster-sorcerer3-sprite-sheet.png'],
    sheetW: 144, sheetH: 192,  // CONFIRMED (6×8)
    cols: 6, rows: 8, size: 24,
  },
  [MON.LOBBER]: {
    sheets:     ['sprites/monster-lobber1-sprite-sheet.png',
                 'sprites/monster-lobber2-sprite-sheet.png',
                 'sprites/monster-lobber3-sprite-sheet.png'],
    sheetW: 120, sheetH: 128,  // CONFIRMED (5×5+partial rows)
    cols: 5, rows: 5, size: 24,
    // Lobber explosion  [SPR CONFIRMED]
    explSheet:  'sprites/monster-lobber-exlosion-sprite-sheet.png',
    explW: 48, explH: 16, explCols: 3, explSize: 16,
  },
  [MON.DEATH]: {
    sheets:     ['sprites/monster-death.png'],  // Only 1 theme (Death is unique)
    sheetW: 72, sheetH: 192,   // CONFIRMED (3×8)
    cols: 3, rows: 8, size: 24,
  },
  [MON.THIEF]: {
    sheets:     ['sprites/monster-thief-sprite-sheet.png'], // Only 1 theme
    sheetW: 216, sheetH: 192,  // CONFIRMED (9×8)
    cols: 9, rows: 8, size: 24,
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// GENERATOR SPRITE SHEETS  [SPR CONFIRMED dimensions]
// ═══════════════════════════════════════════════════════════════════════════════
//
// Each generator has 3 frames (cols 0/1/2) selecting L1/L2/L3 difficulty.
// Ghost generators use a skull-cage sprite; all others use a stone-cage sprite.

export const GEN_SPRITES = Object.freeze({
  ghost: {
    sheet:   'sprites/monster-ghost-generator.png',
    sheetW:  72, sheetH: 24,   // CONFIRMED 72×24 = 3 frames × 24px
    cols: 3, rows: 1, size: 24,
  },
  // All non-ghost monster types use this stone cage:
  default: {
    sheet:   'sprites/monster-monster-generator.png',
    sheetW:  72, sheetH: 24,   // CONFIRMED 72×24 = 3 frames × 24px
    cols: 3, rows: 1, size: 24,
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// ITEM SPRITES  [SPR CONFIRMED unless marked otherwise]
// ═══════════════════════════════════════════════════════════════════════════════

export const ITEM_SPRITES = Object.freeze({
  // Exits  [CONFIRMED]
  exit:             { file: 'sprites/dungeon-exit.png',              w:16, h:16, frames:1 },
  exit_to_4:        { file: 'sprites/dungeon-exit-to-4.png',         w:16, h:16, frames:1 },
  exit_to_8:        { file: 'sprites/dungeon-exit-to-8.png',         w:16, h:16, frames:1 },
  // Gate sprites – extracted from all-monster.png row 2 right section
  // CONFIRMED: these are bar-grate graphics, NOT stone wall tiles
  gate_horizontal:  { file: 'sprites/gate-horizontal.png',           w:29, h:66, frames:1 },
  gate_vertical:    { file: 'sprites/gate-vertical.png',             w:12, h:161, frames:1 },
  // Keys  [CONFIRMED]
  key:              { file: 'sprites/dungeon-key.png',               w:16, h:16, frames:1 },
  keyring:          { file: 'sprites/dungeon-keyring.png',           w:24, h:16, frames:1 },
  // Food  [CONFIRMED food_turkey via VIS]
  food_turkey:      { file: 'sprites/dungeon-food-turkey.png',       w:24, h:24, frames:1 },
  food_drumstick:   { file: 'sprites/dungeon-food-drumstick.png',    w:24, h:24, frames:1 },
  food_ham:         { file: 'sprites/dungeon-food-ham.png',          w:24, h:24, frames:1 },
  food_jug:         { file: 'sprites/dungeon-food-jug.png',          w:24, h:24, frames:1 },
  // Potions  [CONFIRMED potion_blue via VIS]
  potion_blue:      { file: 'sprites/dungeon-potion-blue.png',       w:16, h:16, frames:1 },
  potion_orange:    { file: 'sprites/dungeon-potion-orange.png',     w:16, h:16, frames:1 },
  invisibility:     { file: 'sprites/dungeon-limited-invisibility.png', w:24, h:24, frames:1 },
  // Power-ups  [HYPOTHESIS]
  plus_armor:       { file: 'sprites/dungeon-potion-extra-armor.png',      w:16, h:16, frames:1 },
  plus_speed:       { file: 'sprites/dungeon-potion-extra-speed.png',      w:16, h:16, frames:1 },
  plus_magic:       { file: 'sprites/dungeon-potion-extra-magic.png',      w:16, h:16, frames:1 },
  plus_shot_pow:    { file: 'sprites/dungeon-potion-extra-shot-power.png', w:16, h:16, frames:1 },
  plus_shot_spd:    { file: 'sprites/dungeon-potion-extra-shot-speed.png', w:16, h:16, frames:1 },
  plus_fight:       { file: 'sprites/dungeon-potion-weapon.png',           w:16, h:16, frames:1 },
  // Treasure  [CONFIRMED treasure_chest via VIS]
  treasure_chest:   { file: 'sprites/dungeon-treasure-chest-sprite-sheet.png', w:72, h:24, frames:3 },
  treasure_bag:     { file: 'sprites/dungeon-treasure-bag.png',       w:24, h:24, frames:1 },
  // Effects
  spawn:            { file: 'sprites/player-spawn-sprite-sheet.png', w:168, h:24, frames:7 },
  teleport:         { file: 'sprites/dungeon-teleport-sprite-sheet.png', w:96, h:16, frames:6 },
  explosion:        { file: 'sprites/explosion-collision-sprite-sheet.png', w:48, h:16, frames:3 },
  explosion_teleport:{ file:'sprites/explosion-teleport-sprite-sheet.png', w:144, h:24, frames:6 },
  // HUD icons
  icon_key:         { file: 'sprites/icon-key.png',      w:8, h:8, frames:1 },
  icon_potion:      { file: 'sprites/icon-potion.png',   w:8, h:8, frames:1 },
  icon_upgrades:    { file: 'sprites/icon-upgrades.png', w:48, h:8, frames:6 },
  // Title screen
  text_gauntlet:    { file: 'sprites/text-gauntlet.png', w:80, h:24, frames:1 },
  text_points:      { file: 'sprites/text-points.png',   w:24, h:80, frames:1 },
});

// ═══════════════════════════════════════════════════════════════════════════════
// TILE CODE → ITEM SPRITE KEY  (for level renderer)
// ═══════════════════════════════════════════════════════════════════════════════
//
// This table is what the renderer looks up to know which sprite to draw for
// each tile code.  Walls have no entry (rendered as colour-fill only — wall
// tile graphics require chars ROM decode which is not yet complete).

export const TILE_SPRITE = Object.freeze({
  [TILE.SPAWN]:           'spawn',
  [TILE.EXIT]:            'exit',            // CONFIRMED
  [TILE.EXIT_WARP_4]:     'exit_to_4',       // CONFIRMED
  [TILE.EXIT_WARP_8]:     'exit_to_8',       // CONFIRMED
  [TILE.EXIT_ALT_A]:      'exit',
  [TILE.EXIT_ALT_B]:      'exit',
  [TILE.GATE_H]:          'gate_horizontal', // CONFIRMED
  [TILE.GATE_V]:          'gate_vertical',   // CONFIRMED
  [TILE.KEY]:             'key',             // CONFIRMED
  [TILE.FOOD_TURKEY]:     'food_turkey',     // CONFIRMED
  [TILE.FOOD_JUG]:        'food_jug',
  [TILE.POTION_MAGIC]:    'potion_blue',     // CONFIRMED
  [TILE.POTION_INVIS]:    'invisibility',
  [TILE.TREASURE_CHEST]:  'treasure_chest',  // CONFIRMED
  [TILE.TREASURE_BAG]:    'treasure_bag',
  [TILE.POWERUP_ARMOR]:   'plus_armor',
  [TILE.POWERUP_SPEED]:   'plus_speed',
  [TILE.POWERUP_MAGIC]:   'plus_magic',
  [TILE.POWERUP_SHOT_POW]:'plus_shot_pow',
  [TILE.POWERUP_SHOT_SPD]:'plus_shot_spd',
  [TILE.POWERUP_FIGHT]:   'plus_fight',
});

// ═══════════════════════════════════════════════════════════════════════════════
// LEVEL PNG PIXEL FORMAT  (one pixel per tile, 32×32 image = one level)
// ═══════════════════════════════════════════════════════════════════════════════
//
// This format is used for BOTH the original javascript-gauntlet levels (17
// hand-crafted) AND the ROM-decoded levels from tools/rom-decoder.mjs.
// The ROM decoder outputs PNGs in this exact format.
//
// Pixel value   = 0xRRGGBB (24-bit, ignoring alpha)
// Classification is done by RANGES not exact values (see level.js classifyPixel).

export const PIXEL = Object.freeze({
  FLOOR:           0x000000, // Pure black = floor / nothing
  WALL:            0x404040, // Dark grey = stone wall
  GATE_H:          0xC0C000, // Yellow = horizontal gate  [CONFIRMED $03]
  GATE_V:          0xC0C040, // Yellow + blue tint = vertical gate  [CONFIRMED $04]
                             //   The $40 in blue channel encodes orientation
                             //   (mirrors the $40 bit difference in ROM C534 addresses)
  SPAWN:           0x00F000, // Bright green = player spawn  [CONFIRMED $05]
  EXIT:            0x004000, // Dark green = exit  [CONFIRMED $06]
  EXIT_WARP_4:     0x004010, // Dark green + low blue = warp to 4  [CONFIRMED $07]
  EXIT_WARP_8:     0x004020, // Dark green + medium blue = warp to 8  [CONFIRMED $08]
  // Generators: high red byte = generator, low bytes = monster type + subtype
  // 0xF0TTYY where TT = monster type (MON.*), YY = level subtype
  GEN_BASE:        0xF00000, // Base generator colour (red = generator class)
  // Items: 0x008000 range = items
  // 0x0080YY where YY = item sub-type
  ITEM_BASE:       0x008000,
  // Power-ups: 0x00E0YY
  POWERUP_BASE:    0x00E000,
  // Invisibility: 0x00D0YY (distinguished from items by D0 vs 80)
  INVIS_BASE:      0x00D000,
});

// Ranges for pixel classification (anything between BASE and BASE+0xFF)
export const PIX_RANGE = Object.freeze({
  // Pixels with R >= 0xE0 and G < 0x10 = generators
  isGenerator: (r, g, b) => r >= 0xE0 && g < 0x10,
  // Pixels with G == 0x80 = items
  isItem:      (r, g, b) => r < 0x10 && g === 0x80,
  // Pixels with G == 0xE0 = power-ups
  isPowerup:   (r, g, b) => r < 0x10 && g === 0xE0,
  // Pixels with G == 0xD0 = invisibility
  isInvis:     (r, g, b) => r < 0x10 && g === 0xD0,
  // Wall: grey (equal R/G/B in 0x30–0x60 range)
  isWall:      (r, g, b) => r >= 0x30 && r <= 0x60 && Math.abs(r-g) < 10 && Math.abs(g-b) < 10,
  // Spawn: bright green (G >= 0xE0, R < 0x10)
  isSpawn:     (r, g, b) => r < 0x10 && g >= 0xE0 && b < 0x10,
  // Exit: dark green (G in 0x30–0x50, R < 0x10)
  isExit:      (r, g, b) => r < 0x10 && g >= 0x30 && g <= 0x50,
  // Gate: yellow (R ~= G ~= 0xC0, B < 0x60)
  isGate:      (r, g, b) => r >= 0xA0 && g >= 0xA0 && b < 0x60 && Math.abs(r-g) < 0x20,
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCORING  [PLACEHOLDER – exact values not ROM-confirmed]
// ═══════════════════════════════════════════════════════════════════════════════

export const SCORE = Object.freeze({
  KILL_GHOST:     100,   // PLACEHOLDER
  KILL_GRUNT:     100,
  KILL_DEMON:     200,
  KILL_SORCERER:  200,
  KILL_LOBBER:    200,
  KILL_DEATH:     1000,  // Death is hard to kill
  KILL_THIEF:     500,
  DESTROY_GEN:    250,
  COLLECT_FOOD:   100,
  COLLECT_CHEST:  500,
  COLLECT_BAG:    200,
  COLLECT_KEY:    0,     // Keys have no score value directly
  COLLECT_POTION: 0,
  EXIT_BONUS:     1000,  // Per level
});

// ═══════════════════════════════════════════════════════════════════════════════
// DIRECTION SYSTEM  (used by movement, animation, and AI)
// ═══════════════════════════════════════════════════════════════════════════════
//
// 8 directions, 0 = South (facing toward player at screen start).
// This maps to sprite sheet row ordering (HYPOTHESIS based on arcade convention).

// Sprite-sheet row order — CLOCKWISE FROM NORTH per the user's direct
// inspection of player-warrior-sprite-sheet.png:
//   row 0 = N (moving UP, axe held up)
//   row 2 = E (moving RIGHT, right-facing profile)
//   row 4 = S (moving DOWN, facing toward viewer)
//   row 6 = W (moving LEFT, left-facing profile)
// All other sheets (players + monsters) use the same row order.
export const DIR = Object.freeze({
  N:  0, NE: 1, E:  2, SE: 3,
  S:  4, SW: 5, W:  6, NW: 7,
});

// Direction → velocity vector (normalised ±1).  Index = DIR.* value.
export const DIR_VEC = [
  { dx:  0, dy: -1 },  // 0 N  (up)
  { dx:  1, dy: -1 },  // 1 NE
  { dx:  1, dy:  0 },  // 2 E  (right)
  { dx:  1, dy:  1 },  // 3 SE
  { dx:  0, dy:  1 },  // 4 S  (down)
  { dx: -1, dy:  1 },  // 5 SW
  { dx: -1, dy:  0 },  // 6 W  (left)
  { dx: -1, dy: -1 },  // 7 NW
];

// 4 cardinal directions for player movement
export const CARDINAL = [DIR.S, DIR.W, DIR.N, DIR.E];

// ═══════════════════════════════════════════════════════════════════════════════
// CONTROLS  (keyboard mapping, 4 players)
// ═══════════════════════════════════════════════════════════════════════════════

export const KEYS = Object.freeze([
  // Player 1: WASD + G (shoot) + H (magic)
  { up:'KeyW', down:'KeyS', left:'KeyA', right:'KeyD', shoot:'KeyG', magic:'KeyH' },
  // Player 2: IJKL + ; (shoot) + ' (magic)
  { up:'KeyI', down:'KeyK', left:'KeyJ', right:'KeyL', shoot:'Semicolon', magic:'Quote' },
  // Player 3: Arrow keys + . (shoot) + , (magic)
  { up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight', shoot:'Period', magic:'Comma' },
  // Player 4: Numpad 8/2/4/6 + 0 (shoot) + Enter (magic)
  { up:'Numpad8', down:'Numpad2', left:'Numpad4', right:'Numpad6', shoot:'Numpad0', magic:'NumpadEnter' },
]);

// ═══════════════════════════════════════════════════════════════════════════════
// PALETTE  (colours used when sprite not available)
// ═══════════════════════════════════════════════════════════════════════════════

export const PALETTE = Object.freeze({
  floor:       '#111111',
  wall:        '#8b5a00',  // Orange-brown — placeholder for decoded stone tile
  gate:        '#6666cc',  // Blue — gates (backup if sprite not loaded)
  spawn:       '#00aa00',
  exit:        '#004400',
  ghost_gen:   '#444466',
  monster_gen: '#664422',
  item:        '#ffff44',
  hud_bg:      '#000000',
  hud_text:    '#ffff00',
  health_hi:   '#00ff00',
  health_lo:   '#ff0000',
  p1:          '#4488ff',
  p2:          '#ff8844',
  p3:          '#44ff44',
  p4:          '#ff44ff',
});
