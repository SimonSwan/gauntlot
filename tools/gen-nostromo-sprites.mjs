// Procedurally render placeholder Nostromo sprites — a 24×24 spritesheet
// per actor with 8-direction × N-frame layout matching the Gauntlet
// renderer's expectations. These are PLACEHOLDERS until the user uploads
// the real sprite sheet; the renderer code paths are identical, so when
// the real PNGs replace these the game just picks them up.
//
// Run with: node tools/gen-nostromo-sprites.mjs

import fs from "node:fs";
import path from "node:path";
import { PNG } from "/tmp/pt/node_modules/pngjs/lib/png.js";

const OUT = "assets/nostromo";
fs.mkdirSync(OUT, { recursive: true });

const SP = 24; // Sprite cell size

// 8-direction order matching renderer:
//   0 UP   1 UPRIGHT  2 RIGHT   3 DOWNRIGHT
//   4 DOWN 5 DOWNLEFT 6 LEFT    7 UPLEFT

function newPng(w, h) {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < p.data.length; i += 4) {
    p.data[i] = 0; p.data[i+1] = 0; p.data[i+2] = 0; p.data[i+3] = 0;
  }
  return p;
}

function setPx(png, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (y * png.width + x) << 2;
  png.data[i] = r; png.data[i+1] = g; png.data[i+2] = b; png.data[i+3] = a;
}

function fillRect(png, x, y, w, h, r, g, b, a = 255) {
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
    setPx(png, px, py, r, g, b, a);
  }
}

function hex(c) {
  if (typeof c !== "string") return [200,200,200];
  if (c[0] === "#") {
    if (c.length === 4) return [parseInt(c[1]+c[1],16), parseInt(c[2]+c[2],16), parseInt(c[3]+c[3],16)];
    return [parseInt(c.slice(1,3),16), parseInt(c.slice(3,5),16), parseInt(c.slice(5,7),16)];
  }
  return [200,200,200];
}

function darker([r,g,b], f = 0.6) { return [Math.floor(r*f), Math.floor(g*f), Math.floor(b*f)]; }
function lighter([r,g,b], f = 1.4) { return [Math.min(255, Math.floor(r*f)), Math.min(255, Math.floor(g*f)), Math.min(255, Math.floor(b*f))]; }

async function writePng(file, png) {
  return new Promise((res) => png.pack().pipe(fs.createWriteStream(file)).on("finish", res));
}

// ---------------------------------------------------------------------------
// MARINE-CLASS HEROES
// ---------------------------------------------------------------------------
// Top-down sprite of a soldier holding a rifle.
//   sheet = 9 frames wide × 8 dirs tall = 216×192
//   col 0 = standing, cols 1..3 = walk cycle, cols 4..7 = shoot frames,
//   col 8 = death

function drawHero(sheet, col, row, color) {
  const x0 = col * SP, y0 = row * SP;
  const helmet = darker(color, 0.6);
  const armorL = lighter(color, 1.1);
  const armorD = darker(color, 0.75);
  const skin = [221, 174, 135];
  const visor = [40, 80, 100];
  const rifle = [60, 60, 60];

  // Body: 16x12 torso centred-low in cell.
  fillRect(sheet, x0+4, y0+10, 16, 10, ...armorD);
  fillRect(sheet, x0+5, y0+11, 14,  8, ...color);
  // Shoulder pads
  fillRect(sheet, x0+3, y0+10, 3, 4, ...armorL);
  fillRect(sheet, x0+18,y0+10, 3, 4, ...armorL);
  // Head
  fillRect(sheet, x0+8, y0+4, 8, 8, ...skin);
  fillRect(sheet, x0+7, y0+3, 10, 5, ...helmet);
  // Visor stripe across head
  fillRect(sheet, x0+8, y0+7, 8, 2, ...visor);
  // Legs
  fillRect(sheet, x0+7, y0+19, 4, 4, ...armorD);
  fillRect(sheet, x0+13,y0+19, 4, 4, ...armorD);
  // Walk-cycle leg shift
  if (col >= 1 && col <= 3) {
    const phase = col - 1;
    if (phase === 0) { fillRect(sheet, x0+7, y0+19, 4, 5, ...armorD); }
    if (phase === 2) { fillRect(sheet, x0+13, y0+19, 4, 5, ...armorD); }
  }
  // Rifle held forwards (varies per direction row — for the placeholder
  // render the same forward-facing rifle on every direction; the gameplay
  // doesn't care).
  fillRect(sheet, x0+10, y0+12, 4, 8, ...rifle);
  fillRect(sheet, x0+11, y0+13, 2, 9, [120,120,120]);
  // Muzzle flash on shoot frames
  if (col >= 4 && col <= 7) {
    const f = col - 4;
    fillRect(sheet, x0+11, y0-1+f, 2, 2, 255, 240, 160);
  }
  // Death frame: collapsed
  if (col === 8) {
    fillRect(sheet, x0, y0, SP, SP, 0, 0, 0, 0);
    fillRect(sheet, x0+2, y0+18, 20, 4, ...darker(color, 0.5));
    fillRect(sheet, x0+4, y0+14, 6, 4, ...skin);
    fillRect(sheet, x0+10, y0+15, 12, 3, ...rifle);
  }
}

async function genHero(name, hex_) {
  const sheet = newPng(SP * 9, SP * 8);
  const color = hex(hex_);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 9; c++) drawHero(sheet, c, r, color);
  await writePng(path.join(OUT, `player-${name}-sprite-sheet.png`), sheet);
}

// ---------------------------------------------------------------------------
// XENOMORPH ENEMIES
// ---------------------------------------------------------------------------
// 4-frame walk cycle, 8 directions = 96×192
function drawDrone(sheet, col, row, palette) {
  const x0 = col * SP, y0 = row * SP;
  const body = palette.body;
  const dark = darker(body, 0.4);
  const wet  = lighter(body, 1.5);
  // Curved chitin head
  fillRect(sheet, x0+5,  y0+4, 14, 6, ...dark);
  fillRect(sheet, x0+6,  y0+3, 12, 3, ...body);
  // Elongated cranium back
  fillRect(sheet, x0+9,  y0+1, 6, 3, ...dark);
  // Wet highlight
  fillRect(sheet, x0+8,  y0+5, 2, 1, ...wet);
  fillRect(sheet, x0+14, y0+5, 2, 1, ...wet);
  // Body
  fillRect(sheet, x0+7,  y0+10, 10, 8, ...body);
  fillRect(sheet, x0+8,  y0+11,  8, 6, ...dark);
  // Spiky back ridges
  fillRect(sheet, x0+11, y0+10, 2, 2, ...wet);
  // Tail
  fillRect(sheet, x0+12, y0+18, 2, 5, ...body);
  // Limbs (animated)
  const phase = col % 4;
  fillRect(sheet, x0+4 + (phase&1?1:0), y0+13, 3, 3, ...dark);
  fillRect(sheet, x0+17 - (phase&1?1:0), y0+13, 3, 3, ...dark);
  fillRect(sheet, x0+5, y0+19+(phase>1?1:0), 3, 4, ...dark);
  fillRect(sheet, x0+16, y0+19+(phase>1?0:1), 3, 4, ...dark);
}

async function genDrone(name, body, frames = 4) {
  const sheet = newPng(SP * frames, SP * 8);
  const palette = { body: hex(body) };
  for (let r = 0; r < 8; r++) for (let c = 0; c < frames; c++) drawDrone(sheet, c, r, palette);
  await writePng(path.join(OUT, `monster-${name}-sprite-sheet.png`), sheet);
}

// ---------------------------------------------------------------------------
// SYNTHETIC ENEMIES
// ---------------------------------------------------------------------------
function drawSynth(sheet, col, row, palette) {
  const x0 = col * SP, y0 = row * SP;
  const armor = palette.armor;
  const dark  = darker(armor, 0.55);
  const trim  = palette.trim;
  // Boxy mech body
  fillRect(sheet, x0+5, y0+4, 14, 16, ...dark);
  fillRect(sheet, x0+6, y0+5, 12, 14, ...armor);
  // Head with red optic
  fillRect(sheet, x0+9, y0+3, 6, 4, ...dark);
  fillRect(sheet, x0+11, y0+4, 2, 2, 255, 50, 50);
  // Trim lights
  fillRect(sheet, x0+5, y0+10, 14, 1, ...trim);
  // Legs
  fillRect(sheet, x0+7, y0+20, 4, 3, ...dark);
  fillRect(sheet, x0+13,y0+20, 4, 3, ...dark);
  // Walk shimmer
  if (col & 1) fillRect(sheet, x0+5, y0+10, 14, 1, ...lighter(trim, 1.5));
}

async function genSynth(name, armor, trim, frames = 4) {
  const sheet = newPng(SP * frames, SP * 8);
  const palette = { armor: hex(armor), trim: hex(trim) };
  for (let r = 0; r < 8; r++) for (let c = 0; c < frames; c++) drawSynth(sheet, c, r, palette);
  await writePng(path.join(OUT, `monster-${name}-sprite-sheet.png`), sheet);
}

// ---------------------------------------------------------------------------
// PICKUPS — single-frame 16×16 PNGs
// ---------------------------------------------------------------------------
function drawPickup(png, kind) {
  const W = png.width;
  const fill = (x, y, w, h, r, g, b) => fillRect(png, x, y, w, h, r, g, b);
  switch (kind) {
    case "medkit":
      fill(2,2,12,12, 230,230,230);
      fill(2,2,12,2, 200,30,30); fill(2,12,12,2, 200,30,30);
      fill(7,5,2,6, 200,30,30); fill(5,7,6,2, 200,30,30);
      break;
    case "ammo":
      fill(2,2,4,12, 220,180,40); fill(7,2,4,12, 220,180,40); fill(11,3,3,11, 220,180,40);
      fill(3,2,2,2, 60,60,60); fill(8,2,2,2, 60,60,60); fill(11,3,2,2, 60,60,60);
      break;
    case "oxygen":
      fill(5,2,6,12, 100,180,200); fill(5,2,6,2, 60,140,160);
      fill(6,4,4,8, 150,220,240); fill(7,1,2,2, 200,200,200);
      break;
    case "adrenaline":
      fill(3,3,2,10, 200,200,200);
      fill(5,5,6,4, 220,40,40); fill(5,9,6,2, 220,40,40);
      fill(11,6,3,2, 200,200,200); fill(13,7,1,2, 200,200,200);
      break;
    case "accessCard":
      fill(2,4,12,8, 70,140,200); fill(3,5,10,2, 200,200,255);
      fill(3,8,5,2, 50,50,50); fill(3,10,5,1, 50,50,50);
      break;
    case "emp":
      fill(5,2,6,12, 100,200,250); fill(5,2,6,2, 60,140,200);
      fill(6,4,4,8, 200,240,255);
      fill(7,5,2,2, 60,140,200); fill(7,9,2,2, 60,140,200);
      break;
    case "credits":
      fill(2,4,12,8, 220,180,40); fill(2,4,12,2, 180,140,30);
      fill(4,7,2,2, 80,60,20); fill(8,7,2,2, 80,60,20); fill(12,7,1,2, 80,60,20);
      break;
    case "dataCore":
      fill(2,2,12,12, 80,80,90); fill(3,3,10,10, 30,180,80);
      fill(5,5,6,6, 40,220,100); fill(7,7,2,2, 200,255,200);
      break;
    case "poison":
      fill(5,2,6,12, 220,140,40); fill(5,2,6,2, 160,90,20);
      fill(6,4,4,8, 240,180,80);
      break;
    default:
      fill(4,4,8,8, 200,200,200);
  }
}

async function genPickups() {
  const kinds = ["medkit","ammo","oxygen","adrenaline","accessCard","emp","credits","dataCore","poison"];
  for (const k of kinds) {
    const p = newPng(16, 16);
    drawPickup(p, k);
    await writePng(path.join(OUT, `pickup-${k}.png`), p);
  }
}

// ---------------------------------------------------------------------------
// TILE ATLAS — 16 cols × 8 rows of 32×32 cells
//   row 0:    9 floor themes at sx=1..9
//   rows 1-6: 6 wall themes × 16 mask variants
//   row 7:    8 shadow overlays
// Built procedurally to match Jake's atlas layout, sci-fi palette.
// ---------------------------------------------------------------------------
const TS = 32;

function fillFloor(atlas, col, base, accent, dark) {
  const x0 = col * TS, y0 = 0;
  // Industrial floor panel — central pattern + rivets
  fillRect(atlas, x0,    y0,    TS, TS, ...dark);
  fillRect(atlas, x0+1,  y0+1,  TS-2, TS-2, ...base);
  // Inner panel border
  fillRect(atlas, x0+3,  y0+3,  TS-6, TS-6, ...darker(base, 0.85));
  fillRect(atlas, x0+5,  y0+5,  TS-10, TS-10, ...base);
  // Corner rivets
  for (const [px, py] of [[2,2],[TS-4,2],[2,TS-4],[TS-4,TS-4]]) {
    fillRect(atlas, x0+px, y0+py, 2, 2, ...accent);
  }
}

function fillWall(atlas, col, row, base, accent, light, mask) {
  const x0 = col * TS, y0 = row * TS;
  // Solid panel
  fillRect(atlas, x0, y0, TS, TS, ...base);
  // Diagonal hazard stripes for distinct identity
  for (let i = 0; i < TS*2; i += 8) {
    for (let d = 0; d < 4; d++) {
      const px = (i + d) % TS;
      const py = (i + d) - px;
      if (py >= 0 && py < TS) {
        // skip — keep clean panel
      }
    }
  }
  // Recessed centre
  fillRect(atlas, x0+4, y0+4, TS-8, TS-8, ...darker(base, 0.7));
  fillRect(atlas, x0+6, y0+6, TS-12, TS-12, ...base);
  // Top highlight if no neighbour wall above
  if (!(mask & 1)) fillRect(atlas, x0, y0, TS, 2, ...light);
  // Left highlight if no neighbour to left
  if (!(mask & 8)) fillRect(atlas, x0, y0, 2, TS, ...light);
  // Bottom shadow
  if (!(mask & 4)) fillRect(atlas, x0, y0+TS-2, TS, 2, ...darker(base, 0.4));
  // Right shadow
  if (!(mask & 2)) fillRect(atlas, x0+TS-2, y0, 2, TS, ...darker(base, 0.4));
  // Centre rivet (interior cells get a tech-y dot)
  if (mask === 15) {
    fillRect(atlas, x0+TS/2-1, y0+TS/2-1, 2, 2, ...accent);
  }
}

function drawShadow(atlas, col, mask) {
  const x0 = col * TS, y0 = 7 * TS;
  // Soft black shadow overlays per shadowtype mask:
  //   1 = wall to the left → darken left strip
  //   2 = wall to bottom-left → darken corner
  //   4 = wall directly below → darken bottom strip
  fillRect(atlas, x0, y0, TS, TS, 0, 0, 0, 0);
  if (mask & 1) fillRect(atlas, x0,        y0,         6, TS, 0, 0, 0, 110);
  if (mask & 4) fillRect(atlas, x0,        y0+TS-6,    TS, 6, 0, 0, 0, 110);
  if (mask & 2) fillRect(atlas, x0,        y0+TS-6,     6, 6, 0, 0, 0, 140);
}

async function genTileAtlas() {
  const atlas = newPng(16 * TS, 8 * TS);

  // 9 floors (cols 1..9)
  const floors = [
    { base:[60,70,80],   accent:[150,170,200], dark:[20,30,40] },   // grey panel
    { base:[80,80,90],   accent:[180,180,200], dark:[30,30,40] },   // light grey
    { base:[60,80,60],   accent:[160,200,160], dark:[20,40,20] },   // green tech
    { base:[90,70,40],   accent:[200,170,80],  dark:[40,30,15] },   // amber
    { base:[60,60,80],   accent:[140,160,200], dark:[20,20,40] },   // blue
    { base:[40,60,80],   accent:[100,160,220], dark:[10,30,50] },   // dark blue grate
    { base:[80,40,40],   accent:[200,80,80],   dark:[40,15,15] },   // hazard red
    { base:[40,80,80],   accent:[120,200,200], dark:[15,40,40] },   // teal corridor
    { base:[60,40,80],   accent:[160,100,200], dark:[20,10,40] },   // purple bio
  ];
  for (let i = 0; i < 9; i++) {
    const f = floors[i];
    fillFloor(atlas, i + 1, f.base, f.accent, f.dark);
  }

  // 6 wall themes (rows 1..6)
  const walls = [
    { base:[40,45,55],   light:[110,120,140], accent:[220,180,40] },  // industrial grey
    { base:[60,30,30],   light:[180,80,80],   accent:[255,200,40] },  // hazard red
    { base:[30,60,80],   light:[80,160,200],  accent:[200,255,255] }, // blue-tech
    { base:[55,45,30],   light:[160,130,80],  accent:[230,180,80] },  // amber industrial
    { base:[30,50,40],   light:[80,160,120],  accent:[160,255,200] }, // green-tech
    { base:[50,30,60],   light:[140,80,180],  accent:[230,180,255] }, // purple bio
  ];
  for (let r = 0; r < walls.length; r++) {
    for (let mask = 0; mask < 16; mask++) {
      fillWall(atlas, mask, r + 1, walls[r].base, walls[r].accent, walls[r].light, mask);
    }
  }

  // Shadow row
  for (let mask = 0; mask < 8; mask++) drawShadow(atlas, mask, mask);

  await writePng(path.join(OUT, "tiles.png"), atlas);
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
const HEROES = [
  ["marine",    "#1EFF3C"],
  ["tech",      "#00D8FF"],
  ["smuggler",  "#FF8C1A"],
  ["synthetic", "#E0E0E0"],
];

const XENOS = [
  ["drone",      "#3a4a5a"],  // matches "ghost" gameplay slot
  ["spitter",    "#4a3a2a"],  // demon
  ["runner",     "#7a5b34"],  // grunt
  ["praetorian", "#3a8050"],  // lobber
  ["protoXeno",  "#1a1a1a"],  // death-class
];

const SYNTHS = [
  ["synthSecurity",  "#a0a0a0", "#ff4040"],  // sorcerer
  ["workerAndroid",  "#dac060", "#ff4040"],  // thief
];

console.log("Generating Nostromo placeholder sprites…");
for (const [n, c] of HEROES) await genHero(n, c);
for (const [n, c] of XENOS)  await genDrone(n, c, 4);
for (const [n, c, t] of SYNTHS) await genSynth(n, c, t, 4);
await genPickups();
await genTileAtlas();
console.log("Done. Sprites in", OUT);
