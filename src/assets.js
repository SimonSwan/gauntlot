// Asset loader: pre-loads images, level PNGs, and audio.
//
// Sprite paths point at the Nostromo placeholder atlas. When the user drops
// the real sprite-sheet PNG in, replace the files in assets/nostromo/ —
// no code change needed.

const IMAGE_LIST = {
  // Heroes
  marine:        "assets/nostromo/player-marine-sprite-sheet.png",
  tech:          "assets/nostromo/player-tech-sprite-sheet.png",
  smuggler:      "assets/nostromo/player-smuggler-sprite-sheet.png",
  synthetic:     "assets/nostromo/player-synthetic-sprite-sheet.png",

  // Xenomorph enemies (occupying the ghost/demon/grunt/lobber/death gameplay slots)
  drone:         "assets/nostromo/monster-drone-sprite-sheet.png",
  spitter:       "assets/nostromo/monster-spitter-sprite-sheet.png",
  runner:        "assets/nostromo/monster-runner-sprite-sheet.png",
  praetorian:    "assets/nostromo/monster-praetorian-sprite-sheet.png",
  protoXeno:     "assets/nostromo/monster-protoXeno-sprite-sheet.png",

  // Synthetic enemies (sorcerer + thief slots)
  synthSecurity: "assets/nostromo/monster-synthSecurity-sprite-sheet.png",
  workerAndroid: "assets/nostromo/monster-workerAndroid-sprite-sheet.png",

  // Generators (re-use existing arcade gen sprites for now)
  ghostGen:      "assets/sprites/monster-ghost-generator.png",
  monsterGen:    "assets/sprites/monster-monster-generator.png",

  // Pickups
  medkit:        "assets/nostromo/pickup-medkit.png",
  ammo:          "assets/nostromo/pickup-ammo.png",
  oxygen:        "assets/nostromo/pickup-oxygen.png",
  adrenaline:    "assets/nostromo/pickup-adrenaline.png",
  accessCard:    "assets/nostromo/pickup-accessCard.png",
  emp:           "assets/nostromo/pickup-emp.png",
  credits:       "assets/nostromo/pickup-credits.png",
  dataCore:      "assets/nostromo/pickup-dataCore.png",
  poison:        "assets/nostromo/pickup-poison.png",

  // Doors / exits
  exit:          "assets/sprites/dungeon-exit.png",

  // FX
  explosion:     "assets/sprites/explosion-collision-sprite-sheet.png",

  // ROM-extracted bitmap font (kept — same alphabet)
  textAlphabet:        "assets/sprites/text-an-alphabet.png",
  textAlphabetLarge:   "assets/sprites/text-an-alphabet-large-0-9A.png",

  // Sci-fi tile atlas (procedurally generated for now; same 16x8 layout
  // as the Gauntlet backgrounds.png so render.js's mask math works).
  backgrounds:    "assets/nostromo/tiles.png",
};

const SOUND_LIST = {
  firewarrior:    "assets/sounds/firewarrior.mp3",
  firevalkyrie:   "assets/sounds/firevalkyrie.mp3",
  firewizard:     "assets/sounds/firewizard.mp3",
  fireelf:        "assets/sounds/fireelf.mp3",
  collectfood:    "assets/sounds/collectfood.mp3",
  collectkey:     "assets/sounds/collectkey.mp3",
  collectpotion:  "assets/sounds/collectpotion.mp3",
  collectgold:    "assets/sounds/collectgold.mp3",
  exitlevel:      "assets/sounds/exitlevel.mp3",
  generatordeath: "assets/sounds/generatordeath.mp3",
  monsterdeath1:  "assets/sounds/monsterdeath1.mp3",
  monsterdeath2:  "assets/sounds/monsterdeath2.mp3",
  monsterdeath3:  "assets/sounds/monsterdeath3.mp3",
  malepain1:      "assets/sounds/malepain1.mp3",
  malepain2:      "assets/sounds/malepain2.mp3",
  femalepain1:    "assets/sounds/femalepain1.mp3",
  femalepain2:    "assets/sounds/femalepain2.mp3",
  weak:           "assets/sounds/weak.mp3",
  opendoor:       "assets/sounds/opendoor.mp3",
  victory:        "assets/sounds/victory.mp3",
  gameover:       "assets/sounds/gameover.mp3",
  highscore:      "assets/sounds/highscore.mp3",
  music_lostcorridors:   "assets/sounds/music.lostcorridors.mp3",
  music_bloodyhalo:      "assets/sounds/music.bloodyhalo.mp3",
  music_citrinitas:      "assets/sounds/music.citrinitas.mp3",
  music_fleshandsteel:   "assets/sounds/music.fleshandsteel.mp3",
  music_mountingassault: "assets/sounds/music.mountingassault.mp3",
  music_phantomdrone:    "assets/sounds/music.phantomdrone.mp3",
  music_thebeginning:    "assets/sounds/music.thebeginning.mp3",
  music_warbringer:      "assets/sounds/music.warbringer.mp3",
};

// Hand-crafted Gauntlet levels from jakesgordon/javascript-gauntlet — 7 trainers
// + 10 dungeons. Each PNG is a tile-per-pixel map in the encoding documented in
// the README. The auto-converted ROM dumps in levels-rom/ are noise; these are
// the actual playable maps.
const LEVEL_LIST = [
  "assets/levels-jg/trainer1.png",
  "assets/levels-jg/trainer2.png",
  "assets/levels-jg/trainer3.png",
  "assets/levels-jg/trainer4.png",
  "assets/levels-jg/trainer5.png",
  "assets/levels-jg/trainer6.png",
  "assets/levels-jg/trainer7.png",
  "assets/levels-jg/level1.png",
  "assets/levels-jg/level2.png",
  "assets/levels-jg/level3.png",
  "assets/levels-jg/level4.png",
  "assets/levels-jg/level5.png",
  "assets/levels-jg/level6.png",
  "assets/levels-jg/level7.png",
  "assets/levels-jg/level8.png",
  "assets/levels-jg/level9.png",
  "assets/levels-jg/level10.png",
];

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { console.warn("missing image:", url); resolve(null); };
    img.src = url;
  });
}
function loadAudio(url) {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "auto";
    a.addEventListener("canplaythrough", () => resolve(a), { once: true });
    a.addEventListener("error", () => { console.warn("missing audio:", url); resolve(null); }, { once: true });
    a.src = url;
    setTimeout(() => resolve(a), 4000);
  });
}

export class Assets {
  constructor() {
    this.images = {};
    this.sounds = {};
    this.levels = [];
  }
  async loadAll(progress) {
    const tasks = [];
    let done = 0, total = Object.keys(IMAGE_LIST).length + Object.keys(SOUND_LIST).length + LEVEL_LIST.length;
    const bump = (k, v) => { done++; if (progress) progress(done, total, k); };

    for (const [key, url] of Object.entries(IMAGE_LIST)) {
      tasks.push(loadImage(url).then(img => { this.images[key] = img; bump("img", key); }));
    }
    for (const [key, url] of Object.entries(SOUND_LIST)) {
      tasks.push(loadAudio(url).then(a => { this.sounds[key] = a; bump("snd", key); }));
    }
    for (const url of LEVEL_LIST) {
      tasks.push(loadImage(url).then(img => {
        if (!img) { bump("lvl", url); return; }
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, img.width, img.height).data;
        const pixels = new Uint32Array(img.width * img.height);
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
          pixels[j] = (data[i] << 16) | (data[i+1] << 8) | data[i+2];
        }
        const name = url.split("/").pop().replace(".png","");
        this.levels.push({ name, w: img.width, h: img.height, pixels });
        bump("lvl", name);
      }));
    }
    await Promise.all(tasks);
  }
  pixel(level, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= level.w || ty >= level.h) return 0;
    return level.pixels[tx + ty * level.w];
  }
}
