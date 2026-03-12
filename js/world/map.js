import { TILE_DEFS } from './tile.js';

export const MAP_WIDTH = 100;
export const MAP_HEIGHT = 100;

/**
 * Generates clustered terrain with simple random-walk blob painting.
 */
export class GameMap {
  constructor(width = MAP_WIDTH, height = MAP_HEIGHT) {
    this.width = width;
    this.height = height;
    this.tiles = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({ ...TILE_DEFS.grass }))
    );
    this.generate();
  }

  generate() {
    this.paintClusters('soil', 50, 100);
    this.paintClusters('rock', 38, 70);
    this.paintClusters('water', 26, 55);

    // Blend leftovers with mild randomization.
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.tiles[y][x].type !== 'grass') continue;
        if (Math.random() < 0.15) this.tiles[y][x] = { ...TILE_DEFS.soil };
      }
    }
  }

  paintClusters(type, seedCount, maxSteps) {
    for (let i = 0; i < seedCount; i++) {
      let x = Math.floor(Math.random() * this.width);
      let y = Math.floor(Math.random() * this.height);
      const steps = Math.floor(maxSteps * (0.45 + Math.random() * 0.55));

      for (let s = 0; s < steps; s++) {
        this.setTile(x, y, type);
        x += Math.floor(Math.random() * 3) - 1;
        y += Math.floor(Math.random() * 3) - 1;
        x = clamp(x, 0, this.width - 1);
        y = clamp(y, 0, this.height - 1);
      }
    }
  }

  getTile(x, y) {
    if (!this.inBounds(x, y)) return null;
    return this.tiles[y][x];
  }

  setTile(x, y, type) {
    if (!this.inBounds(x, y) || !TILE_DEFS[type]) return;
    this.tiles[y][x] = { ...TILE_DEFS[type] };
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  isWalkable(x, y) {
    const tile = this.getTile(x, y);
    return !!tile && tile.walkable;
  }

  findNearestWalkable(x, y, radius = 10) {
    if (this.isWalkable(x, y)) return { x, y };

    for (let r = 1; r <= radius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (this.isWalkable(nx, ny)) return { x: nx, y: ny };
        }
      }
    }
    return null;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
