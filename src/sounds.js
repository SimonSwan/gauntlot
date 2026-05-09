// Audio manager with sample pooling for overlapping plays.
// Falls back to silent if a sound failed to load.

const POOL_SIZE = 4;

export class Sounds {
  constructor(assets) {
    this.assets = assets;
    this.pools = {};
    this.muted = false;
    this.musicEl = null;
    this.musicKey = null;
    this.synth = ('speechSynthesis' in window) ? window.speechSynthesis : null;
    this._announced = {};
  }

  play(key, volume = 0.4) {
    if (this.muted) return;
    const src = this.assets.sounds[key];
    if (!src) return;
    let pool = this.pools[key];
    if (!pool) {
      pool = [];
      for (let i = 0; i < POOL_SIZE; i++) {
        const c = src.cloneNode();
        c.volume = volume;
        pool.push(c);
      }
      this.pools[key] = pool;
    }
    for (const a of pool) {
      if (a.paused || a.ended) {
        try { a.currentTime = 0; a.volume = volume; a.play().catch(()=>{}); } catch(e){}
        return;
      }
    }
    // all in use, restart oldest
    const a = pool[0];
    try { a.currentTime = 0; a.play().catch(()=>{}); } catch(e){}
  }

  music(key, volume = 0.5) {
    if (this.musicKey === key) return;
    if (this.musicEl) { try { this.musicEl.pause(); } catch(e){} this.musicEl = null; }
    this.musicKey = key;
    if (!key) return;
    const src = this.assets.sounds[key];
    if (!src) return;
    const a = src.cloneNode();
    a.loop = true;
    a.volume = this.muted ? 0 : volume;
    this.musicEl = a;
    a.play().catch(()=>{ /* needs user gesture */ });
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.musicEl) this.musicEl.volume = this.muted ? 0 : 0.5;
  }

  // Announcer voice - speaks classic Gauntlet voice cues. Throttled per-message.
  say(text, opts = {}) {
    if (this.muted || !this.synth) return;
    const now = performance.now();
    const last = this._announced[text] || 0;
    if (now - last < (opts.cooldown || 6000)) return;
    this._announced[text] = now;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = opts.pitch ?? 0.7;
      u.rate  = opts.rate  ?? 0.9;
      u.volume = opts.volume ?? 0.9;
      // Prefer a deeper voice when possible
      const voices = this.synth.getVoices();
      if (voices && voices.length) {
        const pref = voices.find(v => /male|david|daniel|fred|alex/i.test(v.name)) || voices[0];
        u.voice = pref;
      }
      // Cancel anything queued so cues don't pile up
      this.synth.cancel();
      this.synth.speak(u);
    } catch(e) {}
  }
}
