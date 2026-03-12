import { TILE_SIZE } from './world/tile.js';

export class Renderer {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  render(state, jobSystem, resourceSystem) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Required rendering order:
    // 1) ground tiles, 2) rock tiles, 3) resources, 4) colonists, 5) UI.
    this.drawGround(state);
    this.drawRocks(state, jobSystem);
    this.drawResources(state, resourceSystem);
    this.drawColonists(state);
    this.drawUI(state, resourceSystem);
  }

  drawGround(state) {
    const { startX, endX, startY, endY, px } = this.getView(state);

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const tile = state.map.getTile(x, y);
        if (!tile || tile.type === 'rock') continue;
        this.ctx.fillStyle = tile.color;
        this.ctx.fillRect(px(x, y).x, px(x, y).y, state.tileSize * state.camera.zoom + 1, state.tileSize * state.camera.zoom + 1);
      }
    }
  }

  drawRocks(state, jobSystem) {
    const { startX, endX, startY, endY, px } = this.getView(state);

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const tile = state.map.getTile(x, y);
        if (!tile || tile.type !== 'rock') continue;

        const pos = px(x, y);
        const ts = state.tileSize * state.camera.zoom;
        this.ctx.fillStyle = tile.color;
        this.ctx.fillRect(pos.x, pos.y, ts + 1, ts + 1);

        if (jobSystem.miningOrders.has(`${x},${y}`)) {
          this.ctx.strokeStyle = '#ff8c42';
          this.ctx.lineWidth = 2;
          this.ctx.strokeRect(pos.x + 2, pos.y + 2, ts - 4, ts - 4);
        }
      }
    }
  }

  drawResources(state, resourceSystem) {
    // MVP: draw resource summary chips near top-left as world-independent overlay hint.
    this.ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this.ctx.fillRect(12, 42, 120, 22);
    this.ctx.fillStyle = '#ddd';
    this.ctx.font = '13px Arial';
    this.ctx.fillText(`Stone: ${resourceSystem.inventory.stone}`, 18, 57);
  }

  drawColonists(state) {
    const size = Math.max(4, state.tileSize * state.camera.zoom * 0.5);
    for (const c of state.colonists) {
      const sx = (c.x - state.camera.x) * state.tileSize * state.camera.zoom + size * 0.3;
      const sy = (c.y - state.camera.y) * state.tileSize * state.camera.zoom + size * 0.3;

      this.ctx.fillStyle = c.color;
      this.ctx.fillRect(sx, sy, size, size);
    }
  }

  drawUI(state, resourceSystem) {
    this.ctx.fillStyle = 'rgba(0,0,0,0.62)';
    this.ctx.fillRect(0, 0, this.canvas.width, 32);
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '16px Arial';
    this.ctx.fillText(`Stone: ${resourceSystem.inventory.stone}   Colonists: ${state.colonists.length}`, 12, 21);

    if (state.ui.selectedTile) {
      const { x, y } = state.ui.selectedTile;
      const tile = state.map.getTile(x, y);
      const sx = (x - state.camera.x) * state.tileSize * state.camera.zoom;
      const sy = (y - state.camera.y) * state.tileSize * state.camera.zoom;
      const ts = state.tileSize * state.camera.zoom;

      this.ctx.strokeStyle = '#fff';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(sx + 1, sy + 1, ts - 2, ts - 2);

      this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
      this.ctx.fillRect(12, 68, 320, 40);
      this.ctx.fillStyle = '#fff';
      this.ctx.font = '14px Arial';
      this.ctx.fillText(
        `Selected (${x}, ${y}) | ${tile?.type ?? 'void'} | walk:${tile?.walkable ? 'yes' : 'no'} | mine:${tile?.mineable ? 'yes' : 'no'}`,
        18,
        92
      );
    }
  }

  getView(state) {
    const ts = state.tileSize * state.camera.zoom;
    const startX = Math.floor(state.camera.x);
    const startY = Math.floor(state.camera.y);
    const endX = Math.min(state.map.width, Math.ceil(state.camera.x + this.canvas.width / ts) + 1);
    const endY = Math.min(state.map.height, Math.ceil(state.camera.y + this.canvas.height / ts) + 1);
    const px = (x, y) => ({
      x: (x - state.camera.x) * ts,
      y: (y - state.camera.y) * ts
    });

    return { startX, endX, startY, endY, px };
  }
}
