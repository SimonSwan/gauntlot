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
import { Sounds }      from "./sounds.js";
import { HEROES, TIME, DMG, MON, PALETTE } from "./constants.js";

const FIRE_SFX = ["firewarrior", "firevalkyrie", "fireelf", "firewizard"];
const MUSIC    = [
  "music_thebeginning", "music_citrinitas",   "music_lostcorridors",
  "music_fleshandsteel", "music_warbringer",  "music_phantomdrone",
  "music_bloodyhalo",   "music_mountingassault",
];

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
      await Promise.all([
        Assets.load("assets/").then(() => LevelLoader.init("assets/", Assets.levelManifest)),
        Sounds.load(),
      ]);
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

    // Any one-shot key from any player advances to the select screen.
    for (let i = 0; i < 4; i++) {
      const c = Input.getState(i);
      if (c.confirm || c.shoot) {
        // Reset join state so the select screen starts clean
        for (const p of this.players) p.joined = false;
        this._setState(STATE.SELECT);
        return;
      }
    }
  }

  // ── Select screen ───────────────────────────────────────────────────────────
  // Each player presses their own SHOOT key to JOIN (or LEAVE) their slot.
  // Any joined player presses MAGIC (or CONFIRM) to start the run.
  _select(_dt) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "bold 48px monospace";
    ctx.fillText("SELECT HERO", W/2, H * 0.14);
    ctx.font = "16px monospace";
    ctx.fillStyle = "#FFB000";
    ctx.fillText("EACH PLAYER: PRESS YOUR SHOOT KEY TO JOIN", W/2, H * 0.20);
    ctx.fillText("ANY JOINED PLAYER: PRESS MAGIC OR ENTER TO START", W/2, H * 0.24);

    const slotW = Math.min(220, W / 5);
    const y     = H * 0.55;
    const totalW = slotW * 4 + 60 * 3;
    const startX = (W - totalW) / 2 + slotW / 2;

    for (let i = 0; i < 4; i++) {
      const h = HEROES[i];
      const x = startX + i * (slotW + 60);
      const joined = this.players[i].joined;

      // Frame box
      ctx.lineWidth = 4;
      ctx.strokeStyle = joined ? h.color : "#444";
      ctx.strokeRect(x - slotW/2, y - slotW/2, slotW, slotW);

      // Hero portrait (frame 0 = facing south)
      const img = Assets.img[h.id];
      if (img) {
        const sz = h.frameSize;
        ctx.globalAlpha = joined ? 1 : 0.45;
        ctx.drawImage(img, 0, 0, sz, sz, x - slotW/2 + 8, y - slotW/2 + 8, slotW - 16, slotW - 16);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = h.color;
        ctx.fillRect(x - slotW/2 + 8, y - slotW/2 + 8, slotW - 16, slotW - 16);
      }

      // Name
      ctx.fillStyle = joined ? h.color : "#666";
      ctx.font = "bold 20px monospace";
      ctx.fillText(h.id.toUpperCase(), x, y + slotW/2 + 28);
      ctx.font = "14px monospace";
      ctx.fillText(joined ? "READY" : `P${i+1}: PRESS SHOOT`, x, y + slotW/2 + 50);
    }

    // Input: each player toggles their own join state via their shoot key
    let anyJoined = false;
    for (let i = 0; i < 4; i++) {
      const c = Input.getState(i);
      // Use the "pressed" set so holding doesn't oscillate join state every frame
      // (We approximate by checking if shoot held + a per-slot debounce timer.)
      if (c.shoot) {
        if (!this.players[i]._selDebounce) {
          this.players[i].joined = !this.players[i].joined;
          this.players[i]._selDebounce = 250;
          Sounds.play("opendoor", 0.4);
        }
      }
      if (this.players[i]._selDebounce > 0) {
        this.players[i]._selDebounce -= 16; // ~ per-frame
      }
      if (this.players[i].joined) anyJoined = true;
    }

    // Auto-join P1 after 4 seconds of no input so single-player still flows.
    if (!anyJoined) {
      this._selectIdle = (this._selectIdle || 0) + 16;
      if (this._selectIdle > 4000) { this.players[0].joined = true; }
    } else {
      this._selectIdle = 0;
    }

    // Start: any joined player pressing confirm/magic
    if (anyJoined) {
      for (let i = 0; i < 4; i++) {
        const p = this.players[i];
        if (!p.joined) continue;
        const c = Input.getState(i);
        if (c.confirm || c.magic) {
          this._beginRun();
          return;
        }
      }
    }
  }

  _beginRun() {
    // ROM levels are at the head of LevelLoader.levels, so index 0 is the
    // real ROM Level 1 (level-001.png).
    this.levelIdx = 0;
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
    // Cycle the music track per level so consecutive runs sound different
    Sounds.playMusic(MUSIC[idx % MUSIC.length], 0.4);
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
      // Drain one-shot SFX flags set by Player.update / Player._collectAt
      if (p._didFire)    { Sounds.play(FIRE_SFX[i % 4], 0.35); p._didFire = false; }
      if (p._lastPickup) { Sounds.play(p._lastPickup, 0.6);    p._lastPickup = null; }
      if (p.hp > 0 && p.hp < 200 && (this.frame % 240) === 0) {
        Sounds.say(`${p.hero.id} needs food badly`, { cooldown: 8000 });
      }
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
              const owner = this.players.find(p => p.joined);
              if (owner) owner.score += score;
              Sounds.play(`monsterdeath${1 + (Math.random()*3|0)}`, 0.3);
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
              if (g.hp <= 0) {
                g.dead = true;
                const owner = this.players.find(p => p.joined);
                if (owner) owner.score += 250;
                Sounds.play("generatordeath", 0.5);
              }
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
        Sounds.play("exitlevel", 0.6);
        break;
      }
    }

    // 6. Game-over: all joined players dead
    const anyAlive = this.players.some(p => p.joined && !p.dead);
    if (!anyAlive) {
      this._setState(STATE.GAMEOVER);
      Sounds.stopMusic();
      Sounds.play("gameover", 0.7);
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
