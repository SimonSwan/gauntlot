import { Game } from "./game.js";

const canvas = document.getElementById("screen");
const game = new Game(canvas);
window.__game = game;
game.start();

// Fullscreen toggle
window.addEventListener("keydown", (e) => {
  if (e.key === "f" || e.key === "F") {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  }
});
