// Level / Map: loads a PNG-encoded level into a tile grid + entity list.
//
// Pixel encoding (RGB). Type matching uses (pixel & 0xFFFF00) so the low byte
// carries sub-type info: monster id, gate orientation bit, power-up variant,
// or exit-warp destination.
//
//   0x000000  nothing / floor (out of bounds void in legacy levels)
//   0x404000  wall              (ROM-decoded files may store 0x404040)
//   0xC0C000  gate horizontal   ($03)
//   0xC0C040  gate vertical     ($04)  — same type signature, low byte = 0x40
//   0x00F000  player start      ($05)
//   0x004000  exit              ($06)
//   0x004010  exit-to-4 warp    ($07)
//   0x004020  exit-to-8 warp    ($08)
//   0xF000nn  generator         (low byte = MON.* monster id)
//   0x4000nn  monster           (low byte = MON.* monster id)
//   0x0080nn  treasure / pickup (low byte = TREASURE_LIST index)
//   0x00D000  invisibility potion ($2D)
//   0x00E0nn  power-up          (low byte = which power-up, $2F-$34)
import {
  CELL_PX, PIXEL, MONSTER_LIST, TREASURE_LIST, MONSTER_TYPES, TREASURE_TYPES, DOOR, DIR_VEC,
} from "./constants.js";
import {
  Monster, Generator, Treasure, Door, Exit, Weapon, Fx
} from "./entities.js";

function maskType(p)   { return p & PIXEL.MASK_TYPE; }
function subTypeHigh(p){ return (p & PIXEL.MASK_EXHIGH) >> 4; }
function isType(p, t)  { return (p & PIXEL.MASK_TYPE) === t; }

export class Level {
  constructor(game, src, meta) {
    this.game = game;
    this.src = src;            // {name, w, h, pixels}
    this.meta = meta || { name: src.name, music: null, score: 1000, theme: null, last: false };
    this.tw = src.w;
    this.th = src.h;
    this.w = this.tw * CELL_PX;
    this.h = this.th * CELL_PX;
    this.cells = new Array(this.tw * this.th);
    this.entities = [];
    this.starts = [];
    this.build();
  }

  pixel(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.tw || ty >= this.th) return 0;
    return this.src.pixels[tx + ty * this.tw];
  }

  build() {
    const isWall  = (p) => isType(p, PIXEL.WALL);
    const isDoor  = (p) => isType(p, PIXEL.GATE_H); // matches GATE_H and GATE_V
    const isInvisPot = (p) => isType(p, PIXEL.INVIS);
    const isPowerUp  = (p) => isType(p, PIXEL.POWERUP);

    for (let ty = 0; ty < this.th; ty++) {
      for (let tx = 0; tx < this.tw; tx++) {
        const p = this.pixel(tx, ty);
        const idx = tx + ty * this.tw;
        const cell = { occupied: [] };
        this.cells[idx] = cell;

        if (isType(p, PIXEL.START)) {
          this.starts.push({ x: tx*CELL_PX, y: ty*CELL_PX });
        }
        if (isWall(p)) {
          // Neighbor mask used to pick the right wall sprite from the atlas:
          //   1 = N, 2 = E, 4 = S, 8 = W. Same encoding as Jake Gordon's
          //   javascript-gauntlet so his backgrounds.png atlas slots match.
          let mask = 0;
          if (isWall(this.pixel(tx, ty-1))) mask |= 1;
          if (isWall(this.pixel(tx+1, ty))) mask |= 2;
          if (isWall(this.pixel(tx, ty+1))) mask |= 4;
          if (isWall(this.pixel(tx-1, ty))) mask |= 8;
          cell.wall = true;
          cell.wallMask = mask;
        } else if (p === PIXEL.NOTHING) {
          cell.nothing = true;
        } else {
          // Floor cell — also compute a 3-bit shadow mask describing which
          // adjacent cells to the left / below-left / below are walls. Jake's
          // atlas reserves row 7 cols 1..7 for these shadow overlays.
          let smask = 0;
          if (isWall(this.pixel(tx-1, ty)))   smask |= 1;
          if (isWall(this.pixel(tx-1, ty+1))) smask |= 2;
          if (isWall(this.pixel(tx, ty+1)))   smask |= 4;
          if (smask) cell.shadow = smask;
        }

        if (isType(p, PIXEL.EXIT)) {
          const e = new Exit(tx*CELL_PX, ty*CELL_PX);
          this.add(e);
        } else if (isDoor(p)) {
          // Orientation: bit 6 of the low byte is the explicit ROM-decoded
          // orientation flag (PIXEL.GATE_V_FLAG). Fall back to "wall above
          // means vertical door" for legacy js-gauntlet PNGs that don't set
          // the flag.
          let horiz;
          if ((p & PIXEL.GATE_V_FLAG) === PIXEL.GATE_V_FLAG) {
            horiz = false;
          } else {
            const above = this.pixel(tx, ty-1);
            horiz = !(isWall(above) || isDoor(above));
          }
          const d = new Door(tx*CELL_PX, ty*CELL_PX, horiz ? DOOR.HORIZONTAL : DOOR.VERTICAL);
          this.add(d);
        } else if (isType(p, PIXEL.GENERATOR)) {
          const t = subTypeHigh(p);
          const mt = MONSTER_TYPES[MONSTER_LIST[t < MONSTER_LIST.length ? t : 0]];
          this.add(new Generator(tx*CELL_PX, ty*CELL_PX, mt));
        } else if (isType(p, PIXEL.MONSTER)) {
          const t = subTypeHigh(p);
          const mt = MONSTER_TYPES[MONSTER_LIST[t < MONSTER_LIST.length ? t : 0]];
          this.add(new Monster(tx*CELL_PX, ty*CELL_PX, mt));
        } else if (isType(p, PIXEL.TREASURE)) {
          const t = subTypeHigh(p);
          const tt = TREASURE_TYPES[TREASURE_LIST[t < TREASURE_LIST.length ? t : 0]];
          this.add(new Treasure(tx*CELL_PX, ty*CELL_PX, tt));
        } else if (isInvisPot(p)) {
          // Invisibility potion ($2D) — treat as a magic potion variant for
          // now (same gameplay slot as POTION until invisibility is wired up).
          this.add(new Treasure(tx*CELL_PX, ty*CELL_PX, TREASURE_TYPES.POTION));
        } else if (isPowerUp(p)) {
          // Power-ups ($2F-$34) — placeholder behaviour: treat as gold for
          // score until per-variant effects are implemented.
          this.add(new Treasure(tx*CELL_PX, ty*CELL_PX, TREASURE_TYPES.GOLD));
        }
      }
    }
  }

  add(entity) {
    entity.level = this;
    this.entities.push(entity);
    this.occupy(entity, entity.x, entity.y);
    return entity;
  }
  remove(entity) {
    entity.dead = true;
    this._removeFromCells(entity);
  }
  _removeFromCells(entity) {
    if (entity.cells) {
      for (const c of entity.cells) {
        const i = c.occupied.indexOf(entity);
        if (i >= 0) c.occupied.splice(i, 1);
      }
    }
    entity.cells = [];
  }

  cell(x, y) {
    const tx = Math.floor(x / CELL_PX), ty = Math.floor(y / CELL_PX);
    if (tx < 0 || ty < 0 || tx >= this.tw || ty >= this.th) return null;
    return this.cells[tx + ty * this.tw];
  }

  // Recompute the cells an entity occupies and update memberships.
  occupy(entity, x, y) {
    entity.x = x; entity.y = y;
    if (entity.temporal) return;
    const cellsBefore = entity.cells || [];
    const cellsAfter = this.overlappingCells(x, y, CELL_PX, CELL_PX);
    entity.cells = cellsAfter;
    for (const c of cellsBefore) if (!cellsAfter.includes(c)) {
      const i = c.occupied.indexOf(entity); if (i >= 0) c.occupied.splice(i, 1);
    }
    for (const c of cellsAfter) if (!cellsBefore.includes(c)) {
      c.occupied.push(entity);
    }
  }

  overlappingCells(x, y, w, h) {
    const cells = [];
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const xn = ((x0 % CELL_PX) + w) > CELL_PX ? 1 : 0;
    const yn = ((y0 % CELL_PX) + h) > CELL_PX ? 1 : 0;
    const a = this.cell(x0, y0); if (a) cells.push(a);
    if (xn) { const b = this.cell(x0 + CELL_PX, y0); if (b && !cells.includes(b)) cells.push(b); }
    if (yn) { const b = this.cell(x0, y0 + CELL_PX); if (b && !cells.includes(b)) cells.push(b); }
    if (xn && yn) { const b = this.cell(x0 + CELL_PX, y0 + CELL_PX); if (b && !cells.includes(b)) cells.push(b); }
    return cells;
  }

  // Returns true if (x,y,w,h) collides with a wall or any entity (other than `ignore`).
  // Returns the colliding entity, the literal `true` for walls, or false for none.
  occupied(x, y, w, h, ignore) {
    const cells = this.overlappingCells(x, y, w, h);
    const checked = new Set();
    const ignoreIsPlayer = !!ignore?.player;
    const ignoreIsWeapon = !!ignore?.weapon;
    for (const cell of cells) {
      if (cell.wall) return true;
      for (const item of cell.occupied) {
        if (item === ignore || item.dead || checked.has(item)) continue;
        // Players pass through other players (arcade-faithful 4-player behaviour).
        if (ignoreIsPlayer && item.player) continue;
        // FX never block anyone.
        if (item.fx) continue;
        // Weapons never block — they handle their own collision in Weapon.update.
        if (item.weapon) continue;
        checked.add(item);
        const ix = item.x + (item.cbox?.x ?? 0);
        const iy = item.y + (item.cbox?.y ?? 0);
        const iw = item.cbox?.w ?? CELL_PX;
        const ih = item.cbox?.h ?? CELL_PX;
        if (overlap(x, y, w, h, ix, iy, iw, ih)) return item;
      }
    }
    return false;
  }

  // Try to move entity by `speed` along `dir`. Returns colliding obj or false.
  trymove(entity, dir, speed, ignore = null, dryrun = false) {
    const dv = DIR_VEC[dir];
    const nx = entity.x + dv[0] * speed;
    const ny = entity.y + dv[1] * speed;
    const cb = entity.cbox || { x: 0, y: 0, w: CELL_PX, h: CELL_PX };
    const collision = this.occupied(nx + cb.x, ny + cb.y, cb.w, cb.h, ignore || entity);
    if (!collision && !dryrun) this.occupy(entity, nx, ny);
    if (!collision) { this._lastTry = { x: nx, y: ny }; }
    return collision;
  }

  canmove(entity, dir, speed, ignore = null) {
    const r = this.trymove(entity, dir, speed, ignore, true);
    if (r === false) return this._lastTry;
    return false;
  }

  update(dt, frame, players, viewport) {
    for (const e of this.entities) {
      if (!e.dead && e.update) e.update(dt, frame, players, this, viewport);
    }
    // Sweep dead entities. CRUCIAL: also unlink them from cell.occupied — a
    // dead monster that still occupies its cell creates "ghost walls" that
    // block player movement and bullets.
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (e.dead) {
        this._removeFromCells(e);
        this.entities.splice(i, 1);
      }
    }
  }
}

function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
