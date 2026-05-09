// Arcade-faithful renderer.
//
// Canvas fills the window; we lay out three columns:
//   [ left HUD column ] [ centre game viewport ] [ right HUD column ]
//
// Each HUD column shows two of the four player slots stacked vertically:
//   left  = P1 Warrior (top) + P3 Wizard (bottom)
//   right = P2 Valkyrie (top) + P4 Elf (bottom)
// matching the original cabinet layout.
//
// The internal "world" tile size is a fixed 32px; the centre viewport just
// shows however many tiles fit. We do *not* scale individual sprites — the
// arcade look is one pixel = one pixel — but the total panel layout responds
// to the window size.

import { TILE, DIR, FPS } from "./constants.js";

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
  }

  _computeLayout() {
    const W = this.canvas.width, H = this.canvas.height;

    // Cabinet layout from the reference screenshot:
    //   [   GAME VIEWPORT (large)   ] [ RIGHT HUD COLUMN ]
    // Game on the left, single HUD column down the right. The HUD stacks
    // GAUNTLET logo, LEVEL N, four hero panels, ©1985 ATARI GAMES.
    //
    // Game viewport renders a native 16×16 tile playfield (taken from
    // VIEWPORT in javascript-gauntlet, scaled down a touch to fit a 16:10
    // monitor) and is fractionally scaled up to the largest size that fits
    // the available area while preserving aspect.
    const NATIVE_W = 16 * TILE;
    const NATIVE_H = 16 * TILE;
    const hudW = Math.max(220, Math.floor(W * 0.22));
    const availW = W - hudW;
    const availH = H;

    const scale = Math.min(availW / NATIVE_W, availH / NATIVE_H);
    const gameW = Math.floor(NATIVE_W * scale);
    const gameH = Math.floor(NATIVE_H * scale);
    const gameX = Math.floor((availW - gameW) / 2);
    const gameY = Math.floor((availH - gameH) / 2);

    return {
      W, H, scale,
      hud:  { x: W - hudW, y: 0, w: hudW, h: H },
      game: { x: gameX,    y: gameY, w: gameW, h: gameH },
      worldW: NATIVE_W,
      worldH: NATIVE_H,
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

  // The single right HUD column. Top-down:
  //   GAUNTLET logo, LEVEL N, 4 hero panels (Warrior/Valkyrie/Wizard/Elf),
  //   ©1985 ATARI GAMES footer.
  _drawHudColumn(ctx, L, players, levelName, frame) {
    const x = L.hud.x, w = L.hud.w;
    const padX = Math.max(8, Math.floor(w * 0.06));

    // Block heights — chosen so the four hero panels fill the bulk of the
    // column with the logo / level / footer trim taking the rest.
    const logoH  = Math.floor(L.H * 0.10);
    const levelH = Math.floor(L.H * 0.12);
    const footH  = Math.floor(L.H * 0.05);
    const heroBlockH = L.H - logoH - levelH - footH;
    const heroH = Math.floor(heroBlockH / 4);

    let y = 0;

    // GAUNTLET logo (top of column, centred).
    this._drawGauntletLogo(ctx, x + padX, y + 4, w - padX * 2, logoH - 8);
    y += logoH;

    // LEVEL N — "LEVEL" label above a big number.
    this._drawLevelBlock(ctx, x, y, w, levelH, levelName);
    y += levelH;

    // Four hero panels, top-to-bottom.
    for (let slot = 0; slot < 4; slot++) {
      this._drawHeroPanel(ctx, players[slot], slot, x, y + slot * heroH, w, heroH, frame);
    }
    y += heroH * 4;

    // © 1985 ATARI GAMES footer.
    const fontSize = Math.max(10, Math.floor(footH * 0.45));
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${fontSize}px ${FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("© 1985", x + w/2, y + footH * 0.30);
    ctx.fillText("ATARI GAMES", x + w/2, y + footH * 0.70);
  }

  _drawGauntletLogo(ctx, x, y, w, h) {
    const img = this.assets.images.textGauntlet;
    if (img && img.naturalWidth) {
      const scale = Math.min(w / img.width, h / img.height);
      const dw = Math.floor(img.width * scale), dh = Math.floor(img.height * scale);
      const dx = x + Math.floor((w - dw) / 2), dy = y + Math.floor((h - dh) / 2);
      // Drop-shadow tinted red to mimic the cabinet decal.
      ctx.fillStyle = "rgba(180,30,30,0.55)";
      ctx.drawImage(img, dx + 2, dy + 2, dw, dh);
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.floor(h * 0.85)}px ${FONT}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("GAUNTLET", x + w/2, y + h/2);
    }
  }

  _drawLevelBlock(ctx, x, y, w, h, levelName) {
    const num = (levelName || "").match(/\d+/)?.[0] || "1";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const labelSize = Math.max(12, Math.floor(h * 0.28));
    const numSize = Math.max(28, Math.floor(h * 0.62));
    ctx.font = `bold ${labelSize}px ${FONT}`;
    ctx.fillText("LEVEL", x + w/2, y + h * 0.30);
    ctx.font = `bold ${numSize}px ${FONT}`;
    ctx.fillText(num, x + w/2, y + h * 0.72);
  }

  // One hero panel inside the right HUD column.
  //   WARRIOR  (big colored name; Nx lives on the left if applicable)
  //   SCORE  HEALTH       (small same-color labels, two columns)
  //    3540   2634        (numeric values, two columns)
  _drawHeroPanel(ctx, p, slot, x, y, w, h, frame) {
    const t = p.type;
    const nameSize  = Math.max(16, Math.floor(h * 0.34));
    const labelSize = Math.max(10, Math.floor(h * 0.16));
    const valueSize = Math.max(14, Math.floor(h * 0.22));
    const padX = Math.max(8, Math.floor(w * 0.08));

    const nameY  = y + Math.floor(h * 0.05);
    const labelY = y + Math.floor(h * 0.50);
    const valueY = y + Math.floor(h * 0.74);

    // Hero name centred at the top of the panel in the cabinet colour.
    ctx.fillStyle = p.joined ? t.color : "#3a3a3a";
    ctx.font = `bold ${nameSize}px ${FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(t.key.toUpperCase(), x + w/2, nameY);

    // Lives "Nx" indicator (left of the name) when joined and at least one
    // life — matches the "3x" / "2x" badges in the reference screenshot.
    if (p.joined && (p.lives || 0) >= 1) {
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${nameSize}px ${FONT}`;
      ctx.textAlign = "left";
      ctx.fillText(`${p.lives}x`, x + padX, nameY);
    }

    // Two-column SCORE / HEALTH layout — labels in the hero colour, numeric
    // values in white below them.
    const colCx1 = x + Math.floor(w * 0.30);
    const colCx2 = x + Math.floor(w * 0.70);

    ctx.fillStyle = p.joined ? t.color : "#3a3a3a";
    ctx.font = `bold ${labelSize}px ${FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText("SCORE",  colCx1, labelY);
    ctx.fillText("HEALTH", colCx2, labelY);

    if (p.joined) {
      ctx.font = `bold ${valueSize}px ${FONT}`;
      ctx.fillStyle = "#fff";
      ctx.fillText(this._fmtNum(p.score, 4), colCx1, valueY);
      const weak = p.health < 200;
      const blink = weak && (Math.floor(frame / 12) % 2 === 0);
      ctx.fillStyle = weak ? (blink ? "#F90503" : "#fff") : "#fff";
      ctx.fillText(this._fmtNum(Math.max(0, p.health), 4), colCx2, valueY);
    } else {
      // Inactive panels in the cabinet show the labels only — slot looks
      // dim until the player joins.
      ctx.fillStyle = "#444";
      ctx.font = `bold ${valueSize}px ${FONT}`;
      ctx.fillText("----", colCx1, valueY);
      ctx.fillText("----", colCx2, valueY);
    }
  }

  _fmtNum(n, digits) {
    return String(Math.floor(n)).padStart(digits, "0");
  }
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
