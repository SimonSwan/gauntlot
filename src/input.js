/**
 * src/input.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Input handler for Gauntlet (1985) recreation.
 * Supports keyboard (4 players) and gamepad (up to 4 controllers).
 *
 * KEYBOARD MAPPING (matches controls in README):
 *   P1: W/A/S/D + G (shoot) + H (magic)
 *   P2: I/J/K/L + ; (shoot) + ' (magic)
 *   P3: Arrow keys + . (shoot) + , (magic)
 *   P4: Numpad 8/4/2/6 + 0 (shoot) + Enter (magic)
 *
 * GAMEPAD MAPPING (standard gamepad layout):
 *   D-pad or left stick → movement
 *   Button 0 (A/Cross) → shoot
 *   Button 1 (B/Circle) → magic
 *
 * USAGE:
 *   Input.init()                 // Call once on startup
 *   Input.getState(playerIndex)  // Returns current input state for player 0-3
 *   Input.update()               // Call once per frame (reads gamepad API)
 *   Input.onAnyKey(fn)           // Register callback for any keypress (menus)
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Keyboard layout per player ────────────────────────────────────────────────
// Using KeyboardEvent.code (layout-independent) not .key (layout-dependent).
const KB_MAPS = [
  // Player 1: WASD + G/H
  { up: 'KeyW',     down: 'KeyS',    left: 'KeyA',    right: 'KeyD',
    shoot: 'KeyG',  magic: 'KeyH',   confirm: 'Enter' },
  // Player 2: IJKL + ;/'
  { up: 'KeyI',     down: 'KeyK',    left: 'KeyJ',    right: 'KeyL',
    shoot: 'Semicolon', magic: 'Quote', confirm: 'Enter' },
  // Player 3: Arrow keys + ./,
  { up: 'ArrowUp',  down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    shoot: 'Period', magic: 'Comma',   confirm: 'Enter' },
  // Player 4: Numpad
  { up: 'Numpad8',  down: 'Numpad2', left: 'Numpad4', right: 'Numpad6',
    shoot: 'Numpad0', magic: 'NumpadEnter', confirm: 'NumpadEnter' },
];

// ── Input state object ─────────────────────────────────────────────────────────
// getState() returns one of these per player per frame.
function makeState() {
  return {
    up:      false,
    down:    false,
    left:    false,
    right:   false,
    shoot:   false,
    magic:   false,
    confirm: false,
    // Derived direction (-1, 0, or 1 for each axis)
    dx: 0, dy: 0,
  };
}

export const Input = {
  /** @type {Set<string>} Currently held keys */
  _held: new Set(),

  /** @type {Set<string>} Keys pressed this frame (cleared after getState) */
  _pressed: new Set(),

  /** @type {Array<function>} Menu keypress callbacks */
  _callbacks: [],

  /** @type {Array<Gamepad|null>} Gamepad states from last update */
  _gamepads: [null, null, null, null],

  /**
   * Initialise — call once on startup.
   * Attaches keyboard event listeners to window.
   */
  init() {
    window.addEventListener('keydown', (e) => {
      if (!this._held.has(e.code)) {
        this._pressed.add(e.code);
        this._callbacks.forEach(fn => fn(e.code));
      }
      this._held.add(e.code);

      // Prevent arrow keys and space from scrolling the page
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this._held.delete(e.code);
    });

    // Gamepad connect/disconnect
    window.addEventListener('gamepadconnected', (e) => {
      console.log(`[Input] Gamepad ${e.gamepad.index} connected: ${e.gamepad.id}`);
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      console.log(`[Input] Gamepad ${e.gamepad.index} disconnected`);
      this._gamepads[e.gamepad.index] = null;
    });
  },

  /**
   * Update gamepad state — call ONCE PER FRAME before getState().
   * The Gamepad API requires polling (no events for axis/button changes).
   */
  update() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      this._gamepads[i] = pads[i] || null;
    }
  },

  /**
   * Get the combined keyboard + gamepad state for one player.
   * @param {number} playerIndex  0–3
   * @returns {{ up, down, left, right, shoot, magic, confirm, dx, dy }}
   */
  getState(playerIndex) {
    const state = makeState();
    const km    = KB_MAPS[playerIndex];
    const pad   = this._gamepads[playerIndex];

    // ── Keyboard ─────────────────────────────────────────────────────────────
    if (km) {
      state.up      = this._held.has(km.up);
      state.down    = this._held.has(km.down);
      state.left    = this._held.has(km.left);
      state.right   = this._held.has(km.right);
      state.shoot   = this._held.has(km.shoot);
      state.magic   = this._pressed.has(km.magic);  // Magic is a one-shot press
      state.confirm = this._pressed.has(km.confirm);
    }

    // ── Gamepad ───────────────────────────────────────────────────────────────
    if (pad) {
      const DEAD = 0.3; // Analog stick dead zone
      const ax   = pad.axes[0] || 0; // Left stick X
      const ay   = pad.axes[1] || 0; // Left stick Y

      // D-pad (buttons 12-15 in standard mapping)
      const dUp    = pad.buttons[12]?.pressed || ay < -DEAD;
      const dDown  = pad.buttons[13]?.pressed || ay >  DEAD;
      const dLeft  = pad.buttons[14]?.pressed || ax < -DEAD;
      const dRight = pad.buttons[15]?.pressed || ax >  DEAD;

      state.up    = state.up    || dUp;
      state.down  = state.down  || dDown;
      state.left  = state.left  || dLeft;
      state.right = state.right || dRight;
      state.shoot   = state.shoot   || pad.buttons[0]?.pressed; // A/Cross
      state.magic   = state.magic   || pad.buttons[1]?.pressed; // B/Circle
      state.confirm = state.confirm || pad.buttons[0]?.pressed;
    }

    // ── Compute direction vector ──────────────────────────────────────────────
    state.dx = (state.right ? 1 : 0) - (state.left ? 1 : 0);
    state.dy = (state.down  ? 1 : 0) - (state.up   ? 1 : 0);

    return state;
  },

  /**
   * True if ANY player pressed any key/button this frame (for menu screens).
   */
  anyPressed() {
    return this._pressed.size > 0 ||
           this._gamepads.some(p => p && p.buttons.some(b => b.pressed));
  },

  /**
   * Register a callback invoked on any keydown (used by menus).
   * @param {function(code: string): void} fn
   */
  onAnyKey(fn) {
    this._callbacks.push(fn);
  },

  /**
   * Remove a previously registered callback.
   */
  offAnyKey(fn) {
    this._callbacks = this._callbacks.filter(f => f !== fn);
  },

  /**
   * Clear the one-frame pressed set.
   * MUST be called at the END of each frame after all getState() calls.
   */
  clearFrame() {
    this._pressed.clear();
  },
};
