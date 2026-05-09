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

// Hero archetypes — Atari arcade tuning + canonical cabinet colours.
export const PLAYER_TYPES = {
  WARRIOR:  { key:"warrior",  name:"Thor the Warrior",     color:"#F90503", health: 700, speed: 200/FPS, damage: 50/FPS, armor: 3, magic: 16, weaponSpeed: 600/FPS, reload: 0.40*FPS, weaponDamage: 4, weaponRotate: true,  voice:"male"   },
  VALKYRIE: { key:"valkyrie", name:"Thyra the Valkyrie",   color:"#08B4F0", health: 600, speed: 220/FPS, damage: 40/FPS, armor: 2, magic: 16, weaponSpeed: 620/FPS, reload: 0.35*FPS, weaponDamage: 4, weaponRotate: false, voice:"female" },
  WIZARD:   { key:"wizard",   name:"Merlin the Wizard",    color:"#F5FC00", health: 500, speed: 240/FPS, damage: 30/FPS, armor: 1, magic: 32, weaponSpeed: 640/FPS, reload: 0.30*FPS, weaponDamage: 6, weaponRotate: false, voice:"male"   },
  ELF:      { key:"elf",      name:"Questor the Elf",      color:"#00FF03", health: 500, speed: 260/FPS, damage: 20/FPS, armor: 1, magic: 24, weaponSpeed: 660/FPS, reload: 0.25*FPS, weaponDamage: 6, weaponRotate: false, voice:"male"   },
};
export const PLAYER_LIST = ["WARRIOR","VALKYRIE","WIZARD","ELF"];

// Enemy types
export const MONSTER_TYPES = {
  GHOST:    { key:"ghost",    score:  10, health:  4, speed: 140/FPS, damage: 100/FPS, selfharm: 30/FPS, canBeShot: true,  canBeHit: false, invisibility: null,                 thinking: 0.5*FPS, travelling: 0.5*FPS, weapon: null,                                                                                          generator: { health:  8, rate: 2.5*FPS, max: 40, score: 100 } },
  DEMON:    { key:"demon",    score:  20, health:  4, speed:  80/FPS, damage:  60/FPS, selfharm: 0,      canBeShot: true,  canBeHit: true,  invisibility: null,                 thinking: 0.5*FPS, travelling: 0.5*FPS, weapon: { speed: 240/FPS, reload: 2*FPS, damage: 10, rotate: false, projectile: "fireball" }, generator: { health: 16, rate: 3.0*FPS, max: 40, score: 200 } },
  GRUNT:    { key:"grunt",    score:  30, health:  8, speed: 120/FPS, damage:  60/FPS, selfharm: 0,      canBeShot: true,  canBeHit: true,  invisibility: null,                 thinking: 0.5*FPS, travelling: 0.5*FPS, weapon: null,                                                                                          generator: { health: 16, rate: 3.5*FPS, max: 40, score: 300 } },
  SORCERER: { key:"sorcerer", score:  30, health:  8, speed: 120/FPS, damage:  60/FPS, selfharm: 0,      canBeShot: true,  canBeHit: true,  invisibility: { on: 3*FPS, off: 6*FPS }, thinking: 0.5*FPS, travelling: 0.5*FPS, weapon: null,                                                                                  generator: { health: 24, rate: 4.0*FPS, max: 20, score: 400 } },
  LOBBER:   { key:"lobber",   score:  40, health:  6, speed: 100/FPS, damage:  60/FPS, selfharm: 0,      canBeShot: true,  canBeHit: true,  invisibility: null,                 thinking: 0.6*FPS, travelling: 0.5*FPS, weapon: { speed: 280/FPS, reload: 2.2*FPS, damage: 14, rotate: false, projectile: "rock", lob: true }, generator: { health: 20, rate: 4.0*FPS, max: 30, score: 350 } },
  DEATH:    { key:"death",    score: 500, health: 12, speed: 180/FPS, damage: 120/FPS, selfharm: 6/FPS,  canBeShot: false, canBeHit: false, invisibility: null,                 thinking: 0.5*FPS, travelling: 0.5*FPS, weapon: null,                                                                                          generator: { health: 16, rate: 5.0*FPS, max: 10, score: 500 } },
  THIEF:    { key:"thief",    score: 100, health:  3, speed: 280/FPS, damage:   0,     selfharm: 0,      canBeShot: true,  canBeHit: true,  invisibility: null,                 thinking: 0.3*FPS, travelling: 0.3*FPS, weapon: null, steals: true,                                                                            generator: null },
};
export const MONSTER_LIST = ["GHOST","DEMON","GRUNT","SORCERER","LOBBER","DEATH","THIEF"];

// Treasure types
export const TREASURE_TYPES = {
  HEALTH:  { key:"health",  score:  10, health: 100,            sound:"collectpotion" },
  POISON:  { key:"poison",  score:   0, damage: 100,            sound:"collectpotion" },
  FOOD1:   { key:"food1",   score:  10, health:  50,            sound:"collectfood"   }, // turkey
  FOOD2:   { key:"food2",   score:  10, health:  60,            sound:"collectfood"   }, // ham
  FOOD3:   { key:"food3",   score:  10, health:  70,            sound:"collectfood"   }, // jug
  KEY:     { key:"key",     score: 100, take: "key",            sound:"collectkey"    },
  POTION:  { key:"potion",  score: 200, take: "potion",         sound:"collectpotion" },
  GOLD:    { key:"gold",    score: 250,                         sound:"collectgold"   },
  CHEST:   { key:"chest",   score:1000,                         sound:"collectgold"   },
};
export const TREASURE_LIST = ["HEALTH","POISON","FOOD1","FOOD2","FOOD3","KEY","POTION","GOLD","CHEST"];

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
