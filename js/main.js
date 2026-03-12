import { TILE_SIZE } from './world/tile.js';
import { GameMap } from './world/map.js';
import { spawnColonists } from './entities/colonist.js';
import { ResourceSystem } from './systems/resources.js';
import { JobSystem } from './systems/jobs.js';
import { InputSystem } from './input.js';
import { Renderer } from './renderer.js';
import { UIState } from './ui/ui.js';
import { GameLoop } from './gameLoop.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const gameMap = new GameMap(100, 100);
const resourceSystem = new ResourceSystem();
const jobSystem = new JobSystem(gameMap, resourceSystem);

const state = {
  tileSize: TILE_SIZE,
  map: gameMap,
  colonists: spawnColonists(gameMap, 3),
  camera: {
    x: 40,
    y: 40,
    zoom: 1,
    vx: 0,
    vy: 0
  },
  ui: new UIState()
};

const input = new InputSystem(canvas, state, jobSystem);
const renderer = new Renderer(canvas, ctx);

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const loop = new GameLoop(
  (dt) => {
    input.update(dt);
    jobSystem.update(state.colonists, dt);
  },
  () => {
    renderer.render(state, jobSystem, resourceSystem);
  }
);

loop.start();
