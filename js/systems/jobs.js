import { findPathAStar } from './pathfinding.js';

const MOVE_SPEED = 3.5; // tiles per second
const HUNGER_RATE = 0.01;

export class JobSystem {
  constructor(map, resourceSystem) {
    this.map = map;
    this.resourceSystem = resourceSystem;
    this.miningOrders = new Map(); // key -> {type,targetTile,priority}
  }

  markMining(tileX, tileY) {
    const tile = this.map.getTile(tileX, tileY);
    if (!tile || !tile.mineable || tile.type !== 'rock') return;

    const job = {
      type: 'mine',
      targetTile: { x: tileX, y: tileY },
      priority: 100
    };
    this.miningOrders.set(key(tileX, tileY), job);
  }

  update(colonists, dt) {
    for (const c of colonists) {
      c.hunger = Math.min(1, c.hunger + HUNGER_RATE * dt);
      c.mood = Math.max(0, c.mood - c.hunger * 0.002 * dt);

      if (!c.job) {
        c.job = this.pickJobForColonist(c);
        c.currentJob = c.job?.type ?? 'wander';
      }

      if (c.job?.type === 'mine') {
        this.runMineJob(c, dt);
      } else if (c.job?.type === 'haul') {
        this.runHaulJob(c);
      } else {
        this.runWanderJob(c, dt);
      }
    }
  }

  pickJobForColonist(colonist) {
    let best = null;
    let bestPath = null;

    for (const job of this.miningOrders.values()) {
      const standTile = this.map.findNearestWalkable(job.targetTile.x, job.targetTile.y, 1);
      if (!standTile) continue;

      const path = findPathAStar(this.map, { x: colonist.x, y: colonist.y }, standTile);
      const alreadyThere = colonist.x === standTile.x && colonist.y === standTile.y;
      if (path.length === 0 && !alreadyThere) continue;

      if (!best || job.priority > best.priority || (job.priority === best.priority && path.length < bestPath.length)) {
        best = { ...job, standTile };
        bestPath = path;
      }
    }

    if (best) {
      colonist.path = bestPath ?? [];
      colonist.mineProgress = 0;
      return best;
    }

    // Default autonomous job.
    const wanderTarget = this.map.findNearestWalkable(
      colonist.x + Math.floor(Math.random() * 13) - 6,
      colonist.y + Math.floor(Math.random() * 13) - 6,
      8
    );

    if (wanderTarget) {
      colonist.path = findPathAStar(this.map, { x: colonist.x, y: colonist.y }, wanderTarget);
    } else {
      colonist.path = [];
    }

    return {
      type: 'wander',
      targetTile: wanderTarget,
      priority: 1
    };
  }

  runMineJob(colonist, dt) {
    // 1) Reach stand position next to rock.
    if (colonist.path.length > 0) {
      moveColonistAlongPath(colonist, dt);
      return;
    }

    const { targetTile, standTile } = colonist.job;
    if (!standTile || colonist.x !== standTile.x || colonist.y !== standTile.y) {
      colonist.job = null;
      return;
    }

    const target = this.map.getTile(targetTile.x, targetTile.y);
    if (!target || target.type !== 'rock') {
      this.miningOrders.delete(key(targetTile.x, targetTile.y));
      colonist.job = { type: 'haul', targetTile, priority: 30 };
      colonist.currentJob = 'haul';
      return;
    }

    // 2) Mine over time based on hardness.
    const mineTime = Math.max(0.6, target.hardness * 0.8);
    colonist.mineProgress += dt;

    if (colonist.mineProgress >= mineTime) {
      this.map.setTile(targetTile.x, targetTile.y, 'soil');
      this.miningOrders.delete(key(targetTile.x, targetTile.y));
      this.resourceSystem.addStone(1);

      colonist.mineProgress = 0;
      colonist.job = { type: 'haul', targetTile, priority: 25 };
      colonist.currentJob = 'haul';
    }
  }

  runHaulJob(colonist) {
    // MVP hauling state machine placeholder: short transition before next job.
    colonist.job = null;
    colonist.currentJob = 'haul';
  }

  runWanderJob(colonist, dt) {
    if (colonist.path.length > 0) {
      moveColonistAlongPath(colonist, dt);
      return;
    }

    colonist.job = null;
  }
}

function moveColonistAlongPath(colonist, dt) {
  colonist.moveBuffer += MOVE_SPEED * dt;
  while (colonist.moveBuffer >= 1 && colonist.path.length > 0) {
    const next = colonist.path.shift();
    colonist.x = next.x;
    colonist.y = next.y;
    colonist.moveBuffer -= 1;
  }
}

function key(x, y) {
  return `${x},${y}`;
}
