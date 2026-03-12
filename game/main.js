import { TILE_SIZE } from '../world/tiles.js';
import { createMap } from '../world/map.js';
import { createColonists } from '../entities/colonist.js';
import { updateColonists } from '../systems/jobs.js';
import { createRenderer } from './renderer.js';
import { setupInput } from './input.js';
import { createGameLoop } from './gameloop.js';
import { createUIState } from '../ui/ui.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const state = {
  tileSize: TILE_SIZE,
  map: createMap(),
  colonists: [],
  inventory: {
    stone: 0
  },
  camera: {
    x: 42,
    y: 42,
    zoom: 1
  },
  ui: createUIState()
};

state.colonists = createColonists(state.map, 3);

const renderer = createRenderer(canvas, ctx);
const input = setupInput(state, canvas);

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

createGameLoop({
  update(dt) {
    input.update(dt);
    updateColonists(state, dt);
  },
  render() {
    renderer.render(state);
  }
});

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
