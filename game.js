(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const ui = {
    day: document.getElementById('dayLabel'),
    week: document.getElementById('weekLabel'),
    roads: document.getElementById('roadsLabel'),
    score: document.getElementById('scoreLabel'),
    status: document.getElementById('statusLabel'),
    upgradePanel: document.getElementById('upgradePanel'),
    upgradeChoices: document.getElementById('upgradeChoices'),
    gameOverPanel: document.getElementById('gameOverPanel'),
    gameOverReason: document.getElementById('gameOverReason'),
    restartBtn: document.getElementById('restartBtn'),
  };

  const SAVE_KEY = 'transit-tangle-rework-v1';
  const COLORS = ['#0AACAE', '#DB0D2B', '#F6D6AD', '#27AC41', '#FFC832'];
  const CONFIG = {
    cell: 30,
    topPad: 96,
    sidePad: 44,
    initRoads: 145,
    initBridges: 3,
    daySeconds: 15,
    weekDays: 7,
    speedCellsSec: 3.2,
    spawnBase: 0.12,
    spawnGrowth: 0.024,
    failJam: 56,
    startPairs: 5,
    maxCarsPerColorBase: 7,
    congestionDecay: 0.02,
  };

  const upgrades = [
    { label: '+24 Roads', apply: (s) => (s.maxRoadSegments += 24) },
    { label: '+3 Bridges', apply: (s) => (s.bridgeCredits += 3) },
    { label: 'Traffic Lights', apply: (s) => s.lightLevel++ },
    { label: 'Roundabouts', apply: (s) => s.roundaboutLevel++ },
  ];

  const state = {
    width: innerWidth,
    height: innerHeight,
    cols: 0,
    rows: 0,
    roads: new Set(),
    bridges: new Set(),
    intersections: new Set(),
    river: new Set(),
    houses: [],
    stores: [],
    cars: [],
    particles: [],
    decor: [],
    clouds: [],
    usedRoads: 0,
    maxRoadSegments: CONFIG.initRoads,
    bridgeCredits: CONFIG.initBridges,
    day: 1,
    week: 1,
    elapsed: 0,
    score: 0,
    congestion: 0,
    lightLevel: 0,
    roundaboutLevel: 0,
    running: true,
    pausedForUpgrade: false,
    pointerDown: false,
    dragPath: [],
    lastAutoSave: 0,
  };

  let id = 1;
  const nextId = () => id++;
  const k = (x, y) => `${x},${y}`;
  const fromKey = (s) => ({ x: Number(s.split(',')[0]), y: Number(s.split(',')[1]) });

  function inBounds(x, y) {
    return x >= 0 && y >= 0 && x < state.cols && y < state.rows;
  }

  function resize() {
    state.width = innerWidth;
    state.height = innerHeight;
    canvas.width = state.width;
    canvas.height = state.height;
    state.cols = Math.max(16, Math.floor((state.width - CONFIG.sidePad * 2) / CONFIG.cell));
    state.rows = Math.max(12, Math.floor((state.height - CONFIG.topPad - 24) / CONFIG.cell));
  }

  function toGrid(px, py) {
    return {
      x: Math.floor((px - CONFIG.sidePad) / CONFIG.cell),
      y: Math.floor((py - CONFIG.topPad) / CONFIG.cell),
    };
  }

  function toWorld(cx, cy) {
    return {
      x: CONFIG.sidePad + cx * CONFIG.cell + CONFIG.cell * 0.5,
      y: CONFIG.topPad + cy * CONFIG.cell + CONFIG.cell * 0.5,
    };
  }

  function neighbors(x, y) {
    return [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ].filter((n) => inBounds(n.x, n.y));
  }

  function roadNeighbors(x, y) {
    return neighbors(x, y).filter((n) => state.roads.has(k(n.x, n.y)));
  }

  function isRiver(x, y) {
    return state.river.has(k(x, y));
  }

  function randomCell() {
    return { x: Math.floor(Math.random() * state.cols), y: Math.floor(Math.random() * state.rows) };
  }

  function initRiver() {
    state.river.clear();
    const cStart = Math.floor(state.cols * (0.34 + Math.random() * 0.2));
    const width = 2 + Math.floor(Math.random() * 2);
    for (let c = cStart; c < cStart + width; c++) {
      for (let y = 0; y < state.rows; y++) state.river.add(k(c, y));
    }
  }

  function initDecor() {
    state.decor = [];
    state.clouds = [];
    for (let i = 0; i < 110; i++) {
      const c = randomCell();
      if (!isRiver(c.x, c.y)) {
        const w = toWorld(c.x, c.y);
        state.decor.push({ x: w.x + (Math.random() - 0.5) * 8, y: w.y + (Math.random() - 0.5) * 8, r: 2 + Math.random() * 5, a: 0.14 + Math.random() * 0.25 });
      }
    }
    for (let i = 0; i < 10; i++) {
      state.clouds.push({ x: Math.random() * state.width, y: 30 + Math.random() * 140, w: 70 + Math.random() * 80, v: 0.15 + Math.random() * 0.4 });
    }
  }

  function safeCell(placed) {
    for (let i = 0; i < 500; i++) {
      const c = randomCell();
      if (isRiver(c.x, c.y)) continue;
      if (placed.some((p) => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < 4)) continue;
      return c;
    }
    return { x: 1, y: 1 };
  }

  function spawnBuildings() {
    state.houses = [];
    state.stores = [];
    const placed = [];
    for (let i = 0; i < CONFIG.startPairs; i++) {
      const color = COLORS[i % COLORS.length];
      const h = safeCell(placed);
      placed.push(h);
      const s = safeCell(placed);
      placed.push(s);
      state.houses.push({ id: nextId(), color, cell: h, queue: 0, timer: 2 + Math.random() * 5 });
      state.stores.push({ id: nextId(), color, cell: s });
    }
  }

  function updateIntersections() {
    state.intersections.clear();
    for (const key of state.roads) {
      const c = fromKey(key);
      if (roadNeighbors(c.x, c.y).length >= 3) state.intersections.add(key);
    }
  }

  function addRoad(x, y) {
    const key = k(x, y);
    if (state.roads.has(key)) return true;
    if (state.usedRoads >= state.maxRoadSegments) return false;
    if (isRiver(x, y)) {
      if (state.bridgeCredits <= 0) return false;
      state.bridgeCredits--;
      state.bridges.add(key);
    }
    state.roads.add(key);
    state.usedRoads++;
    state.particles.push({ x: toWorld(x, y).x, y: toWorld(x, y).y, life: 0.45, c: '#ed6f7e' });
    updateIntersections();
    return true;
  }

  function removeRoad(x, y) {
    const key = k(x, y);
    if (!state.roads.has(key)) return;
    state.roads.delete(key);
    state.usedRoads = Math.max(0, state.usedRoads - 1);
    if (state.bridges.has(key)) {
      state.bridges.delete(key);
      state.bridgeCredits++;
    }
    updateIntersections();
  }

  function orthPath(a, b) {
    const p = [{ x: a.x, y: a.y }];
    let x = a.x;
    let y = a.y;
    while (x !== b.x) {
      x += x < b.x ? 1 : -1;
      p.push({ x, y });
    }
    while (y !== b.y) {
      y += y < b.y ? 1 : -1;
      p.push({ x, y });
    }
    return p;
  }

  function bfs(start, end) {
    if (!state.roads.has(k(start.x, start.y)) || !state.roads.has(k(end.x, end.y))) return null;
    const q = [start];
    const prev = new Map();
    const seen = new Set([k(start.x, start.y)]);
    while (q.length) {
      const cur = q.shift();
      const ck = k(cur.x, cur.y);
      if (cur.x === end.x && cur.y === end.y) break;
      for (const n of roadNeighbors(cur.x, cur.y).sort((a, b) => roadNeighbors(b.x, b.y).length - roadNeighbors(a.x, a.y).length)) {
        const nk = k(n.x, n.y);
        if (seen.has(nk)) continue;
        seen.add(nk);
        prev.set(nk, ck);
        q.push(n);
      }
    }
    const endK = k(end.x, end.y);
    if (!seen.has(endK)) return null;
    const path = [];
    let cursor = endK;
    while (cursor) {
      path.push(fromKey(cursor));
      if (cursor === k(start.x, start.y)) break;
      cursor = prev.get(cursor);
    }
    return path.reverse();
  }

  function emitSpark(x, y, color = '#ffffff') {
    for (let i = 0; i < 4; i++) {
      state.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 30,
        life: 0.35 + Math.random() * 0.2,
        c: color,
      });
    }
  }

  function createCar(house) {
    const store = state.stores.find((s) => s.color === house.color);
    if (!store) return;
    const route = bfs(house.cell, store.cell);
    if (!route || route.length < 2) {
      house.queue++;
      state.congestion += 0.12;
      return;
    }
    const p = toWorld(house.cell.x, house.cell.y);
    state.cars.push({
      id: nextId(),
      color: house.color,
      x: p.x,
      y: p.y,
      angle: 0,
      phase: 'toStore',
      from: house,
      to: store,
      path: route,
      idx: 0,
      t: 0,
      wait: 0,
    });
  }

  function spawnCars(dt) {
    const scale = CONFIG.spawnBase + CONFIG.spawnGrowth * (state.week - 1);
    const cap = CONFIG.maxCarsPerColorBase + state.week;
    for (const h of state.houses) {
      h.timer -= dt;
      const active = state.cars.filter((c) => c.color === h.color).length;
      if (h.timer <= 0 && active < cap) {
        createCar(h);
        h.timer = (1.8 + Math.random() * 6.2) / scale;
      }
    }
  }

  function updateCars(dt) {
    const occ = new Map();
    const nodeWait = Math.max(0.04, 0.24 - state.lightLevel * 0.03 - state.roundaboutLevel * 0.018);
    for (const car of state.cars) {
      const a = car.path[car.idx];
      const b = car.path[car.idx + 1];
      if (!a || !b) continue;
      const aw = toWorld(a.x, a.y);
      const bw = toWorld(b.x, b.y);
      const seg = Math.hypot(bw.x - aw.x, bw.y - aw.y);
      const ok = k(a.x, a.y);
      occ.set(ok, (occ.get(ok) || 0) + 1);
      if (occ.get(ok) > 1 + state.lightLevel) car.wait += dt * 0.8;
      if (car.wait < nodeWait) {
        car.wait += dt;
        continue;
      }
      car.t += (CONFIG.speedCellsSec * CONFIG.cell * dt) / Math.max(1, seg);
      car.x = aw.x + (bw.x - aw.x) * car.t;
      car.y = aw.y + (bw.y - aw.y) * car.t;
      car.angle = Math.atan2(bw.y - aw.y, bw.x - aw.x);
      if (car.t >= 1) {
        car.idx++;
        car.t = 0;
        car.wait = 0;
        if (car.idx >= car.path.length - 1) {
          if (car.phase === 'toStore') {
            emitSpark(car.x, car.y, '#0AACAE');
            car.phase = 'toHome';
            const back = bfs(car.to.cell, car.from.cell);
            if (!back || back.length < 2) {
              state.congestion += 0.2;
              car.dead = true;
            } else {
              car.path = back;
              car.idx = 0;
            }
          } else {
            state.score++;
            emitSpark(car.x, car.y, '#FFC832');
            car.dead = true;
          }
        }
      }
    }
    state.cars = state.cars.filter((c) => !c.dead);
    for (const h of state.houses) {
      if (h.queue > 0 && h.timer < 0.9) {
        createCar(h);
        h.queue--;
      }
    }
    const jam = [...occ.values()].filter((v) => v >= 3).length;
    state.congestion += jam * dt * 0.04;
    state.congestion = Math.max(0, state.congestion - dt * CONFIG.congestionDecay);
  }

  function addColorPair() {
    if (state.houses.length >= COLORS.length * 2) return;
    const placed = [...state.houses.map((h) => h.cell), ...state.stores.map((s) => s.cell)];
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    state.houses.push({ id: nextId(), color, cell: safeCell(placed), queue: 0, timer: 2.4 });
    state.stores.push({ id: nextId(), color, cell: safeCell(placed) });
  }

  function showUpgrades() {
    state.pausedForUpgrade = true;
    ui.upgradeChoices.innerHTML = '';
    for (const up of [...upgrades].sort(() => Math.random() - 0.5).slice(0, 3)) {
      const b = document.createElement('button');
      b.textContent = up.label;
      b.onclick = () => {
        up.apply(state);
        ui.upgradePanel.classList.add('hidden');
        state.pausedForUpgrade = false;
        save();
      };
      ui.upgradeChoices.appendChild(b);
    }
    ui.upgradePanel.classList.remove('hidden');
  }

  function updateTime(dt) {
    state.elapsed += dt;
    const d = Math.floor(state.elapsed / CONFIG.daySeconds) + 1;
    if (d <= state.day) return;
    state.day = d;
    if ((state.day - 1) % CONFIG.weekDays === 0) {
      state.week++;
      showUpgrades();
    }
    if (state.day % 3 === 0) addColorPair();
  }

  function checkFail() {
    if (state.congestion < CONFIG.failJam) return;
    state.running = false;
    ui.gameOverReason.textContent = `Congestion reached ${state.congestion.toFixed(1)}. Expand capacity and split routes earlier.`;
    ui.gameOverPanel.classList.remove('hidden');
  }

  // Textures
  function hatchPattern(colorA = '#eadcbc', colorB = '#f4ebd7') {
    const c = document.createElement('canvas');
    c.width = 22;
    c.height = 22;
    const g = c.getContext('2d');
    g.fillStyle = colorB;
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = colorA;
    g.lineWidth = 1;
    for (let i = -22; i < 44; i += 6) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 22, 22);
      g.stroke();
    }
    return ctx.createPattern(c, 'repeat');
  }

  const landPattern = hatchPattern('#eac083', '#f6d6ad');

  function drawBackground(t) {
    const grad = ctx.createLinearGradient(0, 0, 0, state.height);
    grad.addColorStop(0, '#f8dfb8');
    grad.addColorStop(1, '#f0c98d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, state.width, state.height);

    for (const c of state.clouds) {
      c.x += c.v;
      if (c.x - c.w > state.width) c.x = -100;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#fff2d9';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.w * 0.46, c.w * 0.18, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + c.w * 0.22, c.y + 1, c.w * 0.33, c.w * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const mapW = state.cols * CONFIG.cell;
    const mapH = state.rows * CONFIG.cell;
    ctx.fillStyle = landPattern;
    ctx.fillRect(CONFIG.sidePad, CONFIG.topPad, mapW, mapH);

    ctx.strokeStyle = '#e1b56e';
    ctx.lineWidth = 1;
    for (let c = 0; c <= state.cols; c++) {
      const x = CONFIG.sidePad + c * CONFIG.cell;
      ctx.beginPath();
      ctx.moveTo(x, CONFIG.topPad);
      ctx.lineTo(x, CONFIG.topPad + mapH);
      ctx.stroke();
    }
    for (let r = 0; r <= state.rows; r++) {
      const y = CONFIG.topPad + r * CONFIG.cell;
      ctx.beginPath();
      ctx.moveTo(CONFIG.sidePad, y);
      ctx.lineTo(CONFIG.sidePad + mapW, y);
      ctx.stroke();
    }

    // water animation
    for (const key of state.river) {
      const c = fromKey(key);
      const p = toWorld(c.x, c.y);
      ctx.fillStyle = '#0AACAE';
      ctx.fillRect(p.x - CONFIG.cell * 0.5, p.y - CONFIG.cell * 0.5, CONFIG.cell, CONFIG.cell);
      ctx.strokeStyle = '#7fe1e2';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const y = p.y + Math.sin((t * 0.003) + c.y * 0.2) * 2;
      ctx.moveTo(p.x - 10, y);
      ctx.lineTo(p.x + 10, y + 1);
      ctx.stroke();
    }

    for (const d of state.decor) {
      ctx.fillStyle = `rgba(39,172,65,${d.a})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRoads() {
    const w = CONFIG.cell * 0.34;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // drop-shadow pass
    ctx.strokeStyle = '#b08e5399';
    ctx.lineWidth = w + 5;
    for (const key of state.roads) {
      const c = fromKey(key);
      const from = toWorld(c.x, c.y);
      for (const n of roadNeighbors(c.x, c.y)) {
        if (n.x < c.x || (n.x === c.x && n.y < c.y)) continue;
        const to = toWorld(n.x, n.y);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = '#fff3de';
    ctx.lineWidth = w;
    for (const key of state.roads) {
      const c = fromKey(key);
      const from = toWorld(c.x, c.y);
      for (const n of roadNeighbors(c.x, c.y)) {
        if (n.x < c.x || (n.x === c.x && n.y < c.y)) continue;
        const to = toWorld(n.x, n.y);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = '#0AACAE';
    ctx.lineWidth = w * 0.88;
    for (const key of state.bridges) {
      const c = fromKey(key);
      const from = toWorld(c.x, c.y);
      for (const n of roadNeighbors(c.x, c.y)) {
        if (n.x < c.x || (n.x === c.x && n.y < c.y)) continue;
        const to = toWorld(n.x, n.y);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }

    for (const key of state.roads) {
      const c = fromKey(key);
      const center = toWorld(c.x, c.y);
      const ns = roadNeighbors(c.x, c.y);
      ctx.fillStyle = state.bridges.has(key) ? '#0AACAE' : '#fff3de';
      ctx.beginPath();
      ctx.arc(center.x, center.y, w * 0.5, 0, Math.PI * 2);
      ctx.fill();

      if (ns.length === 2) {
        const d1 = { x: ns[0].x - c.x, y: ns[0].y - c.y };
        const d2 = { x: ns[1].x - c.x, y: ns[1].y - c.y };
        if (d1.x !== d2.x && d1.y !== d2.y) {
          const p1 = { x: center.x + d1.x * CONFIG.cell * 0.5, y: center.y + d1.y * CONFIG.cell * 0.5 };
          const p2 = { x: center.x + d2.x * CONFIG.cell * 0.5, y: center.y + d2.y * CONFIG.cell * 0.5 };
          ctx.strokeStyle = '#fff3de';
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.quadraticCurveTo(center.x, center.y, p2.x, p2.y);
          ctx.stroke();
        }
      }
    }

    ctx.strokeStyle = '#e4bf7f';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 6]);
    for (const key of state.roads) {
      const c = fromKey(key);
      const from = toWorld(c.x, c.y);
      for (const n of roadNeighbors(c.x, c.y)) {
        if (n.x < c.x || (n.x === c.x && n.y < c.y)) continue;
        const to = toWorld(n.x, n.y);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    for (const key of state.intersections) {
      const c = fromKey(key);
      const p = toWorld(c.x, c.y);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#5b4423';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (state.dragPath.length > 1) {
      ctx.strokeStyle = '#DB0D2B';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      const s = toWorld(state.dragPath[0].x, state.dragPath[0].y);
      ctx.moveTo(s.x, s.y);
      for (let i = 1; i < state.dragPath.length; i++) {
        const p = toWorld(state.dragPath[i].x, state.dragPath[i].y);
        const prev = toWorld(state.dragPath[i - 1].x, state.dragPath[i - 1].y);
        const mx = (prev.x + p.x) * 0.5;
        const my = (prev.y + p.y) * 0.5;
        ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawBuildings() {
    for (const h of state.houses) {
      const p = toWorld(h.cell.x, h.cell.y);
      ctx.fillStyle = h.color;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 13);
      ctx.lineTo(p.x - 12, p.y - 2);
      ctx.lineTo(p.x + 12, p.y - 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(p.x - 9, p.y - 2, 18, 12);
      if (h.queue > 0) {
        ctx.fillStyle = '#4b381d';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(String(h.queue), p.x + 12, p.y + 4);
      }
    }
    for (const s of state.stores) {
      const p = toWorld(s.cell.x, s.cell.y);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.roundRect(p.x - 12, p.y - 12, 24, 24, 7);
      ctx.fill();
      ctx.fillStyle = '#fff0ce';
      ctx.fillRect(p.x - 8, p.y - 2, 16, 4);
      ctx.fillRect(p.x - 2, p.y - 8, 4, 16);
    }
  }

  function drawCars() {
    for (const c of state.cars) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.fillStyle = '#7c5a222f';
      ctx.beginPath();
      ctx.roundRect(-5, -1, 13, 8, 3);
      ctx.fill();
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.roundRect(-6, -3, 13, 8, 3);
      ctx.fill();
      ctx.fillStyle = '#fff0cf';
      ctx.fillRect(-1, -2, 4, 2);
      ctx.restore();
    }
  }

  function drawParticles(dt) {
    for (const p of state.particles) {
      p.life -= dt;
      p.x += (p.vx || 0) * dt;
      p.y += (p.vy || 0) * dt;
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  function draw(now, dt) {
    ctx.clearRect(0, 0, state.width, state.height);
    drawBackground(now);
    drawRoads();
    drawBuildings();
    drawCars();
    drawParticles(dt);
  }

  function updateUI() {
    ui.day.textContent = `Day ${state.day}`;
    ui.week.textContent = `W${state.week}`;
    ui.roads.textContent = `Roads: ${state.usedRoads} / ${state.maxRoadSegments} • Bridges: ${state.bridgeCredits}`;
    ui.score.textContent = `Trips: ${state.score}`;
    const r = state.congestion / CONFIG.failJam;
    ui.status.textContent = r < 0.45 ? 'Status: Flowing' : r < 0.8 ? 'Status: Heavy Traffic' : 'Status: Critical';
  }

  function save() {
    const out = {
      cols: state.cols,
      rows: state.rows,
      roads: [...state.roads],
      bridges: [...state.bridges],
      intersections: [...state.intersections],
      river: [...state.river],
      houses: state.houses,
      stores: state.stores,
      usedRoads: state.usedRoads,
      maxRoadSegments: state.maxRoadSegments,
      bridgeCredits: state.bridgeCredits,
      day: state.day,
      week: state.week,
      elapsed: state.elapsed,
      score: state.score,
      congestion: state.congestion,
      lightLevel: state.lightLevel,
      roundaboutLevel: state.roundaboutLevel,
      decor: state.decor,
      clouds: state.clouds,
      // TODO(level-mode): persist mission goals and scripted event timeline here.
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(out));
  }

  function load() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      const d = JSON.parse(raw);
      state.cols = d.cols;
      state.rows = d.rows;
      state.roads = new Set(d.roads || []);
      state.bridges = new Set(d.bridges || []);
      state.intersections = new Set(d.intersections || []);
      state.river = new Set(d.river || []);
      state.houses = d.houses || [];
      state.stores = d.stores || [];
      state.usedRoads = d.usedRoads || 0;
      state.maxRoadSegments = d.maxRoadSegments || CONFIG.initRoads;
      state.bridgeCredits = d.bridgeCredits ?? CONFIG.initBridges;
      state.day = d.day || 1;
      state.week = d.week || 1;
      state.elapsed = d.elapsed || 0;
      state.score = d.score || 0;
      state.congestion = d.congestion || 0;
      state.lightLevel = d.lightLevel || 0;
      state.roundaboutLevel = d.roundaboutLevel || 0;
      state.decor = d.decor || [];
      state.clouds = d.clouds || [];
      state.cars = [];
      updateIntersections();
      return true;
    } catch {
      return false;
    }
  }

  function reset() {
    state.roads.clear();
    state.bridges.clear();
    state.intersections.clear();
    state.cars = [];
    state.particles = [];
    state.usedRoads = 0;
    state.maxRoadSegments = CONFIG.initRoads;
    state.bridgeCredits = CONFIG.initBridges;
    state.day = 1;
    state.week = 1;
    state.elapsed = 0;
    state.score = 0;
    state.congestion = 0;
    state.lightLevel = 0;
    state.roundaboutLevel = 0;
    state.running = true;
    state.pausedForUpgrade = false;
    resize();
    initRiver();
    initDecor();
    spawnBuildings();
    ui.gameOverPanel.classList.add('hidden');
    save();
  }

  function onDown(ev) {
    state.pointerDown = true;
    const g = toGrid(ev.clientX, ev.clientY);
    if (!inBounds(g.x, g.y)) return;
    if (ev.button === 2 || ev.shiftKey) {
      removeRoad(g.x, g.y);
      save();
      return;
    }
    state.dragPath = [{ x: g.x, y: g.y }];
  }

  function onMove(ev) {
    if (!state.pointerDown || state.dragPath.length === 0) return;
    const g = toGrid(ev.clientX, ev.clientY);
    if (!inBounds(g.x, g.y)) return;
    state.dragPath = orthPath(state.dragPath[0], g);
  }

  function onUp() {
    if (state.dragPath.length) {
      for (const c of state.dragPath) {
        if (!addRoad(c.x, c.y)) break;
      }
      save();
    }
    state.dragPath = [];
    state.pointerDown = false;
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (state.running && !state.pausedForUpgrade) {
      updateTime(dt);
      spawnCars(dt);
      updateCars(dt);
      checkFail();
    }

    if (Math.floor(now / 3500) > state.lastAutoSave) {
      state.lastAutoSave = Math.floor(now / 3500);
      save();
    }

    updateUI();
    draw(now, dt);
    requestAnimationFrame(loop);
  }

  function init() {
    resize();
    const ok = load();
    if (!ok) {
      initRiver();
      initDecor();
      spawnBuildings();
    }
    addEventListener('resize', resize);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    ui.restartBtn.addEventListener('click', reset);
    requestAnimationFrame(loop);
  }

  init();
})();
