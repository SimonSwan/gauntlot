/**
 * src/sounds.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Minimal audio for the new engine.
 *
 *   Sounds.load()                resolves after the audio bank is preloaded
 *   Sounds.play(name, vol=0.6)   one-shot SFX
 *   Sounds.playMusic(name, vol)  swap background music (loops)
 *   Sounds.stopMusic()           silence the current music track
 *   Sounds.say(text, opts)       speechSynthesis voice cue (best-effort)
 *
 * Each SFX uses a small pool of <audio> elements so rapid-fire shots don't get
 * cut off by the previous instance. Music is a single looped element.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const SFX_NAMES = [
  "firewarrior", "firevalkyrie", "firewizard", "fireelf",
  "collectfood", "collectkey", "collectpotion", "collectgold",
  "exitlevel", "generatordeath",
  "monsterdeath1", "monsterdeath2", "monsterdeath3",
  "malepain1", "malepain2", "femalepain1", "femalepain2",
  "weak", "opendoor", "victory", "gameover", "highscore",
];

const MUSIC_NAMES = [
  "music_lostcorridors", "music_bloodyhalo",   "music_citrinitas",
  "music_fleshandsteel", "music_mountingassault",
  "music_phantomdrone",  "music_thebeginning", "music_warbringer",
];

function urlFor(name) {
  // music tracks live as "music.foo.mp3"; SFX as "foo.mp3".
  if (name.startsWith("music_")) {
    const stem = name.slice("music_".length);
    return `assets/sounds/music.${stem}.mp3`;
  }
  return `assets/sounds/${name}.mp3`;
}

const POOL_SIZE = 4;

export const Sounds = {
  pools:    {},     // name -> [HTMLAudioElement]
  poolIdx:  {},     // name -> next slot for round-robin
  musicKey: null,
  musicEl:  null,
  muted:    false,
  _lastSay: 0,

  async load() {
    const tasks = [];
    for (const name of SFX_NAMES) {
      this.pools[name]   = [];
      this.poolIdx[name] = 0;
      for (let i = 0; i < POOL_SIZE; i++) {
        const a = new Audio();
        a.preload = "auto";
        a.src = urlFor(name);
        this.pools[name].push(a);
        tasks.push(this._wait(a));
      }
    }
    for (const name of MUSIC_NAMES) {
      const a = new Audio();
      a.preload = "auto";
      a.src = urlFor(name);
      a.loop = true;
      this.pools[name] = [a];
      this.poolIdx[name] = 0;
      tasks.push(this._wait(a));
    }
    await Promise.allSettled(tasks);
  },

  _wait(a) {
    return new Promise((resolve) => {
      let done = false;
      const ok = () => { if (!done) { done = true; resolve(); } };
      a.addEventListener("canplaythrough", ok, { once: true });
      a.addEventListener("error",          ok, { once: true });
      setTimeout(ok, 4000); // never block boot on slow audio
    });
  },

  play(name, vol = 0.6) {
    if (this.muted) return;
    const pool = this.pools[name];
    if (!pool) return;
    const idx = this.poolIdx[name] % pool.length;
    this.poolIdx[name] = idx + 1;
    const el = pool[idx];
    try {
      el.currentTime = 0;
      el.volume      = Math.max(0, Math.min(1, vol));
      el.play().catch(() => {});
    } catch {}
  },

  playMusic(name, vol = 0.4) {
    if (this.muted) return;
    if (this.musicKey === name && this.musicEl && !this.musicEl.paused) return;
    this.stopMusic();
    const pool = this.pools[name];
    if (!pool) return;
    this.musicEl  = pool[0];
    this.musicKey = name;
    try {
      this.musicEl.currentTime = 0;
      this.musicEl.volume      = vol;
      this.musicEl.loop        = true;
      this.musicEl.play().catch(() => {});
    } catch {}
  },

  stopMusic() {
    if (this.musicEl) { try { this.musicEl.pause(); } catch {} }
    this.musicEl  = null;
    this.musicKey = null;
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) this.stopMusic();
  },

  /** Voice cue via speechSynthesis. Throttled with `cooldown` ms (default 4000). */
  say(text, opts = {}) {
    if (this.muted) return;
    const now = performance.now();
    const cooldown = opts.cooldown ?? 4000;
    if (now - this._lastSay < cooldown) return;
    this._lastSay = now;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate   = opts.rate   ?? 0.95;
      u.pitch  = opts.pitch  ?? 0.9;
      u.volume = opts.volume ?? 0.7;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {}
  },
};
