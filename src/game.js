// Top-level game: loads assets, manages screens (title, select, playing, transition, gameover).
import { Assets } from "./assets.js";
import { Input } from "./input.js";
import { Sounds } from "./sounds.js";
import { Render } from "./render.js";
import { Level } from "./level.js";
import { Player } from "./player.js";
import { Fx } from "./entities.js";
import {
  TILE, FPS, PLAYER_TYPES, PLAYER_LIST, VIEWPORT, SCORE_PER_LEVEL,
} from "./constants.js";

const LEVEL_META = [
  { src:"trainer1", name:"Training One",   music:"music_bloodyhalo",      help:"Shoot ghosts. Find the exit." },
  { src:"trainer2", name:"Training Two",   music:"music_bloodyhalo",      help:"Watch out for demon fire." },
  { src:"trainer3", name:"Training Three", music:"music_bloodyhalo",      help:"Find keys to open doors." },
  { src:"trainer4", name:"Training Four",  music:"music_bloodyhalo",      help:"Eat and drink to restore health." },
  { src:"trainer5", name:"Training Five",  music:"music_bloodyhalo",      help:"Collect treasure for high score." },
  { src:"trainer6", name:"Training Six",   music:"music_bloodyhalo",      help:"Destroy monster generators." },
  { src:"trainer7", name:"Training Seven", music:"music_bloodyhalo",      help:"Use potions to nuke all monsters." },
  { src:"level1",   name:"Dungeon One",    music:"music_citrinitas",      help:"Welcome to the Dungeon." },
  { src:"level2",   name:"Dungeon Two",    music:"music_citrinitas" },
  { src:"level3",   name:"Dungeon Three",  music:"music_fleshandsteel" },
  { src:"level4",   name:"Dungeon Four",   music:"music_fleshandsteel" },
  { src:"level5",   name:"Dungeon Five",   music:"music_phantomdrone" },
  { src:"level6",   name:"Dungeon Six",    music:"music_phantomdrone" },
  { src:"level7",   name:"Dungeon Seven",  music:"music_thebeginning" },
  { src:"level8",   name:"Dungeon Eight",  music:"music_mountingassault" },
  { src:"level9",   name:"Dungeon Nine",   music:"music_fleshandsteel" },
  { src:"level10",  name:"Dungeon Ten",    music:"music_warbringer",      help:"Final Level. Good luck!" },
];

const STATE = { BOOT: "boot", TITLE: "title", SELECT: "select", LOADING: "loading", PLAYING: "playing", TRANSITION: "transition", GAMEOVER: "gameover" };

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.assets = new Assets();
    this.input = new Input();
    this.sounds = new Sounds(this.assets);
    this.render = new Render(canvas, this.assets);
    this.events = { listeners: {}, on(k,f){(this.listeners[k]||(this.listeners[k]=[])).push(f);}, emit(k,...a){(this.listeners[k]||[]).forEach(f=>f(...a));} };

    this.state = STATE.BOOT;
    this.frame = 0;
    this.players = [
      new Player(0, PLAYER_TYPES.WARRIOR),
      new Player(1, PLAYER_TYPES.VALKYRIE),
      new Player(2, PLAYER_TYPES.WIZARD),
      new Player(3, PLAYER_TYPES.ELF),
    ];
    this.activeTypes = [null, null, null, null]; // chosen type indices per slot during select

    this.viewport = { x: 0, y: 0, w: this.render.viewW, h: this.render.viewH, outside: () => false };
    this.viewport.outside = (x, y, w, h) => (x + w < this.viewport.x || x > this.viewport.x + this.viewport.w || y + h < this.viewport.y || y > this.viewport.y + this.viewport.h);

    this.levelIndex = 0;
    this.level = null;
    this.transitionTimer = 0;
    this.gameoverTimer = 0;
    this._loadProgress = { done: 0, total: 1, key: "" };
  }

  async start() {
    this.state = STATE.BOOT;
    this._renderBoot();
    await this.assets.loadAll((d, t, k) => { this._loadProgress = { done: d, total: t, key: k }; });
    this.state = STATE.TITLE;
    this._loop();
  }

  _renderBoot() {
    const ctx = this.canvas.getContext("2d");
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#999"; ctx.font = "16px monospace";
    ctx.textAlign = "center";
    const p = this._loadProgress;
    ctx.fillText("LOADING…", this.canvas.width/2, this.canvas.height/2 - 12);
    ctx.fillStyle = "#444"; ctx.fillRect(this.canvas.width/2 - 100, this.canvas.height/2, 200, 8);
    ctx.fillStyle = "#0c0"; ctx.fillRect(this.canvas.width/2 - 100, this.canvas.height/2, 200 * (p.done/Math.max(1,p.total)), 8);
    requestAnimationFrame(() => { if (this.state === STATE.BOOT) this._renderBoot(); });
  }

  _loop() {
    const tick = () => {
      this.input.beginFrame();
      this.frame++;
      switch (this.state) {
        case STATE.TITLE: this._title(); break;
        case STATE.SELECT: this._select(); break;
        case STATE.LOADING: this._loading(); break;
        case STATE.PLAYING: this._playing(); break;
        case STATE.TRANSITION: this._transition(); break;
        case STATE.GAMEOVER: this._gameover(); break;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // -------- TITLE --------
  _title() {
    const ctx = this.canvas.getContext("2d");
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Title text glow
    const t = this.frame * 0.02;
    ctx.save();
    ctx.translate(this.canvas.width/2, this.canvas.height/2 - 80);
    const img = this.assets.images.textGauntlet;
    if (img && img.naturalWidth) {
      const scale = 2;
      ctx.drawImage(img, -img.width*scale/2, 0, img.width*scale, img.height*scale);
    } else {
      ctx.fillStyle = "#ffd24a"; ctx.font = "bold 48px monospace"; ctx.textAlign = "center";
      ctx.shadowColor = "#f63"; ctx.shadowBlur = 16 + Math.sin(t)*6;
      ctx.fillText("GAUNTLET", 0, 32);
    }
    ctx.restore();

    ctx.fillStyle = "#fff"; ctx.font = "16px monospace"; ctx.textAlign = "center";
    ctx.fillText("Press any key or button to begin", this.canvas.width/2, this.canvas.height/2 + 8);
    ctx.fillStyle = "#888"; ctx.font = "11px monospace";
    ctx.fillText("Up to 4 players — keyboard or gamepad", this.canvas.width/2, this.canvas.height/2 + 28);
    ctx.fillText("P1 WASD+G/H   P2 IJKL+;/'   P3 ARROWS+./,   P4 NUMPAD", this.canvas.width/2, this.canvas.height/2 + 44);

    // four hero portraits
    const cy = this.canvas.height - 140;
    for (let i = 0; i < 4; i++) {
      const t = this.players[i].type;
      const x = this.canvas.width/2 + (i - 1.5) * 100;
      const sheet = this.assets.images[t.key];
      if (sheet && sheet.naturalWidth) {
        ctx.drawImage(sheet, 0, 4*24, 24, 24, x - 24, cy, 48, 48);
      } else {
        ctx.fillStyle = t.color;
        ctx.fillRect(x - 24, cy, 48, 48);
      }
      ctx.fillStyle = t.color; ctx.font = "11px monospace"; ctx.textAlign = "center";
      ctx.fillText(t.key.toUpperCase(), x, cy + 60);
    }

    if (this.input.anyPressed()) {
      this.sounds.music("music_lostcorridors", 0.4);
      this._startSelect();
    }
  }

  _startSelect() {
    this.state = STATE.SELECT;
    for (const p of this.players) { p.joined = false; p.score = 0; }
    this.activeTypes = [null, null, null, null];
    this._selectIdx = [0, 1, 2, 3];
  }

  // -------- CHARACTER SELECT --------
  _select() {
    const ctx = this.canvas.getContext("2d");
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#fff"; ctx.font = "bold 18px monospace"; ctx.textAlign = "center";
    ctx.fillText("CHOOSE YOUR HERO", this.canvas.width/2, 40);
    ctx.font = "12px monospace"; ctx.fillStyle = "#aaa";
    ctx.fillText("Each player picks with arrows; SHOOT to lock in. ENTER on any locked-in player to start.", this.canvas.width/2, 64);

    const cellW = this.canvas.width / 4;
    let anyLocked = false;
    for (let i = 0; i < 4; i++) {
      const cmd = this.input.getPlayer(i);
      if (cmd.dx !== 0 && (this.frame - (this._lastDir?.[i] ?? -100)) > 8) {
        this._selectIdx[i] = (this._selectIdx[i] + (cmd.dx > 0 ? 1 : -1) + 4) % 4;
        this._lastDir = this._lastDir || [];
        this._lastDir[i] = this.frame;
      }
      if (cmd.join && this.activeTypes[i] === null) {
        this.activeTypes[i] = this._selectIdx[i];
        this.sounds.play("collectkey", 0.4);
      }
      if (cmd.magic && this.activeTypes[i] !== null) {
        this.activeTypes[i] = null;
      }
      if (this.activeTypes[i] !== null) anyLocked = true;

      const x = i * cellW;
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fillRect(x + 8, 100, cellW - 16, 240);
      ctx.strokeStyle = this.activeTypes[i] !== null ? this.players[this.activeTypes[i]].type.color : "#444";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 8, 100, cellW - 16, 240);

      ctx.fillStyle = "#fff"; ctx.font = "bold 12px monospace"; ctx.textAlign = "center";
      ctx.fillText(`PLAYER ${i+1}`, x + cellW/2, 120);

      const idx = this._selectIdx[i];
      const t = PLAYER_TYPES[PLAYER_LIST[idx]];
      const img = this.assets.images[t.key];
      if (img && img.naturalWidth) {
        ctx.drawImage(img, 0, 4*24, 24, 24, x + cellW/2 - 36, 140, 72, 72);
      } else {
        ctx.fillStyle = t.color; ctx.fillRect(x + cellW/2 - 36, 140, 72, 72);
      }
      ctx.fillStyle = t.color; ctx.font = "bold 13px monospace";
      ctx.fillText(t.key.toUpperCase(), x + cellW/2, 232);
      ctx.fillStyle = "#aaa"; ctx.font = "10px monospace";
      ctx.fillText(t.name, x + cellW/2, 248);
      ctx.fillText(`HP ${t.health}  ARM ${t.armor}  MAG ${t.magic}`, x + cellW/2, 262);
      ctx.fillText(`SPEED ${(t.speed*FPS).toFixed(0)}  SHOT ${(t.weaponSpeed*FPS).toFixed(0)}`, x + cellW/2, 276);

      if (this.activeTypes[i] !== null) {
        ctx.fillStyle = "#0c0"; ctx.font = "bold 12px monospace";
        ctx.fillText("READY", x + cellW/2, 300);
      } else {
        ctx.fillStyle = "#777"; ctx.font = "10px monospace";
        ctx.fillText("← →  to choose", x + cellW/2, 300);
        ctx.fillText("SHOOT to lock in", x + cellW/2, 314);
      }
    }

    ctx.fillStyle = anyLocked ? "#ffe66d" : "#555";
    ctx.font = "bold 14px monospace"; ctx.textAlign = "center";
    ctx.fillText(anyLocked ? "Press ENTER to begin" : "At least one player must lock in",
      this.canvas.width/2, this.canvas.height - 30);

    const startPressed = this.input.pressed("Enter") || this.input.pressed("Space") || this.input.pressed("NumpadEnter");
    if (anyLocked && startPressed) {
      // Assign chosen types and join
      for (let i = 0; i < 4; i++) {
        if (this.activeTypes[i] !== null) {
          this.players[i].type = PLAYER_TYPES[PLAYER_LIST[this.activeTypes[i]]];
          this.players[i].joined = true;
          this.players[i].score = 0;
        } else {
          this.players[i].joined = false;
        }
      }
      this.levelIndex = 0;
      this._enterLoading();
    }
  }

  _enterLoading() {
    this.state = STATE.LOADING;
    this._loadingTimer = FPS * 1.5;
  }

  // -------- LOADING (level fade-in) --------
  _loading() {
    const meta = LEVEL_META[Math.min(this.levelIndex, LEVEL_META.length - 1)];
    const src = this.assets.levels.find(l => l.name === meta.src);
    if (!this.level || this.level.src !== src) {
      this.level = new Level(this, src, meta);
      this.level.game = this;
      // place each joined player at a starting position
      let starts = this.level.starts.slice();
      if (starts.length === 0) starts = [{ x: TILE*2, y: TILE*2 }];
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (!p.joined) continue;
        p.level = this.level;
        const s = starts[i % starts.length];
        p.x = s.x; p.y = s.y;
        p.exiting = null; p.dead = false;
        p.health = Math.max(p.health, p.type.health/2);
        this.level.occupy(p, p.x, p.y);
      }
      this.sounds.music(meta.music, 0.4);
      this.sounds.say("Welcome to the Dungeon. The Adventure begins!", { cooldown: 30000 });
    }

    // draw level briefly
    this._updateViewport();
    this.render.drawWorld(this.level, this.viewport, this.frame, this.players);
    this.render.drawHud(this.players, this.level, meta.name);
    // overlay fade-in
    const a = Math.max(0, this._loadingTimer / (FPS * 1.5));
    const ctx = this.canvas.getContext("2d");
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = `rgba(255,220,80,${a})`;
    ctx.font = "bold 22px monospace"; ctx.textAlign = "center";
    ctx.fillText(meta.name, this.canvas.width/2, this.canvas.height/2);
    if (meta.help) {
      ctx.fillStyle = `rgba(180,200,255,${a*0.9})`;
      ctx.font = "12px monospace";
      ctx.fillText(meta.help, this.canvas.width/2, this.canvas.height/2 + 24);
    }
    if (--this._loadingTimer <= 0) this.state = STATE.PLAYING;
  }

  // -------- PLAYING --------
  _playing() {
    // updates
    for (const p of this.players) p.update(1, this.frame, this.level, this.input);
    this.level.update(1, this.frame, this.players, this.viewport);
    this._updateViewport();

    // exit detection
    const joined = this.players.filter(p => p.joined && !p.dead);
    if (joined.length === 0) {
      this.state = STATE.GAMEOVER; this.gameoverTimer = FPS * 4;
      this.sounds.music(null);
      this.sounds.play("gameover", 0.6);
      return;
    }
    if (joined.every(p => p.exiting && p.exiting.done)) {
      // all alive players have exited
      for (const p of this.players) if (p.joined && !p.dead) p.score += SCORE_PER_LEVEL * (this.levelIndex + 1);
      this.levelIndex++;
      if (this.levelIndex >= LEVEL_META.length) {
        this.state = STATE.GAMEOVER;
        this.gameoverTimer = FPS * 6;
        this.sounds.music(null);
        this.sounds.play("victory", 0.8);
        this.sounds.say("Victory! You have triumphed!", { cooldown: 0 });
        return;
      }
      this.state = STATE.TRANSITION;
      this.transitionTimer = FPS * 2;
      this.sounds.play("exitlevel", 0.7);
      return;
    }

    // draw
    this.render.drawWorld(this.level, this.viewport, this.frame, this.players);
    this.render.drawHud(this.players, this.level, LEVEL_META[this.levelIndex]?.name || "");
  }

  _transition() {
    const ctx = this.canvas.getContext("2d");
    this.render.drawWorld(this.level, this.viewport, this.frame, this.players);
    this.render.drawHud(this.players, this.level, "");
    ctx.fillStyle = `rgba(0,0,0,${1 - this.transitionTimer/(FPS*2)})`;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#fff8a0"; ctx.font = "bold 20px monospace"; ctx.textAlign = "center";
    ctx.fillText("LEVEL CLEAR", this.canvas.width/2, this.canvas.height/2 - 4);
    ctx.fillStyle = "#aaa"; ctx.font = "12px monospace";
    ctx.fillText(`+${SCORE_PER_LEVEL * this.levelIndex} bonus`, this.canvas.width/2, this.canvas.height/2 + 18);
    if (--this.transitionTimer <= 0) {
      this.level = null;
      this._enterLoading();
    }
  }

  _gameover() {
    const ctx = this.canvas.getContext("2d");
    if (this.level) {
      this.render.drawWorld(this.level, this.viewport, this.frame, this.players);
      this.render.drawHud(this.players, this.level, "");
    } else {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#ff4040"; ctx.font = "bold 36px monospace"; ctx.textAlign = "center";
    ctx.fillText("GAME OVER", this.canvas.width/2, this.canvas.height/2 - 16);
    ctx.fillStyle = "#fff"; ctx.font = "14px monospace";
    let topScore = 0, topName = "";
    for (const p of this.players) if (p.joined && p.score > topScore) { topScore = p.score; topName = p.type.key.toUpperCase(); }
    ctx.fillText(`HIGH: ${topName} ${topScore}`, this.canvas.width/2, this.canvas.height/2 + 14);
    ctx.fillStyle = "#888";
    ctx.fillText("Press any key for title", this.canvas.width/2, this.canvas.height/2 + 38);
    if (--this.gameoverTimer <= 0 && this.input.anyPressed()) {
      this.level = null;
      this.state = STATE.TITLE;
    }
  }

  _updateViewport() {
    if (!this.level) return;
    // camera follows centroid of joined alive players
    let cx = 0, cy = 0, n = 0;
    for (const p of this.players) {
      if (p.joined) { cx += p.x + TILE/2; cy += p.y + TILE/2; n++; }
    }
    if (n === 0) return;
    cx /= n; cy /= n;
    const targetX = cx - this.viewport.w/2;
    const targetY = cy - this.viewport.h/2;
    // smooth follow
    this.viewport.x += (targetX - this.viewport.x) * 0.18;
    this.viewport.y += (targetY - this.viewport.y) * 0.18;
    this.viewport.x = Math.max(0, Math.min(this.level.w - this.viewport.w, this.viewport.x));
    this.viewport.y = Math.max(0, Math.min(this.level.h - this.viewport.h, this.viewport.y));
  }
}
