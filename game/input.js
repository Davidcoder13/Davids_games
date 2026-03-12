import { keyFromXY, getTile } from '../world/map.js';

export function setupInput(state, canvas) {
  const keys = new Set();

  window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  canvas.addEventListener('mousemove', (e) => {
    state.ui.hoveredTile = screenToTile(state, canvas, e.clientX, e.clientY);
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const direction = Math.sign(e.deltaY);
    const prevZoom = state.camera.zoom;
    const zoomStep = 0.1;
    state.camera.zoom = clamp(prevZoom - direction * zoomStep, 0.5, 3);
  }, { passive: false });

  canvas.addEventListener('click', (e) => {
    if (e.button !== 0) return;
    state.ui.selectedTile = screenToTile(state, canvas, e.clientX, e.clientY);
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const tile = screenToTile(state, canvas, e.clientX, e.clientY);
    if (!tile) return;

    const type = getTile(state.map, tile.x, tile.y);
    if (type === 'rock') {
      state.map.miningOrders.add(keyFromXY(tile.x, tile.y));
      state.ui.selectedTile = tile;
    }
  });

  return {
    update(dt) {
      const speed = 24 * dt / state.camera.zoom;
      if (keys.has('w')) state.camera.y -= speed;
      if (keys.has('s')) state.camera.y += speed;
      if (keys.has('a')) state.camera.x -= speed;
      if (keys.has('d')) state.camera.x += speed;
    }
  };
}

function screenToTile(state, canvas, screenX, screenY) {
  const rect = canvas.getBoundingClientRect();
  const x = (screenX - rect.left) * (canvas.width / rect.width);
  const y = (screenY - rect.top) * (canvas.height / rect.height);

  const worldX = state.camera.x + x / (state.tileSize * state.camera.zoom);
  const worldY = state.camera.y + y / (state.tileSize * state.camera.zoom);

  const tileX = Math.floor(worldX);
  const tileY = Math.floor(worldY);

  if (tileX < 0 || tileY < 0 || tileX >= state.map.width || tileY >= state.map.height) return null;
  return { x: tileX, y: tileY };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
