// Arcade-faithful renderer.
import { CELL_PX, DIR, FPS } from "./constants.js";

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
  // The ROM glyphs sit in fixed-size cells (8×8 or 16×16) but most letters
  // don't fill the cell — `I` is 4 px wide, `M` and `W` are 7 px. We scan
  // each glyph at load time, find its tightest pixel bbox, and remember a
  // per-glyph (leftPad, visualWidth) so drawing advances by the glyph's
  // actual width + 1 px gap. Same as a proportional bitmap font.
  //
  // `gap` is the inter-character pixel gap (in source pixels).
  constructor(assets, imageKey, glyphW, glyphH, charMap, gap = 1) {
    this.assets = assets;
    this.imageKey = imageKey;
    this.gw = glyphW;
    this.gh = glyphH;
    this.gap = gap;
    this.charMap = charMap;
    this.cols = 0;
    this._tinted = new Map();
    this._metrics = null; // [{ leftPad, width }] per glyph index
    this._spaceWidth = Math.max(2, Math.floor(glyphW / 2));
  }

  get image() { return this.assets.images[this.imageKey]; }

  _ensureLoaded() {
    const img = this.image;
    if (!img || !img.naturalWidth) return false;
    if (!this.cols) this.cols = Math.floor(img.naturalWidth / this.gw);
    if (!this._metrics) this._scanMetrics(img);
    return true;
  }

  // Read every glyph cell and record its pixel bbox in source pixels.
  _scanMetrics(img) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    const rows = Math.floor(img.naturalHeight / this.gh);
    const total = this.cols * rows;
    const metrics = new Array(total);
    for (let i = 0; i < total; i++) {
      const cx = (i % this.cols) * this.gw;
      const cy = Math.floor(i / this.cols) * this.gh;
      let minX = this.gw, maxX = -1;
      for (let dy = 0; dy < this.gh; dy++) {
        for (let dx = 0; dx < this.gw; dx++) {
          const p = ((cy + dy) * c.width + (cx + dx)) << 2;
          const lum = (data[p] + data[p+1] + data[p+2]) / 3;
          if (lum > 60) {
            if (dx < minX) minX = dx;
            if (dx > maxX) maxX = dx;
          }
        }
      }
      if (maxX < 0) {
        metrics[i] = { leftPad: 0, width: 0 };
      } else {
        metrics[i] = { leftPad: minX, width: maxX - minX + 1 };
      }
    }
    this._metrics = metrics;
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

  // Width of `str` at given integer scale (proportional — sums each glyph's
  // own visual width + the inter-char gap).
  measure(str, scale = 1) {
    if (!this._ensureLoaded()) return 0;
    let w = 0;
    const upper = String(str).toUpperCase();
    for (let i = 0; i < upper.length; i++) {
      const ch = upper[i];
      if (ch === " ") {
        w += (this._spaceWidth + this.gap) * scale;
        continue;
      }
      const idx = this.charMap[ch];
      const m = idx === undefined ? null : this._metrics[idx];
      const cw = m && m.width > 0 ? m.width : this._spaceWidth;
      w += (cw + (i < upper.length - 1 ? this.gap : 0)) * scale;
    }
    return w;
  }

  // Renders `str` left-aligned at (x, y). Returns the right-edge x.
  // Uses per-glyph leftPad / visualWidth so narrow letters like I don't
  // leave phantom gaps in their cells.
  draw(ctx, str, x, y, color = "#fff", scale = 1) {
    const atlas = this._atlas(color);
    if (!atlas) return x;
    const upper = String(str).toUpperCase();
    let cx = x;
    for (let i = 0; i < upper.length; i++) {
      const ch = upper[i];
      if (ch === " ") { cx += (this._spaceWidth + this.gap) * scale; continue; }
      const idx = this.charMap[ch];
      const m = idx === undefined ? null : this._metrics[idx];
      if (!m || m.width === 0) {
        cx += (this._spaceWidth + this.gap) * scale;
        continue;
      }
      const srcCol = idx % this.cols;
      const srcRow = Math.floor(idx / this.cols);
      const sx = srcCol * this.gw + m.leftPad;
      const sy = srcRow * this.gh;
      ctx.drawImage(
        atlas,
        sx, sy, m.width, this.gh,
        Math.round(cx), Math.round(y), m.width * scale, this.gh * scale,
      );
      cx += (m.width + this.gap) * scale;
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

// Nostromo sprite sheets — 9-frame heroes / 4-frame monsters at 24×24,
// matching the Gauntlet renderer's frame layout so the same animation
// math drives both themes.
// Player sheets: layout matches HEROES[] frameCols/frameRows in constants.js.
const PLAYER_SHEETS = {
  warrior:  { img: "warrior",  cols: 9, rows: 8 },
  valkyrie: { img: "valkyrie", cols: 9, rows: 8 },
  wizard:   { img: "wizard",   cols: 6, rows: 8 },
  elf:      { img: "elf",      cols: 8, rows: 8 },
};
// Monster sheets: layout matches MONSTER_SPRITES[] frameCols/frameRows.
const MONSTER_SHEETS = {
  ghost:    { img: "ghost",    cols: 4, rows: 8 },
  demon:    { img: "demon",    cols: 8, rows: 8 },
  grunt:    { img: "grunt",    cols: 5, rows: 8 },
  sorcerer: { img: "sorcerer", cols: 6, rows: 8 },
  lobber:   { img: "lobber",   cols: 5, rows: 5 },
  death:    { img: "death",    cols: 3, rows: 8 },
  thief:    { img: "thief",    cols: 9, rows: 8 },
};
// Treasure key (from constants) → image asset key. Asset keys come from
// IMAGE_LIST in assets.js.
const TREASURE_IMG = {
  health: "health",
  poison: "poison",
  food1:  "food1",
  food2:  "food2",
  food3:  "food3",
  key:    "key",
  potion: "potion",
  gold:   "gold",
  chest:  "chest",
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
    // ROM-extracted fonts. Each glyph's actual pixel width is measured at
    // load time so narrow letters (I, J, etc.) advance by their own width
    // + 1 px gap rather than wasting fixed-size cell padding. Same as a
    // proper proportional bitmap font.
    this.fontSmall = new BitmapFont(assets, "textAlphabet",      8,  8,  SMALL_GLYPH_INDEX, 1);
    this.fontLarge = new BitmapFont(assets, "textAlphabetLarge", 16, 16, LARGE_GLYPH_INDEX, 1);
  }

  _computeLayout() {
    const W = this.canvas.width, H = this.canvas.height;

    // The cabinet HUD column is 96 native pixels wide. The GAUNTLET sidebar
    // PNG is 80 px wide (centred with 8 px margin on each side), and the
    // SCORE / HEALTH labels in the proportional ROM font need ~88 px to sit
    // side-by-side without colliding. Native height = 240 (full arcade).
    // Everything renders at integer scale K so each ROM pixel lands on a
    // whole device pixel.
    const NATIVE_HUD_W = 96;
    const NATIVE_H     = 240;
    const K = Math.max(1, Math.floor(H / NATIVE_H));
    const hudW = NATIVE_HUD_W * K;

    // Game viewport eats whatever's left. We still render the maze at CELL_PX=32
    // world pixels so collisions stay tile-accurate; the camera shows however
    // many tiles fit in the available area.
    const availW = W - hudW;
    const availH = H;
    const NATIVE_GAME_W = 16 * CELL_PX; // pleasant default for window sizes
    const NATIVE_GAME_H = 14 * CELL_PX;
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

    const tx0 = Math.max(0, Math.floor(viewport.x / CELL_PX) - 1);
    const ty0 = Math.max(0, Math.floor(viewport.y / CELL_PX) - 1);
    const tx1 = Math.min(level.tw - 1, Math.ceil((viewport.x + this.layout.worldW) / CELL_PX) + 1);
    const ty1 = Math.min(level.th - 1, Math.ceil((viewport.y + this.layout.worldH) / CELL_PX) + 1);

    // Pre-decoded ROM tile atlas — Jake Gordon's backgrounds.png. Layout:
    //   row 0: 9 floor textures at sx=1..9
    //   rows 1..6: 6 wall themes; each row has 16 mask variants at sx=0..15
    //   row 7: shadow overlays at sx=0..7 (3-bit shadow mask)
    const atlas = this.assets.images.backgrounds;
    const wallTheme  = level.meta?.wall  || 4; // BLUE_COBBLE
    const floorTheme = level.meta?.floor || 6; // LIGHT_STONE

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const c = level.cells[tx + ty * level.tw];
        if (!c) continue;
        if (c.nothing) {
          // Out-of-bounds — atlas (0, 0) is a black void cell.
          if (atlas) ctx.drawImage(atlas, 0, 0, CELL_PX, CELL_PX, tx*CELL_PX, ty*CELL_PX, CELL_PX, CELL_PX);
          continue;
        }
        if (c.wall) {
          // Wall: column = neighbour mask, row = wall theme.
          if (atlas) ctx.drawImage(atlas, c.wallMask * CELL_PX, wallTheme * CELL_PX, CELL_PX, CELL_PX, tx*CELL_PX, ty*CELL_PX, CELL_PX, CELL_PX);
          else this._drawWall(ctx, tx*CELL_PX, ty*CELL_PX, c.wallMask);
          continue;
        }
        // Floor: flat sci-fi deck plate, no busy stone texture. The shadow
        // mask still gets applied below so corridors abutting walls keep a
        // soft drop shadow for readability.
        this._drawFloor(ctx, tx*CELL_PX, ty*CELL_PX);
        if (c.shadow && atlas) {
          ctx.drawImage(atlas, c.shadow * CELL_PX, 7 * CELL_PX, CELL_PX, CELL_PX, tx*CELL_PX, ty*CELL_PX, CELL_PX, CELL_PX);
        }
      }
    }
    const ents = level.entities.slice().sort((a,b) => (a.y - b.y));
    for (const e of ents) this._drawEntity(ctx, e, frame, level);
    for (const p of players) if (p.joined) this._drawPlayer(ctx, p, frame);
    ctx.restore();
  }

  // Flat sci-fi deck plate. A single dark base colour with a 1-px tile
  // outline so adjacent floor cells still read as a grid, but no busy
  // stone-block texture. Subtle enough to keep entity sprites readable.
  _drawFloor(ctx, x, y) {
    ctx.fillStyle = "#1a1d24";
    ctx.fillRect(x, y, CELL_PX, CELL_PX);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(x, y, CELL_PX, 1);                       // top edge highlight
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.fillRect(x, y + CELL_PX - 1, CELL_PX, 1);            // bottom edge shadow
    ctx.fillRect(x + CELL_PX - 1, y, 1, CELL_PX);            // right edge shadow
  }

  _drawWall(ctx, x, y, mask) {
    // Blue-cobble wall — the level-8 palette in the arcade reference. Solid
    // dark base with paler stone tiles in two rows, and crisp pixel mortar.
    ctx.fillStyle = "#1c1d68";
    ctx.fillRect(x, y, CELL_PX, CELL_PX);
    ctx.fillStyle = "#2c34a4";
    for (let by = 0; by < CELL_PX; by += 8) {
      const off = ((y + by) / 8) % 2 ? 8 : 0;
      for (let bx = 0; bx < CELL_PX + 8; bx += 16) {
        ctx.fillRect(x + ((bx + off) % CELL_PX), y + by, 14, 7);
      }
    }
    // Brighter highlights on the top edge of each cobble.
    ctx.fillStyle = "rgba(160,180,255,0.25)";
    for (let by = 0; by < CELL_PX; by += 8) {
      const off = ((y + by) / 8) % 2 ? 8 : 0;
      for (let bx = 0; bx < CELL_PX + 8; bx += 16) {
        ctx.fillRect(x + ((bx + off) % CELL_PX), y + by, 14, 1);
      }
    }
    // Pixel mortar.
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    for (let by = 7; by < CELL_PX; by += 8) ctx.fillRect(x, y + by, CELL_PX, 1);
    if (!(mask & 1)) { ctx.fillStyle = "rgba(220,230,255,0.22)"; ctx.fillRect(x, y, CELL_PX, 1); }
    if (!(mask & 8)) { ctx.fillStyle = "rgba(220,230,255,0.18)"; ctx.fillRect(x, y, 1, CELL_PX); }
    if (!(mask & 4)) { ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(x, y + CELL_PX - 1, CELL_PX, 1); }
    if (!(mask & 2)) { ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x + CELL_PX - 1, y, 1, CELL_PX); }
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
    const cx = e.x + CELL_PX/2, cy = e.y + CELL_PX/2;
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
    ctx.fillRect(e.x+2, e.y+2, CELL_PX-4, CELL_PX-4);
    ctx.fillStyle = "#7a5b1f";
    for (let i = 4; i < CELL_PX-4; i += 4) ctx.fillRect(e.x+i, e.y+4, 1, CELL_PX-8);
    if (e.opening) {
      const f = Math.min(0.95, 1 - e.opening/(e.type.openSpeed));
      ctx.fillStyle = `rgba(0,0,0,${f})`;
      ctx.fillRect(e.x+2, e.y+2, CELL_PX-4, CELL_PX-4);
    }
  }

  _drawExit(ctx, e, frame) {
    const img = this.assets.images.exit;
    if (img && img.naturalWidth) {
      ctx.drawImage(img, 0, 0, img.width, img.height, e.x, e.y, CELL_PX, CELL_PX);
    } else {
      ctx.fillStyle = "#1c8a4a";
      ctx.fillRect(e.x+2, e.y+2, CELL_PX-4, CELL_PX-4);
    }
    const s = 0.5 + 0.5*Math.sin(frame * 0.2);
    ctx.fillStyle = `rgba(60,200,140,${0.35*s})`;
    ctx.fillRect(e.x, e.y, CELL_PX, CELL_PX);
  }

  _drawTreasure(ctx, e, frame) {
    const key = TREASURE_IMG[e.type.key];
    const img = this.assets.images[key];
    if (img && img.naturalWidth) {
      const sw = img.naturalWidth, sh = img.naturalHeight;
      const fw = sw === 72 ? 24 : 16;
      const fh = sh === 24 && sw > 24 ? 24 : Math.min(sh, 16);
      const f = (sw / fw) > 1 ? Math.floor(frame / 10) % Math.floor(sw / fw) : 0;
      ctx.drawImage(img, f*fw, 0, fw, fh, e.x, e.y, CELL_PX, CELL_PX);
    } else {
      ctx.fillStyle = "#ffcc33";
      ctx.fillRect(e.x+8, e.y+8, CELL_PX-16, CELL_PX-16);
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
      ctx.drawImage(img, animCol * SP, dirRow * SP, SP, SP, e.x + (CELL_PX-SP)/2, e.y + (CELL_PX-SP)/2, SP, SP);
    } else {
      ctx.fillStyle = monsterColor(e.type.key);
      ctx.fillRect(e.x+4, e.y+4, CELL_PX-8, CELL_PX-8);
    }
    if (e.health < e.type.health) {
      const w = (CELL_PX-4) * (e.health / e.type.health);
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(e.x+2, e.y, CELL_PX-4, 2);
      ctx.fillStyle = "#f33"; ctx.fillRect(e.x+2, e.y, w, 2);
    }
  }

  _drawGenerator(ctx, e, frame) {
    // Ghost generators use the dedicated ghost-generator sprite; every other
    // monster type uses the stone-cage generator.
    const isGhost = e.mtype.key === "ghost";
    const img = this.assets.images[isGhost ? "ghostGen" : "monsterGen"];
    const stage = Math.max(0, 2 - Math.floor(3 * (e.health / (e.maxHealth + 1))));
    if (img && img.naturalWidth) {
      ctx.drawImage(img, stage * SP, 0, SP, SP, e.x + (CELL_PX-SP)/2, e.y + (CELL_PX-SP)/2, SP, SP);
    } else {
      ctx.fillStyle = ["#822","#a44","#f66"][stage] || "#a44";
      ctx.fillRect(e.x+2, e.y+2, CELL_PX-4, CELL_PX-4);
    }
    const s = 0.4 + 0.4*Math.sin(frame * 0.25);
    ctx.fillStyle = `rgba(255,80,40,${0.18 * s})`;
    ctx.fillRect(e.x, e.y, CELL_PX, CELL_PX);
  }

  _drawFx(ctx, e, frame) {
    if (e.delay > 0) return;
    const img = this.assets.images.explosion;
    if (img && img.naturalWidth) {
      const fw = 16, fh = 16;
      const f = Math.min(2, e.frame);
      ctx.drawImage(img, f*fw, 0, fw, fh, e.x + (CELL_PX-fw)/2, e.y + (CELL_PX-fh)/2, fw*1.5, fh*1.5);
    } else {
      ctx.fillStyle = `rgba(255,200,80,${1 - e.frame/6})`;
      ctx.beginPath(); ctx.arc(e.x+CELL_PX/2, e.y+CELL_PX/2, 4 + e.frame*3, 0, Math.PI*2); ctx.fill();
    }
  }

  _drawPlayer(ctx, p, frame) {
    const sheet = PLAYER_SHEETS[p.type.key];
    const img = this.assets.images[sheet.img];

    if (p.hurting > 0) {
      const a = 0.3 * (p.hurting / (FPS/2));
      ctx.fillStyle = `rgba(255,40,40,${a})`;
      ctx.fillRect(p.x-2, p.y-2, CELL_PX+4, CELL_PX+4);
    } else if (p.healing > 0) {
      const a = 0.3 * (p.healing / (FPS/2));
      ctx.fillStyle = `rgba(80,255,140,${a})`;
      ctx.fillRect(p.x-2, p.y-2, CELL_PX+4, CELL_PX+4);
    }

    if (img && img.naturalWidth) {
      const dirRow = Math.min(sheet.rows - 1, mapDirToRow(p.dir, sheet.rows));
      let col;
      if (p.dead) col = sheet.cols - 1;
      else if (p.firing) col = (Math.floor(frame / 4) % 3) + 1;
      else if (p.moveDir >= 0) col = 1 + (Math.floor((frame + p.df) / 6) % Math.max(1, sheet.cols - 2));
      else col = 0;
      ctx.drawImage(img, col * SP, dirRow * SP, SP, SP, p.x + (CELL_PX-SP)/2, p.y + (CELL_PX-SP)/2, SP, SP);
    } else {
      ctx.fillStyle = p.type.color;
      ctx.fillRect(p.x+4, p.y+4, CELL_PX-8, CELL_PX-8);
    }

    // No in-world player tag. The cabinet identifies players by colour /
    // sprite alone; the HUD column on the right is the source of truth for
    // which slot is which.
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

    this._drawHudColumn(ctx, L, players, level, levelName, frame);
  }

  // Single right HUD column laid out per the cabinet spec, in native arcade
  // pixels scaled up by integer K. Native panel = 80×240. K = floor(H/240).
  // Native Y positions (top-to-bottom):
  //   2..26    GAUNTLET logo (80×24)
  //   32..40   "LEVEL" small label
  //   44..60   big level digit (16×16)
  //   66..186  four 24-tall hero blocks
  //   196..204 "MAP" label
  //   206..   level minimap
  _drawHudColumn(ctx, L, players, level, levelName, frame) {
    const K = L.K;
    const px = L.hud.x; // panel x in screen pixels
    const py = 0;
    const nW = L.nativeHudW; // 80

    // Helper to convert a native (x, y) inside the panel to screen px.
    const sx = (nx) => px + nx * K;
    const sy = (ny) => py + ny * K;

    // GAUNTLET sidebar logo (the ROM-extracted decal). Native 80×24 at y=2.
    this._drawSidebarLogo(ctx, sx(0), sy(2), nW * K, 24 * K);

    // "LEVEL" label centred. Use the proportional measure to centre exactly.
    const levelW = this.fontSmall.measure("LEVEL", 1);
    this.fontSmall.draw(ctx, "LEVEL", sx((nW - levelW) / 2), sy(32), "#fff", K);

    // Big level number using the dedicated 16×16 large-digit ROM atlas.
    const num = (levelName || "").match(/\d+/)?.[0] || "1";
    const numW = this.fontLarge.measure(num, 1);
    this.fontLarge.draw(ctx, num, sx((nW - numW) / 2), sy(44), "#fff", K);

    // Four hero blocks. Each block is 24 native px tall; we add a 6 px gap
    // between blocks so the name of the next hero doesn't crash into the
    // value row of the previous one.
    const blockH = 24, blockGap = 6;
    for (let slot = 0; slot < 4; slot++) {
      const blockY = 66 + slot * (blockH + blockGap);
      this._drawHeroBlock(ctx, players[slot], px, blockY, nW, K, frame);
    }

    // Footer: level minimap. Replaces the old WEYLAND-YUTANI placeholder. The
    // map shows the whole level layout at 1 native px per tile, plus dots for
    // each player, the exit, generators, and monsters.
    const mapLabelW = this.fontSmall.measure("MAP", 1);
    this.fontSmall.draw(ctx, "MAP", sx((nW - mapLabelW) / 2), sy(196), "#fff", K);
    this._drawMinimap(ctx, sx, sy, K, nW, 206, level, players);
  }

  // Draw a level overview to the right HUD column. The map sits in a panel
  // anchored at native (0, mapTopY); we centre the level's tw x th grid
  // within the panel and overlay the player / exit / monster / generator
  // dots on top.
  _drawMinimap(ctx, sx, sy, K, panelW, mapTopY, level, players) {
    if (!level) return;
    const tw = level.tw, th = level.th;
    // Choose a per-tile pixel size that fits both the panel width AND the
    // remaining vertical space (we have ~30 native px from mapTopY to the
    // panel bottom at y=240).
    const maxW = panelW - 4;
    const maxH = 240 - mapTopY - 2;
    const pxPerTile = Math.max(1, Math.min(Math.floor(maxW / tw), Math.floor(maxH / th)));
    const mapW = tw * pxPerTile;
    const mapH = th * pxPerTile;
    const x0Native = (panelW - mapW) / 2;

    // Background frame
    ctx.fillStyle = "#000";
    ctx.fillRect(sx(x0Native - 1), sy(mapTopY - 1), (mapW + 2) * K, (mapH + 2) * K);
    ctx.fillStyle = "#1a1a22";
    ctx.fillRect(sx(x0Native), sy(mapTopY), mapW * K, mapH * K);

    // Walls + floor
    for (let ty = 0; ty < th; ty++) {
      for (let tx = 0; tx < tw; tx++) {
        const c = level.cells[tx + ty * tw];
        if (!c) continue;
        let col = null;
        if (c.wall) col = "#7a8090";
        else if (c.nothing) col = "#000";
        if (col) {
          ctx.fillStyle = col;
          ctx.fillRect(sx(x0Native + tx * pxPerTile), sy(mapTopY + ty * pxPerTile),
                       pxPerTile * K, pxPerTile * K);
        }
      }
    }

    // Entity dots — exits, generators, treasures, monsters
    for (const e of level.entities) {
      if (e.dead) continue;
      const tx = Math.floor(e.x / CELL_PX), ty = Math.floor(e.y / CELL_PX);
      if (tx < 0 || ty < 0 || tx >= tw || ty >= th) continue;
      let col = null;
      if (e.exit)            col = "#3afa6a";
      else if (e.generator)  col = "#ff5040";
      else if (e.monster)    col = "#ff90c0";
      else if (e.treasure)   col = "#ffd84a";
      if (col) {
        ctx.fillStyle = col;
        ctx.fillRect(sx(x0Native + tx * pxPerTile), sy(mapTopY + ty * pxPerTile),
                     pxPerTile * K, pxPerTile * K);
      }
    }

    // Player dots (drawn last so they always show on top). Each player gets
    // a square in their own colour with a 1-px white border so they stand
    // out against monster dots.
    for (const p of players) {
      if (!p.joined || p.dead) continue;
      const tx = Math.floor(p.x / CELL_PX), ty = Math.floor(p.y / CELL_PX);
      if (tx < 0 || ty < 0 || tx >= tw || ty >= th) continue;
      const dotPx = Math.max(2, pxPerTile + 1);
      const px = sx(x0Native + tx * pxPerTile - 0.5);
      const py = sy(mapTopY  + ty * pxPerTile - 0.5);
      ctx.fillStyle = "#fff";
      ctx.fillRect(px - 1, py - 1, dotPx * K + 2, dotPx * K + 2);
      ctx.fillStyle = p.type.color;
      ctx.fillRect(px, py, dotPx * K, dotPx * K);
    }
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

    // Hero name centred via proportional measure.
    const name = t.key.toUpperCase();
    const nameW = this.fontSmall.measure(name, 1);
    this.fontSmall.draw(ctx, name, sx(Math.floor((nativeW - nameW) / 2)), sy(0), nameColor, K);

    // Two-column layout for SCORE+value and HEALTH+value. We measure each
    // label with the proportional font and centre the column on whichever
    // is wider. Two columns share the panel width with a small middle gap.
    const labelGap = 4; // native px between the two columns
    const scoreW  = this.fontSmall.measure("SCORE", 1);
    const healthW = this.fontSmall.measure("HEALTH", 1);
    const valueW  = this.fontSmall.measure("0000", 1);
    const col1W   = Math.max(scoreW, valueW);
    const col2W   = Math.max(healthW, valueW);
    const totalW  = col1W + labelGap + col2W;
    const col1Left = Math.floor((nativeW - totalW) / 2);
    const col2Left = col1Left + col1W + labelGap;

    // Centre each label inside its column.
    this.fontSmall.draw(ctx, "SCORE",  sx(col1Left + Math.floor((col1W - scoreW)  / 2)), sy(10), nameColor, K);
    this.fontSmall.draw(ctx, "HEALTH", sx(col2Left + Math.floor((col2W - healthW) / 2)), sy(10), nameColor, K);

    if (p.joined) {
      const score4 = this._fmtNum(p.score, 4);
      const hp4    = this._fmtNum(Math.max(0, p.health), 4);
      const score4W = this.fontSmall.measure(score4, 1);
      const hp4W    = this.fontSmall.measure(hp4, 1);
      this.fontSmall.draw(ctx, score4, sx(col1Left + Math.floor((col1W - score4W) / 2)), sy(18), "#fff", K);

      const weak = p.health < 200;
      const blink = weak && (Math.floor(frame / 12) % 2 === 0);
      const hpColor = weak ? (blink ? "#F90503" : "#fff") : "#fff";
      this.fontSmall.draw(ctx, hp4, sx(col2Left + Math.floor((col2W - hp4W) / 2)), sy(18), hpColor, K);
    } else {
      const dashes4 = "----";
      const dashW = this.fontSmall.measure(dashes4, 1);
      this.fontSmall.draw(ctx, dashes4, sx(col1Left + Math.floor((col1W - dashW) / 2)), sy(18), colorDim, K);
      this.fontSmall.draw(ctx, dashes4, sx(col2Left + Math.floor((col2W - dashW) / 2)), sy(18), colorDim, K);
    }
  }

  _drawSidebarLogo(ctx, x, y, w, h) {
    // GAUNTLET wordmark rendered with the ROM bitmap font + a red shadow
    // underlay. We size it to fill the panel slot.
    const text = "GAUNTLET";
    // Pick the largest scale that lets the wordmark fit in `w`.
    let scale = 1;
    for (let s = 8; s >= 1; s--) {
      if (this.fontSmall.measure(text, s) <= w - 4) { scale = s; break; }
    }
    const tw = this.fontSmall.measure(text, scale);
    const th = 8 * scale;
    const dx = x + Math.floor((w - tw) / 2);
    const dy = y + Math.floor((h - th) / 2);
    this.fontSmall.draw(ctx, text, dx + scale, dy + scale, "#9a0a0a", scale);
    this.fontSmall.draw(ctx, text, dx,         dy,         "#FFFFFF", scale);
    // Underline trim.
    ctx.fillStyle = "#9a0a0a";
    ctx.fillRect(dx, dy + th + 1, tw, 1 * scale);
  }

  // Cache the logo content bbox after first measurement.
  _logoBbox(img) {
    if (this._logoBboxCache) return this._logoBboxCache;
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
    for (let py = 0; py < c.height; py++) {
      for (let px = 0; px < c.width; px++) {
        const i = (py * c.width + px) << 2;
        const a = data[i+3];
        const lum = (data[i] + data[i+1] + data[i+2]) / 3;
        if (a > 30 && lum > 30) {
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }
    }
    if (maxX < 0) {
      this._logoBboxCache = { x: 0, y: 0, w: c.width, h: c.height };
    } else {
      this._logoBboxCache = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }
    return this._logoBboxCache;
  }

  _drawTintedRegion(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh, color) {
    if (!this._tintTmp) this._tintTmp = document.createElement("canvas");
    const tmp = this._tintTmp;
    tmp.width = sw; tmp.height = sh;
    const g = tmp.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, sw, sh);
    g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, sw, sh);
    ctx.drawImage(tmp, 0, 0, sw, sh, dx, dy, dw, dh);
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
  return ({
    drone:          "#3a4a5a",
    spitter:        "#cc6a3a",
    runner:         "#a07a4a",
    synthSecurity:  "#a0a0a0",
    praetorian:     "#3a8050",
    protoXeno:      "#000000",
    workerAndroid:  "#dac060",
  })[k] || "#888";
}
