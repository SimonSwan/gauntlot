// Arcade-faithful renderer.
import { TILE, DIR, FPS } from "./constants.js";

// ---------------------------------------------------------------------------
// BitmapFont — renders strings from a ROM-extracted glyph sheet.
//
// `text-an-alphabet.png` (80×128) is the alphanumeric ROM (136037-104.6p)
// decoded into an 8×8 glyph atlas. The character layout is custom (NOT
// pure ASCII). Glyph index = row * 10 + col, where col is the 8-pixel
// column and row is the 8-pixel row inside the sheet.
//
// `text-an-alphabet-large-0-9A.png` (16×176) is a separate 16×16 atlas
// containing just 0-9 plus A.
// ---------------------------------------------------------------------------

const SMALL_GLYPH_INDEX = {
  // row 0 (col 1-9): A B C D E F G H I  (col 0 = blank space)
  " ":  0,
  "A":  1, "B":  2, "C":  3, "D":  4, "E":  5,
  "F":  6, "G":  7, "H":  8, "I":  9,
  // row 1 (col 0-9): J K L M N O P Q R S
  "J": 10, "K": 11, "L": 12, "M": 13, "N": 14,
  "O": 15, "P": 16, "Q": 17, "R": 18, "S": 19,
  // row 2 (col 0-6): T U V W X Y Z
  "T": 20, "U": 21, "V": 22, "W": 23, "X": 24, "Y": 25, "Z": 26,
  // row 3 (col 3-9): ! " # $ % & '
  "!": 33, '"': 34, "#": 35, "$": 36, "%": 37, "&": 38, "'": 39,
  // row 4: ( ) * + , - . /  0 1
  "(": 40, ")": 41, "*": 42, "+": 43, ",": 44, "-": 45, ".": 46, "/": 47,
  "0": 48, "1": 49,
  // row 5 (col 0-7): 2 3 4 5 6 7 8 9     (col 8-9: : and ;)
  "2": 50, "3": 51, "4": 52, "5": 53, "6": 54, "7": 55, "8": 56, "9": 57,
  ":": 58, ";": 59,
};

const LARGE_GLYPH_INDEX = {
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5,
  "6": 6, "7": 7, "8": 8, "9": 9, "A": 10,
};

class BitmapFont {
  // assets is the live Assets bag; we look up `imageKey` on every draw so
  // that fonts constructed before assets.loadAll() resolves still pick up
  // the image once it's available.
  //
  // `advance` is the per-glyph horizontal step in source pixels. Defaults
  // to glyphW (no compression), but the cabinet HUD uses 7 for an 8-wide
  // glyph because the ROM tiles have a 1-px right padding column.
  constructor(assets, imageKey, glyphW, glyphH, charMap, advance) {
    this.assets = assets;
    this.imageKey = imageKey;
    this.gw = glyphW;
    this.gh = glyphH;
    this.advance = advance ?? glyphW;
    this.charMap = charMap;
    this.cols = 0;
    this._tinted = new Map();
  }

  get image() { return this.assets.images[this.imageKey]; }

  _ensureLoaded() {
    const img = this.image;
    if (!img || !img.naturalWidth) return false;
    if (!this.cols) this.cols = Math.floor(img.naturalWidth / this.gw);
    return true;
  }

  // Returns a per-color tinted copy of the glyph atlas, cached.
  //
  // The ROM-extracted alphabet PNG is RGB (no alpha) — black background
  // with white glyph pixels. We can't just tint it with a composite op
  // because every pixel is opaque. So for each color we build a fresh
  // RGBA canvas: dark source pixels become alpha=0, bright pixels become
  // the requested colour at full alpha.
  _atlas(color) {
    if (!this._ensureLoaded()) return null;
    const cached = this._tinted.get(color);
    if (cached) return cached;
    const w = this.image.naturalWidth, h = this.image.naturalHeight;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(this.image, 0, 0);
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    const [tr, tg, tb] = parseColor(color);
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] + d[i+1] + d[i+2]) / 3;
      if (lum < 60) {
        d[i+3] = 0; // fully transparent background
      } else {
        d[i] = tr; d[i+1] = tg; d[i+2] = tb; d[i+3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this._tinted.set(color, c);
    return c;
  }

  // Width of `str` at given integer scale, using the configured advance.
  measure(str, scale = 1) { return str.length * this.advance * scale; }

  // Renders `str` left-aligned at (x, y). Returns the right-edge x.
  draw(ctx, str, x, y, color = "#fff", scale = 1) {
    const atlas = this._atlas(color);
    if (!atlas) return x;
    const upper = String(str).toUpperCase();
    let cx = x;
    for (const ch of upper) {
      const idx = this.charMap[ch];
      if (idx === undefined) { cx += this.advance * scale; continue; }
      const sx = (idx % this.cols) * this.gw;
      const sy = Math.floor(idx / this.cols) * this.gh;
      // Glyphs are drawn at their full source size (gw × gh) but advance is
      // typically `gw - 1` so neighbours sit tight, matching the cabinet.
      ctx.drawImage(atlas, sx, sy, this.gw, this.gh, Math.floor(cx), Math.floor(y), this.gw * scale, this.gh * scale);
      cx += this.advance * scale;
    }
    return cx;
  }

  drawCentered(ctx, str, cx, y, color = "#fff", scale = 1) {
    const w = this.measure(String(str), scale);
    return this.draw(ctx, str, cx - w/2, y, color, scale);
  }

  drawRight(ctx, str, rx, y, color = "#fff", scale = 1) {
    const w = this.measure(String(str), scale);
    return this.draw(ctx, str, rx - w, y, color, scale);
  }
}

const SP = 24;

const PLAYER_SHEETS = {
  warrior:  { img: "warrior",  cols: 9, rows: 8 },
  valkyrie: { img: "valkyrie", cols: 9, rows: 8 },
  wizard:   { img: "wizard",   cols: 9, rows: 8 },
  elf:      { img: "elf",      cols: 9, rows: 8 },
};
const MONSTER_SHEETS = {
  ghost:    { img: "ghost",    cols: 4, rows: 8 },
  grunt:    { img: "grunt",    cols: 5, rows: 8 },
  demon:    { img: "demon",    cols: 8, rows: 8 },
  sorcerer: { img: "sorcerer", cols: 6, rows: 8 },
  lobber:   { img: "lobber",   cols: 5, rows: 4 },
  death:    { img: "death",    cols: 3, rows: 8 },
  thief:    { img: "thief",    cols: 9, rows: 8 },
};
const TREASURE_IMG = {
  health: "potionBlue",
  poison: "potionOrange",
  food1:  "foodTurkey",
  food2:  "foodHam",
  food3:  "foodJug",
  key:    "key",
  potion: "potionWeapon",
  gold:   "treasureBag",
  chest:  "treasureChest",
};

// In the reference cabinet screenshot the four heroes stack top-to-bottom in
// the single right HUD column, in canonical Atari order:
//   slot 0 Warrior  → row 0
//   slot 1 Valkyrie → row 1
//   slot 2 Wizard   → row 2
//   slot 3 Elf      → row 3
const SLOT_ROW = { 0: 0, 1: 1, 2: 2, 3: 3 };

const ARCADE_BG = "#000";
const HUD_BG = "#000";
const FONT = "monospace";

export class Render {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.assets = assets;
    this.layout = this._computeLayout();
    // ROM-extracted fonts. Asset images may still be loading; the font looks
    // up its image key on every draw so it picks them up automatically.
    // Small font advances by 7 (not 8) — the ROM glyphs are 7 px wide with a
    // 1 px right-padding column the cabinet doesn't waste.
    this.fontSmall = new BitmapFont(assets, "textAlphabet",      8,  8,  SMALL_GLYPH_INDEX, 7);
    this.fontLarge = new BitmapFont(assets, "textAlphabetLarge", 16, 16, LARGE_GLYPH_INDEX, 14);
  }

  _computeLayout() {
    const W = this.canvas.width, H = this.canvas.height;

    // The cabinet HUD is 80 native pixels wide (set by the GAUNTLET sidebar
    // logo) by 240 native pixels tall (full arcade screen). We render at an
    // integer scale K so every pixel of the ROM-extracted art lands on a
    // whole device pixel — same crispness as the original.
    const NATIVE_HUD_W = 80;
    const NATIVE_H     = 240;
    const K = Math.max(1, Math.floor(H / NATIVE_H));
    const hudW = NATIVE_HUD_W * K;

    // Game viewport eats whatever's left. We still render the maze at TILE=32
    // world pixels so collisions stay tile-accurate; the camera shows however
    // many tiles fit in the available area.
    const availW = W - hudW;
    const availH = H;
    const NATIVE_GAME_W = 16 * TILE; // pleasant default for window sizes
    const NATIVE_GAME_H = 14 * TILE;
    const gameScale = Math.min(availW / NATIVE_GAME_W, availH / NATIVE_GAME_H);
    const gameW = Math.floor(NATIVE_GAME_W * gameScale);
    const gameH = Math.floor(NATIVE_GAME_H * gameScale);
    const gameX = Math.floor((availW - gameW) / 2);
    const gameY = Math.floor((availH - gameH) / 2);

    return {
      W, H,
      K,
      nativeHudW: NATIVE_HUD_W,
      nativeH:    NATIVE_H,
      hud:  { x: W - hudW, y: 0, w: hudW, h: H },
      game: { x: gameX,    y: gameY, w: gameW, h: gameH },
      // World viewport size used by the camera in level.js.
      worldW: NATIVE_GAME_W,
      worldH: NATIVE_GAME_H,
      scale: gameScale, // separate from K — the playfield uses a non-integer
                        // scale so it can fill the centre column.
    };
  }

  resize() { this.layout = this._computeLayout(); }

  // --- World rendering -----------------------------------------------------

  drawWorld(level, viewport, frame, players) {
    this.layout = this._computeLayout();
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = ARCADE_BG;
    ctx.fillRect(0, 0, this.layout.W, this.layout.H);

    const g = this.layout.game;
    const scale = this.layout.scale;

    // Clip to game column then apply integer scale + camera translate so we
    // draw all sprites at native pixel coordinates.
    ctx.save();
    ctx.beginPath(); ctx.rect(g.x, g.y, g.w, g.h); ctx.clip();
    ctx.translate(g.x, g.y);
    ctx.scale(scale, scale);
    ctx.translate(-viewport.x, -viewport.y);

    const tx0 = Math.max(0, Math.floor(viewport.x / TILE) - 1);
    const ty0 = Math.max(0, Math.floor(viewport.y / TILE) - 1);
    const tx1 = Math.min(level.tw - 1, Math.ceil((viewport.x + this.layout.worldW) / TILE) + 1);
    const ty1 = Math.min(level.th - 1, Math.ceil((viewport.y + this.layout.worldH) / TILE) + 1);

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const c = level.cells[tx + ty * level.tw];
        if (!c || c.nothing || c.wall) continue;
        this._drawFloor(ctx, tx*TILE, ty*TILE);
      }
    }
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const c = level.cells[tx + ty * level.tw];
        if (!c || !c.wall) continue;
        this._drawWall(ctx, tx*TILE, ty*TILE, c.wallMask);
      }
    }
    const ents = level.entities.slice().sort((a,b) => (a.y - b.y));
    for (const e of ents) this._drawEntity(ctx, e, frame, level);
    for (const p of players) if (p.joined) this._drawPlayer(ctx, p, frame);
    ctx.restore();
  }

  // Brown stone-block floor with subtle grid + flecks. Matches the arcade
  // playfield ground.
  _drawFloor(ctx, x, y) {
    ctx.fillStyle = "#3b2010";
    ctx.fillRect(x, y, TILE, TILE);
    // 4 stone blocks per tile in a 2×2 grid, each ~16×16 with mortar.
    ctx.fillStyle = "#5a3115";
    ctx.fillRect(x + 1, y + 1, 14, 14);
    ctx.fillRect(x + 17, y + 1, 14, 14);
    ctx.fillRect(x + 1, y + 17, 14, 14);
    ctx.fillRect(x + 17, y + 17, 14, 14);
    // Top highlight on each block.
    ctx.fillStyle = "rgba(255,180,120,0.18)";
    ctx.fillRect(x + 1, y + 1, 14, 1);
    ctx.fillRect(x + 17, y + 1, 14, 1);
    ctx.fillRect(x + 1, y + 17, 14, 1);
    ctx.fillRect(x + 17, y + 17, 14, 1);
    // Flecks for arcade grit.
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(x + 4, y + 5, 1, 1);
    ctx.fillRect(x + 11, y + 9, 1, 1);
    ctx.fillRect(x + 22, y + 4, 1, 1);
    ctx.fillRect(x + 26, y + 13, 1, 1);
    ctx.fillRect(x + 6, y + 22, 1, 1);
    ctx.fillRect(x + 19, y + 25, 1, 1);
    ctx.fillRect(x + 27, y + 28, 1, 1);
  }

  _drawWall(ctx, x, y, mask) {
    // Blue-cobble wall — the level-8 palette in the arcade reference. Solid
    // dark base with paler stone tiles in two rows, and crisp pixel mortar.
    ctx.fillStyle = "#1c1d68";
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = "#2c34a4";
    for (let by = 0; by < TILE; by += 8) {
      const off = ((y + by) / 8) % 2 ? 8 : 0;
      for (let bx = 0; bx < TILE + 8; bx += 16) {
        ctx.fillRect(x + ((bx + off) % TILE), y + by, 14, 7);
      }
    }
    // Brighter highlights on the top edge of each cobble.
    ctx.fillStyle = "rgba(160,180,255,0.25)";
    for (let by = 0; by < TILE; by += 8) {
      const off = ((y + by) / 8) % 2 ? 8 : 0;
      for (let bx = 0; bx < TILE + 8; bx += 16) {
        ctx.fillRect(x + ((bx + off) % TILE), y + by, 14, 1);
      }
    }
    // Pixel mortar.
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    for (let by = 7; by < TILE; by += 8) ctx.fillRect(x, y + by, TILE, 1);
    if (!(mask & 1)) { ctx.fillStyle = "rgba(220,230,255,0.22)"; ctx.fillRect(x, y, TILE, 1); }
    if (!(mask & 8)) { ctx.fillStyle = "rgba(220,230,255,0.18)"; ctx.fillRect(x, y, 1, TILE); }
    if (!(mask & 4)) { ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(x, y + TILE - 1, TILE, 1); }
    if (!(mask & 2)) { ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x + TILE - 1, y, 1, TILE); }
  }

  _drawEntity(ctx, e, frame) {
    if (e.dead) return;
    if (e.fx) return this._drawFx(ctx, e, frame);
    if (e.weapon) return this._drawWeapon(ctx, e, frame);
    if (e.door) return this._drawDoor(ctx, e, frame);
    if (e.exit) return this._drawExit(ctx, e, frame);
    if (e.treasure) return this._drawTreasure(ctx, e, frame);
    if (e.monster) return this._drawMonster(ctx, e, frame);
    if (e.generator) return this._drawGenerator(ctx, e, frame);
  }

  _drawWeapon(ctx, e, frame) {
    const cx = e.x + TILE/2, cy = e.y + TILE/2;
    if (e.monster) {
      ctx.fillStyle = "#ff7a2a";
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#ffe24a";
      ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI*2); ctx.fill();
    } else {
      const c = e.owner?.type?.color || "#fff";
      ctx.fillStyle = c;
      const t = (frame % 8) / 8;
      const r = 3 + Math.sin(t * Math.PI * 2) * 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI*2); ctx.fill();
    }
  }

  _drawDoor(ctx, e) {
    ctx.fillStyle = "#caa54f";
    ctx.fillRect(e.x+2, e.y+2, TILE-4, TILE-4);
    ctx.fillStyle = "#7a5b1f";
    for (let i = 4; i < TILE-4; i += 4) ctx.fillRect(e.x+i, e.y+4, 1, TILE-8);
    if (e.opening) {
      const f = Math.min(0.95, 1 - e.opening/(e.type.openSpeed));
      ctx.fillStyle = `rgba(0,0,0,${f})`;
      ctx.fillRect(e.x+2, e.y+2, TILE-4, TILE-4);
    }
  }

  _drawExit(ctx, e, frame) {
    const img = this.assets.images.exit;
    if (img && img.naturalWidth) {
      ctx.drawImage(img, 0, 0, img.width, img.height, e.x, e.y, TILE, TILE);
    } else {
      ctx.fillStyle = "#1c8a4a";
      ctx.fillRect(e.x+2, e.y+2, TILE-4, TILE-4);
    }
    const s = 0.5 + 0.5*Math.sin(frame * 0.2);
    ctx.fillStyle = `rgba(60,200,140,${0.35*s})`;
    ctx.fillRect(e.x, e.y, TILE, TILE);
  }

  _drawTreasure(ctx, e, frame) {
    const key = TREASURE_IMG[e.type.key];
    const img = this.assets.images[key];
    if (img && img.naturalWidth) {
      const sw = img.naturalWidth, sh = img.naturalHeight;
      const fw = sw === 72 ? 24 : 16;
      const fh = sh === 24 && sw > 24 ? 24 : Math.min(sh, 16);
      const f = (sw / fw) > 1 ? Math.floor(frame / 10) % Math.floor(sw / fw) : 0;
      ctx.drawImage(img, f*fw, 0, fw, fh, e.x, e.y, TILE, TILE);
    } else {
      ctx.fillStyle = "#ffcc33";
      ctx.fillRect(e.x+8, e.y+8, TILE-16, TILE-16);
    }
  }

  _drawMonster(ctx, e, frame) {
    const sheet = MONSTER_SHEETS[e.type.key];
    const img = sheet && this.assets.images[sheet.img];
    if (e.type.invisibility) {
      const phase = (frame + e.df) % (e.type.invisibility.on + e.type.invisibility.off);
      if (phase < e.type.invisibility.on) return;
    }
    if (img && img.naturalWidth) {
      const dirRow = Math.min(sheet.rows - 1, mapDirToRow(e.dir, sheet.rows));
      const animCol = Math.floor((frame + e.df) / 6) % sheet.cols;
      ctx.drawImage(img, animCol * SP, dirRow * SP, SP, SP, e.x + (TILE-SP)/2, e.y + (TILE-SP)/2, SP, SP);
    } else {
      ctx.fillStyle = monsterColor(e.type.key);
      ctx.fillRect(e.x+4, e.y+4, TILE-8, TILE-8);
    }
    if (e.health < e.type.health) {
      const w = (TILE-4) * (e.health / e.type.health);
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(e.x+2, e.y, TILE-4, 2);
      ctx.fillStyle = "#f33"; ctx.fillRect(e.x+2, e.y, w, 2);
    }
  }

  _drawGenerator(ctx, e, frame) {
    const isGhost = e.mtype.key === "ghost";
    const img = this.assets.images[isGhost ? "ghostGen" : "monsterGen"];
    const stage = Math.max(0, 2 - Math.floor(3 * (e.health / (e.maxHealth + 1))));
    if (img && img.naturalWidth) {
      ctx.drawImage(img, stage * SP, 0, SP, SP, e.x + (TILE-SP)/2, e.y + (TILE-SP)/2, SP, SP);
    } else {
      ctx.fillStyle = ["#822","#a44","#f66"][stage] || "#a44";
      ctx.fillRect(e.x+2, e.y+2, TILE-4, TILE-4);
    }
    const s = 0.4 + 0.4*Math.sin(frame * 0.25);
    ctx.fillStyle = `rgba(255,80,40,${0.18 * s})`;
    ctx.fillRect(e.x, e.y, TILE, TILE);
  }

  _drawFx(ctx, e, frame) {
    if (e.delay > 0) return;
    const img = this.assets.images.explosion;
    if (img && img.naturalWidth) {
      const fw = 16, fh = 16;
      const f = Math.min(2, e.frame);
      ctx.drawImage(img, f*fw, 0, fw, fh, e.x + (TILE-fw)/2, e.y + (TILE-fh)/2, fw*1.5, fh*1.5);
    } else {
      ctx.fillStyle = `rgba(255,200,80,${1 - e.frame/6})`;
      ctx.beginPath(); ctx.arc(e.x+TILE/2, e.y+TILE/2, 4 + e.frame*3, 0, Math.PI*2); ctx.fill();
    }
  }

  _drawPlayer(ctx, p, frame) {
    const sheet = PLAYER_SHEETS[p.type.key];
    const img = this.assets.images[sheet.img];

    if (p.hurting > 0) {
      const a = 0.3 * (p.hurting / (FPS/2));
      ctx.fillStyle = `rgba(255,40,40,${a})`;
      ctx.fillRect(p.x-2, p.y-2, TILE+4, TILE+4);
    } else if (p.healing > 0) {
      const a = 0.3 * (p.healing / (FPS/2));
      ctx.fillStyle = `rgba(80,255,140,${a})`;
      ctx.fillRect(p.x-2, p.y-2, TILE+4, TILE+4);
    }

    if (img && img.naturalWidth) {
      const dirRow = Math.min(sheet.rows - 1, mapDirToRow(p.dir, sheet.rows));
      let col;
      if (p.dead) col = sheet.cols - 1;
      else if (p.firing) col = (Math.floor(frame / 4) % 3) + 1;
      else if (p.moveDir >= 0) col = 1 + (Math.floor((frame + p.df) / 6) % Math.max(1, sheet.cols - 2));
      else col = 0;
      ctx.drawImage(img, col * SP, dirRow * SP, SP, SP, p.x + (TILE-SP)/2, p.y + (TILE-SP)/2, SP, SP);
    } else {
      ctx.fillStyle = p.type.color;
      ctx.fillRect(p.x+4, p.y+4, TILE-8, TILE-8);
    }

    // Player number tag
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(p.x + TILE - 11, p.y + TILE - 11, 10, 10);
    ctx.fillStyle = p.type.color;
    ctx.font = "bold 9px " + FONT;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(p.slot + 1), p.x + TILE - 6, p.y + TILE - 5.5);
  }

  // --- HUD -----------------------------------------------------------------

  drawHud(players, level, levelName, frame) {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    const L = this.layout;

    // Repaint only the HUD column and the letterbox bands around the game
    // viewport. The playfield was already rendered by drawWorld; don't
    // clobber it.
    ctx.fillStyle = HUD_BG;
    ctx.fillRect(L.hud.x, 0, L.hud.w, L.H);
    if (L.game.y > 0)
      ctx.fillRect(0, 0, L.hud.x, L.game.y);
    if (L.game.y + L.game.h < L.H)
      ctx.fillRect(0, L.game.y + L.game.h, L.hud.x, L.H - (L.game.y + L.game.h));
    if (L.game.x > 0)
      ctx.fillRect(0, 0, L.game.x, L.H);

    this._drawHudColumn(ctx, L, players, levelName, frame);
  }

  // Single right HUD column laid out per the cabinet spec, in native arcade
  // pixels scaled up by integer K. Native panel = 80×240. K = floor(H/240).
  // Native Y positions (top-to-bottom):
  //   2..26    GAUNTLET logo (80×24)
  //   32..40   "LEVEL" small label
  //   44..60   big level digit (16×16)
  //   66..162  four 24-tall hero blocks (Warrior/Valkyrie/Wizard/Elf)
  //   220..228 "©1985"
  //   228..236 "ATARI GAMES"
  _drawHudColumn(ctx, L, players, levelName, frame) {
    const K = L.K;
    const px = L.hud.x; // panel x in screen pixels
    const py = 0;
    const nW = L.nativeHudW; // 80

    // Helper to convert a native (x, y) inside the panel to screen px.
    const sx = (nx) => px + nx * K;
    const sy = (ny) => py + ny * K;

    // GAUNTLET sidebar logo (the ROM-extracted decal). Native 80×24 at y=2.
    this._drawSidebarLogo(ctx, sx(0), sy(2), nW * K, 24 * K);

    // "LEVEL" label and big number.
    this.fontSmall.drawCentered(ctx, "LEVEL", sx(nW / 2), sy(32), "#fff", K);
    const num = (levelName || "").match(/\d+/)?.[0] || "1";
    this.fontLarge.draw(
      ctx, num,
      sx(nW / 2) - this.fontLarge.measure(num, K) / 2,
      sy(44),
      "#fff", K,
    );

    // Four hero blocks. Each block is 24 native px tall; we add a 6 px gap
    // between blocks so the name of the next hero doesn't crash into the
    // value row of the previous one.
    const blockH = 24, blockGap = 6;
    for (let slot = 0; slot < 4; slot++) {
      const blockY = 66 + slot * (blockH + blockGap);
      this._drawHeroBlock(ctx, players[slot], px, blockY, nW, K, frame);
    }

    // Footer at the bottom of the panel. Native y = (240 - 16) = 224 / 232.
    this.fontSmall.drawCentered(ctx, "1985",        sx(nW / 2), sy(220), "#fff", K);
    this.fontSmall.drawCentered(ctx, "ATARI GAMES", sx(nW / 2), sy(228), "#fff", K);
  }

  // Draw a single 24-native-tall hero block at the given native Y.
  // Layout inside the block:
  //   y+0..8   hero name (8h, hero color, centred)
  //   y+10..16 SCORE / HEALTH labels (6h, hero color, two-column)
  //   y+18..24 4-digit values (6h, white)
  _drawHeroBlock(ctx, p, panelX, nativeY, nativeW, K, frame) {
    const t = p.type;
    const sx = (nx) => panelX + nx * K;
    const sy = (ny) => 0    + (nativeY + ny) * K;

    const colorBright = t.color;
    const colorDim    = dimColor(t.color, 0.45);
    const nameColor   = p.joined ? colorBright : colorDim;

    // Hero name centred. "WARRIOR" = 7×7 = 49 native px in the 80-wide panel.
    this.fontSmall.drawCentered(ctx, t.key.toUpperCase(), sx(nativeW / 2), sy(0), nameColor, K);

    // Two-column layout for SCORE+value and HEALTH+value.
    // Native column 1: SCORE (5×7 = 35 px) starts at native x = 0
    // Native column 2: HEALTH (6×7 = 42 px) starts at native x = 38
    // 4-digit values (4×7 = 28 px) centred under each label.
    const col1Left = 0;             // SCORE column
    const col1W    = 35;
    const col2Left = 38;            // HEALTH column
    const col2W    = 42;

    this.fontSmall.draw(ctx, "SCORE",  sx(col1Left), sy(10), nameColor, K);
    this.fontSmall.draw(ctx, "HEALTH", sx(col2Left), sy(10), nameColor, K);

    if (p.joined) {
      // Centre the value under its label.
      const score4 = this._fmtNum(p.score, 4);
      const hp4    = this._fmtNum(Math.max(0, p.health), 4);
      const score4W = this.fontSmall.measure(score4, 1); // native px
      const hp4W    = this.fontSmall.measure(hp4, 1);
      this.fontSmall.draw(ctx, score4, sx(col1Left + (col1W - score4W) / 2), sy(18), "#fff", K);

      const weak = p.health < 200;
      const blink = weak && (Math.floor(frame / 12) % 2 === 0);
      const hpColor = weak ? (blink ? "#F90503" : "#fff") : "#fff";
      this.fontSmall.draw(ctx, hp4, sx(col2Left + (col2W - hp4W) / 2), sy(18), hpColor, K);
    } else {
      // Inactive: hero-coloured "----" placeholders.
      const dashes4 = "----";
      const dashW = this.fontSmall.measure(dashes4, 1);
      this.fontSmall.draw(ctx, dashes4, sx(col1Left + (col1W - dashW) / 2), sy(18), colorDim, K);
      this.fontSmall.draw(ctx, dashes4, sx(col2Left + (col2W - dashW) / 2), sy(18), colorDim, K);
    }
  }

  _drawSidebarLogo(ctx, x, y, w, h) {
    const img = this.assets.images.textGauntletSide || this.assets.images.textGauntlet;
    if (!img || !img.naturalWidth) return;
    // Red drop-shadow underlay then the white logo on top.
    this._drawTinted(ctx, img, x + 2, y + 2, w, h, "#9a0a0a");
    ctx.drawImage(img, x, y, w, h);
  }

  // Helper: draws `img` tinted to `color`, scaled to (dw, dh) at (dx, dy).
  // Uses a reusable temp canvas so we don't trash the per-color tint cache
  // BitmapFont keeps for itself.
  _drawTinted(ctx, img, dx, dy, dw, dh, color) {
    if (!this._tintTmp) {
      this._tintTmp = document.createElement("canvas");
    }
    const tmp = this._tintTmp;
    tmp.width = img.naturalWidth;
    tmp.height = img.naturalHeight;
    const g = tmp.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, tmp.width, tmp.height);
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, dx, dy, dw, dh);
  }

  _fmtNum(n, digits) {
    return String(Math.floor(n)).padStart(digits, "0");
  }
}

// Dim a hex/rgb color toward black by `factor` (0..1, where 0 is black).
function dimColor(c, factor) {
  const [r, g, b] = parseColor(c);
  const f = Math.max(0, Math.min(1, factor));
  return `#${[r, g, b].map(v => Math.floor(v * f).toString(16).padStart(2, "0")).join("")}`;
}

// "#RGB", "#RRGGBB" — return [r,g,b] 0-255.
function parseColor(c) {
  if (typeof c !== "string") return [255, 255, 255];
  if (c[0] === "#") {
    if (c.length === 4) {
      return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16)];
    }
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }
  return [255, 255, 255];
}

function mapDirToRow(dir, rows) {
  if (rows >= 8) return dir;
  if (rows === 4) {
    if (dir === DIR.UP || dir === DIR.UPLEFT || dir === DIR.UPRIGHT) return 0;
    if (dir === DIR.RIGHT || dir === DIR.DOWNRIGHT) return 1;
    if (dir === DIR.DOWN || dir === DIR.DOWNLEFT) return 2;
    return 3;
  }
  return 0;
}
function monsterColor(k) {
  return ({ ghost:"#9be0ff", grunt:"#7a5b34", demon:"#cc3a3a", sorcerer:"#a060c0", lobber:"#3a8050", death:"#000", thief:"#dd44dd" })[k] || "#888";
}
