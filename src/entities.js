// All non-player entities: Monster, Generator, Treasure, Door, Exit, Weapon, Fx.
import {
  TILE, FPS, DIR, DIR_VEC, CBOX,
  PREFERRED_DIRECTIONS, isVertical, isHorizontal, isDiagonal,
} from "./constants.js";

let _id = 0;
const nextId = () => ++_id;

class Entity {
  constructor() {
    this.id = nextId();
    this.x = 0; this.y = 0;
    this.dead = false;
    this.cells = [];
    this.dir = DIR.DOWN;
    this.cbox = CBOX.FULL;
    this.frame = 0;
  }
}

export class Monster extends Entity {
  constructor(x, y, type, generator = null) {
    super();
    this.x = x; this.y = y;
    this.monster = true;
    this.type = type;
    this.generator = generator;
    this.cbox = CBOX.MONSTER;
    this.dir = (Math.random() * 8) | 0;
    this.health = type.health;
    this.thinking = 0;
    this.travelling = 0;
    this.reloading = 0;
    this.df = (Math.random() * 100) | 0;
  }

  update(dt, frame, players, level, viewport) {
    // skip if no players and we are far from screen
    if (viewport && viewport.outside(this.x - viewport.w, this.y - viewport.h, 2*viewport.w, 2*viewport.h)) return;
    if (this.reloading > 0) this.reloading--;
    if (this.thinking > 0) { this.thinking--; return; }

    const target = nearestPlayer(this, players);
    if (!target) return;

    const away = !target.alive();
    const speed = away ? 1 : this.type.speed;

    if (this.travelling > 0) {
      this.travelling--;
      this.step(level, target, this.dir, speed, this.travelling, !away);
      return;
    }

    const dirs = PREFERRED_DIRECTIONS[directionTo(this, target, away)];
    for (let n = 0; n < dirs.length; n++) {
      if (this.step(level, target, dirs[n], speed, n < 2 ? 0 : this.type.travelling * (n - 2), !away)) return;
    }
  }

  step(level, target, dir, speed, travelling, allowFire) {
    const collision = level.trymove(this, dir, speed);
    if (!collision) {
      this.dir = dir;
      if (allowFire && this.type.weapon && this.fire(level, target)) {
        this.thinking = this.type.thinking;
        this.travelling = 0;
      } else {
        this.thinking = 0;
        this.travelling = travelling;
      }
      return true;
    } else if (collision.player) {
      // collide with a player: damage the player, take self-harm if applicable
      collision.hurt(this.type.damage, this);
      if (this.type.steals && collision.keys + collision.potions > 0) {
        if (collision.keys > 0) collision.keys--;
        else collision.potions--;
        this.stole = true;
        this.dead = true; // thief escapes
        if (level.game) level.game.events.emit("thiefSteal", this, collision);
      }
      if (this.type.selfharm) this.health = Math.max(0, this.health - this.type.selfharm);
      return true;
    }
    if (speed > 1) return this.step(level, target, dir, 1, travelling, allowFire);
    this.thinking = this.type.thinking;
    this.travelling = 0;
    return false;
  }

  fire(level, target) {
    if (!this.type.weapon || this.reloading > 0) return false;
    const dx = Math.abs(Math.floor(this.x / TILE) - Math.floor(target.x / TILE));
    const dy = Math.abs(Math.floor(this.y / TILE) - Math.floor(target.y / TILE));
    const dd = Math.abs(dx - dy);
    if (((dx < 2) && isVertical(this.dir)) ||
        ((dy < 2) && isHorizontal(this.dir)) ||
        ((dd < 2) && isDiagonal(this.dir))) {
      this.reloading = this.type.weapon.reload;
      const w = new Weapon(this.x, this.y, this.type.weapon, this.dir, this);
      w.monster = true;
      level.add(w);
      level.game?.sounds.play("monsterdeath2", 0.15); // fireball whoosh placeholder
      return true;
    }
    return false;
  }

  hurt(damage, by, nuke = false) {
    if (nuke || (by?.weapon && this.type.canBeShot) || (by?.player && this.type.canBeHit) || by === this) {
      this.health = Math.max(0, this.health - damage);
      if (this.health === 0) this.die(by?.player ? by : (by?.weapon && by.owner?.player ? by.owner : null), nuke);
    }
  }

  die(by, nuke) {
    if (this.generator) this.generator.count = Math.max(0, this.generator.count - 1);
    this.dead = true;
    if (by) by.score += this.type.score;
    const lvl = this.level;
    lvl.add(new Fx(this.x, this.y, "monsterDeath", nuke ? FPS/2 : FPS/6));
    lvl.game?.sounds.play(`monsterdeath${1 + (Math.random()*3|0)}`, 0.25);
  }
}

export class Generator extends Entity {
  constructor(x, y, monsterType) {
    super();
    this.x = x; this.y = y;
    this.generator = true;
    this.mtype = monsterType;
    this.type = monsterType.generator || { health: 8, rate: 3*FPS, max: 20, score: 100 };
    this.health = this.type.health;
    this.maxHealth = this.type.health;
    this.pending = 0;
    this.count = 0;
    this.cbox = CBOX.FULL;
  }

  update(dt, frame, players, level) {
    if (this.count >= this.type.max) return;
    if (--this.pending > 0) return;
    const d = (Math.random() * 8) | 0;
    const pos = level.canmove(this, d, TILE);
    if (pos) {
      const m = new Monster(pos.x, pos.y, this.mtype, this);
      level.add(m);
      this.count++;
      this.pending = 1 + ((Math.random() * this.type.rate) | 0);
    } else {
      this.pending = FPS/4;
    }
  }

  hurt(damage, by) {
    this.health = Math.max(0, this.health - damage);
    if (this.health === 0) {
      this.dead = true;
      if (by?.player) by.score += this.type.score;
      else if (by?.weapon && by.owner?.player) by.owner.score += this.type.score;
      this.level.add(new Fx(this.x, this.y, "explosion", 0));
      this.level.game?.sounds.play("generatordeath", 0.4);
    }
  }
}

export class Treasure extends Entity {
  constructor(x, y, type) {
    super();
    this.x = x; this.y = y;
    this.treasure = true;
    this.type = type;
    this.cbox = CBOX.FULL;
  }
  collect(player) {
    if (this.dead) return;
    this.dead = true;
    player.score += this.type.score;
    if (this.type.take === "key") player.keys = Math.min(player.keys + 1, 9);
    else if (this.type.take === "potion") player.potions = Math.min(player.potions + 1, 9);
    if (this.type.health) player.heal(this.type.health);
    if (this.type.damage) player.hurt(this.type.damage, this, true);
    this.level.game?.sounds.play(this.type.sound, 0.5);
  }
}

export class Door extends Entity {
  constructor(x, y, type) {
    super();
    this.x = x; this.y = y;
    this.door = true;
    this.type = type;
    this.cbox = CBOX.FULL;
    this.opening = 0;
  }
  open(speed = 0) {
    if (this.opening) return false;
    this.opening = (speed | 0) + this.type.openSpeed;
    this.level.game?.sounds.play("opendoor", 0.3);
    // chain to neighbouring doors
    for (const [dx, dy] of [[-TILE,0],[TILE,0],[0,-TILE],[0,TILE]]) {
      const c = this.level.cell(this.x + dx, this.y + dy);
      if (!c) continue;
      const next = c.occupied.find(e => e.door && !e.opening);
      if (next) next.opening = (this.opening | 0);
    }
    return true;
  }
  update() {
    if (this.opening > 0 && --this.opening === 0) this.dead = true;
  }
}

export class Exit extends Entity {
  constructor(x, y) {
    super();
    this.x = x; this.y = y;
    this.exit = true;
    this.cbox = CBOX.FULL;
  }
}

export class Weapon extends Entity {
  constructor(x, y, type, dir, owner) {
    super();
    this.x = x; this.y = y;
    this.weapon = true;
    this.temporal = true;
    this.type = type;
    this.dir = dir;
    this.owner = owner;
    this.cbox = CBOX.WEAPON;
    this.life = FPS * 2;
  }
  update(dt, frame, players, level) {
    if (--this.life <= 0) { this.dead = true; return; }
    const dv = DIR_VEC[this.dir];
    const speed = this.type.speed;
    // Subdivide movement into 4-pixel steps so fast shots don't tunnel through
    // narrow walls between frames.
    const steps = Math.max(1, Math.ceil(speed / 4));
    const stepX = (dv[0] * speed) / steps;
    const stepY = (dv[1] * speed) / steps;
    for (let s = 0; s < steps; s++) {
      const nx = this.x + stepX, ny = this.y + stepY;
      // Pass through anything that should never stop a shot: doors, exits,
      // treasures, the projectile owner, other player projectiles fired by
      // the same side, players themselves when fired by another player.
      const collision = level.occupied(nx + this.cbox.x, ny + this.cbox.y, this.cbox.w, this.cbox.h, this.owner);
      this.x = nx; this.y = ny;
      if (!collision) continue;
      if (collision === true) { // wall
        this.dead = true;
        level.add(new Fx(nx, ny, "explosion"));
        return;
      }
      // pass-throughs: doors, exits, treasures
      if (collision.door || collision.exit || collision.treasure) continue;
      // pass-through: another shot from same side
      if (collision.weapon) {
        if ((this.owner.player && collision.owner?.player) ||
            (this.owner.monster && collision.owner?.monster)) continue;
        collision.dead = true;
        this.dead = true;
        level.add(new Fx(nx, ny, "explosion"));
        return;
      }
      // pass-through: same-side player friendly fire
      if (collision.player && this.owner.player) continue;
      // pass-through: monster shooting another monster (no friendly fire)
      if (collision.monster && this.owner.monster) continue;

      // Damage time
      if (this.owner.player && (collision.monster || collision.generator)) {
        collision.hurt(this.type.damage, this);
      } else if (this.owner.monster && collision.player) {
        collision.hurt(this.type.damage, this);
      } else {
        // Unrecognized entity — pass through harmlessly rather than create
        // an "invisible wall" that vanishes the shot for no reason.
        continue;
      }
      this.dead = true;
      level.add(new Fx(nx, ny, "explosion"));
      return;
    }
  }
}

export class Fx extends Entity {
  constructor(x, y, kind, delay = 0) {
    super();
    this.x = x; this.y = y;
    this.fx = true; this.temporal = true;
    this.kind = kind;
    this.delay = delay;
    this.start = -1;
    this.frame = 0;
    this.frames = kind === "explosion" ? 6 : 6;
    this.fpf = FPS / 12;
    this.cbox = CBOX.FULL;
  }
  update(dt, frame, players, level) {
    if (this.delay > 0) { this.delay--; return; }
    if (this.start < 0) this.start = frame;
    this.frame = Math.floor((frame - this.start) / this.fpf);
    if (this.frame >= this.frames) this.dead = true;
  }
}

// helpers
function nearestPlayer(self, players) {
  let best = null, bd = Infinity;
  for (const p of players) {
    if (!p || !p.joined) continue;
    const dx = p.x - self.x, dy = p.y - self.y;
    const d = dx*dx + dy*dy;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function directionTo(self, target, away) {
  const speed = self.type?.speed || 1;
  const up    = target.y < self.y - speed;
  const down  = target.y > self.y + speed;
  const left  = target.x < self.x - speed;
  const right = target.x > self.x + speed;
  if (up && left)    return away ? DIR.DOWNRIGHT : DIR.UPLEFT;
  if (up && right)   return away ? DIR.DOWNLEFT  : DIR.UPRIGHT;
  if (down && left)  return away ? DIR.UPRIGHT   : DIR.DOWNLEFT;
  if (down && right) return away ? DIR.UPLEFT    : DIR.DOWNRIGHT;
  if (up)    return away ? DIR.DOWN  : DIR.UP;
  if (down)  return away ? DIR.UP    : DIR.DOWN;
  if (left)  return away ? DIR.RIGHT : DIR.LEFT;
  if (right) return away ? DIR.LEFT  : DIR.RIGHT;
  return self.dir;
}
