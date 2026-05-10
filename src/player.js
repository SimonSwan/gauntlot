// Player: one of four heroes, controlled by a single input slot.
import {
  CELL_PX, FPS, DIR, DIR_VEC, CBOX,
  SLIDE_DIRECTIONS, AUTO_HURT_FRAMES,
} from "./constants.js";
import { Weapon, Fx } from "./entities.js";

export class Player {
  constructor(slot, type) {
    this.id = `p${slot}`;
    this.slot = slot;
    this.type = type;
    this.player = true;
    this.cbox = CBOX.PLAYER;

    this.x = 0; this.y = 0;
    this.dir = DIR.DOWN;
    this.cells = [];

    this.joined = false;
    this.dead = false;
    this.exiting = null;
    this.firing = false;
    this.moveDir = -1;
    this.score = 0;
    this.health = type.health;
    this.lives = 0; // shown in HUD as "Nx"; arcade-style each coin grants 700 health = 1 life
    this.keys = 0;
    this.potions = 0;
    this.reloading = 0;
    this.hurting = 0;
    this.healing = 0;
    this.df = (Math.random() * 100) | 0;

    this.lastWeakAnnounce = 0;
  }

  alive() { return this.joined && !this.dead && !this.exiting; }

  join(level) {
    this.joined = true;
    this.dead = false;
    this.exiting = null;
    this.health = this.type.health;
    this.score = this.score || 0;
    this.keys = 0;
    this.potions = 0;
    const start = level.starts[this.slot] || level.starts[0];
    if (start) {
      this.x = start.x;
      this.y = start.y;
      level.occupy(this, this.x, this.y);
    }
  }

  leave() {
    if (!this.joined) return;
    this.joined = false;
    if (this.cells) for (const c of this.cells) {
      const i = c.occupied.indexOf(this); if (i >= 0) c.occupied.splice(i, 1);
    }
    this.cells = [];
  }

  update(dt, frame, level, input) {
    if (!this.joined || this.dead) return;
    if (this.exiting) {
      if (--this.exiting.count <= 0) {
        // exited; main game flow detects when all live players have exited
        this.exiting.done = true;
      }
      return;
    }

    // auto-drain
    if ((frame % AUTO_HURT_FRAMES) === 0) this._autoHurt();

    if (this.hurting > 0) this.hurting--;
    if (this.healing > 0) this.healing--;
    if (this.reloading > 0) this.reloading--;

    const cmd = input.getPlayer(this.slot);

    // magic potion (nuke)
    if (cmd.magic && this.potions > 0) {
      this.potions--;
      this._nuke(level);
    }

    // facing
    let dir = -1;
    if (cmd.dy < 0 && cmd.dx < 0) dir = DIR.UPLEFT;
    else if (cmd.dy < 0 && cmd.dx > 0) dir = DIR.UPRIGHT;
    else if (cmd.dy > 0 && cmd.dx < 0) dir = DIR.DOWNLEFT;
    else if (cmd.dy > 0 && cmd.dx > 0) dir = DIR.DOWNRIGHT;
    else if (cmd.dy < 0) dir = DIR.UP;
    else if (cmd.dy > 0) dir = DIR.DOWN;
    else if (cmd.dx < 0) dir = DIR.LEFT;
    else if (cmd.dx > 0) dir = DIR.RIGHT;
    this.moveDir = dir;
    if (dir >= 0) this.dir = dir;

    this.firing = !!cmd.shoot;
    if (this.firing) {
      if (this.reloading <= 0) {
        this.reloading = this.type.reload;
        const wt = {
          speed: this.type.weaponSpeed, reload: this.type.reload, damage: this.type.weaponDamage,
          rotate: this.type.weaponRotate, projectile: this.type.key + "Shot",
        };
        const w = new Weapon(this.x, this.y, wt, this.dir, this);
        level.add(w);
        // Per-hero weapon SFX — falls back to firewarrior if unspecified.
        level.game?.sounds.play(this.type.weaponSound || "firewarrior", 0.3);
      }
      return; // can't move while firing in arcade Gauntlet
    }
    if (dir < 0) return;

    // Slide-along-walls movement, exactly as Jake Gordon's PLAYER update:
    //
    //   for each direction in SLIDE_DIRECTIONS[dir]:
    //     trymove(direction)
    //       - if it succeeded (no collision): we moved, return
    //       - else publish PLAYER_COLLIDE for the collider, and CONTINUE the
    //         slide loop with the next direction
    //
    // We inline the collide handler here so the player either picks up the
    // treasure, opens the door, exits the level, or whacks the monster.
    const dirs = SLIDE_DIRECTIONS[dir];
    for (const d of dirs) {
      const collision = level.trymove(this, d, this.type.speed);
      if (!collision) return;             // moved, done
      if (collision === true) continue;   // wall, try the next slide direction

      // entity collision — publish-style handler matching Jake's onPlayerCollide:
      //   monsters / generators take damage from the player
      //   treasures get collected
      //   doors open if we hold a key
      //   exits trigger the exit sequence
      // The player only takes damage from monsters via Monster.update, NOT here,
      // so colliding with a monster doesn't double-tap the player.
      if (collision.monster || collision.generator) {
        collision.hurt(this.type.damage, this);
      } else if (collision.treasure) {
        collision.collect(this);
      } else if (collision.door) {
        if (this.keys > 0 && collision.open()) this.keys--;
      } else if (collision.exit) {
        this._exitTo(collision);
      }
      // try the remaining slide directions even after an entity collision —
      // this is what makes the player "stutter past" a treasure on the wall.
    }
  }

  _exitTo(exit) {
    if (this.exiting) return;
    if (this.health < this.type.health) this.health = Math.min(this.type.health, this.health + 100);
    this.exiting = { count: FPS, done: false };
    this.level?.game?.sounds.play("exitlevel", 0.7);
  }

  _nuke(level) {
    // Damages all monsters within `magic` tiles
    const limit = CELL_PX * this.type.magic;
    for (const e of level.entities) {
      if (!e.monster || e.dead) continue;
      const dx = Math.abs(e.x - this.x), dy = Math.abs(e.y - this.y);
      const distance = Math.max(dx, dy);
      if (distance < limit) {
        const damage = this.type.magic * (1 - distance / limit);
        e.hurt(damage, this, true);
      }
    }
    level.add(new Fx(this.x, this.y, "explosion"));
    level.game?.sounds.play("collectpotion", 0.5);
  }

  heal(amount) { this.health = Math.min(this.type.health * 2, this.health + amount); this.healing = FPS / 2; }

  hurt(damage, by, automatic = false) {
    if (this.dead || this.exiting) return;
    const dmg = automatic ? damage : Math.max(1, damage / this.type.armor);
    this.health = Math.max(0, this.health - dmg);
    if (!automatic) {
      this.hurting = FPS / 2;
      const k = this.type.voice === "female" ? "femalepain" : "malepain";
      this.level?.game?.sounds.play(`${k}${1 + (Math.random()*2|0)}`, 0.5);
    }
    if (this.health === 0) this._die();
    else if (this.health < 200) {
      const t = performance.now();
      if (t - this.lastWeakAnnounce > 8000) {
        this.lastWeakAnnounce = t;
        // The iconic Gauntlet weak-health voice cue.
        this.level?.game?.sounds.say(`${this.type.key} needs food, badly!`, { cooldown: 8000 });
      }
    }
  }

  _autoHurt() {
    if (this.dead || this.exiting) return;
    this.health = Math.max(0, this.health - 1);
    if (this.health === 0) this._die();
  }

  _die() {
    this.dead = true;
    // Release cell occupancy so monsters don't pile up on the corpse tile.
    this.level?._removeFromCells(this);
    this.level?.game?.sounds.play("gameover", 0.5);
    this.level?.game?.sounds.say(`${this.type.key} has died!`, { cooldown: 4000 });
  }
}

Player.prototype.level = null; // set by Game.start
