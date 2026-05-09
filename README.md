# Gauntlot — A Faithful Recreation of Atari Gauntlet (1985)

HTML5 Canvas + vanilla JS. Up to 4 players, keyboard or gamepad, with the four
classic heroes (Thor the Warrior, Thyra the Valkyrie, Merlin the Wizard,
Questor the Elf), all the original enemy types (Ghosts, Demons, Grunts,
Sorcerers, Lobbers, Death, Thieves), generators, doors, treasure, and the
arcade health-drain.

## Run it

Any static web server works. For example:

```
python3 -m http.server 8765
# then open http://localhost:8765
```

## Controls

| | Up/Down/Left/Right | Shoot | Magic |
|---|---|---|---|
| Player 1 | W / A / S / D | G | H |
| Player 2 | I / J / K / L | ; | ' |
| Player 3 | Arrow keys | . | , |
| Player 4 | Numpad 8 / 4 / 5 / 6 | Numpad 0 | NumpadEnter |
| Any player | Gamepad d-pad / left stick | A button | B button |

`Enter` / `Space` to advance through screens. `F` toggles fullscreen.

## Credits / Licensing

This is a fan recreation. Original Gauntlet © 1985 Atari Games.

Assets reused with permission of their MIT-licensed authors:

- Sound effects + music from
  [jakesgordon/javascript-gauntlet](https://github.com/jakesgordon/javascript-gauntlet)
  (MIT, Jake Gordon).
- Sprite sheets extracted directly from the original Gauntlet arcade ROM by
  [mbeisser1/gauntlet_mame_gfx](https://github.com/mbeisser1/gauntlet_mame_gfx)
  (MIT, Matt Beisser).
- Initial level designs (PNG-encoded tile maps) also from
  jakesgordon/javascript-gauntlet.
- Maze data references from
  [alinsavix/gex](https://github.com/alinsavix/gex) (Gauntlet ROM extractor).
- Game-feel constants (player speeds, monster behaviour, AI direction tables)
  ported and adapted from javascript-gauntlet.

## Architecture

- `src/main.js` — entry point.
- `src/game.js` — top-level state machine (title / select / loading / playing /
  transition / gameover). Owns the camera/viewport and drives the per-frame
  update + render.
- `src/constants.js` — arcade-faithful tuning: hero / monster / treasure types,
  damage, speeds, magic radius, health-drain rate.
- `src/assets.js` — preloads sprite PNGs, audio, and PNG-encoded levels into
  pixel arrays.
- `src/input.js` — keyboard + gamepad, sliced into 4 player slots.
- `src/level.js` — parses each level PNG into a tile grid, instantiates
  entities. Provides cell-based collision queries.
- `src/entities.js` — Monster (with arcade AI: preferred / sliding directions,
  reload, line-of-fire), Generator (waves), Treasure, Door (key-opens with
  chain to neighbours), Exit, Weapon (player + monster projectiles), Fx.
- `src/player.js` — per-slot Player. Shooting locks movement (arcade
  behaviour). Health auto-drains 1 HP / 0.5s. Magic potion = nuke within
  `magic` tiles.
- `src/render.js` — camera-relative draw of floor / walls / entities + 4-cell
  HUD with hero portrait, score, health, keys, potions.
- `src/sounds.js` — pooled `<audio>` playback + announcer voice via
  `speechSynthesis` ("Warrior needs food, badly!").

## Level format

Levels are tiny PNG images where each pixel is one tile. The encoding matches
javascript-gauntlet's so its 17 levels (7 trainers + 10 dungeons) load
directly:

| Hex          | Meaning                |
|--------------|------------------------|
| `0x000000`   | nothing (out-of-bounds)|
| `0x404000`   | wall                   |
| `0xC0C000`   | door                   |
| `0x00F000`   | player start           |
| `0x004000`   | exit                   |
| `0xF000n0`   | generator (n = monster type) |
| `0x4000n0`   | monster (n = type)     |
| `0x0080n0`   | treasure (n = type)    |

Monster sub-types: 0 ghost, 1 demon, 2 grunt, 3 sorcerer, 4 lobber, 5 death, 6
thief.

Treasure sub-types: 0 health, 1 poison, 2-4 food (turkey/ham/jug), 5 key, 6
potion, 7 gold, 8 chest.
