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
  WALL, FLOOR,
} from "./constants.js";

// Per-dungeon wall + floor themes cycle through the available ROM-atlas
// palettes so consecutive levels visually differ — same approach Jake's
// javascript-gauntlet uses for its 10 hand-crafted dungeons.
const WALL_CYCLE  = [WALL.BLUE_COBBLE, WALL.CONCRETE,    WALL.BLUE,         WALL.PURPLE_COBBLE,
                     WALL.BLUE_BRICK,  WALL.PURPLE_TILE, WALL.CONCRETE,     WALL.BLUE_COBBLE];
const FLOOR_CYCLE = [FLOOR.LIGHT_STONE, FLOOR.WOOD,      FLOOR.DARK_STONE,  FLOOR.BROWN_LAMINATE,
                     FLOOR.PURPLE_LAMINATE, FLOOR.GREY_BOARDS, FLOOR.WOOD,  FLOOR.LIGHT_STONE];
const MUSIC_CYCLE = ["music_citrinitas","music_fleshandsteel","music_phantomdrone","music_thebeginning",
                     "music_mountingassault","music_warbringer","music_bloodyhalo","music_lostcorridors"];

// 17 hand-crafted Gauntlet levels (7 trainers + 10 dungeons), reskinned as
// derelict-vessel decks for the Nostromo theme.
const LEVEL_SOURCES = [
  { src: "trainer1", name: "Airlock 01", help: "Boarding the derelict. Watch your six." },
  { src: "trainer2", name: "Airlock 02", help: "Use SHOOT to engage hostiles at range." },
  { src: "trainer3", name: "Airlock 03", help: "Doors need an access card." },
  { src: "trainer4", name: "Airlock 04", help: "Generators keep spawning. Destroy them." },
  { src: "trainer5", name: "Airlock 05", help: "Pickups regenerate health and ammo." },
  { src: "trainer6", name: "Airlock 06", help: "EMP charge clears a room. Use sparingly." },
  { src: "trainer7", name: "Airlock 07", help: "Find the exit hatch to advance." },
  { src: "level1",   name: "Deck 01 — Cargo Hold",     help: null },
  { src: "level2",   name: "Deck 02 — Engineering",    help: null },
  { src: "level3",   name: "Deck 03 — Crew Quarters",  help: null },
  { src: "level4",   name: "Deck 04 — Reactor Core",   help: null },
  { src: "level5",   name: "Deck 05 — Hydroponics",    help: null },
  { src: "level6",   name: "Deck 06 — Med Bay",        help: null },
  { src: "level7",   name: "Deck 07 — Bridge",         help: null },
  { src: "level8",   name: "Deck 08 — Hive",           help: null },
  { src: "level9",   name: "Deck 09 — Synth Foundry",  help: null },
  { src: "level10",  name: "Deck 10 — Escape Pod",     help: null },
];
const LEVEL_META = LEVEL_SOURCES.map((meta, i) => ({
  ...meta,
  wall:  WALL_CYCLE[i % WALL_CYCLE.length],
  floor: FLOOR_CYCLE[i % FLOOR_CYCLE.length],
  music: MUSIC_CYCLE[i % MUSIC_CYCLE.length],
}));

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
      new Player(0, PLAYER_TYPES.MARINE),
      new Player(1, PLAYER_TYPES.TECH),
      new Player(2, PLAYER_TYPES.SMUGGLER),
      new Player(3, PLAYER_TYPES.SYNTHETIC),
    ];
    this.activeTypes = [null, null, null, null]; // chosen type indices per slot during select

    this.viewport = { x: 0, y: 0, w: 320, h: 320, outside: () => false };
    this.viewport.outside = (x, y, w, h) => (x + w < this.viewport.x || x > this.viewport.x + this.viewport.w || y + h < this.viewport.y || y > this.viewport.y + this.viewport.h);
    this._refreshViewportSize();
    window.addEventListener("resize", () => this._refreshViewportSize());

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
    const W = this.canvas.width, H = this.canvas.height;
    const u = Math.max(8, Math.floor(H / 60));
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#999"; ctx.font = `bold ${u*3}px monospace`;
    ctx.textAlign = "center";
    const p = this._loadProgress;
    ctx.fillText("LOADING…", W/2, H/2 - u*2);
    const barW = Math.floor(W * 0.4), barH = u;
    ctx.fillStyle = "#444"; ctx.fillRect(W/2 - barW/2, H/2, barW, barH);
    ctx.fillStyle = "#0c0"; ctx.fillRect(W/2 - barW/2, H/2, barW * (p.done/Math.max(1,p.total)), barH);
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
    const W = this.canvas.width, H = this.canvas.height;
    const u = Math.max(8, Math.floor(H / 60)); // base unit
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);

    // NOSTROMO wordmark — drawn through the ROM bitmap font with a red
    // shadow underlay, snapped to an integer scale picked from the window.
    const fontSmall = this.render.fontSmall;
    const titleText = "NOSTROMO";
    const titleScale = Math.max(4, Math.floor(W * 0.6 / fontSmall.measure(titleText, 1)));
    const tw = fontSmall.measure(titleText, titleScale);
    const tx = Math.floor((W - tw) / 2);
    const ty = Math.floor(H * 0.18);
    fontSmall.draw(ctx, titleText, tx + titleScale, ty + titleScale, "#9a0a0a", titleScale);
    fontSmall.draw(ctx, titleText, tx,              ty,              "#FFFFFF", titleScale);
    // Subtitle
    const subtitle = "ALIENS - DERELICT VESSEL";
    const subScale = Math.max(2, Math.floor(titleScale / 3));
    const sw = fontSmall.measure(subtitle, subScale);
    fontSmall.draw(ctx, subtitle, Math.floor((W - sw) / 2), ty + 8 * titleScale + 12, "#FFB000", subScale);

    // Four hero standing portraits across the middle.
    const portraitSize = Math.max(96, Math.floor(H * 0.18 / 24) * 24);
    const cy = Math.floor(H * 0.55);
    const gap = Math.floor(W * 0.06);
    const totalW = portraitSize * 4 + gap * 3;
    let x0 = (W - totalW) / 2;
    for (let i = 0; i < 4; i++) {
      const t = this.players[i].type;
      const sheet = this.assets.images[t.key];
      if (sheet && sheet.naturalWidth) {
        ctx.drawImage(sheet, 0, 4*24, 24, 24, x0, cy, portraitSize, portraitSize);
      } else {
        ctx.fillStyle = t.color; ctx.fillRect(x0, cy, portraitSize, portraitSize);
      }
      ctx.fillStyle = t.color; ctx.font = `bold ${u*2}px monospace`; ctx.textAlign = "center";
      ctx.fillText(t.key.toUpperCase(), x0 + portraitSize/2, cy + portraitSize + u*2);
      x0 += portraitSize + gap;
    }

    // Press start text + control reminders.
    const blink = (Math.floor(this.frame / 20) % 2) === 0;
    ctx.fillStyle = blink ? "#fff" : "#888";
    ctx.font = `bold ${u*3}px monospace`; ctx.textAlign = "center";
    ctx.fillText("PRESS START", W/2, Math.floor(H * 0.84));

    ctx.fillStyle = "#666"; ctx.font = `bold ${u*1.4}px monospace`;
    ctx.fillText("P1 WASD+G/H    P2 IJKL+;/'    P3 ARROWS+./,    P4 NUMPAD",
      W/2, Math.floor(H * 0.92));
    ctx.fillStyle = "#444";
    ctx.fillText("WEYLAND-YUTANI CORP. CRYO ENTERTAINMENT DIVISION", W/2, Math.floor(H * 0.96));

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
    const W = this.canvas.width, H = this.canvas.height;
    const u = Math.max(8, Math.floor(H / 60));
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff"; ctx.font = `bold ${u*4}px monospace`; ctx.textAlign = "center";
    ctx.fillText("CHOOSE YOUR HERO", W/2, u*6);
    ctx.font = `${u*1.6}px monospace`; ctx.fillStyle = "#aaa";
    ctx.fillText("Each player ← → to pick, SHOOT to lock in, then ENTER to begin",
      W/2, u*9);

    const cellW = W / 4;
    const portraitSize = Math.max(96, Math.floor(H * 0.20 / 24) * 24);
    const cellTop = u*12;
    const cellH = H - cellTop - u*8;
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
      ctx.fillRect(x + u, cellTop, cellW - u*2, cellH);
      ctx.strokeStyle = this.activeTypes[i] !== null ? this.players[this.activeTypes[i]].type.color : "#444";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + u + 1, cellTop + 1, cellW - u*2 - 2, cellH - 2);

      ctx.fillStyle = "#fff"; ctx.font = `bold ${u*2}px monospace`; ctx.textAlign = "center";
      ctx.fillText(`PLAYER ${i+1}`, x + cellW/2, cellTop + u*3);

      const idx = this._selectIdx[i];
      const t = PLAYER_TYPES[PLAYER_LIST[idx]];
      const img = this.assets.images[t.key];
      const px = x + cellW/2 - portraitSize/2;
      const py = cellTop + u*5;
      if (img && img.naturalWidth) {
        ctx.drawImage(img, 0, 4*24, 24, 24, px, py, portraitSize, portraitSize);
      } else {
        ctx.fillStyle = t.color; ctx.fillRect(px, py, portraitSize, portraitSize);
      }
      ctx.fillStyle = t.color; ctx.font = `bold ${u*2.2}px monospace`;
      ctx.fillText(t.key.toUpperCase(), x + cellW/2, py + portraitSize + u*2);

      ctx.fillStyle = "#aaa"; ctx.font = `${u*1.4}px monospace`;
      ctx.fillText(t.name, x + cellW/2, py + portraitSize + u*4);
      ctx.fillText(`HP ${t.health}  ARM ${t.armor}  MAG ${t.magic}`, x + cellW/2, py + portraitSize + u*5.5);
      ctx.fillText(`SPEED ${(t.speed*FPS).toFixed(0)}  SHOT ${(t.weaponSpeed*FPS).toFixed(0)}`, x + cellW/2, py + portraitSize + u*7);

      if (this.activeTypes[i] !== null) {
        ctx.fillStyle = "#0c0"; ctx.font = `bold ${u*2}px monospace`;
        ctx.fillText("READY", x + cellW/2, py + portraitSize + u*9.5);
      } else {
        ctx.fillStyle = "#777"; ctx.font = `${u*1.4}px monospace`;
        ctx.fillText("← →  to choose", x + cellW/2, py + portraitSize + u*9);
        ctx.fillText("SHOOT to lock in", x + cellW/2, py + portraitSize + u*10.4);
      }
    }

    ctx.fillStyle = anyLocked ? "#ffe66d" : "#555";
    ctx.font = `bold ${u*2.4}px monospace`; ctx.textAlign = "center";
    ctx.fillText(anyLocked ? "Press ENTER to begin" : "At least one player must lock in",
      W/2, H - u*3);

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
      // If we have fewer starts than joined players, fan additional players
      // out into nearby walkable cells so they don't all spawn stacked.
      const offsets = [[0,0],[1,0],[0,1],[1,1],[-1,0],[0,-1],[-1,1],[1,-1]];
      let spawnIdx = 0;
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (!p.joined) continue;
        p.level = this.level;
        const s = starts[Math.min(spawnIdx, starts.length - 1)];
        const o = offsets[spawnIdx % offsets.length];
        let nx = s.x + o[0] * TILE, ny = s.y + o[1] * TILE;
        // If the candidate cell is a wall, fall back to the start.
        const cell = this.level.cell(nx, ny);
        if (!cell || cell.wall || cell.nothing) { nx = s.x; ny = s.y; }
        p.x = nx; p.y = ny;
        p.exiting = null; p.dead = false;
        p.health = Math.max(p.health, p.type.health/2);
        this.level.occupy(p, p.x, p.y);
        spawnIdx++;
      }
      this.sounds.music(meta.music, 0.4);
      this.sounds.say("Stay frosty. Hostiles inbound.", { cooldown: 30000 });
    }

    this._updateViewport();
    this.render.drawWorld(this.level, this.viewport, this.frame, this.players);
    this.render.drawHud(this.players, this.level, meta.name, this.frame);

    const ctx = this.canvas.getContext("2d");
    const W = this.canvas.width, H = this.canvas.height;
    const u = Math.max(8, Math.floor(H / 60));
    const a = Math.max(0, this._loadingTimer / (FPS * 1.5));
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(this.render.layout.game.x, 0, this.render.layout.game.w, H);
    ctx.fillStyle = `rgba(255,220,80,${a})`;
    ctx.font = `bold ${u*4}px monospace`; ctx.textAlign = "center";
    ctx.fillText(meta.name, this.render.layout.game.x + this.render.layout.game.w/2, H/2);
    if (meta.help) {
      ctx.fillStyle = `rgba(180,200,255,${a*0.9})`;
      ctx.font = `${u*1.6}px monospace`;
      ctx.fillText(meta.help, this.render.layout.game.x + this.render.layout.game.w/2, H/2 + u*4);
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

    this.render.drawWorld(this.level, this.viewport, this.frame, this.players);
    this.render.drawHud(this.players, this.level, LEVEL_META[this.levelIndex]?.name || "", this.frame);
  }

  _transition() {
    const ctx = this.canvas.getContext("2d");
    const W = this.canvas.width, H = this.canvas.height;
    const u = Math.max(8, Math.floor(H / 60));
    this.render.drawWorld(this.level, this.viewport, this.frame, this.players);
    this.render.drawHud(this.players, this.level, "", this.frame);
    ctx.fillStyle = `rgba(0,0,0,${1 - this.transitionTimer/(FPS*2)})`;
    ctx.fillRect(this.render.layout.game.x, 0, this.render.layout.game.w, H);
    ctx.fillStyle = "#fff8a0"; ctx.font = `bold ${u*4}px monospace`; ctx.textAlign = "center";
    ctx.fillText("LEVEL CLEAR", this.render.layout.game.x + this.render.layout.game.w/2, H/2 - u);
    ctx.fillStyle = "#aaa"; ctx.font = `${u*2}px monospace`;
    ctx.fillText(`+${SCORE_PER_LEVEL * this.levelIndex} bonus`,
      this.render.layout.game.x + this.render.layout.game.w/2, H/2 + u*3);
    if (--this.transitionTimer <= 0) {
      this.level = null;
      this._enterLoading();
    }
  }

  _gameover() {
    const ctx = this.canvas.getContext("2d");
    const W = this.canvas.width, H = this.canvas.height;
    const u = Math.max(8, Math.floor(H / 60));
    if (this.level) {
      this.render.drawWorld(this.level, this.viewport, this.frame, this.players);
      this.render.drawHud(this.players, this.level, "", this.frame);
    } else {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ff4040"; ctx.font = `bold ${u*7}px monospace`; ctx.textAlign = "center";
    ctx.fillText("GAME OVER", W/2, H/2 - u*2);
    ctx.fillStyle = "#fff"; ctx.font = `bold ${u*2.5}px monospace`;
    let topScore = 0, topName = "";
    for (const p of this.players) if (p.joined && p.score > topScore) { topScore = p.score; topName = p.type.key.toUpperCase(); }
    ctx.fillText(`HIGH: ${topName} ${topScore}`, W/2, H/2 + u*2);
    ctx.fillStyle = "#888"; ctx.font = `${u*1.8}px monospace`;
    ctx.fillText("Press any key for title", W/2, H/2 + u*5);
    if (--this.gameoverTimer <= 0 && this.input.anyPressed()) {
      this.level = null;
      this.state = STATE.TITLE;
    }
  }

  _refreshViewportSize() {
    // Camera viewport sees `worldW × worldH` of world pixels (the renderer
    // scales them up to fill the centre column).
    this.render.resize();
    this.viewport.w = this.render.layout.worldW;
    this.viewport.h = this.render.layout.worldH;
  }

  _updateViewport() {
    if (!this.level) return;
    let cx = 0, cy = 0, n = 0;
    for (const p of this.players) {
      if (p.joined) { cx += p.x + TILE/2; cy += p.y + TILE/2; n++; }
    }
    if (n === 0) return;
    cx /= n; cy /= n;
    const targetX = cx - this.viewport.w/2;
    const targetY = cy - this.viewport.h/2;
    this.viewport.x += (targetX - this.viewport.x) * 0.18;
    this.viewport.y += (targetY - this.viewport.y) * 0.18;
    this.viewport.x = Math.max(0, Math.min(this.level.w - this.viewport.w, this.viewport.x));
    this.viewport.y = Math.max(0, Math.min(this.level.h - this.viewport.h, this.viewport.y));
  }
}
