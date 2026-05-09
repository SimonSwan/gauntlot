// Keyboard + gamepad input split across up to 4 players.

const KEYMAPS = [
  // P1: WASD + G shoot + H magic
  { up:"KeyW",     down:"KeyS",      left:"KeyA",      right:"KeyD",      shoot:"KeyG",        magic:"KeyH" },
  // P2: IJKL + ; shoot + ' magic
  { up:"KeyI",     down:"KeyK",      left:"KeyJ",      right:"KeyL",      shoot:"Semicolon",   magic:"Quote" },
  // P3: Arrows + . shoot + , magic
  { up:"ArrowUp",  down:"ArrowDown", left:"ArrowLeft", right:"ArrowRight",shoot:"Period",      magic:"Comma" },
  // P4: Numpad 8/5/4/6 + Numpad0 shoot + NumpadEnter magic
  { up:"Numpad8",  down:"Numpad5",   left:"Numpad4",   right:"Numpad6",   shoot:"Numpad0",     magic:"NumpadEnter" },
];

export class Input {
  constructor() {
    this.keys = new Set();
    this._just = new Set();
    this._next = new Set();
    this._lastPad = [false, false, false, false];
    this._lastPadStart = [false, false, false, false];

    window.addEventListener("keydown", (e) => {
      if (!this.keys.has(e.code)) this._next.add(e.code);
      this.keys.add(e.code);
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","Tab"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
  }

  beginFrame() {
    this._just = this._next;
    this._next = new Set();
  }

  pressed(code) { return this._just.has(code); }
  down(code)    { return this.keys.has(code); }
  anyPressed()  { return this._just.size > 0 || this._anyPadPressed(); }

  _anyPadPressed() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      const pad = pads && pads[i];
      if (pad && pad.buttons && pad.buttons.some(b => b && b.pressed)) return true;
    }
    return false;
  }

  // Returns input state for player slot 0..3
  getPlayer(i) {
    const m = KEYMAPS[i];
    let dx = 0, dy = 0;
    if (this.keys.has(m.left))  dx -= 1;
    if (this.keys.has(m.right)) dx += 1;
    if (this.keys.has(m.up))    dy -= 1;
    if (this.keys.has(m.down))  dy += 1;
    let shoot = this.keys.has(m.shoot);
    let magic = this._just.has(m.magic);
    let start = this._just.has("Enter") || this._just.has("Space");
    let join  = this._just.has(m.shoot) || this._just.has(m.up) || this._just.has(m.down) || this._just.has(m.left) || this._just.has(m.right);

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && pads[i];
    if (pad) {
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (Math.abs(ax) > 0.3) dx = Math.sign(ax);
      if (Math.abs(ay) > 0.3) dy = Math.sign(ay);
      if (pad.buttons[12]?.pressed) dy = -1;
      if (pad.buttons[13]?.pressed) dy = 1;
      if (pad.buttons[14]?.pressed) dx = -1;
      if (pad.buttons[15]?.pressed) dx = 1;
      const a = pad.buttons[0]?.pressed;
      const b = pad.buttons[1]?.pressed;
      const s = pad.buttons[9]?.pressed;
      if (a) { shoot = true; if (!this._lastPad[i]) join = true; }
      if (b && !this._lastPad[i+10]) magic = true;
      this._lastPad[i+10] = !!b;
      if (s && !this._lastPadStart[i]) start = true;
      this._lastPadStart[i] = !!s;
      this._lastPad[i] = !!a;
    }
    // NOTE: do NOT normalise diagonal input. Arcade Gauntlet moves at full
    // speed on both axes simultaneously when going diagonal — the diagonal is
    // intentionally faster. The player only uses the sign of dx/dy to pick a
    // DIR; the actual world step comes from `type.speed` in `level.trymove`.
    return { dx, dy, shoot, magic, start, join };
  }
}
