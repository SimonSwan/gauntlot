// Arcade-faithful tuning, ported from javascript-gauntlet (Jake Gordon, MIT)
// and corroborated against original Atari Gauntlet (1985) behaviour.

export const FPS = 60;
export const TILE = 32;          // tile size on screen, in pixels
export const STILE = 32;         // sprite tile size

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

// Hero archetypes — Nostromo crew. Stats track the 4-class arcade balance:
// MARINE = tank (Warrior), TECH = balanced (Valkyrie),
// SMUGGLER = glass-cannon (Wizard), SYNTHETIC = fast scout (Elf).
// `weaponSound` maps to the existing javascript-gauntlet audio assets
// (re-using firewarrior/firevalkyrie/firewizard/fireelf — they're generic
// enough to read as a pulse rifle, plasma cutter, hand cannon, smartgun).
export const PLAYER_TYPES = {
  MARINE:    { key:"marine",    name:"Cpl. Hicks",       color:"#1EFF3C", weaponSound:"firewarrior",  health: 700, speed: 200/FPS, damage: 50/FPS, armor: 3, magic: 16, weaponSpeed: 600/FPS, reload: 0.40*FPS, weaponDamage: 4, weaponRotate: true,  voice:"male"   },
  TECH:      { key:"tech",      name:"Lt. Vasquez",      color:"#00D8FF", weaponSound:"firevalkyrie", health: 600, speed: 220/FPS, damage: 40/FPS, armor: 2, magic: 16, weaponSpeed: 620/FPS, reload: 0.35*FPS, weaponDamage: 4, weaponRotate: false, voice:"female" },
  SMUGGLER:  { key:"smuggler",  name:"Ripley",           color:"#FF8C1A", weaponSound:"firewizard",   health: 500, speed: 240/FPS, damage: 30/FPS, armor: 1, magic: 32, weaponSpeed: 640/FPS, reload: 0.30*FPS, weaponDamage: 6, weaponRotate: false, voice:"female" },
  SYNTHETIC: { key:"synthetic", name:"Bishop",           color:"#E0E0E0", weaponSound:"fireelf",      health: 500, speed: 260/FPS, damage: 20/FPS, armor: 1, magic: 24, weaponSpeed: 660/FPS, reload: 0.25*FPS, weaponDamage: 6, weaponRotate: false, voice:"male"   },
};
export const PLAYER_LIST = ["MARINE","TECH","SMUGGLER","SYNTHETIC"];

// Enemy types — Nostromo bestiary. Stat blocks intentionally mirror the
// arcade Gauntlet balance so the game still feels right.
//   DRONE          = ghost-class (fast, suicidal melee, dies on hit)
//   SPITTER        = demon-class (acid projectile)
//   RUNNER         = grunt-class (chunky melee)
//   SYNTH_SECURITY = sorcerer-class (cloaks in/out)
//   PRAETORIAN     = lobber-class (lobs acid blobs)
//   PROTO_XENO     = death-class (invincible, drains player health)
//   WORKER_ANDROID = thief-class (steals access cards then flees)
export const MONSTER_TYPES = {
  DRONE:          { key:"drone",          score:  10, health:  4, speed: 140/FPS, damage: 100/FPS, selfharm: 30/FPS, canBeShot: true,  canBeHit: false, invisibility: null,                 thinking: 0.5*FPS, travelling: 0.5*FPS, weapon: null,                                                                                                                generator: { health:  8, rate: 2.5*FPS, max: 40, score: 100 } },
  SPITTER:        { key:"spitter",        score:  20, health:  4, speed:  80/FPS, damage:  60/FPS, selfharm: 0,      canBeShot: true,  canBeHit: true,  invisibility: null,                 thinking: 0.5*FPS, travelling: 0.5*FPS, weapon: { speed: 240/FPS, reload: 2*FPS,   damage: 10, rotate: false, projectile: "acidball" },                            generator: { health: 16, rate: 3.0*FPS, max: 40, score: 200 } },
  RUNNER:         { key:"runner",         score:  30, health:  8, speed: 120/FPS, damage:  60/FPS, selfharm: 0,      canBeShot: true,  canBeHit: true,  invisibility: null,                 thinking: 0.5*FPS, travelling: 0.5*FPS, weapon: null,                                                                                                                generator: { health: 16, rate: 3.5*FPS, max: 40, score: 300 } },
  SYNTH_SECURITY: { key:"synthSecurity",  score:  30, health:  8, speed: 120/FPS, damage:  60/FPS, selfharm: 0,      canBeShot: true,  canBeHit: true,  invisibility: { on: 3*FPS, off: 6*FPS }, thinking: 0.5*FPS, travelling: 0.5*FPS, weapon: null,                                                                                                          generator: { health: 24, rate: 4.0*FPS, max: 20, score: 400 } },
  PRAETORIAN:     { key:"praetorian",     score:  40, health:  6, speed: 100/FPS, damage:  60/FPS, selfharm: 0,      canBeShot: true,  canBeHit: true,  invisibility: null,                 thinking: 0.6*FPS, travelling: 0.5*FPS, weapon: { speed: 280/FPS, reload: 2.2*FPS, damage: 14, rotate: false, projectile: "acidblob", lob: true },               generator: { health: 20, rate: 4.0*FPS, max: 30, score: 350 } },
  PROTO_XENO:     { key:"protoXeno",      score: 500, health: 12, speed: 180/FPS, damage: 120/FPS, selfharm: 6/FPS,  canBeShot: false, canBeHit: false, invisibility: null,                 thinking: 0.5*FPS, travelling: 0.5*FPS, weapon: null,                                                                                                                generator: { health: 16, rate: 5.0*FPS, max: 10, score: 500 } },
  WORKER_ANDROID: { key:"workerAndroid",  score: 100, health:  3, speed: 280/FPS, damage:   0,     selfharm: 0,      canBeShot: true,  canBeHit: true,  invisibility: null,                 thinking: 0.3*FPS, travelling: 0.3*FPS, weapon: null, steals: true,                                                                                                  generator: null },
};
export const MONSTER_LIST = ["DRONE","SPITTER","RUNNER","SYNTH_SECURITY","PRAETORIAN","PROTO_XENO","WORKER_ANDROID"];

// Pickup types — Nostromo. Same gameplay roles as Gauntlet treasures so
// the level format / pickup logic stays compatible:
//   MEDKIT    = full health potion
//   POISON    = leaking acid canister (damages)
//   AMMO/OXY/ADREN = food-class incremental health
//   ACCESS_CARD = key
//   EMP       = magic potion (nuke)
//   CREDITS   = gold
//   DATA_CORE = chest (1000pt)
export const TREASURE_TYPES = {
  MEDKIT:      { key:"medkit",      score:  10, health: 100,            sound:"collectpotion" },
  POISON:      { key:"poison",      score:   0, damage: 100,            sound:"collectpotion" },
  AMMO:        { key:"ammo",        score:  10, health:  50,            sound:"collectfood"   },
  OXYGEN:      { key:"oxygen",      score:  10, health:  60,            sound:"collectfood"   },
  ADRENALINE:  { key:"adrenaline",  score:  10, health:  70,            sound:"collectfood"   },
  ACCESS_CARD: { key:"accessCard",  score: 100, take: "key",            sound:"collectkey"    },
  EMP:         { key:"emp",         score: 200, take: "potion",         sound:"collectpotion" },
  CREDITS:     { key:"credits",     score: 250,                         sound:"collectgold"   },
  DATA_CORE:   { key:"dataCore",    score:1000,                         sound:"collectgold"   },
};
export const TREASURE_LIST = ["MEDKIT","POISON","AMMO","OXYGEN","ADRENALINE","ACCESS_CARD","EMP","CREDITS","DATA_CORE"];

// Door / Exit
export const DOOR = {
  HORIZONTAL: { key:"horiz", openSpeed: 0.3*FPS, horizontal: true },
  VERTICAL:   { key:"vert",  openSpeed: 0.3*FPS, vertical: true },
  EXIT:       { key:"exit",  exitSpeed: 1.5*FPS },
};

// Collision boxes (relative to TILE-sized cell)
export const CBOX = {
  FULL:    { x: 0,        y: 0,        w: TILE,     h: TILE },
  PLAYER:  { x: TILE/4,   y: TILE/4,   w: TILE/2,   h: TILE - TILE/4 },
  WEAPON:  { x: TILE/3,   y: TILE/3,   w: TILE/3,   h: TILE/3 },
  MONSTER: { x: 1,        y: 1,        w: TILE-2,   h: TILE-2 },
};

// Pixel-encoded level format (RGB) — same scheme as javascript-gauntlet so PNG levels load directly.
export const PIXEL = {
  NOTHING:   0x000000,
  DOOR:      0xC0C000,
  WALL:      0x404000,
  GENERATOR: 0xF00000,
  MONSTER:   0x400000,
  START:     0x00F000,
  TREASURE:  0x008000,
  EXIT:      0x004000,
  // Sub-type encoded in the second hex digit (e.g. red 0xF[type]0000 not used; we use the 0x0000F0 nybble for sub-type when needed).
  MASK_TYPE:   0xFFFF00,
  MASK_EXHIGH: 0x0000F0,
  MASK_EXLOW:  0x00000F,
};

// Health auto-drain rate: 1 HP per ~half second (arcade ~ same)
export const AUTO_HURT_FRAMES = FPS / 2;

// Scoring
export const SCORE_PER_LEVEL = 1000;

// Camera follows centroid of active players
export const VIEWPORT = { TW: 20, TH: 14 }; // tiles wide x high

// Wall + floor themes from the ROM tile atlas (backgrounds.png).
// Numbers index directly into atlas rows (walls) / atlas cols (floors).
export const WALL = {
  BLUE: 1, BLUE_BRICK: 2, PURPLE_TILE: 3,
  BLUE_COBBLE: 4, PURPLE_COBBLE: 5, CONCRETE: 6,
  MAX: 6,
};
export const FLOOR = {
  BROWN_BOARDS: 1, LIGHTBROWN_BOARDS: 2, GREEN_BOARDS: 3, GREY_BOARDS: 4,
  WOOD: 5, LIGHT_STONE: 6, DARK_STONE: 7,
  BROWN_LAMINATE: 8, PURPLE_LAMINATE: 9,
};
