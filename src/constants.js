/**
 * src/constants.js  —  Gauntlet (1985) Arcade-Faithful Constants
 *
 * All values verified against original ROM via:
 *   - ROM reverse-engineering (CPU binary analysis, $00C534 lookup table)
 *   - Attract-screen gameplay data (damage tables, enemy behaviour)
 *   - User visual inspection of Level 1, Rev 14 ROM
 *
 * CONFIDENCE legend throughout this file:
 *   CONFIRMED  = directly verified from ROM or attract-screen data
 *   HYPOTHESIS = strong inference, not yet byte-verified
 *   PLACEHOLDER= unknown, using closest reasonable value
 *
 * NOTE on file layout: the top half is the upstream "ROM spec" exports
 * (TILE-codes / MON / DAMAGE / HEROES / sprite manifests / new PIXEL codes).
 * The bottom half re-exports the engine-side runtime constants the existing
 * src/{level,player,entities,render,game}.js files have always relied on —
 * direction tables, slide order, collision boxes, behaviour stats, etc. —
 * because the upstream spec didn't include them.
 */

// ── Tile codes (ROM $00C534 lookup table, 64 entries) ─────────────────────────
// Raw tile codes in the 32x32 level grid decoded from ROM. Level PNG pixels map
// to these codes — see tools/rom-decoder.mjs for mapping.
export const TILE = Object.freeze({
  FLOOR:              0x00, // C534 value $0000  CONFIRMED
  WALL:               0x01, // C534 value $8000  CONFIRMED (stone wall, permanent)
  GATE_UNUSED:        0x02, // C534 value $1E09  CONFIRMED (0 placements in 125 levels)
  GATE_H:             0x03, // C534 value $9D3C  CONFIRMED horizontal gate row21 col15 Level 1
  GATE_V:             0x04, // C534 value $9D7C  CONFIRMED vertical gate   row31 col9  Level 1
  // $9D7C - $9D3C = $40: the $40 bit is the orientation flag in the entity descriptor
  SPAWN:              0x05, // C534 value $1E0D  CONFIRMED player spawn point
  EXIT:               0x06, // C534 value $8001  CONFIRMED exit row31 col1 Level 1
  EXIT_WARP_4:        0x07, // C534 value $8001  CONFIRMED exit to level 4 row31 col31
  EXIT_WARP_8:        0x08, // C534 value $8001  CONFIRMED exit to level 8 row1  col31
  GHOST_SPRITE:       0x09, // C534 value $0800  CONFIRMED ghost enemy (not generator)
  GHOST_SPRITE_L2:    0x0A, // C534 value $0809  HYPOTHESIS (3 dungeon themes)
  GHOST_SPRITE_L3:    0x0B, // C534 value $0812  HYPOTHESIS
  GEN_A1:             0x0C, // C534 value $09E1  PLACEHOLDER type unconfirmed, theme A
  GEN_A2:             0x0D, //                   PLACEHOLDER theme B
  GEN_A3:             0x0E, //                   PLACEHOLDER theme C
  GEN_B1:             0x0F, // C534 value $183F  PLACEHOLDER type unconfirmed
  GEN_B2:             0x10, //                   PLACEHOLDER
  GEN_B3:             0x11, //                   PLACEHOLDER
  GEN_C1:             0x12, // C534 value $1B57  PLACEHOLDER avg 3/level (rare)
  GEN_C2:             0x13, //                   PLACEHOLDER
  GEN_C3:             0x14, //                   PLACEHOLDER
  GEN_D1:             0x15, // C534 value $13A2  PLACEHOLDER
  GEN_D2:             0x16, //                   PLACEHOLDER
  GEN_D3:             0x17, //                   PLACEHOLDER
  DEATH_GEN:          0x18, // C534 value $1A75  PLACEHOLDER (232×/56 levels)
  GHOST_GEN_L1:       0x19, // C534 value $09AB  CONFIRMED ghost generator L1 row27 col8
  GHOST_GEN_L2:       0x1A, // C534 value $09B4  CONFIRMED ghost generator L2 row31 col17
  GHOST_GEN_L3:       0x1B, // C534 value $09BD  HYPOTHESIS ghost generator L3
  GEN_BLOCK_A1:       0x1C, // 4-theme × 3-frame block, theme A frame 1  PLACEHOLDER
  GEN_BLOCK_A2:       0x1D,
  GEN_BLOCK_A3:       0x1E,
  GEN_BLOCK_B1:       0x1F, // theme B frame 1  PLACEHOLDER
  GEN_BLOCK_B2:       0x20,
  GEN_BLOCK_B3:       0x21,
  GEN_BLOCK_C1:       0x22, // theme C frame 1  PLACEHOLDER
  GEN_BLOCK_C2:       0x23,
  GEN_BLOCK_C3:       0x24,
  GEN_BLOCK_D1:       0x25, // theme D frame 1  PLACEHOLDER
  GEN_BLOCK_D2:       0x26,
  GEN_BLOCK_D3:       0x27,
  TREASURE_CHEST:     0x28, // C534 value $0987  CONFIRMED row2 col10 Level 1
  TREASURE_BAG:       0x29, // C534 value $09A2  HYPOTHESIS
  GEN_DENSE:          0x2A, // C534 value $0963  PLACEHOLDER (555×/103 levels, very common)
  FOOD_TURKEY:        0x2B, // C534 value $096C  CONFIRMED row26 col31 Level 1
  POTION_MAGIC:       0x2C, // C534 value $88FC  CONFIRMED magic potion row1 col5 Level 1
  POTION_INVIS:       0x2D, // C534 value $89FC  HYPOTHESIS invisibility (1×/9 levels)
  FOOD_JUG:           0x2E, // C534 value $?     HYPOTHESIS non-destructible food
  POWERUP_ARMOR:      0x2F, // C534 value $91FC  HYPOTHESIS +Armor (1 level only)
  POWERUP_SPEED:      0x30, // C534 value $92FC  HYPOTHESIS +Speed
  POWERUP_MAGIC:      0x31, // C534 value $93FC  HYPOTHESIS +Magic Power
  POWERUP_SHOT_POW:   0x32, // C534 value $94FC  HYPOTHESIS +Shot Power
  POWERUP_SHOT_SPD:   0x33, // C534 value $95FC  HYPOTHESIS +Shot Speed
  POWERUP_FIGHT:      0x34, // C534 value $96FC  HYPOTHESIS +Fight Power
  KEY:                0x35, // C534 value $8AFC  CONFIRMED row31 col3 Level 1
  WALL_ALT_A:         0x36, // C534 value $8000  CONFIRMED ($8000 flag = wall)
  WALL_ALT_B:         0x37, // C534 value $8000  CONFIRMED
  WALL_ALT_C:         0x38, // C534 value $8000  CONFIRMED
  WALL_ALT_D:         0x39, // C534 value $8000  CONFIRMED
  EXIT_ALT_A:         0x3A, // C534 value $8001  HYPOTHESIS exit alt tileset
  EXIT_ALT_B:         0x3B, // C534 value $8001  HYPOTHESIS
  FLOOR_UNUSED_C:     0x3C, // C534 value $0000  CONFIRMED (unused, treated as floor)
  FLOOR_UNUSED_D:     0x3D, // C534 value $0000  CONFIRMED
  FLOOR_UNUSED_E:     0x3E, // C534 value $0000  CONFIRMED
  FLOOR_UNUSED_F:     0x3F, // C534 value $0000  CONFIRMED
});

export const WALL_TILES = new Set([
  TILE.WALL, TILE.WALL_ALT_A, TILE.WALL_ALT_B, TILE.WALL_ALT_C, TILE.WALL_ALT_D,
]);

export const DOOR_TILES = new Set([
  TILE.EXIT, TILE.EXIT_WARP_4, TILE.EXIT_WARP_8, TILE.EXIT_ALT_A, TILE.EXIT_ALT_B,
]);

export const GATE_TILES = new Set([TILE.GATE_H, TILE.GATE_V]);

// ── Monster types ──────────────────────────────────────────────────────────────
// Used by entities.js and PNG pixel sub-type byte (0xF000nn)
export const MON = Object.freeze({
  GHOST:    0, // C534 $0800 — no fight, no shoot, phased through walls  CONFIRMED
  DEMON:    1, // — shoots + fights                                       CONFIRMED (attract)
  GRUNT:    2, // — fights only                                           CONFIRMED (attract)
  SORCERER: 3, // — fights only (similar to grunt, different sprite)      CONFIRMED (attract)
  LOBBER:   4, // — shoots lobbed projectile only                         CONFIRMED (attract)
  DEATH:    5, // — no fight/shoot, drains huge HP, only magic kills      CONFIRMED (attract)
  THIEF:    6, // — fights, steals items from player                      CONFIRMED (attract)
});

// ── Damage values (from attract-screen damage tables) ────────────────────────
// All CONFIRMED via attract sequence in MAME gameplay.
// Format: [level1_damage, level2_damage, level3_damage] per hit
export const DAMAGE = Object.freeze({
  // Monster melee damage per hit
  GHOST_HIT:    [10, 20, 30], // CONFIRMED — ghosts cannot be fought, only shot
  GRUNT_HIT:    [ 5,  8, 10], // CONFIRMED
  DEMON_HIT:    [ 5,  8, 10], // CONFIRMED (also shoots)
  DEMON_SHOT:   [10, 10, 10], // CONFIRMED demon projectile damage (same all levels)
  LOBBER_SHOT:  [ 3,  3,  3], // CONFIRMED lobber shot (same all levels)
  SORCERER_HIT: [ 5,  8, 10], // CONFIRMED
  DEATH_HIT:    [200, 200, 200], // CONFIRMED "up to 200" per hit — only magic kills Death
  THIEF_HIT:    [10, 10, 10],   // CONFIRMED thief fight damage

  // Player shot damage to monsters
  // Each monster level (L1/L2/L3) requires 1/2/3 shots to kill — CONFIRMED attract
  SHOT_TO_KILL_L1: 1, // CONFIRMED
  SHOT_TO_KILL_L2: 2, // CONFIRMED
  SHOT_TO_KILL_L3: 3, // CONFIRMED

  // Health economy
  COIN_HP:         2000, // CONFIRMED "1 coin = 2000 health" from attract screen
});

// ── Health drain rate ──────────────────────────────────────────────────────────
// Passive HP drain while alive. Rate not byte-confirmed from ROM yet.
// javascript-gauntlet uses 1 HP per 0.5 seconds — kept as HYPOTHESIS.
export const HEALTH_DRAIN_PER_SEC = 2; // HYPOTHESIS — ~1 HP per 0.5s

// ── Player starting health ─────────────────────────────────────────────────────
export const PLAYER_START_HP = 2000; // HYPOTHESIS — matches js-gauntlet, plausible

// ── Player character definitions ───────────────────────────────────────────────
// Stats relative to each other, not byte-confirmed from ROM.
export const HEROES = Object.freeze([
  {
    id:      'warrior',
    name:    'Thor the Warrior',
    color:   '#4488ff',
    // Sprite sheet: assets/sprites/player-warrior-sprite-sheet.png
    // Frame grid: 9 cols × 8 rows = 72 frames at 24×24px  CONFIRMED from zip
    spriteSheet: 'assets/sprites/player-warrior-sprite-sheet.png',
    frameCols: 9, frameRows: 8, frameSize: 24,
    // Weapon sprite: assets/sprites/player-warrior-weapon-sprite-sheet.png
    // Frame grid: 16 frames (256×16, 16px each)
    weaponSheet: 'assets/sprites/player-warrior-weapon-sprite-sheet.png',
    weaponFrames: 16, weaponFrameSize: 16,
    shotPower:  1.0, // HYPOTHESIS
    shotSpeed:  1.0, // HYPOTHESIS
    moveSpeed:  1.0, // HYPOTHESIS
    armour:     1.0, // HYPOTHESIS — best armour
    magic:      1.0, // HYPOTHESIS
  },
  {
    id:      'valkyrie',
    name:    'Thyra the Valkyrie',
    color:   '#ff8844',
    spriteSheet: 'assets/sprites/player-valkyrie-sprite-sheet.png',
    frameCols: 9, frameRows: 8, frameSize: 24,
    weaponSheet: 'assets/sprites/player-valkyrie-weapon-sprite-sheet.png',
    weaponFrames: 8, weaponFrameSize: 16,
    shotPower:  0.75, // HYPOTHESIS
    shotSpeed:  0.75, // HYPOTHESIS
    moveSpeed:  0.9,  // HYPOTHESIS
    armour:     1.25, // HYPOTHESIS — best armour
    magic:      0.75, // HYPOTHESIS
  },
  {
    id:      'elf',
    name:    'Questor the Elf',
    color:   '#44ff44',
    spriteSheet: 'assets/sprites/player-elf-sprite-sheet.png',
    frameCols: 8, frameRows: 8, frameSize: 24,
    weaponSheet: 'assets/sprites/player-elf-weapon-sprite-sheet.png',
    weaponFrames: 8, weaponFrameSize: 16,
    shotPower:  0.75, // HYPOTHESIS
    shotSpeed:  1.5,  // HYPOTHESIS — fastest shots
    moveSpeed:  1.25, // HYPOTHESIS — fastest movement
    armour:     0.75, // HYPOTHESIS — weakest armour
    magic:      0.75, // HYPOTHESIS
  },
  {
    id:      'wizard',
    name:    'Merlin the Wizard',
    color:   '#ff44ff',
    spriteSheet: 'assets/sprites/player-wizard-sprite-sheet.png',
    frameCols: 6, frameRows: 8, frameSize: 24,
    weaponSheet: 'assets/sprites/player-wizard-weapon-sprite-sheet.png',
    weaponFrames: 8, weaponFrameSize: 16,
    shotPower:  0.5,  // HYPOTHESIS
    shotSpeed:  1.0,  // HYPOTHESIS
    moveSpeed:  0.75, // HYPOTHESIS — slowest
    armour:     0.5,  // HYPOTHESIS — weakest armour
    magic:      2.0,  // HYPOTHESIS — best magic
  },
]);

// ── Monster sprite sheets ──────────────────────────────────────────────────────
// All confirmed from mbeisser1/gauntlet_mame_gfx v1.1.0 sprite zip.
// Frame grid sizes confirmed by pixel measurement.
export const MONSTER_SPRITES = Object.freeze({
  [MON.GHOST]: {
    sheets: [
      'assets/sprites/monster-ghost1-sprite-sheet.png', // dungeon theme 1
      'assets/sprites/monster-ghost2-sprite-sheet.png', // dungeon theme 2
      'assets/sprites/monster-ghost3-sprite-sheet.png', // dungeon theme 3
    ],
    frameCols: 4, frameRows: 8, frameSize: 24, // CONFIRMED 96×192 = 4×8
  },
  [MON.GRUNT]: {
    sheets: [
      'assets/sprites/monster-grunt1-sprite-sheet.png',
      'assets/sprites/monster-grunt2-sprite-sheet.png',
      'assets/sprites/monster-grunt3-sprite-sheet.png',
    ],
    altSheets: [
      'assets/sprites/monster-grunt1-alt-sprite-sheet.png',
      'assets/sprites/monster-grunt2-alt-sprite-sheet.png',
      'assets/sprites/monster-grunt3-alt-sprite-sheet.png',
    ],
    frameCols: 5, frameRows: 8, frameSize: 24,    // CONFIRMED 120×192 = 5×8
    altFrameCols: 6,                               // CONFIRMED 144×192 = 6×8
  },
  [MON.DEMON]: {
    sheets: [
      'assets/sprites/monster-demon1-sprite-sheet.png',
      'assets/sprites/monster-demon2-sprite-sheet.png',
      'assets/sprites/monster-demon3-sprite-sheet.png',
    ],
    frameCols: 8, frameRows: 8, frameSize: 24,    // CONFIRMED 192×192 = 8×8
  },
  [MON.SORCERER]: {
    sheets: [
      'assets/sprites/monster-sorcerer1-sprite-sheet.png',
      'assets/sprites/monster-sorcerer2-sprite-sheet.png',
      'assets/sprites/monster-sorcerer3-sprite-sheet.png',
    ],
    frameCols: 6, frameRows: 8, frameSize: 24,    // CONFIRMED 144×192 = 6×8
  },
  [MON.LOBBER]: {
    sheets: [
      'assets/sprites/monster-lobber1-sprite-sheet.png',
      'assets/sprites/monster-lobber2-sprite-sheet.png',
      'assets/sprites/monster-lobber3-sprite-sheet.png',
    ],
    frameCols: 5, frameRows: 5, frameSize: 24,    // CONFIRMED 120×128 (≈5×5 + partial)
  },
  [MON.DEATH]: {
    sheets: ['assets/sprites/monster-death.png'],
    frameCols: 3, frameRows: 8, frameSize: 24,    // CONFIRMED 72×192 = 3×8
  },
  [MON.THIEF]: {
    sheets: ['assets/sprites/monster-thief-sprite-sheet.png'],
    frameCols: 9, frameRows: 8, frameSize: 24,    // CONFIRMED 216×192 = 9×8
  },
});

// ── Generator sprite sheets ────────────────────────────────────────────────────
export const GENERATOR_SPRITES = Object.freeze({
  [MON.GHOST]: {
    sheet: 'assets/sprites/monster-ghost-generator.png',
    frameCols: 3, frameRows: 1, frameSize: 24,   // CONFIRMED 72×24 = 3 frames
    // Frame 0 = L1 (easiest/1-shot kill), frame 1 = L2, frame 2 = L3
  },
  // All non-ghost monster generators use the stone cage sprite:
  default: {
    sheet: 'assets/sprites/monster-monster-generator.png',
    frameCols: 3, frameRows: 1, frameSize: 24,   // CONFIRMED 72×24 = 3 frames
  },
});

// ── Item sprites ───────────────────────────────────────────────────────────────
export const ITEM_SPRITES = Object.freeze({
  exit:              'assets/sprites/dungeon-exit.png',            // 16×16  CONFIRMED
  exit_to_4:         'assets/sprites/dungeon-exit-to-4.png',       // 16×16  CONFIRMED
  exit_to_8:         'assets/sprites/dungeon-exit-to-8.png',       // 16×16  CONFIRMED
  key:               'assets/sprites/dungeon-key.png',             // 16×16  CONFIRMED
  keyring:           'assets/sprites/dungeon-keyring.png',         // 24×16  CONFIRMED
  food_turkey:       'assets/sprites/dungeon-food-turkey.png',     // 24×24  CONFIRMED
  food_drumstick:    'assets/sprites/dungeon-food-drumstick.png',   // 24×24
  food_ham:          'assets/sprites/dungeon-food-ham.png',         // 24×24
  food_jug:          'assets/sprites/dungeon-food-jug.png',         // 24×24
  potion_blue:       'assets/sprites/dungeon-potion-blue.png',      // 16×16  CONFIRMED
  potion_orange:     'assets/sprites/dungeon-potion-orange.png',    // 16×16
  invisibility:      'assets/sprites/dungeon-limited-invisibility.png', // 24×24
  plus_armor:        'assets/sprites/dungeon-potion-extra-armor.png',   // 16×16
  plus_speed:        'assets/sprites/dungeon-potion-extra-speed.png',
  plus_magic:        'assets/sprites/dungeon-potion-extra-magic.png',
  plus_shot_pow:     'assets/sprites/dungeon-potion-extra-shot-power.png',
  plus_shot_spd:     'assets/sprites/dungeon-potion-extra-shot-speed.png',
  plus_fight:        'assets/sprites/dungeon-potion-weapon.png',
  treasure_chest:    'assets/sprites/dungeon-treasure-chest-sprite-sheet.png', // 3 frames
  treasure_bag:      'assets/sprites/dungeon-treasure-bag.png',
  spawn:             'assets/sprites/player-spawn-sprite-sheet.png',           // 7 frames
  teleport:          'assets/sprites/dungeon-teleport-sprite-sheet.png',       // 6 frames (16×16)
  explosion:         'assets/sprites/explosion-collision-sprite-sheet.png',    // 3 frames (16×16)
  // Gate sprites — extracted from all-monster.png row 2 right section
  // These are the blue bar graphics (NOT stone wall tiles)
  gate_horizontal:   'assets/sprites/gate-horizontal.png',  // 29×66 composite
  gate_vertical:     'assets/sprites/gate-vertical.png',    // 12×161 composite
});

// ── Tile code → sprite key mapping ────────────────────────────────────────────
// Maps ROM tile codes to ITEM_SPRITES keys for rendering.
// Used by render.js to look up which sprite to draw.
export const TILE_SPRITE = Object.freeze({
  [TILE.SPAWN]:           'spawn',
  [TILE.EXIT]:            'exit',
  [TILE.EXIT_WARP_4]:     'exit_to_4',
  [TILE.EXIT_WARP_8]:     'exit_to_8',
  [TILE.EXIT_ALT_A]:      'exit',
  [TILE.EXIT_ALT_B]:      'exit',
  [TILE.GATE_H]:          'gate_horizontal',   // CONFIRMED
  [TILE.GATE_V]:          'gate_vertical',     // CONFIRMED
  [TILE.KEY]:             'key',               // CONFIRMED
  [TILE.FOOD_TURKEY]:     'food_turkey',       // CONFIRMED
  [TILE.FOOD_JUG]:        'food_jug',
  [TILE.POTION_MAGIC]:    'potion_blue',       // CONFIRMED
  [TILE.POTION_INVIS]:    'invisibility',
  [TILE.TREASURE_CHEST]:  'treasure_chest',    // CONFIRMED
  [TILE.TREASURE_BAG]:    'treasure_bag',
  [TILE.POWERUP_ARMOR]:   'plus_armor',
  [TILE.POWERUP_SPEED]:   'plus_speed',
  [TILE.POWERUP_MAGIC]:   'plus_magic',
  [TILE.POWERUP_SHOT_POW]:'plus_shot_pow',
  [TILE.POWERUP_SHOT_SPD]:'plus_shot_spd',
  [TILE.POWERUP_FIGHT]:   'plus_fight',
});

// ── Level PNG format (pixel-per-tile encoding) ─────────────────────────────────
// Matches javascript-gauntlet format for the original 17 levels.
// Extended for ROM-decoded levels (power-ups, invisibility, gate orientation).
//
// IMPORTANT: the engine matches with a 0xFFFF00 byte mask (see level.js
// isType()). That means each PIXEL.* constant below holds the TYPE BASE
// signature (byte 2 = 0). Sub-types live in the low byte. The rom-decoder
// emits some pixels with non-zero low bytes (e.g. wall = 0x404040 in the
// ROM dump, gate-vertical = 0xC0C040). Those mask down to the same type
// signature here (0x404040 & 0xFFFF00 = 0x404000) so both legacy and
// ROM-decoded levels classify the same way.
export const PIXEL = Object.freeze({
  FLOOR:        0x000000,
  NOTHING:      0x000000,   // legacy alias — out-of-bounds void
  WALL:         0x404000,   // type signature (ROM pixels may be 0x404040)
  GATE_H:       0xC0C000,   // horizontal gate  CONFIRMED $03
  GATE_V_FLAG:  0x000040,   // OR'd onto GATE_H to mark vertical orientation
  GATE_V:       0xC0C040,   // vertical gate    CONFIRMED $04 (bit 6 = orientation flag)
  DOOR:         0xC0C000,   // legacy alias for gate (horizontal)
  SPAWN:        0x00F000,   // player start      CONFIRMED $05
  START:        0x00F000,   // legacy alias
  EXIT:         0x004000,   // exit              CONFIRMED $06
  EXIT_WARP_4:  0x004010,   // exit-to-4-warp   CONFIRMED $07
  EXIT_WARP_8:  0x004020,   // exit-to-8-warp   CONFIRMED $08
  // Generators: 0xF000nn where nn = monster type (MON.*)
  GENERATOR:    0xF00000,
  GEN_GHOST:    0xF00000, // CONFIRMED
  GEN_DEMON:    0xF00010,
  GEN_GRUNT:    0xF00020,
  GEN_SORCERER: 0xF00030,
  GEN_LOBBER:   0xF00040,
  GEN_DEATH:    0xF00050,
  GEN_THIEF:    0xF00060,
  // Monsters (live placements, no generator): 0x4000nn
  MONSTER:      0x400000,
  // Treasure/items: 0x0080nn where nn = sub-type
  TREASURE:     0x008000,
  TREASURE_CHEST:  0x008080, // CONFIRMED $28
  TREASURE_BAG:    0x008070, // HYPOTHESIS $29
  FOOD_TURKEY:     0x008020, // CONFIRMED $2B
  FOOD_JUG:        0x008040, // HYPOTHESIS $2E
  KEY:             0x008050, // CONFIRMED $35
  POTION_MAGIC:    0x008060, // CONFIRMED $2C
  POTION_INVIS:    0x00D000, // HYPOTHESIS $2D (high G channel distinguishes from magic)
  INVIS:           0x00D000, // type signature for invisibility (same value, masks identically)
  // Power-ups: 0x00E0nn where nn = power-up type (ROM extension)
  POWERUP:         0x00E000, // type signature
  POWERUP_ARMOR:   0x00E000, // $2F
  POWERUP_SPEED:   0x00E010, // $30
  POWERUP_MAGIC:   0x00E020, // $31
  POWERUP_SHOT_POW:0x00E030, // $32
  POWERUP_SHOT_SPD:0x00E040, // $33
  POWERUP_FIGHT:   0x00E050, // $34

  // Byte masks for level.js type-matching. The high two bytes carry the
  // entity class; the low byte carries the sub-type (monster id, orientation
  // flag, power-up variant, etc.).
  MASK_TYPE:    0xFFFF00,
  MASK_EXHIGH:  0x0000F0,
  MASK_EXLOW:   0x00000F,
});

// ═══════════════════════════════════════════════════════════════════════════════
// ENGINE-SIDE CONSTANTS — these were in the previous constants.js and are still
// imported by level.js / entities.js / player.js / render.js / game.js. The
// upstream ROM-spec rewrite didn't include them, so they're preserved here.
// Naming notes:
//   - the old `TILE = 32` (pixel size) is now `CELL_PX`; `TILE` itself is the
//     tile-code enum at the top of this file.
//   - the old `WALL` / `FLOOR` theme-index objects are now `WALL_THEME` /
//     `FLOOR_THEME` to avoid colliding with TILE.WALL / TILE.FLOOR.
// ═══════════════════════════════════════════════════════════════════════════════

export const FPS = 60;
export const CELL_PX = 32;          // tile size on screen, in pixels (was TILE)
export const STILE   = 32;          // sprite tile size

// 8-direction enum.
export const DIR = {
  UP: 0, UPRIGHT: 1, RIGHT: 2, DOWNRIGHT: 3,
  DOWN: 4, DOWNLEFT: 5, LEFT: 6, UPLEFT: 7,
};
export const DIR_NAMES = ["up","upright","right","downright","down","downleft","left","upleft"];
export const DIR_VEC = [
  [ 0, -1], [ 1, -1], [ 1, 0], [ 1, 1],
  [ 0,  1], [-1,  1], [-1, 0], [-1,-1],
];

export const PREFERRED_DIRECTIONS = {
  [DIR.UPLEFT]:    [DIR.UPLEFT,    DIR.LEFT,     DIR.UP,        DIR.UPRIGHT,  DIR.DOWNLEFT],
  [DIR.UPRIGHT]:   [DIR.UPRIGHT,   DIR.RIGHT,    DIR.UP,        DIR.UPLEFT,   DIR.DOWNRIGHT],
  [DIR.DOWNLEFT]:  [DIR.DOWNLEFT,  DIR.LEFT,     DIR.DOWN,      DIR.UPLEFT,   DIR.DOWNRIGHT],
  [DIR.DOWNRIGHT]: [DIR.DOWNRIGHT, DIR.RIGHT,    DIR.DOWN,      DIR.DOWNLEFT, DIR.UPRIGHT],
  [DIR.UP]:        [DIR.UP,        DIR.UPLEFT,   DIR.UPRIGHT,   DIR.LEFT,     DIR.RIGHT],
  [DIR.DOWN]:      [DIR.DOWN,      DIR.DOWNLEFT, DIR.DOWNRIGHT, DIR.LEFT,     DIR.RIGHT],
  [DIR.LEFT]:      [DIR.LEFT,      DIR.UPLEFT,   DIR.DOWNLEFT,  DIR.UP,       DIR.DOWN],
  [DIR.RIGHT]:     [DIR.RIGHT,     DIR.UPRIGHT,  DIR.DOWNRIGHT, DIR.UP,       DIR.DOWN],
};

export const SLIDE_DIRECTIONS = {
  [DIR.UPLEFT]:    [DIR.UPLEFT,    DIR.UP,   DIR.LEFT],
  [DIR.UPRIGHT]:   [DIR.UPRIGHT,   DIR.UP,   DIR.RIGHT],
  [DIR.DOWNLEFT]:  [DIR.DOWNLEFT,  DIR.DOWN, DIR.LEFT],
  [DIR.DOWNRIGHT]: [DIR.DOWNRIGHT, DIR.DOWN, DIR.RIGHT],
  [DIR.UP]:    [DIR.UP],
  [DIR.DOWN]:  [DIR.DOWN],
  [DIR.LEFT]:  [DIR.LEFT],
  [DIR.RIGHT]: [DIR.RIGHT],
};

export function isUp(d)         { return d === DIR.UP || d === DIR.UPLEFT || d === DIR.UPRIGHT; }
export function isDown(d)       { return d === DIR.DOWN || d === DIR.DOWNLEFT || d === DIR.DOWNRIGHT; }
export function isLeft(d)       { return d === DIR.LEFT || d === DIR.UPLEFT || d === DIR.DOWNLEFT; }
export function isRight(d)      { return d === DIR.RIGHT || d === DIR.UPRIGHT || d === DIR.DOWNRIGHT; }
export function isHorizontal(d) { return d === DIR.LEFT || d === DIR.RIGHT; }
export function isVertical(d)   { return d === DIR.UP || d === DIR.DOWN; }
export function isDiagonal(d)   { return d === DIR.UPLEFT || d === DIR.UPRIGHT || d === DIR.DOWNLEFT || d === DIR.DOWNRIGHT; }

// ── Engine-side player behaviour ───────────────────────────────────────────────
// One entry per HEROES[] slot. The runtime imports PLAYER_TYPES for tile/anim
// keys + behaviour stats; sprite paths and visual stats come from HEROES above.
export const PLAYER_TYPES = {
  WARRIOR:  { key:"warrior",  name:"Thor the Warrior",     color:"#4488ff", weaponSound:"firewarrior",  health: 700, speed: 200/FPS, damage: 50/FPS, armor: 3, magic: 16, weaponSpeed: 600/FPS, reload: 0.40*FPS, weaponDamage: 4, weaponRotate: true,  voice:"male"   },
  VALKYRIE: { key:"valkyrie", name:"Thyra the Valkyrie",   color:"#ff8844", weaponSound:"firevalkyrie", health: 600, speed: 220/FPS, damage: 40/FPS, armor: 2, magic: 16, weaponSpeed: 620/FPS, reload: 0.35*FPS, weaponDamage: 4, weaponRotate: false, voice:"female" },
  WIZARD:   { key:"wizard",   name:"Merlin the Wizard",    color:"#ff44ff", weaponSound:"firewizard",   health: 500, speed: 240/FPS, damage: 30/FPS, armor: 1, magic: 32, weaponSpeed: 640/FPS, reload: 0.30*FPS, weaponDamage: 6, weaponRotate: false, voice:"male"   },
  ELF:      { key:"elf",      name:"Questor the Elf",      color:"#44ff44", weaponSound:"fireelf",      health: 500, speed: 260/FPS, damage: 20/FPS, armor: 1, magic: 24, weaponSpeed: 660/FPS, reload: 0.25*FPS, weaponDamage: 6, weaponRotate: false, voice:"male"   },
};
export const PLAYER_LIST = ["WARRIOR","VALKYRIE","WIZARD","ELF"];

// Monster behaviour stats. Keys named after MON.* slots so entities.js can
// resolve MONSTER_TYPES[MONSTER_LIST[subType]] from a level-pixel sub-byte.
export const MONSTER_TYPES = {
  GHOST:    { key:"ghost",    score:  10, health:  4, speed: 140/FPS, damage: 100/FPS, selfharm: 30/FPS, canBeShot: true,  canBeHit: false, invisibility: null,                 thinking: 0.5*FPS, travelling: 0.5*FPS, weapon: null,                                                                                                                generator: { health:  8, rate: 2.5*FPS, max: 40, score: 100 } },
  DEMON:    { key:"demon",    score:  20, health:  4, speed:  80/FPS, damage:  60/FPS, selfharm: 0,      canBeShot: true,  canBeHit: true,  invisibility: null,                 thinking: 0.5*FPS, travelling: 0.5*FPS, weapon: { speed: 240/FPS, reload: 2*FPS,   damage: 10, rotate: false, projectile: "fireball" },                            generator: { health: 16, rate: 3.0*FPS, max: 40, score: 200 } },
  GRUNT:    { key:"grunt",    score:  30, health:  8, speed: 120/FPS, damage:  60/FPS, selfharm: 0,      canBeShot: true,  canBeHit: true,  invisibility: null,                 thinking: 0.5*FPS, travelling: 0.5*FPS, weapon: null,                                                                                                                generator: { health: 16, rate: 3.5*FPS, max: 40, score: 300 } },
  SORCERER: { key:"sorcerer", score:  30, health:  8, speed: 120/FPS, damage:  60/FPS, selfharm: 0,      canBeShot: true,  canBeHit: true,  invisibility: { on: 3*FPS, off: 6*FPS }, thinking: 0.5*FPS, travelling: 0.5*FPS, weapon: null,                                                                                                          generator: { health: 24, rate: 4.0*FPS, max: 20, score: 400 } },
  LOBBER:   { key:"lobber",   score:  40, health:  6, speed: 100/FPS, damage:  60/FPS, selfharm: 0,      canBeShot: true,  canBeHit: true,  invisibility: null,                 thinking: 0.6*FPS, travelling: 0.5*FPS, weapon: { speed: 280/FPS, reload: 2.2*FPS, damage: 14, rotate: false, projectile: "lobshot", lob: true },                generator: { health: 20, rate: 4.0*FPS, max: 30, score: 350 } },
  DEATH:    { key:"death",    score: 500, health: 12, speed: 180/FPS, damage: 120/FPS, selfharm: 6/FPS,  canBeShot: false, canBeHit: false, invisibility: null,                 thinking: 0.5*FPS, travelling: 0.5*FPS, weapon: null,                                                                                                                generator: { health: 16, rate: 5.0*FPS, max: 10, score: 500 } },
  THIEF:    { key:"thief",    score: 100, health:  3, speed: 280/FPS, damage:   0,     selfharm: 0,      canBeShot: true,  canBeHit: true,  invisibility: null,                 thinking: 0.3*FPS, travelling: 0.3*FPS, weapon: null, steals: true,                                                                                                  generator: null },
};
// Order matches MON.* numeric values, so MONSTER_LIST[MON.GHOST] === "GHOST".
export const MONSTER_LIST = ["GHOST","DEMON","GRUNT","SORCERER","LOBBER","DEATH","THIEF"];

// Treasure / pickup engine stats. Order matches the level-pixel sub-type byte
// (0x0080nn): 0 health, 1 poison, 2-4 food, 5 key, 6 potion, 7 gold, 8 chest.
export const TREASURE_TYPES = {
  HEALTH: { key:"health", score:  10, health: 100,            sound:"collectpotion" },
  POISON: { key:"poison", score:   0, damage: 100,            sound:"collectpotion" },
  FOOD1:  { key:"food1",  score:  10, health:  50,            sound:"collectfood"   },
  FOOD2:  { key:"food2",  score:  10, health:  60,            sound:"collectfood"   },
  FOOD3:  { key:"food3",  score:  10, health:  70,            sound:"collectfood"   },
  KEY:    { key:"key",    score: 100, take: "key",            sound:"collectkey"    },
  POTION: { key:"potion", score: 200, take: "potion",         sound:"collectpotion" },
  GOLD:   { key:"gold",   score: 250,                         sound:"collectgold"   },
  CHEST:  { key:"chest",  score:1000,                         sound:"collectgold"   },
};
export const TREASURE_LIST = ["HEALTH","POISON","FOOD1","FOOD2","FOOD3","KEY","POTION","GOLD","CHEST"];

// Door / Gate engine descriptors. The level loader picks HORIZONTAL or VERTICAL
// based on the gate's PIXEL.GATE_V flag (low byte = 0x40) vs PIXEL.GATE_H.
export const DOOR = {
  HORIZONTAL: { key:"horiz", openSpeed: 0.3*FPS, horizontal: true },
  VERTICAL:   { key:"vert",  openSpeed: 0.3*FPS, vertical: true },
  EXIT:       { key:"exit",  exitSpeed: 1.5*FPS },
};

// Collision boxes (relative to CELL_PX-sized cell)
export const CBOX = {
  FULL:    { x: 0,            y: 0,            w: CELL_PX,      h: CELL_PX },
  PLAYER:  { x: CELL_PX/4,    y: CELL_PX/4,    w: CELL_PX/2,    h: CELL_PX - CELL_PX/4 },
  WEAPON:  { x: CELL_PX/3,    y: CELL_PX/3,    w: CELL_PX/3,    h: CELL_PX/3 },
  MONSTER: { x: 1,            y: 1,            w: CELL_PX - 2,  h: CELL_PX - 2 },
};

// Health auto-drain rate: 1 HP per ~half second (matches arcade).
export const AUTO_HURT_FRAMES = FPS / 2;

// Scoring
export const SCORE_PER_LEVEL = 1000;

// Camera follows centroid of active players
export const VIEWPORT = { TW: 20, TH: 14 }; // tiles wide x high

// Wall + floor THEME indices into the ROM tile atlas (backgrounds.png).
// Renamed from WALL/FLOOR (clashed with TILE.WALL / TILE.FLOOR above).
export const WALL_THEME = {
  BLUE: 1, BLUE_BRICK: 2, PURPLE_TILE: 3,
  BLUE_COBBLE: 4, PURPLE_COBBLE: 5, CONCRETE: 6,
  MAX: 6,
};
export const FLOOR_THEME = {
  BROWN_BOARDS: 1, LIGHTBROWN_BOARDS: 2, GREEN_BOARDS: 3, GREY_BOARDS: 4,
  WOOD: 5, LIGHT_STONE: 6, DARK_STONE: 7,
  BROWN_LAMINATE: 8, PURPLE_LAMINATE: 9,
};
