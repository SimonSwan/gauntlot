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

// Cabinet positions.
//   slotPositions[slot] = { col: "left"|"right", half: "top"|"bottom" }
const SLOT_POS = {
  0: { col: "left",  half: "top"    }, // Warrior
  1: { col: "right", half: "top"    }, // Valkyrie
  2: { col: "left",  half: "bottom" }, // Wizard
  3: { col: "right", half: "bottom" }, // Elf
};

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

    // Aim for a fixed-pixel HUD width that scales with window. The reference
    // arcade cabinet has HUD ≈ 22% of total width per side; the centre game
    // playfield is the rest. We snap the side panels to a multiple of 32 so
    // sprites and text grids align cleanly.
    const hudW = Math.max(180, Math.floor(W * 0.22));
    const gameW = W - hudW * 2;
    const gameH = H;

    return {
      W, H,
      left:  { x: 0,            y: 0, w: hudW,  h: H },
      right: { x: W - hudW,     y: 0, w: hudW,  h: H },
      game:  { x: hudW,         y: 0, w: gameW, h: gameH },
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

    // Clip to game column.
    ctx.save();
    const g = this.layout.game;
    ctx.beginPath(); ctx.rect(g.x, g.y, g.w, g.h); ctx.clip();
    ctx.translate(g.x - viewport.x, g.y - viewport.y);

    // Tiles visible.
    const tx0 = Math.max(0, Math.floor(viewport.x / TILE) - 1);
    const ty0 = Math.max(0, Math.floor(viewport.y / TILE) - 1);
    const tx1 = Math.min(level.tw - 1, Math.ceil((viewport.x + g.w) / TILE) + 1);
    const ty1 = Math.min(level.th - 1, Math.ceil((viewport.y + g.h) / TILE) + 1);

    // Floors
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const c = level.cells[tx + ty * level.tw];
        if (!c || c.nothing || c.wall) continue;
        this._drawFloor(ctx, tx*TILE, ty*TILE);
      }
    }
    // Walls
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const c = level.cells[tx + ty * level.tw];
        if (!c || !c.wall) continue;
        this._drawWall(ctx, tx*TILE, ty*TILE, c.wallMask);
      }
    }
    // Entities (sorted by y for cheap depth)
    const ents = level.entities.slice().sort((a,b) => (a.y - b.y));
    for (const e of ents) this._drawEntity(ctx, e, frame, level);
    // Players
    for (const p of players) if (p.joined) this._drawPlayer(ctx, p, frame);
    ctx.restore();

    // Border lines flanking the game viewport — arcade-style trim.
    ctx.fillStyle = "#222";
    ctx.fillRect(this.layout.left.x + this.layout.left.w - 2, 0, 2, this.layout.H);
    ctx.fillRect(this.layout.right.x, 0, 2, this.layout.H);
  }

  // ROM-style tiled floor: dark earthy brown with a faint grid.
  _drawFloor(ctx, x, y) {
    ctx.fillStyle = "#26180a";
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = "#321e0b";
    for (let i = 4; i < TILE; i += 8) ctx.fillRect(x + i, y, 1, TILE);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x, y + TILE - 1, TILE, 1);
    ctx.fillRect(x + TILE - 1, y, 1, TILE);
  }

  _drawWall(ctx, x, y, mask) {
    // Brown brick wall like the arcade. Solid base + bricked highlights.
    ctx.fillStyle = "#4a2913";
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = "#642f12";
    // Two rows of bricks per tile; offset every other row for staggered pattern.
    for (let by = 0; by < TILE; by += 8) {
      const off = ((y + by) / 8) % 2 ? 8 : 0;
      for (let bx = 0; bx < TILE + 8; bx += 16) {
        ctx.fillRect(x + ((bx + off) % TILE), y + by, 14, 7);
      }
    }
    // Mortar lines.
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    for (let by = 7; by < TILE; by += 8) ctx.fillRect(x, y + by, TILE, 1);
    // Top highlight (light source from above-left).
    if (!(mask & 1)) { ctx.fillStyle = "rgba(255,200,140,0.22)"; ctx.fillRect(x, y, TILE, 1); }
    if (!(mask & 8)) { ctx.fillStyle = "rgba(255,200,140,0.18)"; ctx.fillRect(x, y, 1, TILE); }
    if (!(mask & 4)) { ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x, y + TILE - 1, TILE, 1); }
    if (!(mask & 2)) { ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x + TILE - 1, y, 1, TILE); }
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

    // Black backgrounds for both side panels.
    ctx.fillStyle = HUD_BG;
    ctx.fillRect(L.left.x, 0, L.left.w, L.H);
    ctx.fillRect(L.right.x, 0, L.right.w, L.H);

    // Compute panel geometry: each side is split vertically into two halves.
    // Logo occupies the very top of the right column (LEVEL N also rendered there).
    const topReserve = Math.min(110, Math.max(60, Math.floor(L.H * 0.13)));
    const cellH = Math.floor((L.H - topReserve) / 2);

    // GAUNTLET logo top-right
    this._drawLogo(ctx, L.right.x + 8, 8, L.right.w - 16, topReserve - 16);
    // LEVEL banner top-left
    this._drawLevelBanner(ctx, L.left.x + 8, 8, L.left.w - 16, topReserve - 16, levelName);

    // Player panels by slot.
    for (let slot = 0; slot < 4; slot++) {
      const pos = SLOT_POS[slot];
      const colSide = pos.col === "left" ? L.left : L.right;
      const top = topReserve + (pos.half === "top" ? 0 : cellH);
      this._drawPlayerPanel(ctx, players[slot], slot, colSide.x + 4, top + 4, colSide.w - 8, cellH - 8, frame);
    }

    // Footer credits at bottom of right panel.
    ctx.fillStyle = "#888";
    ctx.font = `bold ${Math.max(9, Math.floor(L.H * 0.013))}px ${FONT}`;
    ctx.textAlign = "right"; ctx.textBaseline = "bottom";
    ctx.fillText("©1985 ATARI GAMES", L.right.x + L.right.w - 8, L.H - 6);
    ctx.textAlign = "left";
    ctx.fillText("1 COIN = 700 HEALTH", L.left.x + 8, L.H - 6);
  }

  _drawLogo(ctx, x, y, w, h) {
    const img = this.assets.images.textGauntlet;
    if (img && img.naturalWidth) {
      // Preserve aspect, fit inside the box.
      const scale = Math.min(w / img.width, h / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = "#ffd24a";
      ctx.font = `bold ${Math.floor(h * 0.7)}px ${FONT}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("GAUNTLET", x + w/2, y + h/2);
    }
  }

  _drawLevelBanner(ctx, x, y, w, h, name) {
    ctx.fillStyle = "#222";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#444"; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = "#ffd24a";
    ctx.font = `bold ${Math.floor(h * 0.42)}px ${FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("LEVEL", x + w/2, y + h*0.3);
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.floor(h * 0.55)}px ${FONT}`;
    const num = (name || "").match(/\d+/)?.[0] || "?";
    ctx.fillText(num, x + w/2, y + h*0.7);
  }

  _drawPlayerPanel(ctx, p, slot, x, y, w, h, frame) {
    const t = p.type;
    // Subtle frame around the panel.
    ctx.strokeStyle = p.joined ? t.color : "#333";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

    // Hero name in their colour, big.
    const nameSize = Math.max(14, Math.floor(h * 0.13));
    ctx.fillStyle = p.joined ? t.color : "#444";
    ctx.font = `bold ${nameSize}px ${FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText(t.key.toUpperCase(), x + w/2, y + 6);

    // Lives count "Nx" — big, tucked top-left.
    if (p.joined && (p.lives || 0) > 0) {
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${nameSize}px ${FONT}`;
      ctx.textAlign = "left";
      ctx.fillText(`${p.lives}x`, x + 8, y + 6);
    }

    // Big portrait of the hero, down-facing standing frame.
    const sheet = PLAYER_SHEETS[t.key];
    const img = this.assets.images[sheet.img];
    const portraitTop = y + 6 + nameSize + 4;
    const portraitMax = Math.min(w - 16, h * 0.30);
    const portraitSize = Math.max(48, Math.floor(portraitMax / 24) * 24);
    if (img && img.naturalWidth) {
      ctx.drawImage(img, 0, 4*SP, SP, SP,
        x + (w - portraitSize)/2, portraitTop, portraitSize, portraitSize);
    } else {
      ctx.fillStyle = t.color;
      ctx.fillRect(x + (w - portraitSize)/2, portraitTop, portraitSize, portraitSize);
    }

    // Score / Health labels.
    const labelSize = Math.max(10, Math.floor(h * 0.07));
    const valueSize = Math.max(14, Math.floor(h * 0.11));
    let cy = portraitTop + portraitSize + 8;

    if (p.joined) {
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${labelSize}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("SCORE", x + w/2, cy);
      cy += labelSize + 2;
      ctx.font = `bold ${valueSize}px ${FONT}`;
      ctx.fillText(String(Math.floor(p.score)).padStart(5, "0"), x + w/2, cy);
      cy += valueSize + 8;

      ctx.font = `bold ${labelSize}px ${FONT}`;
      ctx.fillText("HEALTH", x + w/2, cy);
      cy += labelSize + 2;
      const weak = p.health < 200;
      const blink = weak && (Math.floor(frame / 12) % 2 === 0);
      ctx.fillStyle = weak ? (blink ? "#f33" : "#fff") : "#9f9";
      ctx.font = `bold ${valueSize}px ${FONT}`;
      ctx.fillText(String(Math.max(0, Math.floor(p.health))).padStart(5, "0"), x + w/2, cy);
      cy += valueSize + 6;

      // Keys + potions
      ctx.fillStyle = "#ffd24a";
      ctx.font = `bold ${labelSize}px ${FONT}`;
      ctx.fillText(`KEY ${p.keys}   POT ${p.potions}`, x + w/2, cy);
    } else {
      ctx.fillStyle = "#666";
      ctx.font = `bold ${labelSize+1}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("PRESS", x + w/2, cy);
      ctx.fillText("START", x + w/2, cy + labelSize + 4);
      const bind = ["WASD + G", "IJKL + ;", "ARROWS + .", "NUMPAD"][slot];
      ctx.fillStyle = "#444";
      ctx.font = `${labelSize}px ${FONT}`;
      ctx.fillText(bind, x + w/2, cy + (labelSize + 4) * 2 + 8);
    }
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
