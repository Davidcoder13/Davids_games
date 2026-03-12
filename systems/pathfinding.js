import { isWalkable } from '../world/map.js';

const DIRS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];

function heuristic(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function nodeKey(x, y) {
  return `${x},${y}`;
}

export function findPath(map, start, goal, maxIterations = 4000) {
  if (!isWalkable(map, start.x, start.y) || !isWalkable(map, goal.x, goal.y)) {
    return [];
  }

  const open = [{ x: start.x, y: start.y, g: 0, h: heuristic(start, goal), parent: null }];
  const openMap = new Map([[nodeKey(start.x, start.y), open[0]]]);
  const closed = new Set();

  let iterations = 0;

  while (open.length > 0 && iterations < maxIterations) {
    iterations++;

    open.sort((a, b) => (a.g + a.h) - (b.g + b.h));
    const current = open.shift();
    openMap.delete(nodeKey(current.x, current.y));

    if (current.x === goal.x && current.y === goal.y) {
      const path = [];
      let n = current;
      while (n.parent) {
        path.push({ x: n.x, y: n.y });
        n = n.parent;
      }
      path.reverse();
      return path;
    }

    closed.add(nodeKey(current.x, current.y));

    for (const d of DIRS) {
      const nx = current.x + d.x;
      const ny = current.y + d.y;
      const key = nodeKey(nx, ny);

      if (!isWalkable(map, nx, ny) || closed.has(key)) continue;

      const g = current.g + 1;
      const h = heuristic({ x: nx, y: ny }, goal);
      const existing = openMap.get(key);

      if (!existing || g < existing.g) {
        const nextNode = { x: nx, y: ny, g, h, parent: current };
        if (!existing) open.push(nextNode);
        else Object.assign(existing, nextNode);
        openMap.set(key, nextNode);
      }
    }
  }

  return [];
}
