import { findNearestWalkable } from '../world/map.js';

const NAMES = ['Ada', 'Jon', 'Mira', 'Sia', 'Tao', 'Niko'];

export function createColonists(map, count = 3) {
  const colonists = [];

  for (let i = 0; i < count; i++) {
    const spawn = randomWalkableSpawn(map);
    colonists.push({
      id: i + 1,
      name: NAMES[i % NAMES.length],
      x: spawn.x,
      y: spawn.y,
      px: spawn.x,
      py: spawn.y,
      hunger: Math.random() * 0.2,
      mood: 0.8 + Math.random() * 0.2,
      currentJob: 'wander',
      jobData: null,
      path: [],
      moveProgress: 0,
      miningProgress: 0,
      color: ['#f25f5c', '#ffe066', '#70c1b3'][i % 3]
    });
  }

  return colonists;
}

function randomWalkableSpawn(map) {
  for (let i = 0; i < 200; i++) {
    const x = Math.floor(Math.random() * map.width);
    const y = Math.floor(Math.random() * map.height);
    const found = findNearestWalkable(map, x, y, 4);
    if (found) return found;
  }
  return { x: 1, y: 1 };
}
