/**
 * Grid A* pathfinding (4-direction). Returns list of tile steps excluding start.
 */
export function findPathAStar(map, start, goal, maxIterations = 10000) {
  if (!map.isWalkable(start.x, start.y) || !map.isWalkable(goal.x, goal.y)) return [];

  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];

  const open = [];
  const openByKey = new Map();
  const closed = new Set();

  const startNode = {
    x: start.x,
    y: start.y,
    g: 0,
    h: heuristic(start.x, start.y, goal.x, goal.y),
    parent: null
  };

  open.push(startNode);
  openByKey.set(key(start.x, start.y), startNode);

  let steps = 0;

  while (open.length > 0 && steps < maxIterations) {
    steps++;
    open.sort((a, b) => (a.g + a.h) - (b.g + b.h));
    const current = open.shift();
    openByKey.delete(key(current.x, current.y));

    if (current.x === goal.x && current.y === goal.y) {
      return reconstructPath(current);
    }

    closed.add(key(current.x, current.y));

    for (const d of dirs) {
      const nx = current.x + d.x;
      const ny = current.y + d.y;
      const nk = key(nx, ny);
      if (!map.isWalkable(nx, ny) || closed.has(nk)) continue;

      const g = current.g + 1;
      const h = heuristic(nx, ny, goal.x, goal.y);
      const existing = openByKey.get(nk);

      if (!existing || g < existing.g) {
        const node = { x: nx, y: ny, g, h, parent: current };
        if (!existing) open.push(node);
        else Object.assign(existing, node);
        openByKey.set(nk, node);
      }
    }
  }

  return [];
}

function reconstructPath(goalNode) {
  const path = [];
  let current = goalNode;
  while (current.parent) {
    path.push({ x: current.x, y: current.y });
    current = current.parent;
  }
  path.reverse();
  return path;
}

function heuristic(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function key(x, y) {
  return `${x},${y}`;
}
