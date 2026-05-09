import { Game } from "./game.js";

const canvas = document.getElementById("screen");

// Resize the canvas backing store to match its CSS pixel size, with devicePixelRatio
// so the arcade pixel art stays crisp on hi-DPI screens.
function resize() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = Math.floor(window.innerWidth * dpr);
  const h = Math.floor(window.innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    canvas.dpr = dpr;
  }
}
resize();
window.addEventListener("resize", resize);

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
