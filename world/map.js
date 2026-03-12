import { TILE_TYPES } from './tiles.js';

export const MAP_WIDTH = 100;
export const MAP_HEIGHT = 100;

/**
 * Build a 100x100 world map with basic terrain noise.
 */
export function createMap(width = MAP_WIDTH, height = MAP_HEIGHT) {
  const tiles = Array.from({ length: height }, () => Array(width).fill('grass'));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const r = Math.random();
      if (r < 0.1) tiles[y][x] = 'water';
      else if (r < 0.22) tiles[y][x] = 'rock';
      else if (r < 0.55) tiles[y][x] = 'soil';
      else tiles[y][x] = 'grass';
    }
  }

  return {
    width,
    height,
    tiles,
    miningOrders: new Set()
  };
}

export function keyFromXY(x, y) {
  return `${x},${y}`;
}

export function getTile(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return map.tiles[y][x];
}

export function setTile(map, x, y, type) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
  map.tiles[y][x] = type;
}

export function isWalkable(map, x, y) {
  const tile = getTile(map, x, y);
  return tile ? TILE_TYPES[tile].walkable : false;
}

/**
 * Find a walkable tile nearest to a desired position.
 */
export function findNearestWalkable(map, x, y, maxRadius = 12) {
  if (isWalkable(map, x, y)) return { x, y };

  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (isWalkable(map, nx, ny)) return { x: nx, y: ny };
      }
    }
  }

  return null;
}
