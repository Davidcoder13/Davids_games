import { TILE_TYPES } from '../world/tiles.js';
import { getTopBarText } from '../ui/ui.js';

export function createRenderer(canvas, ctx) {
  return {
    render(state) {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      drawTiles(ctx, state, width, height);
      drawResources(ctx, state);
      drawBuildings(ctx, state);
      drawColonists(ctx, state);
      drawUI(ctx, state, width);
    }
  };
}

function drawTiles(ctx, state, canvasW, canvasH) {
  const tileSize = state.tileSize * state.camera.zoom;
  const startX = Math.floor(state.camera.x);
  const startY = Math.floor(state.camera.y);
  const endX = Math.ceil(state.camera.x + canvasW / tileSize) + 1;
  const endY = Math.ceil(state.camera.y + canvasH / tileSize) + 1;

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) continue;
      const tileId = state.map.tiles[y][x];
      ctx.fillStyle = TILE_TYPES[tileId].color;
      ctx.fillRect(toScreenX(state, x), toScreenY(state, y), tileSize + 1, tileSize + 1);

      const key = `${x},${y}`;
      if (state.map.miningOrders.has(key)) {
        ctx.strokeStyle = '#ff7f50';
        ctx.lineWidth = 2;
        ctx.strokeRect(toScreenX(state, x) + 2, toScreenY(state, y) + 2, tileSize - 4, tileSize - 4);
      }
    }
  }
}

function drawResources() {
  // Placeholder for future dropped resources rendering.
}

function drawBuildings() {
  // Placeholder for future building rendering.
}

function drawColonists(ctx, state) {
  const size = Math.max(4, state.tileSize * state.camera.zoom * 0.5);
  for (const c of state.colonists) {
    const x = toScreenX(state, c.x) + size * 0.3;
    const y = toScreenY(state, c.y) + size * 0.3;
    ctx.fillStyle = c.color;
    ctx.fillRect(x, y, size, size);

    if (state.camera.zoom > 1.1) {
      ctx.fillStyle = '#111';
      ctx.font = '10px Arial';
      ctx.fillText(c.name, x - 4, y - 4);
    }
  }
}

function drawUI(ctx, state, canvasW) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, canvasW, 34);
  ctx.fillStyle = '#fff';
  ctx.font = '16px Arial';
  ctx.fillText(getTopBarText(state), 12, 22);

  if (state.ui.selectedTile) {
    const { x, y } = state.ui.selectedTile;
    const sx = toScreenX(state, x);
    const sy = toScreenY(state, y);
    const ts = state.tileSize * state.camera.zoom;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, ts - 2, ts - 2);

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(10, 44, 240, 22);
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.fillText(`Selected: (${x}, ${y})`, 16, 60);
  }
}

function toScreenX(state, tileX) {
  return (tileX - state.camera.x) * state.tileSize * state.camera.zoom;
}

function toScreenY(state, tileY) {
  return (tileY - state.camera.y) * state.tileSize * state.camera.zoom;
}
