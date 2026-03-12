import { TILE_SIZE } from './world/tile.js';

/**
 * Handles keyboard/mouse, translates screen positions to map tile positions.
 */
export class InputSystem {
  constructor(canvas, state, jobSystem) {
    this.canvas = canvas;
    this.state = state;
    this.jobSystem = jobSystem;
    this.keys = new Set();

    this.bindEvents();
  }

  bindEvents() {
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    this.canvas.addEventListener('click', (e) => {
      if (e.button !== 0) return;
      this.state.ui.selectedTile = this.screenToTile(e.clientX, e.clientY);
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const tile = this.screenToTile(e.clientX, e.clientY);
      if (!tile) return;
      this.jobSystem.markMining(tile.x, tile.y);
      this.state.ui.selectedTile = tile;
    });

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const before = this.state.camera.zoom;
        const delta = Math.sign(e.deltaY) * 0.1;
        this.state.camera.zoom = clamp(before - delta, 0.6, 3);
      },
      { passive: false }
    );
  }

  update(dt) {
    // Smooth camera motion.
    const speed = 26 / this.state.camera.zoom;
    const targetDX = (Number(this.keys.has('d')) - Number(this.keys.has('a'))) * speed;
    const targetDY = (Number(this.keys.has('s')) - Number(this.keys.has('w'))) * speed;

    this.state.camera.vx += (targetDX - this.state.camera.vx) * Math.min(1, dt * 10);
    this.state.camera.vy += (targetDY - this.state.camera.vy) * Math.min(1, dt * 10);

    this.state.camera.x += this.state.camera.vx * dt;
    this.state.camera.y += this.state.camera.vy * dt;

    // Keep camera inside map bounds.
    const tilesVisibleX = this.canvas.width / (TILE_SIZE * this.state.camera.zoom);
    const tilesVisibleY = this.canvas.height / (TILE_SIZE * this.state.camera.zoom);
    this.state.camera.x = clamp(this.state.camera.x, 0, this.state.map.width - tilesVisibleX);
    this.state.camera.y = clamp(this.state.camera.y, 0, this.state.map.height - tilesVisibleY);
  }

  screenToTile(screenX, screenY) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = (screenX - rect.left) * (this.canvas.width / rect.width);
    const cy = (screenY - rect.top) * (this.canvas.height / rect.height);

    const tx = Math.floor(this.state.camera.x + cx / (TILE_SIZE * this.state.camera.zoom));
    const ty = Math.floor(this.state.camera.y + cy / (TILE_SIZE * this.state.camera.zoom));

    if (!this.state.map.inBounds(tx, ty)) return null;
    return { x: tx, y: ty };
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
