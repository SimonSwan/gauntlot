/**
 * src/render.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Canvas renderer for the Gauntlet recreation.
 *
 * World coordinates: 16px per tile, 32x32 grid (512x512 world units per level).
 * Sprites in mbeisser1 zip are 24x24 (HW.SPRITE_PX). Items 16x16.
 *
 * The canvas auto-resizes to fill its CSS box; we pick an integer scale that
 * fits both the playfield (32 tiles + HUD column) and the available height.
 * Camera follows the centroid of joined live players.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { HW, RENDER, PALETTE, MON, HEROES, DIR, DIR_VEC, MON_NAME, CELL } from "./constants.js";
import { T } from "./level.js";
import { Assets } from "./assets.js";
import { Monster, Generator, Projectile, Item, Fx } from "./entities.js";

const SPRPX = 24;     // sprite frame size in world px (equals CELL)

// Reference layout (per jakesgordon/javascript-gauntlet):
//   canvas split 75% playfield / 25% scoreboard.
//   playfield is a SCROLLING viewport of VIEW_TILES x VIEW_TILES (24, not 32).
//   The camera follows the focused player; the maze is larger than the view.
const VIEW_TILES = 24;
const HUD_FRACT  = 0.25;   // HUD is 25% of canvas width

export class Render {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext("2d");
    this.scale  = 2;        // recomputed on each frame
    this.cameraX = 0;
    this.cameraY = 0;
  }

  _layout() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    // Reserve a quarter of the canvas for the scoreboard column.
    const hudW   = Math.max(140, Math.floor(W * HUD_FRACT));
    const availW = Math.max(1, W - hudW);
    // Pick the largest scale that fits VIEW_TILES x VIEW_TILES into the
    // available area (non-integer ok — imageSmoothingEnabled=false keeps
    // sprites crisp at any scale).
    const sx = availW / (VIEW_TILES * CELL);
    const sy = H      / (VIEW_TILES * CELL);
    this.scale = Math.max(0.5, Math.min(sx, sy));
    this.viewW = Math.floor(VIEW_TILES * CELL * this.scale);
    this.viewH = Math.floor(VIEW_TILES * CELL * this.scale);
    this.viewX = Math.floor((availW - this.viewW) / 2);
    this.viewY = Math.floor((H      - this.viewH) / 2);
    this.hudX  = availW;     // HUD starts where the playfield ends
    this.hudW  = W - this.hudX;
    // Approx font sizes scaled to HUD width.
    this.hudFontPx = Math.max(12, Math.floor(this.hudW / 12));
  }

  // ── World rendering ─────────────────────────────────────────────────────────
  drawFrame(level, players, mgr, frame) {
    this._layout();
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (!level || !level.grid) return;

    // Centre on the first joined live player; could be the centroid of all.
    const focus = players.find(p => p.joined && !p.dead) || players[0];
    const cx = focus ? focus.cx : 16 * CELL;
    const cy = focus ? focus.cy : 16 * CELL;
    // Camera target: place focus at the centre of the viewport
    let camX = cx * this.scale - this.viewW / 2;
    let camY = cy * this.scale - this.viewH / 2;
    // Clamp camera so the viewport never shows beyond the 32-tile maze edges.
    const mazePx = 32 * CELL * this.scale;
    camX = Math.max(0, Math.min(camX, mazePx - this.viewW));
    camY = Math.max(0, Math.min(camY, mazePx - this.viewH));
    this.cameraX = camX | 0;
    this.cameraY = camY | 0;

    // Clip to the playfield panel so wall/sprite overflow can't leak into the HUD
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.viewX, this.viewY, this.viewW, this.viewH);
    ctx.clip();

    this._drawTiles(level);
    this._drawGenerators(mgr);
    this._drawItems(mgr);
    this._drawMonsters(mgr);
    this._drawProjectiles(mgr);
    this._drawPlayers(players);
    this._drawFx(mgr);

    ctx.restore();

    // HUD on the right
    this._drawHud(players, level, frame);
  }

  // ── Tile layer ──────────────────────────────────────────────────────────────
  _drawTiles(level) {
    const ctx = this.ctx;
    const S = this.scale, C = CELL * S;
    for (const tile of level.grid) {
      const sx = this.viewX + tile.wx * S - this.cameraX;
      const sy = this.viewY + tile.wy * S - this.cameraY;
      if (sx + C < this.viewX || sx > this.viewX + this.viewW) continue;
      if (sy + C < this.viewY || sy > this.viewY + this.viewH) continue;

      switch (tile.type) {
        case T.FLOOR:
          // floor: dark gray + 1px grid line for readability
          ctx.fillStyle = "#1a1d24";
          ctx.fillRect(sx, sy, C, C);
          ctx.fillStyle = "rgba(255,255,255,0.04)";
          ctx.fillRect(sx, sy, C, 1);
          break;

        case T.WALL: {
          // Stone wall (chars ROM not decoded — flat colour fill per spec)
          ctx.fillStyle = PALETTE.wall;
          ctx.fillRect(sx, sy, C, C);
          ctx.fillStyle = "rgba(255,255,255,0.10)";
          ctx.fillRect(sx, sy, C, Math.max(1, S));
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.fillRect(sx, sy + C - Math.max(1, S), C, Math.max(1, S));
          break;
        }

        case T.GATE_H:
        case T.GATE_V: {
          const key = tile.type === T.GATE_H ? "gate_h" : "gate_v";
          const img = Assets.img[key];
          if (tile.locked) {
            if (img) ctx.drawImage(img, sx, sy, C, C);
            else {
              ctx.fillStyle = PALETTE.gate;
              ctx.fillRect(sx, sy, C, C);
            }
          } else {
            // unlocked = floor
            ctx.fillStyle = "#1a1d24";
            ctx.fillRect(sx, sy, C, C);
          }
          break;
        }

        case T.SPAWN:
          ctx.fillStyle = "#1a1d24";
          ctx.fillRect(sx, sy, C, C);
          ctx.fillStyle = PALETTE.spawn;
          ctx.fillRect(sx + C/3, sy + C/3, C/3, C/3);
          break;

        case T.EXIT:
        case T.EXIT_WARP4:
        case T.EXIT_WARP8: {
          ctx.fillStyle = "#1a1d24";
          ctx.fillRect(sx, sy, C, C);
          const key = tile.type === T.EXIT_WARP4 ? "exit_4"
                    : tile.type === T.EXIT_WARP8 ? "exit_8"
                    : "exit";
          const img = Assets.img[key];
          if (img) ctx.drawImage(img, sx, sy, C, C);
          else {
            ctx.fillStyle = PALETTE.exit;
            ctx.fillRect(sx + 1, sy + 1, C - 2, C - 2);
          }
          break;
        }

        default:
          // Generators / items / power-ups are entities, not tiles — draw floor here.
          ctx.fillStyle = "#1a1d24";
          ctx.fillRect(sx, sy, C, C);
      }
    }
  }

  _drawGenerators(mgr) {
    const ctx = this.ctx;
    const S = this.scale, sprite = SPRPX * S;
    for (const e of mgr.entities) {
      if (!(e instanceof Generator) || e.dead) continue;
      const sx = this.viewX + e.wx * S - this.cameraX;
      const sy = this.viewY + e.wy * S - this.cameraY;
      const key = e.monType === MON.GHOST ? "ghost_gen" : "monster_gen";
      const img = Assets.img[key];
      // Frame column = clamp(level-1, 0..2)
      const col = Math.max(0, Math.min(2, (e.level || 1) - 1));
      if (img) {
        ctx.drawImage(img, col * SPRPX, 0, SPRPX, SPRPX, sx, sy, sprite, sprite);
      } else {
        ctx.fillStyle = e.monType === MON.GHOST ? PALETTE.ghost_gen : PALETTE.monster_gen;
        ctx.fillRect(sx, sy, sprite, sprite);
      }
    }
  }

  _drawItems(mgr) {
    const ctx = this.ctx;
    const S = this.scale, C = CELL * S;
    for (const e of mgr.entities) {
      if (!(e instanceof Item) || e.dead) continue;
      const sx = this.viewX + e.wx * S - this.cameraX;
      const sy = this.viewY + e.wy * S - this.cameraY;
      const img = Assets.img[e.itemKind];
      if (img) {
        // Most items are 16x16; food/treasure are 24x24 — scale to one tile.
        ctx.drawImage(img, sx, sy, C, C);
      } else {
        ctx.fillStyle = PALETTE.item;
        ctx.fillRect(sx + 2 * S, sy + 2 * S, C - 4 * S, C - 4 * S);
      }
    }
  }

  _drawMonsters(mgr) {
    const ctx = this.ctx;
    const S = this.scale, sprite = SPRPX * S;
    for (const e of mgr.entities) {
      if (!(e instanceof Monster) || e.dead) continue;
      const sx = this.viewX + e.wx * S - this.cameraX;
      const sy = this.viewY + e.wy * S - this.cameraY;
      const key = Assets.monsterSheetKey(e.monType, e.theme || 0);
      const img = Assets.img[key];
      if (img) {
        const cols = Math.floor(img.naturalWidth  / SPRPX);
        const rows = Math.floor(img.naturalHeight / SPRPX);
        // Lobber: only 5 direction rows (S, E, N, W, ?), map 8 dirs onto 4
        // cardinals by collapsing diagonals — HYPOTHESIS per SPRITE_FRAMES.md.
        const dir  = e.dir | 0;
        const row  = (e.monType === MON.LOBBER)
          ? [0,0,1,1,2,2,3,3][dir] ?? 0
          : Math.min(rows - 1, dir);
        const col  = Math.min(cols - 1, e.animFrame | 0);
        ctx.drawImage(img, col * SPRPX, row * SPRPX, SPRPX, SPRPX, sx, sy, sprite, sprite);
      } else {
        ctx.fillStyle = "#a44";
        ctx.fillRect(sx, sy, sprite, sprite);
      }
    }
  }

  _drawProjectiles(mgr) {
    const ctx = this.ctx;
    const S = this.scale;
    for (const e of mgr.entities) {
      if (!(e instanceof Projectile) || e.dead) continue;
      if (e.owner === "player" && e.heroId && this._drawPlayerShot(e, S)) continue;
      // Fallback / monster shot — small circle
      const sx = this.viewX + (e.wx + 4) * S - this.cameraX;
      const sy = this.viewY + (e.wy + 4) * S - this.cameraY;
      const r  = 3 * S;
      ctx.fillStyle = e.owner === "monster" ? "#ff7a2a" : "#ffe24a";
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath(); ctx.arc(sx, sy, r/2, 0, Math.PI*2); ctx.fill();
    }
  }

  /**
   * Draw a player's weapon projectile using its per-hero sprite sheet.
   * CONFIRMED per SPRITE_FRAMES.md (clockwise dir rows):
   *   warrior  256×16  16 frames spin: col = (ageMs/50) % 16, row 0
   *   valkyrie 128×16   8 static dirs: col = dir,             row 0
   *   elf      128×16   8 static dirs: col = dir,             row 0
   *   wizard   128×32   8 dirs × 2 rows pulse: col = dir, row = (ageMs/80) % 2
   * Drawn 2× source size, centred on the projectile.
   * @returns {boolean} true if the sprite was drawn (caller skips fallback)
   */
  _drawPlayerShot(e, S) {
    const img = Assets.img[`${e.heroId}_weapon`];
    if (!img || !img.complete) return false;
    const fw = 16, fh = 16;
    const cols = Math.max(1, Math.floor(img.naturalWidth  / fw));
    const rows = Math.max(1, Math.floor(img.naturalHeight / fh));
    let col = 0, row = 0;
    const dir = (e.dir | 0) % 8;
    switch (e.heroId) {
      case 'warrior': col = Math.floor((e.ageMs | 0) / 50) % cols; row = 0; break;
      case 'wizard':  col = Math.min(dir, cols - 1); row = Math.floor((e.ageMs | 0) / 80) % rows; break;
      default:        col = Math.min(dir, cols - 1); row = 0;  // valkyrie / elf — static
    }
    // Source is 16×16; our renderer already applies a 2× world scale, so
    // drawing at fw*S keeps the projectile roughly 2/3 the player size on
    // screen (the doc's "2×" was for an upstream renderer without that scale).
    const drawW = fw * S, drawH = fh * S;
    const sx = this.viewX + (e.wx + 4) * S - this.cameraX - drawW / 2 + 4 * S;
    const sy = this.viewY + (e.wy + 4) * S - this.cameraY - drawH / 2 + 4 * S;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(img, col * fw, row * fh, fw, fh, sx, sy, drawW, drawH);
    return true;
  }

  _drawPlayers(players) {
    const ctx = this.ctx;
    const S = this.scale, sprite = SPRPX * S;
    for (const p of players) {
      if (!p.joined || p.dead) continue;
      const sx = this.viewX + p.wx * S - this.cameraX;
      const sy = this.viewY + p.wy * S - this.cameraY;
      const img = Assets.img[p.hero.id];
      if (img) {
        const row = Math.min(p.hero.frameRows - 1, p.dir | 0);
        const col = Math.min(p.hero.frameCols - 1, p.animFrame | 0);
        const sz  = p.hero.frameSize;
        ctx.drawImage(img, col * sz, row * sz, sz, sz, sx, sy, sprite, sprite);
      } else {
        ctx.fillStyle = p.hero.color;
        ctx.fillRect(sx, sy, sprite, sprite);
      }
      if (p.invuln > 0 && Math.floor(performance.now() / 60) % 2) {
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillRect(sx, sy, sprite, sprite);
      }
    }
  }

  _drawFx(mgr) {
    const ctx = this.ctx;
    const S = this.scale, sprite = 16 * S;
    for (const e of mgr.entities) {
      if (!(e instanceof Fx) || e.dead) continue;
      const sx = this.viewX + e.wx * S - this.cameraX;
      const sy = this.viewY + e.wy * S - this.cameraY;
      // Lobber impacts use the dedicated shrapnel sheet; everything else
      // uses the generic collision explosion (3 frames, ~100ms/frame).
      const key = e.fxType === 'lobber_explosion' ? 'lobber_expl' : 'collision_expl';
      const img = Assets.img[key];
      if (img) {
        const f = Math.min(2, (e.animFrame ?? e.frame ?? 0) | 0);
        ctx.drawImage(img, f * 16, 0, 16, 16, sx, sy, sprite, sprite);
      } else {
        ctx.fillStyle = `rgba(255,200,80,0.7)`;
        ctx.beginPath(); ctx.arc(sx + sprite/2, sy + sprite/2, sprite/2, 0, Math.PI*2); ctx.fill();
      }
    }
  }

  // ── HUD ─────────────────────────────────────────────────────────────────────
  _drawHud(players, level, frame) {
    const ctx = this.ctx;
    const x = this.hudX, w = this.hudW, h = this.canvas.height;
    const fp = this.hudFontPx;
    ctx.fillStyle = "#000";
    ctx.fillRect(x, 0, w, h);

    ctx.textAlign = "center";
    const pad = Math.max(8, fp);
    let yy = pad + fp;

    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.floor(fp * 1.6)}px monospace`;
    ctx.fillText("GAUNTLET", x + w/2, yy);
    yy += fp * 1.6;

    ctx.font = `${fp}px monospace`;
    ctx.fillText(`LEVEL ${(level?.index ?? 0) + 1}`, x + w/2, yy);
    yy += fp * 2;

    // Per-player panel.  Spread evenly across the remaining height.
    const panelH = (h - yy - pad) / players.length;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const py = yy + i * panelH;
      ctx.fillStyle = p.hero.color;
      ctx.font = `bold ${Math.floor(fp * 1.25)}px monospace`;
      ctx.fillText(p.hero.id.toUpperCase(), x + w/2, py + fp);
      ctx.fillStyle = p.joined ? "#fff" : "#666";
      ctx.font = `${fp}px monospace`;
      ctx.fillText(`HP ${Math.max(0, p.hp|0)}`, x + w/2, py + fp * 2.4);
      ctx.fillText(`${(p.score|0).toString().padStart(6,"0")}`, x + w/2, py + fp * 3.6);
      ctx.fillText(`K${p.keys}  P${p.potions}`, x + w/2, py + fp * 4.8);
    }
  }
}
