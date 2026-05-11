/**
 * src/player.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One Player per slot (up to 4). Owns hero stats, world position, HP, score,
 * keys, potions, and a per-frame input → movement / shoot / magic loop.
 *
 * Coordinate system matches entities.js: 16px tile grid, world positions in
 * pixels, entity centre = (wx + 12, wy + 12).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { HEROES, DMG, TIME, DIR, DIR_VEC, SCORE } from "./constants.js";
import { Projectile } from "./entities.js";
import { T } from "./level.js";

export class Player {
  /**
   * @param {number} slot   0..3
   * @param {number} heroIdx index into HEROES (0=warrior, 1=valkyrie, 2=elf, 3=wizard)
   */
  constructor(slot, heroIdx) {
    this.slot      = slot;
    this.hero      = HEROES[heroIdx];
    this.joined    = false;
    this.dead      = false;
    this.wx        = 0;
    this.wy        = 0;
    this.hp        = TIME.PLAYER_START_HP;
    this.score     = 0;
    this.keys      = 0;
    this.potions   = 0;
    this.dir       = DIR.S;
    this.animFrame = 0;
    this.animTimer = 0;
    this.walkFrame      = 0; // 0 or 1 — walk cycle frame (cols 1-2)
    this.shootAnimFrame = 0; // 0..N — shoot animation progress (cols 3..)
    this.shooting       = false;
    this.shotCd    = 0;
    this.invuln    = 0;
    this.drainAcc  = 0;
  }

  get cx() { return this.wx + 12; }
  get cy() { return this.wy + 12; }
  get tileCol() { return Math.floor(this.cx / 16); }
  get tileRow() { return Math.floor(this.cy / 16); }

  spawnAt(col, row) {
    this.wx = col * 16;
    this.wy = row * 16;
    this.hp = Math.max(this.hp, TIME.PLAYER_START_HP);
    this.dead = false;
    this.invuln = TIME.INVULN_MS;
  }

  /**
   * @param {number} dt        Delta time in ms
   * @param {object} cmd       Input.getState() — {up,down,left,right,shoot,magic,dx,dy}
   * @param {Level}  level
   * @param {EntityManager} mgr
   */
  update(dt, cmd, level, mgr) {
    if (!this.joined || this.dead) return;

    // Passive HP drain (≈ 1 HP per 0.5 s = 2 HP/s)
    this.drainAcc += (TIME.HEALTH_DRAIN_PER_SEC * dt) / 1000;
    if (this.drainAcc >= 1) {
      const whole = this.drainAcc | 0;
      this.hp -= whole;
      this.drainAcc -= whole;
    }
    if (this.hp <= 0) { this.hp = 0; this.dead = true; return; }

    if (this.shotCd > 0) this.shotCd -= dt;
    if (this.invuln > 0) this.invuln -= dt;

    // ── Movement ────────────────────────────────────────────────────────────
    const speed   = TIME.PLAYER_SPEED_PX * (this.hero.moveSpeed || 1);
    const pxPerMs = speed / 1000;
    const move    = pxPerMs * dt;

    let dx = 0, dy = 0;
    if (cmd.left)  dx -= 1;
    if (cmd.right) dx += 1;
    if (cmd.up)    dy -= 1;
    if (cmd.down)  dy += 1;

    if (dx || dy) {
      // Move X and Y independently so we can slide along walls
      if (dx !== 0) {
        const nx   = this.wx + dx * move;
        const ncol = Math.floor((nx + 12) / 16);
        if (!level.isBlocked(ncol, this.tileRow)) this.wx = nx;
      }
      if (dy !== 0) {
        const ny   = this.wy + dy * move;
        const nrow = Math.floor((ny + 12) / 16);
        if (!level.isBlocked(this.tileCol, nrow)) this.wy = ny;
      }

      // Face
      if      (dx ===  1 && dy ===  1) this.dir = DIR.SE;
      else if (dx ===  1 && dy === -1) this.dir = DIR.NE;
      else if (dx === -1 && dy ===  1) this.dir = DIR.SW;
      else if (dx === -1 && dy === -1) this.dir = DIR.NW;
      else if (dx ===  1)              this.dir = DIR.E;
      else if (dx === -1)              this.dir = DIR.W;
      else if (dy ===  1)              this.dir = DIR.S;
      else if (dy === -1)              this.dir = DIR.N;

      // Walk anim — cycle through walk cols 1-2 (CONFIRMED col 0 = idle pose)
      this.animTimer += dt;
      if (this.animTimer >= TIME.ANIM_FRAME_MS) {
        this.animTimer -= TIME.ANIM_FRAME_MS;
        this.walkFrame = (this.walkFrame + 1) % 2;
      }
    } else {
      this.walkFrame = 0;
      this.animTimer = 0;
    }

    // ── Shoot ───────────────────────────────────────────────────────────────
    // shootAnimFrame drives the col 3..N pose; shotCd controls fire rate.
    if (cmd.shoot && this.shotCd <= 0) {
      const v = DIR_VEC[this.dir];
      const shotSpeed = TIME.PLAYER_SHOT_SPEED * (this.hero.shotSpeed || 1) / 1000;
      mgr.add(new Projectile(
        this.cx - 4, this.cy - 4,
        v.dx * shotSpeed,
        v.dy * shotSpeed,
        "player",
        DMG.PLAYER_SHOT,
        false,
        this.hero.id,
        this.dir,
      ));
      this.shotCd = 300 / (this.hero.shotSpeed || 1);
      this._didFire = true;     // game.js consumes this flag for SFX
      this.shooting = true;
      this.shootAnimFrame = 0;
      this.shootAnimTimer = 0;
    }
    if (this.shooting) {
      this.shootAnimTimer = (this.shootAnimTimer || 0) + dt;
      // Shoot cols are 3..(frameCols-1).  Advance one frame per ANIM_FRAME_MS.
      const shootCols = Math.max(1, this.hero.frameCols - 3);
      const idx = Math.floor(this.shootAnimTimer / TIME.ANIM_FRAME_MS);
      if (idx >= shootCols) {
        this.shooting = false;
        this.shootAnimFrame = 0;
      } else {
        this.shootAnimFrame = idx;
      }
    }

    // Final animFrame: shoot pose overrides walk/idle
    if (this.shooting)         this.animFrame = 3 + this.shootAnimFrame;
    else if (dx !== 0 || dy !== 0) this.animFrame = 1 + this.walkFrame;
    else                            this.animFrame = 0;

    // ── Magic ───────────────────────────────────────────────────────────────
    if (cmd.magic && this.potions > 0) {
      this.potions--;
      const radius = (DMG.MAGIC_RADIUS || 6) * (this.hero.magic || 1);
      this.score += mgr.detonateMagic(this.cx, this.cy, radius, [this]);
    }

    // ── Tile-side effects: gates / exits / items handled at game.js level ──
    this._collectAt(level, mgr);
  }

  /** Collect any Item on the current tile, open gates with keys. */
  _collectAt(level, mgr) {
    const col = this.tileCol, row = this.tileRow;
    const tile = level.tileAt(col, row);
    if (!tile) return;

    // Adjacent gates: if the player has a key and is next to a locked gate, open.
    if (this.keys > 0) {
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        if (level.unlockGate(col + dc, row + dr)) {
          this.keys--;
          break;
        }
      }
    }

    // Stand-on item pickup
    for (const e of mgr.entities) {
      if (!e || e.dead) continue;
      if (e.constructor.name !== "Item") continue;
      const ec = Math.floor(e.cx / 16), er = Math.floor(e.cy / 16);
      if (ec !== col || er !== row) continue;

      const k = e.itemKind || "";
      let sfx = null;
      if (k === "key")                                  { this.keys++;    e.dead = true; this.score += SCORE.COLLECT_KEY;    sfx = "collectkey"; }
      else if (k === "potion_magic" || k === "invisibility") { this.potions++; e.dead = true; this.score += SCORE.COLLECT_POTION; sfx = "collectpotion"; }
      else if (k.startsWith("food_"))                    { this.hp += DMG.FOOD_HP; e.dead = true; this.score += SCORE.COLLECT_FOOD;   sfx = "collectfood"; }
      else if (k === "treasure_chest")                   { e.dead = true; this.score += SCORE.COLLECT_CHEST; sfx = "collectgold"; }
      else if (k === "treasure_bag")                     { e.dead = true; this.score += SCORE.COLLECT_BAG;   sfx = "collectgold"; }
      else if (k.startsWith("plus_"))                    { e.dead = true; this.score += SCORE.COLLECT_BAG;   sfx = "collectgold"; }
      if (sfx) this._lastPickup = sfx;     // game.js consumes this
    }
  }

  hurt(dmg) {
    if (this.dead || this.invuln > 0) return;
    this.hp -= dmg;
    this.invuln = TIME.INVULN_MS;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  }
}
