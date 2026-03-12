export class Colonist {
  constructor(id, name, x, y, color) {
    this.id = id;
    this.name = name;
    this.x = x;
    this.y = y;
    this.hunger = Math.random() * 0.2;
    this.mood = 0.9;
    this.currentJob = 'wander';
    this.path = [];

    // Internal state used by systems.
    this.job = null;
    this.moveBuffer = 0;
    this.mineProgress = 0;
    this.color = color;
  }
}

export function spawnColonists(map, count = 3) {
  const names = ['Ada', 'Mira', 'Jon', 'Tao', 'Sia', 'Niko'];
  const colors = ['#f25f5c', '#ffe066', '#70c1b3', '#9d79d6', '#ff9f1c', '#6ecbff'];
  const colonists = [];

  for (let i = 0; i < count; i++) {
    const x = Math.floor(map.width * 0.5) + (Math.floor(Math.random() * 11) - 5);
    const y = Math.floor(map.height * 0.5) + (Math.floor(Math.random() * 11) - 5);
    const spawn = map.findNearestWalkable(x, y, 10) || { x: 1 + i, y: 1 };
    colonists.push(new Colonist(i + 1, names[i % names.length], spawn.x, spawn.y, colors[i % colors.length]));
  }

  return colonists;
}
