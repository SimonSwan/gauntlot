// Renderer: draws floor, walls, entities, HUD.
// Uses original arcade sprites (24×24 frames laid out as cols=animFrames, rows=8 directions).
import { TILE, DIR, FPS } from "./constants.js";

const SP = 24; // sprite frame size from MAME extracts (24x24)

// Map our entity sprites to images and frame layouts.
// rows = 8 directions in MAME order: UP=0, UPRIGHT=1, RIGHT=2, DOWNRIGHT=3, DOWN=4, DOWNLEFT=5, LEFT=6, UPLEFT=7
// cols = animation frames for that direction (varies per sheet)
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
  lobber:   { img: "lobber",   cols: 5, rows: 4 }, // lobber sheet is 120x128, 4 dir rows
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

export class Render {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.assets = assets;
    this.W = canvas.width;
    this.H = canvas.height;
    this.HUD_H = 64;
    this.viewW = this.W;
    this.viewH = this.H - this.HUD_H;
    this._floorPattern = this._makeFloorPattern();
  }

  _makeFloorPattern() {
    // Procedural stone floor
    const c = document.createElement("canvas");
    c.width = TILE; c.height = TILE;
    const g = c.getContext("2d");
    g.fillStyle = "#1a1208";
    g.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 16; i++) {
      g.fillStyle = `rgba(${60 + (Math.random()*30|0)}, ${40 + (Math.random()*20|0)}, ${20 + (Math.random()*15|0)}, 0.5)`;
      g.fillRect((Math.random()*TILE)|0, (Math.random()*TILE)|0, 2, 2);
    }
    g.strokeStyle = "rgba(0,0,0,0.4)";
    g.strokeRect(0.5, 0.5, TILE-1, TILE-1);
    return this.ctx.createPattern(c, "repeat");
  }

  drawWorld(level, viewport, frame, players) {
    const ctx = this.ctx;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.W, this.viewH);

    // visible tile range
    const tx0 = Math.max(0, Math.floor(viewport.x / TILE) - 1);
    const ty0 = Math.max(0, Math.floor(viewport.y / TILE) - 1);
    const tx1 = Math.min(level.tw - 1, Math.ceil((viewport.x + this.viewW) / TILE) + 1);
    const ty1 = Math.min(level.th - 1, Math.ceil((viewport.y + this.viewH) / TILE) + 1);

    // floors first
    ctx.save();
    ctx.translate(-viewport.x, -viewport.y);
    ctx.fillStyle = this._floorPattern;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const c = level.cells[tx + ty * level.tw];
        if (!c || c.nothing || c.wall) continue;
        ctx.fillRect(tx*TILE, ty*TILE, TILE, TILE);
      }
    }
    // walls
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const c = level.cells[tx + ty * level.tw];
        if (!c || !c.wall) continue;
        this._drawWall(ctx, tx*TILE, ty*TILE, c.wallMask);
      }
    }
    // entities sorted by y for cheap depth
    const ents = level.entities.slice().sort((a,b) => (a.y - b.y));
    for (const e of ents) this._drawEntity(ctx, e, frame, level);
    // players on top
    for (const p of players) if (p.joined) this._drawPlayer(ctx, p, frame);
    ctx.restore();
  }

  _drawWall(ctx, x, y, mask) {
    // mask: 1=N,2=E,4=S,8=W neighbours
    ctx.fillStyle = "#3b3a78";
    ctx.fillRect(x, y, TILE, TILE);
    // brick lines
    ctx.fillStyle = "#272464";
    for (let i = 0; i < TILE; i += 8) ctx.fillRect(x, y + i, TILE, 1);
    for (let j = 0; j < TILE; j += 16) {
      const off = (j/16) % 2 ? 0 : 16;
      for (let k = 0; k < TILE; k += 16) ctx.fillRect(x + ((k + off) % TILE), y + j, 1, 8);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    if (!(mask & 1)) { ctx.beginPath(); ctx.moveTo(x, y+0.5); ctx.lineTo(x+TILE, y+0.5); ctx.stroke(); }
    if (!(mask & 8)) { ctx.beginPath(); ctx.moveTo(x+0.5, y); ctx.lineTo(x+0.5, y+TILE); ctx.stroke(); }
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    if (!(mask & 4)) { ctx.beginPath(); ctx.moveTo(x, y+TILE-0.5); ctx.lineTo(x+TILE, y+TILE-0.5); ctx.stroke(); }
    if (!(mask & 2)) { ctx.beginPath(); ctx.moveTo(x+TILE-0.5, y); ctx.lineTo(x+TILE-0.5, y+TILE); ctx.stroke(); }
  }

  _drawEntity(ctx, e, frame, level) {
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
      const owner = e.owner;
      const c = owner?.type?.color || "#fff";
      ctx.fillStyle = c;
      const t = (frame % 8) / 8;
      const r = 3 + Math.sin(t*Math.PI*2)*2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI*2); ctx.fill();
    }
  }

  _drawDoor(ctx, e, frame) {
    const f = e.opening ? Math.min(0.95, 1 - e.opening/(e.type.openSpeed)) : 0;
    ctx.fillStyle = "#caa54f";
    ctx.fillRect(e.x+2, e.y+2, TILE-4, TILE-4);
    ctx.fillStyle = "#7a5b1f";
    for (let i = 4; i < TILE-4; i += 4) ctx.fillRect(e.x+i, e.y+4, 1, TILE-8);
    if (f > 0) {
      ctx.fillStyle = `rgba(0,0,0,${f})`;
      ctx.fillRect(e.x+2, e.y+2, TILE-4, TILE-4);
    }
  }

  _drawExit(ctx, e, frame) {
    const t = (frame / 8) % 8 | 0;
    const img = this.assets.images.exit;
    if (img && img.naturalWidth) {
      ctx.drawImage(img, 0, 0, img.width, img.height, e.x, e.y, TILE, TILE);
    } else {
      ctx.fillStyle = "#2a8";
      ctx.fillRect(e.x+2, e.y+2, TILE-4, TILE-4);
    }
    // pulsing glow
    const s = 0.5 + 0.5*Math.sin(frame * 0.2);
    ctx.fillStyle = `rgba(60,200,140,${0.4*s})`;
    ctx.fillRect(e.x, e.y, TILE, TILE);
  }

  _drawTreasure(ctx, e, frame) {
    const key = TREASURE_IMG[e.type.key];
    const img = this.assets.images[key];
    if (img && img.naturalWidth) {
      // Most are 16x16; draw centered, scaled to TILE
      const sw = img.naturalWidth, sh = img.naturalHeight;
      const fw = sw === 72 ? 24 : 16; // chest is sprite-sheet 72x24
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
    // invisibility flicker (sorcerer)
    if (e.type.invisibility) {
      const phase = (frame + e.df) % (e.type.invisibility.on + e.type.invisibility.off);
      if (phase < e.type.invisibility.on) return; // invisible
    }
    if (img && img.naturalWidth) {
      const dirRow = Math.min(sheet.rows - 1, mapDirToRow(e.dir, sheet.rows));
      const animCol = Math.floor((frame + e.df) / 6) % sheet.cols;
      ctx.drawImage(img, animCol * SP, dirRow * SP, SP, SP, e.x + (TILE-SP)/2, e.y + (TILE-SP)/2, SP, SP);
    } else {
      ctx.fillStyle = monsterColor(e.type.key);
      ctx.fillRect(e.x+4, e.y+4, TILE-8, TILE-8);
    }
    // health bar when hurt
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
      // 72x24 sheet: 3 frames of 24x24
      ctx.drawImage(img, stage * SP, 0, SP, SP, e.x + (TILE-SP)/2, e.y + (TILE-SP)/2, SP, SP);
    } else {
      ctx.fillStyle = ["#822","#a44","#f66"][stage] || "#a44";
      ctx.fillRect(e.x+2, e.y+2, TILE-4, TILE-4);
    }
    // throbbing tint
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

    // glow when hurt/healed
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

    // player number tag
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(p.x + TILE - 10, p.y + TILE - 10, 9, 9);
    ctx.fillStyle = p.type.color;
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(p.slot + 1), p.x + TILE - 5.5, p.y + TILE - 5);
  }

  // ----- HUD -----
  drawHud(players, level, levelName) {
    const ctx = this.ctx;
    const y = this.viewH;
    ctx.fillStyle = "#0a0a14";
    ctx.fillRect(0, y, this.W, this.HUD_H);
    ctx.fillStyle = "#222244";
    ctx.fillRect(0, y, this.W, 2);

    const cellW = Math.floor(this.W / 4);
    for (let i = 0; i < 4; i++) {
      const x = i * cellW;
      const p = players[i];
      this._drawHudCell(ctx, x + 4, y + 4, cellW - 8, this.HUD_H - 8, p, i);
    }
    // top bar: level name
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, this.W, 18);
    ctx.fillStyle = "#fff8a0";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(levelName || "", this.W/2, 9);
  }

  _drawHudCell(ctx, x, y, w, h, p, slot) {
    const t = p.type;
    ctx.strokeStyle = p.joined ? t.color : "#333";
    ctx.lineWidth = 1;
    ctx.strokeRect(x+0.5, y+0.5, w-1, h-1);
    ctx.fillStyle = p.joined ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.7)";
    ctx.fillRect(x+1, y+1, w-2, h-2);

    // portrait
    const sheet = PLAYER_SHEETS[t.key];
    const img = this.assets.images[sheet.img];
    if (img && img.naturalWidth) {
      ctx.drawImage(img, 0, 4*SP, SP, SP, x+4, y+8, 32, 32);
    } else {
      ctx.fillStyle = t.color;
      ctx.fillRect(x+4, y+8, 32, 32);
    }

    ctx.fillStyle = p.joined ? "#fff" : "#666";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(`P${slot+1} ${t.key.toUpperCase()}`, x+40, y+4);
    ctx.font = "10px monospace";
    if (p.joined) {
      ctx.fillStyle = "#aaa";
      ctx.fillText(`SCORE  ${p.score}`, x+40, y+18);
      ctx.fillStyle = p.health < 200 ? (Math.floor(performance.now()/250)%2 ? "#f33":"#fff") : "#aaffaa";
      ctx.fillText(`HEALTH ${Math.floor(p.health)}`, x+40, y+30);
      ctx.fillStyle = "#ffd";
      ctx.fillText(`KEYS ${p.keys}  POT ${p.potions}`, x+40, y+42);
    } else {
      ctx.fillStyle = "#aaa";
      ctx.fillText(`PRESS START`, x+40, y+22);
      ctx.fillStyle = "#777";
      const codes = ["WASD+G", "IJKL+;", "ARROWS+.", "NUMPAD"];
      ctx.fillText(codes[slot], x+40, y+34);
    }
  }
}

function mapDirToRow(dir, rows) {
  // Our DIR enum: UP=0, UPRIGHT=1, RIGHT=2, DOWNRIGHT=3, DOWN=4, DOWNLEFT=5, LEFT=6, UPLEFT=7
  // Most arcade sheets use the same order. If a sheet only has 4 rows (lobber), map to cardinals.
  if (rows >= 8) return dir;
  if (rows === 4) {
    // up=0, right=1, down=2, left=3
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
