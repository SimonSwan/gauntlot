/**
 * src/game.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Top-level state machine.
 *
 *   BOOT → TITLE → SELECT → PLAYING → TRANSITION → PLAYING ...
 *                                ↘  GAMEOVER
 *
 * Holds the active Level + Players + EntityManager and drives the per-frame
 * update / render loop.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Assets }      from "./assets.js";
import { Input }       from "./input.js";
import { LevelLoader, T } from "./level.js";
import { EntityManager, Monster, Projectile, Generator } from "./entities.js";
import { Player }      from "./player.js";
import { Render }      from "./render.js";
import { HEROES, TIME, DMG, MON, PALETTE } from "./constants.js";

const STATE = {
  BOOT:       "boot",
  TITLE:      "title",
  SELECT:     "select",
  LOADING:    "loading",
  PLAYING:    "playing",
  TRANSITION: "transition",
  GAMEOVER:   "gameover",
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext("2d");
    this.render = new Render(canvas);

    this.players = [
      new Player(0, 0),
      new Player(1, 1),
      new Player(2, 2),
      new Player(3, 3),
    ];
    this.mgr        = new EntityManager();
    this.level      = null;
    this.levelIdx   = 0;
    this.state      = STATE.BOOT;
    this.frame      = 0;
    this.lastT      = performance.now();
    this.transTimer = 0;
    this.loadProg   = { done: 0, total: 1 };
  }

  async start() {
    Input.init();
    this._setState(STATE.BOOT);
    this._renderBoot();
    try {
      await Assets.load("assets/");
      LevelLoader.init("assets/", Assets.levelManifest);
    } catch (e) {
      console.error("[Game] Asset load failed:", e);
    }
    this._setState(STATE.TITLE);
    requestAnimationFrame(() => this._loop());
  }

  _setState(s) { this.state = s; }

  _renderBoot() {
    const ctx = this.ctx;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#9a9a9a";
    ctx.font = "bold 32px monospace";
    ctx.textAlign = "center";
    ctx.fillText("LOADING…", this.canvas.width/2, this.canvas.height/2);
  }

  _loop() {
    const now = performance.now();
    let dt = now - this.lastT;
    this.lastT = now;
    if (dt > 100) dt = 100;        // clamp absurd dt on tab-switch
    this.frame++;

    Input.update();

    switch (this.state) {
      case STATE.TITLE:      this._title(dt); break;
      case STATE.SELECT:     this._select(dt); break;
      case STATE.LOADING:    this._loading(dt); break;
      case STATE.PLAYING:    this._playing(dt); break;
      case STATE.TRANSITION: this._transition(dt); break;
      case STATE.GAMEOVER:   this._gameover(dt); break;
    }

    // Clear one-shot 'pressed' set so confirm/magic don't fire continuously
    Input.clearFrame();

    requestAnimationFrame(() => this._loop());
  }

  // ── States ──────────────────────────────────────────────────────────────────
  _title(dt) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "bold 96px monospace";
    ctx.fillText("GAUNTLET", W/2, H * 0.30);
    ctx.fillStyle = "#FFB000";
    ctx.font = "bold 24px monospace";
    ctx.fillText("1985 ATARI — 4 PLAYER ACTION", W/2, H * 0.40);

    const slotW = Math.min(180, W / 6);
    const y     = H * 0.60;
    for (let i = 0; i < 4; i++) {
      const h = HEROES[i];
      const x = W/2 + (i - 1.5) * (slotW + 20);
      const img = Assets.img[h.id];
      if (img) {
        // Draw frame at (col 0, row 4 = facing south)
        const sz = h.frameSize;
        ctx.drawImage(img, 0, 0 * sz, sz, sz, x - slotW/2, y - slotW/2, slotW, slotW);
      } else {
        ctx.fillStyle = h.color;
        ctx.fillRect(x - slotW/2, y - slotW/2, slotW, slotW);
      }
      ctx.fillStyle = h.color;
      ctx.font = "bold 16px monospace";
      ctx.fillText(h.id.toUpperCase(), x, y + slotW/2 + 24);
    }

    const blink = Math.floor(this.frame / 30) % 2;
    ctx.fillStyle = blink ? "#fff" : "#444";
    ctx.font = "bold 28px monospace";
    ctx.fillText("PRESS START", W/2, H * 0.86);

    ctx.fillStyle = "#666";
    ctx.font = "12px monospace";
    ctx.fillText("P1 WASD+G/H    P2 IJKL+;/'    P3 ARROWS+./,    P4 NUMPAD", W/2, H * 0.92);

    // Any input from any player joins immediately and starts the level
    for (let i = 0; i < 4; i++) {
      const c = Input.getState(i);
      if (c.confirm || c.shoot || c.up || c.down || c.left || c.right) {
        this._joinAndStart(i);
        return;
      }
    }
  }

  _select(_dt) { /* not used in this minimal build — title joins straight in */ }

  _joinAndStart(starterSlot) {
    this.players[starterSlot].joined = true;
    this.levelIdx = 0;
    // Prefer ROM levels (skip the 17 trainer slots whose files don't exist).
    // Index 17 is level-001.png — the garbage $0003 entry from the pointer
    // table — so start at 18 (the real maze001 at ROM ptr $833d).
    if (Assets.levelManifest && Assets.levelManifest.levels?.length) {
      this.levelIdx = 18;
    }
    this._loadLevel(this.levelIdx);
  }

  async _loadLevel(idx) {
    this._setState(STATE.LOADING);
    try {
      this.level = await LevelLoader.loadLevel(idx);
    } catch (e) {
      // Skip missing trainer levels by hopping to the next index.
      console.warn(`[Game] Level ${idx} failed to load: ${e.message}`);
      if (idx + 1 < LevelLoader.count) { this._loadLevel(idx + 1); return; }
      this._setState(STATE.GAMEOVER); return;
    }
    this.levelIdx = idx;
    this.mgr.initFromLevel(this.level, 0);
    // Place each joined player at the first spawn (offset slightly for multi-player)
    const spawn = this.level.spawns[0] || { col: 1, row: 1 };
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p.joined) continue;
      // Offset multi-player spawns by tile units, falling back to spawn if blocked.
      const offsets = [[0,0],[1,0],[0,1],[1,1]];
      const [oc, or] = offsets[i] || [0,0];
      const nc = spawn.col + oc, nr = spawn.row + or;
      if (!this.level.isBlocked(nc, nr)) p.spawnAt(nc, nr);
      else                                p.spawnAt(spawn.col, spawn.row);
    }
    this._setState(STATE.PLAYING);
  }

  _loading(_dt) {
    const ctx = this.ctx;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#fff"; ctx.textAlign = "center";
    ctx.font = "bold 32px monospace";
    ctx.fillText(`LOADING LEVEL ${this.levelIdx + 1}`, this.canvas.width/2, this.canvas.height/2);
  }

  _playing(dt) {
    // 1. Player input → players
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p.joined) continue;
      const cmd = Input.getState(i);
      p.update(dt, cmd, this.level, this.mgr);
    }

    // 2. Entities (monsters, generators, projectiles, fx)
    this.mgr.update(dt, this.level, this.players);

    // 3. Collisions: monsters touch players
    for (const e of this.mgr.entities) {
      if (!(e instanceof Monster) || e.dead) continue;
      for (const p of this.players) {
        if (!p.joined || p.dead) continue;
        if (e.overlaps(p, 10)) p.hurt(e.meleeDamage);
      }
    }

    // 4. Projectiles hit monsters / players
    for (const e of this.mgr.entities) {
      if (!(e instanceof Projectile) || e.dead) continue;
      if (e.owner === "player") {
        for (const m of this.mgr.entities) {
          if (!(m instanceof Monster) || m.dead) continue;
          if (e.overlaps(m, 12)) {
            const score = m.hit();
            if (score > 0) {
              // attribute to nearest joined player (simple version: first joined)
              const owner = this.players.find(p => p.joined);
              if (owner) owner.score += score;
            }
            e.dead = true;
            break;
          }
        }
        // Also damage generators on direct hit
        if (!e.dead) {
          for (const g of this.mgr.entities) {
            if (!(g instanceof Generator) || g.dead) continue;
            if (e.overlaps(g, 12)) {
              g.hp = (g.hp ?? 5) - 1;
              if (g.hp <= 0) { g.dead = true; const owner = this.players.find(p => p.joined); if (owner) owner.score += 250; }
              e.dead = true;
              break;
            }
          }
        }
      } else if (e.owner === "monster") {
        for (const p of this.players) {
          if (!p.joined || p.dead) continue;
          if (e.overlaps(p, 12)) {
            p.hurt(e.damage || 5);
            e.dead = true;
            break;
          }
        }
      }
    }

    // 5. Exit detection: any joined player standing on an exit
    for (const p of this.players) {
      if (!p.joined || p.dead) continue;
      const tile = this.level.tileAt(p.tileCol, p.tileRow);
      if (!tile) continue;
      if (tile.type === T.EXIT || tile.type === T.EXIT_WARP4 || tile.type === T.EXIT_WARP8) {
        this.transTimer = 600;
        this._setState(STATE.TRANSITION);
        break;
      }
    }

    // 6. Game-over: all joined players dead
    const anyAlive = this.players.some(p => p.joined && !p.dead);
    if (!anyAlive) {
      this._setState(STATE.GAMEOVER);
    }

    // 7. Render
    this.render.drawFrame(this.level, this.players, this.mgr, this.frame);
  }

  _transition(dt) {
    this.transTimer -= dt;
    const ctx = this.ctx;
    this.render.drawFrame(this.level, this.players, this.mgr, this.frame);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#fff"; ctx.textAlign = "center";
    ctx.font = "bold 32px monospace";
    ctx.fillText(`LEVEL ${this.levelIdx + 1} CLEARED`, this.canvas.width/2, this.canvas.height/2);

    if (this.transTimer <= 0) {
      const next = this.levelIdx + 1;
      if (next >= LevelLoader.count) { this._setState(STATE.GAMEOVER); return; }
      this._loadLevel(next);
    }
  }

  _gameover(_dt) {
    const ctx = this.ctx;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#fff"; ctx.textAlign = "center";
    ctx.font = "bold 64px monospace";
    ctx.fillText("GAME OVER", this.canvas.width/2, this.canvas.height/2);
    ctx.font = "bold 16px monospace";
    ctx.fillStyle = "#888";
    ctx.fillText("PRESS ANY KEY", this.canvas.width/2, this.canvas.height/2 + 48);

    for (let i = 0; i < 4; i++) {
      const c = Input.getState(i);
      if (c.confirm || c.shoot) {
        // reset and back to title
        this.players = [
          new Player(0, 0), new Player(1, 1), new Player(2, 2), new Player(3, 3),
        ];
        this.mgr = new EntityManager();
        this.level = null;
        this.levelIdx = 0;
        this._setState(STATE.TITLE);
        return;
      }
    }
  }
}
