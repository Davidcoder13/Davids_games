import { findPath } from './pathfinding.js';
import { getTile, keyFromXY, setTile, findNearestWalkable } from '../world/map.js';

const MOVE_SPEED_TILES_PER_SEC = 3.2;
const MINE_TIME_SEC = 2.0;

export function updateColonists(state, dt) {
  for (const colonist of state.colonists) {
    colonist.hunger = Math.min(1, colonist.hunger + dt * 0.01);
    colonist.mood = Math.max(0, colonist.mood - colonist.hunger * dt * 0.002);

    if (colonist.currentJob === 'mine') {
      runMineJob(state, colonist, dt);
      continue;
    }

    if (colonist.path.length > 0) {
      moveAlongPath(colonist, dt);
      continue;
    }

    if (tryAssignMineJob(state, colonist)) continue;

    assignWander(state, colonist);
  }
}

function moveAlongPath(colonist, dt) {
  if (colonist.path.length === 0) return;
  colonist.moveProgress += MOVE_SPEED_TILES_PER_SEC * dt;

  while (colonist.moveProgress >= 1 && colonist.path.length > 0) {
    const step = colonist.path.shift();
    colonist.px = colonist.x;
    colonist.py = colonist.y;
    colonist.x = step.x;
    colonist.y = step.y;
    colonist.moveProgress -= 1;
  }
}

function tryAssignMineJob(state, colonist) {
  let bestOrder = null;
  let bestPath = null;

  for (const order of state.map.miningOrders) {
    const [rx, ry] = order.split(',').map(Number);
    if (getTile(state.map, rx, ry) !== 'rock') continue;

    const stand = findNearestWalkable(state.map, rx, ry, 1);
    if (!stand) continue;

    const path = findPath(state.map, { x: colonist.x, y: colonist.y }, stand);
    if (path.length === 0 && (colonist.x !== stand.x || colonist.y !== stand.y)) continue;

    if (!bestPath || path.length < bestPath.length) {
      bestPath = path;
      bestOrder = { key: order, rx, ry, stand };
    }
  }

  if (!bestOrder) return false;

  colonist.currentJob = 'mine';
  colonist.jobData = bestOrder;
  colonist.path = bestPath || [];
  colonist.miningProgress = 0;
  return true;
}

function runMineJob(state, colonist, dt) {
  const job = colonist.jobData;
  if (!job) {
    colonist.currentJob = 'wander';
    return;
  }

  if (colonist.path.length > 0) {
    moveAlongPath(colonist, dt);
    return;
  }

  const atStand = colonist.x === job.stand.x && colonist.y === job.stand.y;
  if (!atStand) {
    colonist.currentJob = 'wander';
    colonist.jobData = null;
    return;
  }

  if (getTile(state.map, job.rx, job.ry) !== 'rock') {
    state.map.miningOrders.delete(job.key);
    colonist.currentJob = 'haul';
    colonist.jobData = null;
    return;
  }

  colonist.miningProgress += dt;
  if (colonist.miningProgress >= MINE_TIME_SEC) {
    setTile(state.map, job.rx, job.ry, 'soil');
    state.map.miningOrders.delete(keyFromXY(job.rx, job.ry));
    state.inventory.stone += 1;
    colonist.currentJob = 'haul';
    colonist.jobData = null;
    colonist.path = [];
    colonist.miningProgress = 0;
  }
}

function assignWander(state, colonist) {
  const rx = colonist.x + Math.floor(Math.random() * 13) - 6;
  const ry = colonist.y + Math.floor(Math.random() * 13) - 6;
  const target = findNearestWalkable(state.map, rx, ry, 6);
  colonist.currentJob = 'wander';
  colonist.jobData = null;
  colonist.path = target ? findPath(state.map, { x: colonist.x, y: colonist.y }, target) : [];
}
