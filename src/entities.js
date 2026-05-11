/**
 * src/entities.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All non-player game entities for Gauntlet (1985) recreation.
 *
 * ENTITY TYPES:
 *   Monster   — Ghosts, Grunts, Demons, Sorcerers, Lobbers, Death, Thieves.
 *   Generator — Spawns monsters.  Has HP; can be destroyed.
 *   Projectile — Player shots and monster shots.
 *   Item      — Collectible objects (food, potions, keys, treasure, power-ups).
 *   Door      — Gate tile (interactive; opens with key).
 *   Fx        — Visual effects (explosions, teleport flashes).
 *
 * MONSTER AI (PLACEHOLDER — exact ROM routines not decoded yet):
 *   All monsters move toward the nearest player using a simplified
 *   preferred-direction system:
 *     1. Compute vector to nearest player.
 *     2. Pick the axis with the larger component (preferred direction).
 *     3. If blocked, try the other axis (sliding).
 *     4. If both blocked, pick a random perpendicular direction.
 *   All monsters are wall-blocked.  (Previously ghosts phased through walls;
 *   that has been removed — no ROM evidence for it.)
 *   Death cannot be killed by shots — only magic.  CONFIRMED behaviour.
 *
 * DAMAGE VALUES: All from ATT (attract-screen) analysis.  See constants.js.
 *
 * COLLISION:
 *   Tile-based.  An entity occupies the tile at its centre point.
 *   For movement, we check the destination tile before moving.
 *   Entity-entity collision uses a simple circular overlap test
 *   (radius = half sprite size = 12px for 24px sprites).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { MON, DMG, TIME, SCORE, RENDER, DIR, DIR_VEC, CELL, HALF_CELL, MONSTER_HITBOX } from './constants.js';
import { T as TILE_T } from './level.js';

// Upper-case monster names for SCORE table lookup
const MON_NAME_UC = ['GHOST','DEMON','GRUNT','SORCERER','LOBBER','DEATH','THIEF'];

// ── Unique ID generator ───────────────────────────────────────────────────────
let _nextId = 1;
function uid() { return _nextId++; }

// ── Base entity ───────────────────────────────────────────────────────────────

class Entity {
  /**
   * @param {number} wx   World X in pixels (top-left of sprite)
   * @param {number} wy   World Y in pixels (top-left of sprite)
   */
  constructor(wx, wy) {
    this.id      = uid();
    this.wx      = wx;   // World position X
    this.wy      = wy;   // World position Y
    this.dead    = false; // True = remove from simulation next frame
  }

  /** Centre X in world pixels */
  get cx() { return this.wx + HALF_CELL; }
  /** Centre Y in world pixels */
  get cy() { return this.wy + HALF_CELL; }
  /** Current tile column */
  get tileCol() { return Math.floor(this.cx / CELL); }
  /** Current tile row */
  get tileRow()  { return Math.floor(this.cy / CELL); }

  /**
   * Distance to another entity (centre to centre).
   */
  distTo(other) {
    const dx = this.cx - other.cx;
    const dy = this.cy - other.cy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * True if this entity's hitbox overlaps another's.
   * @param {Entity} other
   * @param {number} [radius]  Overlap radius in pixels (default 10)
   */
  overlaps(other, radius = 10) {
    return this.distTo(other) < radius;
  }
}

// ── Monster ───────────────────────────────────────────────────────────────────

export class Monster extends Entity {
  /**
   * @param {number} wx
   * @param {number} wy
   * @param {number} monType   One of MON.* constants
   * @param {number} level     1/2/3 — controls damage dealt and HP
   * @param {number} theme     0/1/2 — dungeon theme (selects sprite palette)
   */
  constructor(wx, wy, monType, level = 1, theme = 0) {
    super(wx, wy);
    this.monType = monType;
    this.level   = level;   // 1/2/3 = L1/L2/L3
    this.theme   = theme;   // 0/1/2 = dungeon theme (sprite colour variant)

    // HP = shots required to kill (from ATT CONFIRMED data)
    this.hp      = DMG.SHOTS_TO_KILL[level - 1]; // L1=1, L2=2, L3=3

    this.dir     = DIR.S;   // Facing direction (0–7)
    this.animFrame = 0;     // Current animation frame column within sprite row
    this.animTimer = 0;     // ms until next animation frame

    // AI state
    this.moveTimer = 0;     // ms until next position update
    this.shotTimer = 0;     // ms until next shot (demons/lobbers only)
    this.stuckTimer = 0;    // ms we've been stuck (for random-direction escape)

    // Speed in px/s  [PLACEHOLDER]
    const speeds = {
      [MON.GHOST]:    TIME.GHOST_SPEED_PX,
      [MON.GRUNT]:    TIME.GRUNT_SPEED_PX,
      [MON.DEMON]:    TIME.DEMON_SPEED_PX,
      [MON.SORCERER]: TIME.SORCERER_SPEED_PX,
      [MON.LOBBER]:   TIME.LOBBER_SPEED_PX,
      [MON.DEATH]:    TIME.DEATH_SPEED_PX,
      [MON.THIEF]:    TIME.THIEF_SPEED_PX,
    };
    this.speed = speeds[monType] ?? TIME.GRUNT_SPEED_PX;
  }

  /**
   * Melee damage dealt to a player per contact frame.
   * [ATT CONFIRMED for all types]
   */
  get meleeDamage() {
    const table = {
      [MON.GHOST]:    DMG.GHOST,
      [MON.GRUNT]:    DMG.GRUNT,
      [MON.DEMON]:    DMG.DEMON,
      [MON.SORCERER]: DMG.SORCERER,
      [MON.DEATH]:    DMG.DEATH,
      [MON.THIEF]:    DMG.THIEF,
      [MON.LOBBER]:   [0, 0, 0], // Lobber doesn't fight, only shoots
    };
    return (table[this.monType] ?? DMG.GRUNT)[this.level - 1];
  }

  // Ghost wall-phasing removed per user correction — no ROM evidence.
  // All monsters are wall-blocked.  Kept for callers that still ask.
  get canPhase() { return false; }

  /**
   * Can this monster be killed by player shots?
   * Death cannot — only magic.  CONFIRMED.
   */
  get canBeShot() { return this.monType !== MON.DEATH; }

  /**
   * Does this monster shoot projectiles?
   */
  get doesShoot() {
    return this.monType === MON.DEMON || this.monType === MON.LOBBER;
  }

  /**
   * Take a player shot hit.
   * Decrements HP.  Sets dead=true when HP reaches 0.
   * Returns score value if killed, 0 if just damaged.
   * Note: Death returns 0 (cannot be killed this way).
   */
  hit() {
    if (!this.canBeShot) return 0;
    this.hp--;
    if (this.hp <= 0) {
      this.dead = true;
      return SCORE[`KILL_${MON_NAME_UC[this.monType]}`] ?? SCORE.KILL_GRUNT;
    }
    return 0;
  }

  /**
   * Update AI and animation.
   * @param {number}          dt       Delta time in ms
   * @param {Level}           level    Current level (for collision)
   * @param {Entity[]}        players  Live player entities for targeting
   * @param {EntityManager}   mgr      Entity manager (for spawning shots)
   */
  update(dt, level, players, mgr) {
    this._updateAnimation(dt);
    this._updateAI(dt, level, players, mgr);
  }

  /** @private */
  _updateAnimation(dt) {
    this.animTimer += dt;
    if (this.animTimer >= TIME.ANIM_FRAME_MS) {
      this.animTimer -= TIME.ANIM_FRAME_MS;
      // Number of animation frames per direction row depends on sheet
      const maxFrames = {
        [MON.GHOST]:    4,
        [MON.GRUNT]:    5,
        [MON.DEMON]:    8,
        [MON.SORCERER]: 6,
        [MON.LOBBER]:   5,
        [MON.DEATH]:    3,
        [MON.THIEF]:    9,
      }[this.monType] ?? 4;
      this.animFrame = (this.animFrame + 1) % maxFrames;
    }
  }

  /** @private */
  _updateAI(dt, level, players, mgr) {
    if (players.length === 0) return;

    // Target: nearest living player
    let nearest = null, nearestDist = Infinity;
    for (const p of players) {
      if (p.dead) continue;
      const d = this.distTo(p);
      if (d < nearestDist) { nearest = p; nearestDist = d; }
    }
    if (!nearest) return;

    // ── Shooting (Demon and Lobber) ──────────────────────────────────────────
    if (this.doesShoot) {
      this.shotTimer -= dt;
      if (this.shotTimer <= 0) {
        // Reset shot timer  [PLACEHOLDER rate]
        this.shotTimer = this.monType === MON.DEMON ? 2000 : 2500;
        // Only shoot if player is in line of sight (simplification: range check)
        if (nearestDist < 200) {
          this._shoot(nearest, mgr);
        }
      }
    }

    // ── Movement ────────────────────────────────────────────────────────────
    // Move continuously based on speed (not tile-snapped)  [PLACEHOLDER AI]
    const pxPerMs = this.speed / 1000;
    const distToMove = pxPerMs * dt;

    const ddx = nearest.cx - this.cx;
    const ddy = nearest.cy - this.cy;
    const len = Math.sqrt(ddx * ddx + ddy * ddy);
    if (len < 1) return;

    const nx = (ddx / len) * distToMove;
    const ny = (ddy / len) * distToMove;

    // Preferred direction: larger component moves first
    let moved = false;
    if (Math.abs(nx) >= Math.abs(ny)) {
      moved = this._tryMove(nx, 0, level) || this._tryMove(0, ny, level);
    } else {
      moved = this._tryMove(0, ny, level) || this._tryMove(nx, 0, level);
    }

    // Update facing direction
    if (ddx > 4)       this.dir = ddy > 4 ? DIR.SE : ddy < -4 ? DIR.NE : DIR.E;
    else if (ddx < -4) this.dir = ddy > 4 ? DIR.SW : ddy < -4 ? DIR.NW : DIR.W;
    else               this.dir = ddy > 4 ? DIR.S  : DIR.N;

    if (!moved) {
      this.stuckTimer += dt;
      // If stuck for 500ms, try a random perpendicular direction  [PLACEHOLDER]
      if (this.stuckTimer > 500) {
        this.stuckTimer = 0;
        const perp = Math.random() < 0.5 ? { x: -ny, y: nx } : { x: ny, y: -nx };
        this._tryMove(perp.x, perp.y, level);
      }
    } else {
      this.stuckTimer = 0;
    }
  }

  /**
   * Try to move by (dx, dy) pixels.  Returns true if movement succeeded.
   * Uses MONSTER_HITBOX (22x22 inside the 24x24 tile, 1-px wiggle each side)
   * as the collision rect, following jakesgordon's model — large enough that
   * the sprite never visually overhangs a wall, small enough that single-tile
   * corridors stay traversable.
   * @private
   */
  _tryMove(dx, dy, level) {
    const nx = this.wx + dx;
    const ny = this.wy + dy;
    const b  = MONSTER_HITBOX;
    const corners = [
      [nx + b.x,         ny + b.y        ],
      [nx + b.x + b.w-1, ny + b.y        ],
      [nx + b.x,         ny + b.y + b.h-1],
      [nx + b.x + b.w-1, ny + b.y + b.h-1],
    ];
    for (const [px, py] of corners) {
      const c = Math.floor(px / CELL);
      const r = Math.floor(py / CELL);
      if (c < 0 || c > 31 || r < 0 || r > 31) return false;
      if (level.isBlocked(c, r)) return false;
    }
    this.wx = nx;
    this.wy = ny;
    return true;
  }

  /**
   * Spawn a projectile toward the target player.
   * @private
   */
  _shoot(target, mgr) {
    const ddx = target.cx - this.cx;
    const ddy = target.cy - this.cy;
    const len = Math.sqrt(ddx * ddx + ddy * ddy);
    if (len < 1) return;

    const isLobber = this.monType === MON.LOBBER;
    const dmg = isLobber
      ? DMG.LOBBER_SHOT[this.level - 1]
      : DMG.DEMON_SHOT[this.level - 1];

    mgr.add(new Projectile(
      this.cx - 4, this.cy - 4,   // origin
      (ddx / len) * (isLobber ? TIME.DEMON_SHOT_SPEED * 0.8 : TIME.DEMON_SHOT_SPEED) / 1000,
      (ddy / len) * (isLobber ? TIME.DEMON_SHOT_SPEED * 0.8 : TIME.DEMON_SHOT_SPEED) / 1000,
      'monster',
      dmg,
      isLobber,
    ));
  }
}

// ── Generator ─────────────────────────────────────────────────────────────────

export class Generator extends Entity {
  /**
   * @param {number} wx
   * @param {number} wy
   * @param {number} monType   Monster type this generates
   * @param {number} level     1/2/3 — L1/L2/L3 (selects generator frame + monster level)
   * @param {number} theme     Dungeon theme (0/1/2) for monster colour variant
   */
  constructor(wx, wy, monType, level = 1, theme = 0) {
    super(wx, wy);
    this.monType     = monType;
    this.level       = level;
    this.theme       = theme;
    this.hp          = DMG.GEN_HP[level - 1];    // Shots to destroy  [PLACEHOLDER]
    this.spawnTimer  = TIME.GEN_SPAWN_INTERVAL_MS * (0.5 + Math.random()); // Stagger spawns
    this.spawnCount  = 0;
    this.animFrame   = level - 1;  // Frame 0=L1, 1=L2, 2=L3  CONFIRMED (ghost gen sprite)
  }

  /** True if this is a ghost generator (skull-cage sprite) */
  get isGhostGen() { return this.monType === MON.GHOST; }

  /**
   * @param {number}        dt
   * @param {EntityManager} mgr
   */
  update(dt, mgr) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = TIME.GEN_SPAWN_INTERVAL_MS;
      this.spawnCount++;
      if (this.spawnCount <= TIME.GEN_MAX_SPAWN) {
        this._spawnMonster(mgr);
      }
    }
  }

  /**
   * Take a player shot hit.  Returns score if destroyed.
   */
  hit() {
    this.hp--;
    if (this.hp <= 0) {
      this.dead = true;
      return SCORE.DESTROY_GEN;
    }
    return 0;
  }

  /** @private */
  _spawnMonster(mgr) {
    // Spawn at generator position, offset slightly to avoid spawning inside the generator
    const offsets = [
      {dx: -16, dy: 0}, {dx: 16, dy: 0},
      {dx: 0, dy: -16}, {dx: 0, dy: 16},
    ];
    const off = offsets[Math.floor(Math.random() * offsets.length)];
    mgr.add(new Monster(
      this.wx + off.dx,
      this.wy + off.dy,
      this.monType,
      this.level,
      this.theme,
    ));
  }
}

// ── Projectile ────────────────────────────────────────────────────────────────

export class Projectile extends Entity {
  /**
   * @param {number}  wx
   * @param {number}  wy
   * @param {number}  vx       Velocity X in px/ms
   * @param {number}  vy       Velocity Y in px/ms
   * @param {string}  owner    'player' or 'monster'
   * @param {number}  damage   HP damage on hit
   * @param {boolean} isLobbed True for lobber arcing shots (unused currently)
   * @param {string|null} heroId  Hero id ('warrior'/'valkyrie'/'elf'/'wizard') for sprite pick
   * @param {number}  dir      Firing direction (0-7, clockwise from S)
   */
  constructor(wx, wy, vx, vy, owner, damage, isLobbed = false, heroId = null, dir = 0) {
    super(wx, wy);
    this.vx       = vx;
    this.vy       = vy;
    this.owner    = owner;
    this.damage   = damage;
    this.isLobbed = isLobbed;
    this.heroId   = heroId;
    this.dir      = dir;
    this.ageMs    = 0;
    this.lifetime = 3000; // ms before auto-removal  [PLACEHOLDER]
  }

  /**
   * @param {number} dt
   * @param {Level}  level
   */
  update(dt, level) {
    this.wx += this.vx * dt;
    this.wy += this.vy * dt;
    this.ageMs   += dt;
    this.lifetime -= dt;
    if (this.lifetime <= 0) { this.dead = true; return; }

    // Off-grid? die so shots can't accumulate when fired toward open level edges
    const col = Math.floor(this.cx / CELL);
    const row = Math.floor(this.cy / CELL);
    if (col < 0 || col >= 32 || row < 0 || row >= 32) { this.dead = true; return; }
    if (level.isBlocked(col, row)) { this.dead = true; }
  }
}

// ── Item ──────────────────────────────────────────────────────────────────────

export class Item extends Entity {
  /**
   * @param {number} wx
   * @param {number} wy
   * @param {string} itemKind  One of: 'food_turkey','food_ham','food_jug',
   *                           'food_drumstick','key','potion_magic','invisibility',
   *                           'treasure_chest','treasure_bag','plus_armor',
   *                           'plus_speed','plus_magic','plus_shot_pow',
   *                           'plus_shot_spd','plus_fight'
   * @param {number} [hpValue] For food items, HP restored  [PLACEHOLDER]
   */
  constructor(wx, wy, itemKind, hpValue = DMG.FOOD_HP) {
    super(wx, wy);
    this.itemKind  = itemKind;
    this.hpValue   = hpValue;
    this.collected = false;
  }

  /**
   * Is this item food (gives HP)?
   */
  get isFood() {
    return this.itemKind.startsWith('food_');
  }

  /**
   * Is this item a power-up (permanently improves a stat)?
   */
  get isPowerUp() {
    return this.itemKind.startsWith('plus_');
  }

  /**
   * Collect this item by a player.
   * Returns a descriptor of what happened (caller handles effects).
   * @param {object} player
   * @returns {{ type: string, value: number }}
   */
  collect(player) {
    if (this.collected) return null;
    this.collected = true;
    this.dead      = true;

    switch (this.itemKind) {
      case 'food_turkey':
      case 'food_ham':
      case 'food_jug':
      case 'food_drumstick':
        return { type: 'food', value: this.hpValue };
      case 'key':
        return { type: 'key', value: 1 };
      case 'potion_magic':
        return { type: 'potion', value: 1 };
      case 'invisibility':
        return { type: 'invisibility', value: 30000 }; // 30 seconds  [PLACEHOLDER]
      case 'treasure_chest':
        return { type: 'score', value: SCORE.COLLECT_CHEST };
      case 'treasure_bag':
        return { type: 'score', value: SCORE.COLLECT_BAG };
      case 'plus_armor':
        return { type: 'powerup', stat: 'armour',    value: 0.25 };
      case 'plus_speed':
        return { type: 'powerup', stat: 'moveSpeed', value: 0.25 };
      case 'plus_magic':
        return { type: 'powerup', stat: 'magic',     value: 0.25 };
      case 'plus_shot_pow':
        return { type: 'powerup', stat: 'shotPower', value: 0.25 };
      case 'plus_shot_spd':
        return { type: 'powerup', stat: 'shotSpeed', value: 0.25 };
      case 'plus_fight':
        return { type: 'powerup', stat: 'fight',     value: 0.25 };
      default:
        return { type: 'score', value: 0 };
    }
  }
}

// ── Visual effect ─────────────────────────────────────────────────────────────

export class Fx extends Entity {
  /**
   * @param {number} wx
   * @param {number} wy
   * @param {string} fxType   'explosion' | 'teleport'
   * @param {number} [duration] ms to display
   */
  constructor(wx, wy, fxType, duration = 300) {
    super(wx, wy);
    this.fxType    = fxType;
    this.lifetime  = duration;
    this.animFrame = 0;
    this.animTimer = 0;
  }

  update(dt) {
    this.lifetime -= dt;
    if (this.lifetime <= 0) { this.dead = true; return; }
    this.animTimer += dt;
    if (this.animTimer > TIME.ANIM_FRAME_MS) {
      this.animTimer -= TIME.ANIM_FRAME_MS;
      this.animFrame++;
    }
  }
}

// ── EntityManager ─────────────────────────────────────────────────────────────
// Central registry for all active entities in the current level.

export class EntityManager {
  constructor() {
    /** @type {Entity[]} */
    this.entities = [];
    /** @type {Entity[]} Entities added this frame (merged at frame end) */
    this._pending = [];
  }

  /** Add an entity (deferred until end of frame to avoid mutation during iteration) */
  add(entity) {
    this._pending.push(entity);
    return entity;
  }

  /** Get all live entities of a given class */
  getAll(cls) {
    return this.entities.filter(e => e instanceof cls && !e.dead);
  }

  /**
   * Populate from a parsed Level.
   * Creates Generator and Item entities from the level grid.
   * Players are NOT added here — they are added by game.js.
   *
   * @param {Level}     level
   * @param {number}    theme   Dungeon theme 0/1/2  [PLACEHOLDER — from ROM header]
   */
  initFromLevel(level, theme = 0) {
    this.entities = [];
    this._pending = [];

    // Map item pixel sub-type bytes to item kind strings
    const ITEM_KIND_MAP = {
      0x00: 'food_turkey',    // Generic food → turkey as default
      0x10: 'food_turkey',    // Poison (treat as food for now)  [PLACEHOLDER]
      0x20: 'food_turkey',    // CONFIRMED $2B
      0x30: 'food_ham',
      0x40: 'food_jug',       // HYPOTHESIS $2E
      0x50: 'key',            // CONFIRMED $35
      0x60: 'potion_magic',   // CONFIRMED $2C
      0x70: 'treasure_bag',
      0x80: 'treasure_chest', // CONFIRMED $28
    };

    const POWERUP_KIND_MAP = {
      0x00: 'plus_armor',    // HYPOTHESIS $2F
      0x10: 'plus_speed',    // HYPOTHESIS $30
      0x20: 'plus_magic',    // HYPOTHESIS $31
      0x30: 'plus_shot_pow', // HYPOTHESIS $32
      0x40: 'plus_shot_spd', // HYPOTHESIS $33
      0x50: 'plus_fight',    // HYPOTHESIS $34
    };

    // Generator → monster type mapping for PLACEHOLDER codes
    // CONFIRMED: $19/$1A/$1B (ghost generators) → MON.GHOST
    // All others: PLACEHOLDER (type unconfirmed from ROM)
    const GEN_MON_TYPE = {
      0: MON.GHOST,    // Confirmed
      1: MON.DEMON,    // PLACEHOLDER
      2: MON.GRUNT,    // PLACEHOLDER
      3: MON.SORCERER, // PLACEHOLDER
      4: MON.LOBBER,   // PLACEHOLDER
      5: MON.DEATH,    // PLACEHOLDER
      6: MON.THIEF,    // PLACEHOLDER
    };

    const T = TILE_T;

    for (const tile of level.grid) {
      const wx = tile.col * CELL;
      const wy = tile.row * CELL;

      switch (tile.type) {
        case T.GENERATOR: {
          const monType = GEN_MON_TYPE[tile.monType] ?? MON.GRUNT;
          // Infer generator level from pixel sub-byte  [PLACEHOLDER]
          const genLevel = (tile.monType & 0x03) + 1; // 1/2/3
          this.add(new Generator(wx, wy, monType, Math.min(genLevel, 3), theme));
          break;
        }
        case T.ITEM: {
          const kind = ITEM_KIND_MAP[tile.itemType & 0xF0] ?? 'food_turkey';
          this.add(new Item(wx, wy, kind));
          break;
        }
        case T.POWER_UP: {
          const kind = POWERUP_KIND_MAP[tile.pwrType & 0xF0] ?? 'plus_armor';
          this.add(new Item(wx, wy, kind));
          break;
        }
        case T.INVIS: {
          this.add(new Item(wx, wy, 'invisibility'));
          break;
        }
      }
    }

    // Commit all pending entities
    this._commit();
    console.log(`[EntityManager] Spawned: ${this.entities.length} entities from level`);
  }

  /**
   * Update all entities.
   * @param {number}      dt
   * @param {Level}       level
   * @param {Player[]}    players
   */
  update(dt, level, players) {
    // Update monsters
    for (const e of this.entities) {
      if (e.dead) continue;
      if (e instanceof Monster)    e.update(dt, level, players, this);
      else if (e instanceof Generator)  e.update(dt, this);
      else if (e instanceof Projectile) e.update(dt, level);
      else if (e instanceof Fx)         e.update(dt);
    }

    // Remove dead entities
    this.entities = this.entities.filter(e => !e.dead);

    // Add newly spawned entities
    this._commit();
  }

  /** @private */
  _commit() {
    for (const e of this._pending) this.entities.push(e);
    this._pending = [];
  }

  /** Detonate a magic potion — kills all non-Death monsters in radius */
  detonateMagic(cx, cy, radiusTiles, players) {
    const radiusPx = radiusTiles * CELL;
    let score = 0;
    for (const e of this.entities) {
      if (e instanceof Monster && !e.dead) {
        const dx = e.cx - cx, dy = e.cy - cy;
        if (Math.sqrt(dx*dx + dy*dy) <= radiusPx) {
          if (e.monType !== MON.DEATH) {
            e.dead = true;
            score += SCORE[`KILL_${MON_NAME_UC[e.monType]}`] ?? SCORE.KILL_GRUNT;
            this.add(new Fx(e.wx, e.wy, 'explosion'));
          }
        }
      }
    }
    return score;
  }
}
