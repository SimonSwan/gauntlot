// Asset loader: pre-loads images, level PNGs, and audio.

const IMAGE_LIST = {
  // Players: 9x8 grid of 24x24 sprites (rows = 8 directions, cols = animation/state frames)
  warrior:        "assets/sprites/player-warrior-sprite-sheet.png",
  warriorWeapon:  "assets/sprites/player-warrior-weapon-sprite-sheet.png",
  warriorExit:    "assets/sprites/player-warrior-exit-sprite-sheet.png",
  valkyrie:       "assets/sprites/player-valkyrie-sprite-sheet.png",
  valkyrieWeapon: "assets/sprites/player-valkyrie-weapon-sprite-sheet.png",
  valkyrieExit:   "assets/sprites/player-valkyrie-exit-sprite-sheet.png",
  wizard:         "assets/sprites/player-wizard-sprite-sheet.png",
  wizardWeapon:   "assets/sprites/player-wizard-weapon-sprite-sheet.png",
  wizardExit:     "assets/sprites/player-wizard-exit-sprite-sheet.png",
  elf:            "assets/sprites/player-elf-sprite-sheet.png",
  elfWeapon:      "assets/sprites/player-elf-weapon-sprite-sheet.png",
  elfExit:        "assets/sprites/player-elf-exit-sprite-sheet.png",
  spawn:          "assets/sprites/player-spawn-sprite-sheet.png",

  // Monsters
  ghost:          "assets/sprites/monster-ghost1-sprite-sheet.png",
  ghost2:         "assets/sprites/monster-ghost2-sprite-sheet.png",
  ghost3:         "assets/sprites/monster-ghost3-sprite-sheet.png",
  grunt:          "assets/sprites/monster-grunt1-sprite-sheet.png",
  grunt2:         "assets/sprites/monster-grunt2-sprite-sheet.png",
  grunt3:         "assets/sprites/monster-grunt3-sprite-sheet.png",
  demon:          "assets/sprites/monster-demon1-sprite-sheet.png",
  demon2:         "assets/sprites/monster-demon2-sprite-sheet.png",
  demon3:         "assets/sprites/monster-demon3-sprite-sheet.png",
  sorcerer:       "assets/sprites/monster-sorcerer1-sprite-sheet.png",
  sorcerer2:      "assets/sprites/monster-sorcerer2-sprite-sheet.png",
  sorcerer3:      "assets/sprites/monster-sorcerer3-sprite-sheet.png",
  lobber:         "assets/sprites/monster-lobber1-sprite-sheet.png",
  lobber2:        "assets/sprites/monster-lobber2-sprite-sheet.png",
  lobber3:        "assets/sprites/monster-lobber3-sprite-sheet.png",
  lobberFx:       "assets/sprites/monster-lobber-exlosion-sprite-sheet.png",
  death:          "assets/sprites/monster-death.png",
  thief:          "assets/sprites/monster-thief-sprite-sheet.png",
  monsterDeath:   "assets/sprites/monster-death.png",
  ghostGen:       "assets/sprites/monster-ghost-generator.png",
  monsterGen:     "assets/sprites/monster-monster-generator.png",

  // Items
  key:            "assets/sprites/dungeon-key.png",
  keyring:        "assets/sprites/dungeon-keyring.png",
  potionBlue:     "assets/sprites/dungeon-potion-blue.png",
  potionOrange:   "assets/sprites/dungeon-potion-orange.png",
  potionWeapon:   "assets/sprites/dungeon-potion-weapon.png",
  potionArmor:    "assets/sprites/dungeon-potion-extra-armor.png",
  potionSpeed:    "assets/sprites/dungeon-potion-extra-speed.png",
  potionMagic:    "assets/sprites/dungeon-potion-extra-magic.png",
  potionPower:    "assets/sprites/dungeon-potion-extra-shot-power.png",
  potionShot:     "assets/sprites/dungeon-potion-extra-shot-speed.png",
  invis:          "assets/sprites/dungeon-limited-invisibility.png",
  foodHam:        "assets/sprites/dungeon-food-ham.png",
  foodTurkey:     "assets/sprites/dungeon-food-turkey.png",
  foodDrumstick:  "assets/sprites/dungeon-food-drumstick.png",
  foodJug:        "assets/sprites/dungeon-food-jug.png",
  treasureBag:    "assets/sprites/dungeon-treasure-bag.png",
  treasureChest:  "assets/sprites/dungeon-treasure-chest-sprite-sheet.png",

  // Walls / floor / exits
  wallH:          "assets/sprites/dungeon-wall-horizontal.png",
  wallV:          "assets/sprites/dungeon-wall-vertical.png",
  wallC:          "assets/sprites/dungeon-wall-corners.png",
  exit:           "assets/sprites/dungeon-exit.png",
  exitTo4:        "assets/sprites/dungeon-exit-to-4.png",
  exitTo8:        "assets/sprites/dungeon-exit-to-8.png",
  teleport:       "assets/sprites/dungeon-teleport-sprite-sheet.png",

  // FX
  explosion:      "assets/sprites/explosion-collision-sprite-sheet.png",
  explosionTeleport: "assets/sprites/explosion-teleport-sprite-sheet.png",
  explosionLobber:"assets/sprites/monster-lobber-exlosion-sprite-sheet.png",

  // UI
  textGauntlet:   "assets/sprites/text-gauntlet.png",
  textPoints:     "assets/sprites/text-points.png",
  iconKey:        "assets/sprites/icon-key.png",
  iconPotion:     "assets/sprites/icon-potion.png",
  iconUpgrades:   "assets/sprites/icon-upgrades.png",
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

// 115 ROM-extracted Gauntlet 1 mazes (converted via tools/convert-rom-mazes.mjs).
const LEVEL_LIST = Array.from({ length: 115 }, (_, i) =>
  `assets/levels-rom/maze${String(i + 1).padStart(3, "0")}.png`
);

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
    // Some browsers need a timeout fallback
    setTimeout(() => resolve(a), 4000);
  });
}

export class Assets {
  constructor() {
    this.images = {};
    this.sounds = {};
    this.levels = []; // [{name, image, w, h, pixels}]
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
