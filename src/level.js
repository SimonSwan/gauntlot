// Level / Map: loads a PNG-encoded level into a tile grid + entity list.
// Pixel encoding (RGB, javascript-gauntlet compatible):
//   0x000000  nothing (open floor outside playable area / void)
//   0x404000  wall
//   0xC0C000  door
//   0x00F000  player start
//   0x004000  exit
//   0xF00000  generator (sub-type in low nybbles selects monster)
//   0x400000  monster   (sub-type selects monster)
//   0x008000  treasure  (sub-type selects treasure)
import {
  TILE, PIXEL, MONSTER_LIST, TREASURE_LIST, MONSTER_TYPES, TREASURE_TYPES, DOOR, DIR_VEC,
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
    this.w = this.tw * TILE;
    this.h = this.th * TILE;
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
    const isDoor  = (p) => isType(p, PIXEL.DOOR);

    for (let ty = 0; ty < this.th; ty++) {
      for (let tx = 0; tx < this.tw; tx++) {
        const p = this.pixel(tx, ty);
        const idx = tx + ty * this.tw;
        const cell = { occupied: [] };
        this.cells[idx] = cell;

        if (isType(p, PIXEL.START)) {
          this.starts.push({ x: tx*TILE, y: ty*TILE });
        }
        if (isWall(p)) {
          // bitmask: 1=N,2=E,4=S,8=W neighbour walls
          let mask = 0;
          if (isWall(this.pixel(tx, ty-1))) mask |= 1;
          if (isWall(this.pixel(tx+1, ty))) mask |= 2;
          if (isWall(this.pixel(tx, ty+1))) mask |= 4;
          if (isWall(this.pixel(tx-1, ty))) mask |= 8;
          cell.wall = true;
          cell.wallMask = mask;
        } else if (p === PIXEL.NOTHING) {
          cell.nothing = true;
        }

        if (isType(p, PIXEL.EXIT)) {
          const e = new Exit(tx*TILE, ty*TILE);
          this.add(e);
        } else if (isDoor(p)) {
          // pick orientation: wall above means vertical door (N/S of walls), else horizontal
          const above = this.pixel(tx, ty-1);
          const horiz = !(isWall(above) || isDoor(above));
          const d = new Door(tx*TILE, ty*TILE, horiz ? DOOR.HORIZONTAL : DOOR.VERTICAL);
          this.add(d);
        } else if (isType(p, PIXEL.GENERATOR)) {
          const t = subTypeHigh(p);
          const mt = MONSTER_TYPES[MONSTER_LIST[t < MONSTER_LIST.length ? t : 0]];
          this.add(new Generator(tx*TILE, ty*TILE, mt));
        } else if (isType(p, PIXEL.MONSTER)) {
          const t = subTypeHigh(p);
          const mt = MONSTER_TYPES[MONSTER_LIST[t < MONSTER_LIST.length ? t : 0]];
          this.add(new Monster(tx*TILE, ty*TILE, mt));
        } else if (isType(p, PIXEL.TREASURE)) {
          const t = subTypeHigh(p);
          const tt = TREASURE_TYPES[TREASURE_LIST[t < TREASURE_LIST.length ? t : 0]];
          this.add(new Treasure(tx*TILE, ty*TILE, tt));
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
    if (entity.cells) for (const c of entity.cells) {
      const i = c.occupied.indexOf(entity); if (i >= 0) c.occupied.splice(i, 1);
    }
    entity.cells = [];
  }

  cell(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.tw || ty >= this.th) return null;
    return this.cells[tx + ty * this.tw];
  }

  // Recompute the cells an entity occupies and update memberships.
  occupy(entity, x, y) {
    entity.x = x; entity.y = y;
    if (entity.temporal) return;
    const cellsBefore = entity.cells || [];
    const cellsAfter = this.overlappingCells(x, y, TILE, TILE);
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
    const xn = ((x0 % TILE) + w) > TILE ? 1 : 0;
    const yn = ((y0 % TILE) + h) > TILE ? 1 : 0;
    const a = this.cell(x0, y0); if (a) cells.push(a);
    if (xn) { const b = this.cell(x0 + TILE, y0); if (b && !cells.includes(b)) cells.push(b); }
    if (yn) { const b = this.cell(x0, y0 + TILE); if (b && !cells.includes(b)) cells.push(b); }
    if (xn && yn) { const b = this.cell(x0 + TILE, y0 + TILE); if (b && !cells.includes(b)) cells.push(b); }
    return cells;
  }

  // Returns true if (x,y,w,h) collides with a wall or any entity (other than `ignore`).
  // Returns the colliding entity, the literal `true` for walls, or false for none.
  occupied(x, y, w, h, ignore) {
    const cells = this.overlappingCells(x, y, w, h);
    const checked = new Set();
    for (const cell of cells) {
      if (cell.wall) return true;
      for (const item of cell.occupied) {
        if (item === ignore || checked.has(item)) continue;
        checked.add(item);
        const ix = item.x + (item.cbox?.x ?? 0);
        const iy = item.y + (item.cbox?.y ?? 0);
        const iw = item.cbox?.w ?? TILE;
        const ih = item.cbox?.h ?? TILE;
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
    const cb = entity.cbox || { x: 0, y: 0, w: TILE, h: TILE };
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
    // sweep dead
    for (let i = this.entities.length - 1; i >= 0; i--) if (this.entities[i].dead) this.entities.splice(i, 1);
  }
}

function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
