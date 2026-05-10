// Asset loader: pre-loads images, level PNGs, and audio.
//
// Sprite paths now come from the original Atari Gauntlet sprite set
// (mbeisser1/gauntlet_mame_gfx, MIT) shipped in assets/sprites/. Keys here
// match HEROES[].id and MONSTER_TYPES[].key in constants.js so render.js can
// look them up by entity type.

const IMAGE_LIST = {
  // Heroes (CONFIRMED frame layouts — see HEROES[] in constants.js)
  warrior:       "assets/sprites/player-warrior-sprite-sheet.png",
  valkyrie:      "assets/sprites/player-valkyrie-sprite-sheet.png",
  wizard:        "assets/sprites/player-wizard-sprite-sheet.png",
  elf:           "assets/sprites/player-elf-sprite-sheet.png",

  // Monsters — keys match MONSTER_TYPES[].key
  ghost:         "assets/sprites/monster-ghost1-sprite-sheet.png",
  demon:         "assets/sprites/monster-demon1-sprite-sheet.png",
  grunt:         "assets/sprites/monster-grunt1-sprite-sheet.png",
  sorcerer:      "assets/sprites/monster-sorcerer1-sprite-sheet.png",
  lobber:        "assets/sprites/monster-lobber1-sprite-sheet.png",
  death:         "assets/sprites/monster-death.png",
  thief:         "assets/sprites/monster-thief-sprite-sheet.png",

  // Generators
  ghostGen:      "assets/sprites/monster-ghost-generator.png",
  monsterGen:    "assets/sprites/monster-monster-generator.png",

  // Pickups (keys match TREASURE_TYPES[].key)
  health:        "assets/sprites/dungeon-potion-blue.png",
  poison:        "assets/sprites/dungeon-potion-orange.png",
  food1:         "assets/sprites/dungeon-food-turkey.png",
  food2:         "assets/sprites/dungeon-food-ham.png",
  food3:         "assets/sprites/dungeon-food-drumstick.png",
  key:           "assets/sprites/dungeon-key.png",
  potion:        "assets/sprites/dungeon-potion-blue.png",
  gold:          "assets/sprites/dungeon-treasure-bag.png",
  chest:         "assets/sprites/dungeon-treasure-chest-sprite-sheet.png",

  // Doors / exits
  exit:          "assets/sprites/dungeon-exit.png",
  exit_to_4:     "assets/sprites/dungeon-exit-to-4.png",
  exit_to_8:     "assets/sprites/dungeon-exit-to-8.png",

  // FX
  explosion:     "assets/sprites/explosion-collision-sprite-sheet.png",

  // ROM-extracted bitmap font
  textAlphabet:        "assets/sprites/text-an-alphabet.png",
  textAlphabetLarge:   "assets/sprites/text-an-alphabet-large-0-9A.png",

  // Wall / floor tile atlas — original Atari Gauntlet ROM-extracted
  // (16 cols × 8 rows of 32×32 cells; see render.js for wall-mask math).
  backgrounds:   "assets/sprites/backgrounds.png",
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

// The original Atari Gauntlet 1 ROM mazes, reconstructed from gex's
// pre-rendered reference PNGs by tools/template-match-mazes.mjs. Each PNG is
// a 33x33 tile grid in the same encoding the level loader already uses. The
// numbering matches gex's maze-NNN ROM addresses; gaps (e.g. 050, 114-149)
// reflect mazes gex couldn't decode.
const MAZE_NUMBERS = [
  ...Array.from({ length: 49  }, (_, i) => i + 1),     // 001-049
  ...Array.from({ length: 63  }, (_, i) => i + 51),    // 051-113
  150, 151,
];
const LEVEL_LIST = MAZE_NUMBERS.map(
  n => `assets/levels-rom/maze${String(n).padStart(3, "0")}.png`
);
export { MAZE_NUMBERS };

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
