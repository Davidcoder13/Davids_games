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

  const SAVE_KEY = 'transit-tangle-grid-save-v1';

  const CONFIG = {
    cellSize: 28,
    gridPaddingTop: 90,
    gridPaddingSide: 38,
    initialRoadBudget: 130,
    initialBridgeBudget: 3,
    daySeconds: 16,
    weekDays: 7,
    carSpeedCellsPerSec: 3.1,
    spawnBase: 0.11,
    spawnGrowthPerWeek: 0.022,
    jamLoseThreshold: 50,
    houseStartCount: 5,
    maxCarsPerColorBase: 6,
    congestionDecay: 0.02,
    maxColors: 6,
  };

  const COLORS = ['#ff8aa8', '#7ec8e3', '#f6c177', '#a1e887', '#be95ff', '#ffa57f'];

  const upgrades = [
    { id: 'roads', label: '+24 Roads', apply: (s) => (s.maxRoadSegments += 24) },
    { id: 'lights', label: 'Traffic Lights (+flow)', apply: (s) => s.lightLevel++ },
    { id: 'round', label: 'Roundabouts (+node speed)', apply: (s) => s.roundaboutLevel++ },
    { id: 'bridges', label: '+3 Bridges', apply: (s) => (s.bridgeCredits += 3) },
  ];

  let audioCtx;
  function beep(freq = 360, duration = 0.05, type = 'sine', gain = 0.03) {
    if (!audioCtx) {
      try {
        audioCtx = new AudioContext();
      } catch {
        return;
      }
    }
    const osc = audioCtx.createOscillator();
    const amp = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.value = gain;
    osc.connect(amp);
    amp.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }

  const state = {
    width: window.innerWidth,
    height: window.innerHeight,
    gridCols: 0,
    gridRows: 0,
    roadCells: new Set(),
    bridgeCells: new Set(),
    intersections: new Set(),
    blockedRiverCells: new Set(),
    riverCols: [],
    houses: [],
    stores: [],
    cars: [],
    roadSegmentsUsed: 0,
    maxRoadSegments: CONFIG.initialRoadBudget,
    bridgeCredits: CONFIG.initialBridgeBudget,
    lightLevel: 0,
    roundaboutLevel: 0,
    day: 1,
    week: 1,
    elapsed: 0,
    scoreTrips: 0,
    congestionMeter: 0,
    running: true,
    pausedForUpgrade: false,
    pointer: { x: 0, y: 0, down: false },
    dragPath: [],
    decorTrees: [],
    clouds: [],
    lastAutoSaveTick: 0,
  };

  const idGen = (() => {
    let n = 1;
    return () => n++;
  })();

  const keyOf = (x, y) => `${x},${y}`;
  const parseKey = (k) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  };

  function inBounds(x, y) {
    return x >= 0 && y >= 0 && x < state.gridCols && y < state.gridRows;
  }

  function worldToGrid(px, py) {
    const gx = Math.floor((px - CONFIG.gridPaddingSide) / CONFIG.cellSize);
    const gy = Math.floor((py - CONFIG.gridPaddingTop) / CONFIG.cellSize);
    return { x: gx, y: gy };
  }

  function gridToWorld(cx, cy) {
    return {
      x: CONFIG.gridPaddingSide + cx * CONFIG.cellSize + CONFIG.cellSize * 0.5,
      y: CONFIG.gridPaddingTop + cy * CONFIG.cellSize + CONFIG.cellSize * 0.5,
    };
  }

  function resize() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    canvas.width = state.width;
    canvas.height = state.height;
    state.gridCols = Math.max(16, Math.floor((state.width - CONFIG.gridPaddingSide * 2) / CONFIG.cellSize));
    state.gridRows = Math.max(12, Math.floor((state.height - CONFIG.gridPaddingTop - 24) / CONFIG.cellSize));
  }

  function buildRiver() {
    state.blockedRiverCells.clear();
    const start = Math.floor(state.gridCols * (0.35 + Math.random() * 0.2));
    const width = 2 + Math.floor(Math.random() * 2);
    state.riverCols = [];
    for (let c = start; c < start + width; c++) {
      state.riverCols.push(c);
      for (let y = 0; y < state.gridRows; y++) state.blockedRiverCells.add(keyOf(c, y));
    }
  }

  function isRiverCell(x, y) {
    return state.blockedRiverCells.has(keyOf(x, y));
  }

  function spawnDecor() {
    state.decorTrees = [];
    state.clouds = [];
    for (let i = 0; i < 80; i++) {
      const x = Math.floor(Math.random() * state.gridCols);
      const y = Math.floor(Math.random() * state.gridRows);
      if (!isRiverCell(x, y)) {
        const p = gridToWorld(x, y);
        state.decorTrees.push({ x: p.x, y: p.y, r: 3 + Math.random() * 6, alpha: 0.2 + Math.random() * 0.2 });
      }
    }
    for (let i = 0; i < 8; i++) {
      state.clouds.push({ x: Math.random() * state.width, y: 35 + Math.random() * 110, w: 50 + Math.random() * 80, speed: 0.2 + Math.random() * 0.55 });
    }
  }

  function randomFreeCell(avoid = []) {
    let attempts = 0;
    while (attempts < 400) {
      const x = Math.floor(Math.random() * state.gridCols);
      const y = Math.floor(Math.random() * state.gridRows);
      if (isRiverCell(x, y)) {
        attempts++;
        continue;
      }
      const near = avoid.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 4);
      if (!near) return { x, y };
      attempts++;
    }
    return { x: 1, y: 1 };
  }

  function spawnBuildings() {
    state.houses = [];
    state.stores = [];
    const placed = [];
    for (let i = 0; i < CONFIG.houseStartCount; i++) {
      const color = COLORS[i % CONFIG.maxColors];
      const h = randomFreeCell(placed);
      placed.push(h);
      const s = randomFreeCell(placed);
      placed.push(s);
      state.houses.push({ id: idGen(), color, cell: h, spawnTimer: 2 + Math.random() * 4, queue: 0 });
      state.stores.push({ id: idGen(), color, cell: s });
    }
  }

  function cellHasRoad(x, y) {
    return state.roadCells.has(keyOf(x, y));
  }

  function addRoadCell(x, y) {
    const k = keyOf(x, y);
    if (state.roadCells.has(k)) return true;
    if (state.roadSegmentsUsed >= state.maxRoadSegments) return false;

    if (isRiverCell(x, y)) {
      if (state.bridgeCredits <= 0) return false;
      state.bridgeCredits--;
      state.bridgeCells.add(k);
    }

    state.roadCells.add(k);
    state.roadSegmentsUsed++;
    updateIntersections();
    return true;
  }

  function removeRoadCell(x, y) {
    const k = keyOf(x, y);
    if (!state.roadCells.has(k)) return;
    state.roadCells.delete(k);
    state.roadSegmentsUsed = Math.max(0, state.roadSegmentsUsed - 1);
    if (state.bridgeCells.has(k)) {
      state.bridgeCells.delete(k);
      state.bridgeCredits++;
    }
    updateIntersections();
  }

  function neighbors(x, y) {
    const n = [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ];
    return n.filter((p) => inBounds(p.x, p.y));
  }

  function roadNeighborsCount(x, y) {
    return neighbors(x, y).filter((n) => cellHasRoad(n.x, n.y)).length;
  }

  function roadNeighborCells(x, y) {
    return neighbors(x, y).filter((n) => cellHasRoad(n.x, n.y));
  }

  function updateIntersections() {
    state.intersections.clear();
    for (const k of state.roadCells) {
      const { x, y } = parseKey(k);
      if (roadNeighborsCount(x, y) >= 3) state.intersections.add(k);
    }
  }

  function bfs(start, end) {
    const sKey = keyOf(start.x, start.y);
    const eKey = keyOf(end.x, end.y);
    if (!cellHasRoad(start.x, start.y) || !cellHasRoad(end.x, end.y)) return null;

    const queue = [start];
    const prev = new Map();
    const seen = new Set([sKey]);

    while (queue.length) {
      const cur = queue.shift();
      const cKey = keyOf(cur.x, cur.y);
      if (cKey === eKey) break;

      const nexts = neighbors(cur.x, cur.y)
        .filter((n) => cellHasRoad(n.x, n.y))
        .sort((a, b) => roadNeighborsCount(b.x, b.y) - roadNeighborsCount(a.x, a.y));

      for (const n of nexts) {
        const nk = keyOf(n.x, n.y);
        if (seen.has(nk)) continue;
        seen.add(nk);
        prev.set(nk, cKey);
        queue.push(n);
      }
    }

    if (!seen.has(eKey)) return null;

    const out = [];
    let cursor = eKey;
    while (cursor) {
      out.push(parseKey(cursor));
      if (cursor === sKey) break;
      cursor = prev.get(cursor);
    }
    out.reverse();
    return out;
  }

  function findStoreByColor(color) {
    return state.stores.find((s) => s.color === color);
  }

  function createCar(house) {
    const store = findStoreByColor(house.color);
    if (!store) return;
    const route = bfs(house.cell, store.cell);
    if (!route || route.length < 2) {
      house.queue++;
      state.congestionMeter += 0.15;
      return;
    }

    const wp = gridToWorld(house.cell.x, house.cell.y);
    state.cars.push({
      id: idGen(),
      color: house.color,
      x: wp.x,
      y: wp.y,
      angle: 0,
      from: house,
      to: store,
      phase: 'toStore',
      path: route,
      idx: 0,
      t: 0,
      wait: 0,
    });
  }

  function spawnCars(dt) {
    const spawnScale = CONFIG.spawnBase + CONFIG.spawnGrowthPerWeek * (state.week - 1);
    const cap = CONFIG.maxCarsPerColorBase + state.week;

    for (const h of state.houses) {
      h.spawnTimer -= dt;
      const active = state.cars.filter((c) => c.color === h.color).length;
      if (h.spawnTimer <= 0 && active < cap) {
        createCar(h);
        h.spawnTimer = (1.8 + Math.random() * 6) / spawnScale;
      }
    }
  }

  function updateCars(dt) {
    const occupancy = new Map();

    for (const car of state.cars) {
      const a = car.path[car.idx];
      const b = car.path[car.idx + 1];
      if (!a || !b) continue;

      const aW = gridToWorld(a.x, a.y);
      const bW = gridToWorld(b.x, b.y);
      const segLen = Math.hypot(bW.x - aW.x, bW.y - aW.y);
      const occKey = keyOf(a.x, a.y);
      occupancy.set(occKey, (occupancy.get(occKey) || 0) + 1);

      const nodeDelay = Math.max(0.05, 0.24 - state.lightLevel * 0.03 - state.roundaboutLevel * 0.02);
      if (occupancy.get(occKey) > 1 + state.lightLevel) {
        car.wait += dt * 0.7;
      }

      if (car.wait < nodeDelay) {
        car.wait += dt;
        continue;
      }

      const speed = CONFIG.carSpeedCellsPerSec * CONFIG.cellSize;
      car.t += (speed * dt) / Math.max(1, segLen);
      car.x = aW.x + (bW.x - aW.x) * car.t;
      car.y = aW.y + (bW.y - aW.y) * car.t;
      car.angle = Math.atan2(bW.y - aW.y, bW.x - aW.x);

      if (car.t >= 1) {
        car.idx++;
        car.t = 0;
        car.wait = 0;

        if (car.idx >= car.path.length - 1) {
          if (car.phase === 'toStore') {
            car.phase = 'toHome';
            const back = bfs(car.to.cell, car.from.cell);
            if (!back || back.length < 2) {
              state.congestionMeter += 0.22;
              car.dead = true;
            } else {
              car.path = back;
              car.idx = 0;
              const p = gridToWorld(car.to.cell.x, car.to.cell.y);
              car.x = p.x;
              car.y = p.y;
            }
          } else {
            state.scoreTrips++;
            car.dead = true;
          }
        }
      }
    }

    state.cars = state.cars.filter((c) => !c.dead);

    for (const h of state.houses) {
      if (h.queue > 0 && h.spawnTimer < 0.8) {
        createCar(h);
        h.queue--;
      }
    }

    const jamCells = [...occupancy.values()].filter((v) => v >= 3).length;
    state.congestionMeter += jamCells * dt * 0.035;
    state.congestionMeter = Math.max(0, state.congestionMeter - dt * CONFIG.congestionDecay);
  }

  function addColorPair() {
    if (state.houses.length >= CONFIG.maxColors * 2) return;
    const color = COLORS[Math.floor(Math.random() * CONFIG.maxColors)];
    const used = [...state.houses.map((h) => h.cell), ...state.stores.map((s) => s.cell)];
    state.houses.push({ id: idGen(), color, cell: randomFreeCell(used), spawnTimer: 2, queue: 0 });
    state.stores.push({ id: idGen(), color, cell: randomFreeCell(used), congestion: 0 });
  }

  function showUpgradeChoice() {
    state.pausedForUpgrade = true;
    ui.upgradeChoices.innerHTML = '';
    const picks = [...upgrades].sort(() => Math.random() - 0.5).slice(0, 3);
    for (const u of picks) {
      const b = document.createElement('button');
      b.textContent = u.label;
      b.onclick = () => {
        u.apply(state);
        state.pausedForUpgrade = false;
        ui.upgradePanel.classList.add('hidden');
        saveGame();
        beep(620, 0.1, 'triangle', 0.03);
      };
      ui.upgradeChoices.appendChild(b);
    }
    ui.upgradePanel.classList.remove('hidden');
  }

  function updateTime(dt) {
    state.elapsed += dt;
    const nextDay = Math.floor(state.elapsed / CONFIG.daySeconds) + 1;
    if (nextDay <= state.day) return;

    state.day = nextDay;
    beep(300, 0.08, 'sine', 0.02);

    if ((state.day - 1) % CONFIG.weekDays === 0) {
      state.week++;
      showUpgradeChoice();
    }

    if (state.day % 3 === 0) addColorPair();
  }

  function checkFailure() {
    if (state.congestionMeter < CONFIG.jamLoseThreshold) return;
    state.running = false;
    ui.gameOverReason.textContent = `Network jam reached ${state.congestionMeter.toFixed(1)}. Expand routes and spread traffic.`;
    ui.gameOverPanel.classList.remove('hidden');
    beep(100, 0.35, 'sawtooth', 0.08);
  }

  function paintBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, state.height);
    g.addColorStop(0, '#f4f8ff');
    g.addColorStop(0.5, '#edf7f9');
    g.addColorStop(1, '#eef8ee');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, state.width, state.height);

    for (const c of state.clouds) {
      c.x += c.speed;
      if (c.x - c.w > state.width) c.x = -80;
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.w * 0.45, c.w * 0.18, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + c.w * 0.24, c.y + 1, c.w * 0.35, c.w * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function paintGrid() {
    const left = CONFIG.gridPaddingSide;
    const top = CONFIG.gridPaddingTop;
    const w = state.gridCols * CONFIG.cellSize;
    const h = state.gridRows * CONFIG.cellSize;

    ctx.fillStyle = '#f8fcf8';
    ctx.fillRect(left, top, w, h);

    ctx.strokeStyle = '#eaf1f7';
    ctx.lineWidth = 1;
    for (let c = 0; c <= state.gridCols; c++) {
      const x = left + c * CONFIG.cellSize;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + h);
      ctx.stroke();
    }
    for (let r = 0; r <= state.gridRows; r++) {
      const y = top + r * CONFIG.cellSize;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + w, y);
      ctx.stroke();
    }

    for (const rk of state.blockedRiverCells) {
      const { x, y } = parseKey(rk);
      const p = gridToWorld(x, y);
      ctx.fillStyle = '#c8e8ff';
      ctx.fillRect(p.x - CONFIG.cellSize * 0.5, p.y - CONFIG.cellSize * 0.5, CONFIG.cellSize, CONFIG.cellSize);
    }
  }

  function paintDecor() {
    for (const t of state.decorTrees) {
      ctx.fillStyle = `rgba(100,170,120,${t.alpha})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function paintRoads() {
    const roadW = CONFIG.cellSize * 0.42;

    // Base links: only draw right/down to avoid duplicate overdraw.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#cfd8e4';
    ctx.lineWidth = roadW;
    for (const k of state.roadCells) {
      const { x, y } = parseKey(k);
      const from = gridToWorld(x, y);
      const right = { x: x + 1, y };
      const down = { x, y: y + 1 };
      if (cellHasRoad(right.x, right.y)) {
        const to = gridToWorld(right.x, right.y);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
      if (cellHasRoad(down.x, down.y)) {
        const to = gridToWorld(down.x, down.y);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }

    // Bridges get a colored top coat.
    ctx.strokeStyle = '#7f8fb3';
    ctx.lineWidth = roadW * 0.95;
    for (const k of state.bridgeCells) {
      const { x, y } = parseKey(k);
      const from = gridToWorld(x, y);
      for (const n of roadNeighborCells(x, y)) {
        if (n.x < x || (n.x == x && n.y < y)) continue;
        const to = gridToWorld(n.x, n.y);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }

    // Smooth corners && rounded intersections.
    for (const k of state.roadCells) {
      const { x, y } = parseKey(k);
      const center = gridToWorld(x, y);
      const ns = roadNeighborCells(x, y);

      // rounded node cap
      ctx.fillStyle = state.bridgeCells.has(k) ? '#7f8fb3' : '#cfd8e4';
      ctx.beginPath();
      ctx.arc(center.x, center.y, roadW * 0.5, 0, Math.PI * 2);
      ctx.fill();

      if (ns.length === 2) {
        const d1 = { x: ns[0].x - x, y: ns[0].y - y };
        const d2 = { x: ns[1].x - x, y: ns[1].y - y };
        const isCorner = d1.x !== d2.x && d1.y !== d2.y;
        if (isCorner) {
          const p1 = { x: center.x + d1.x * CONFIG.cellSize * 0.5, y: center.y + d1.y * CONFIG.cellSize * 0.5 };
          const p2 = { x: center.x + d2.x * CONFIG.cellSize * 0.5, y: center.y + d2.y * CONFIG.cellSize * 0.5 };
          ctx.strokeStyle = state.bridgeCells.has(k) ? '#7f8fb3' : '#cfd8e4';
          ctx.lineWidth = roadW;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.quadraticCurveTo(center.x, center.y, p2.x, p2.y);
          ctx.stroke();
        }
      }
    }

    // subtle center lane
    ctx.strokeStyle = '#f8fbff';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([7, 6]);
    for (const k of state.roadCells) {
      const { x, y } = parseKey(k);
      const from = gridToWorld(x, y);
      const right = { x: x + 1, y };
      const down = { x, y: y + 1 };
      if (cellHasRoad(right.x, right.y)) {
        const to = gridToWorld(right.x, right.y);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
      if (cellHasRoad(down.x, down.y)) {
        const to = gridToWorld(down.x, down.y);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // remembered intersections visual
    for (const k of state.intersections) {
      const p = gridToWorld(parseKey(k).x, parseKey(k).y);
      ctx.fillStyle = '#ff9ca5';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (state.dragPath.length > 1) {
      ctx.strokeStyle = '#6f9fd2';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      const s = gridToWorld(state.dragPath[0].x, state.dragPath[0].y);
      ctx.moveTo(s.x, s.y);
      for (let i = 1; i < state.dragPath.length; i++) {
        const p = gridToWorld(state.dragPath[i].x, state.dragPath[i].y);
        const prev = gridToWorld(state.dragPath[i - 1].x, state.dragPath[i - 1].y);
        const mx = (prev.x + p.x) * 0.5;
        const my = (prev.y + p.y) * 0.5;
        ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
      }
      const last = state.dragPath[state.dragPath.length - 1];
      const lw = gridToWorld(last.x, last.y);
      ctx.lineTo(lw.x, lw.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function paintBuildings() {
    const drawHouse = (h) => {
      const p = gridToWorld(h.cell.x, h.cell.y);
      ctx.fillStyle = h.color;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 12);
      ctx.lineTo(p.x - 11, p.y - 2);
      ctx.lineTo(p.x + 11, p.y - 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(p.x - 9, p.y - 2, 18, 12);
      if (h.queue > 0) {
        ctx.fillStyle = '#2f3b4c';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(String(h.queue), p.x + 12, p.y + 4);
      }
    };

    const drawStore = (s) => {
      const p = gridToWorld(s.cell.x, s.cell.y);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.roundRect(p.x - 11, p.y - 11, 22, 22, 6);
      ctx.fill();
      ctx.fillStyle = '#ffffffd8';
      ctx.fillRect(p.x - 7, p.y - 2, 14, 4);
      ctx.fillRect(p.x - 2, p.y - 7, 4, 14);
    };

    state.houses.forEach(drawHouse);
    state.stores.forEach(drawStore);
  }

  function paintCars() {
    for (const car of state.cars) {
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      ctx.fillStyle = '#00000028';
      ctx.beginPath();
      ctx.roundRect(-5, -1, 13, 8, 3);
      ctx.fill();
      ctx.fillStyle = car.color;
      ctx.beginPath();
      ctx.roundRect(-6, -3, 13, 8, 3);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-1, -2, 4, 2);
      ctx.restore();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, state.width, state.height);
    paintBackground();
    paintGrid();
    paintDecor();
    paintRoads();
    paintBuildings();
    paintCars();
  }

  function updateUI() {
    ui.day.textContent = `Day ${state.day}`;
    ui.week.textContent = `Week ${state.week}`;
    ui.roads.textContent = `Roads: ${state.roadSegmentsUsed} / ${state.maxRoadSegments} • Bridges: ${state.bridgeCredits}`;
    ui.score.textContent = `Trips: ${state.scoreTrips}`;
    const c = state.congestionMeter / CONFIG.jamLoseThreshold;
    ui.status.textContent = c < 0.45 ? 'Status: Flowing' : c < 0.8 ? 'Status: Slowdown' : 'Status: Critical';
  }

  function saveGame() {
    const payload = {
      width: state.width,
      height: state.height,
      gridCols: state.gridCols,
      gridRows: state.gridRows,
      roadCells: [...state.roadCells],
      bridgeCells: [...state.bridgeCells],
      intersections: [...state.intersections],
      blockedRiverCells: [...state.blockedRiverCells],
      riverCols: state.riverCols,
      houses: state.houses,
      stores: state.stores,
      roadSegmentsUsed: state.roadSegmentsUsed,
      maxRoadSegments: state.maxRoadSegments,
      bridgeCredits: state.bridgeCredits,
      lightLevel: state.lightLevel,
      roundaboutLevel: state.roundaboutLevel,
      day: state.day,
      week: state.week,
      elapsed: state.elapsed,
      scoreTrips: state.scoreTrips,
      congestionMeter: state.congestionMeter,
      decorTrees: state.decorTrees,
      clouds: state.clouds,
      // TODO(level-mode): persist map seeds/objectives and scripted unlock sequence.
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  }

  function loadGame() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      const d = JSON.parse(raw);
      state.gridCols = d.gridCols;
      state.gridRows = d.gridRows;
      state.roadCells = new Set(d.roadCells || []);
      state.bridgeCells = new Set(d.bridgeCells || []);
      state.intersections = new Set(d.intersections || []);
      state.blockedRiverCells = new Set(d.blockedRiverCells || []);
      state.riverCols = d.riverCols || [];
      state.houses = d.houses || [];
      state.stores = d.stores || [];
      state.roadSegmentsUsed = d.roadSegmentsUsed || 0;
      state.maxRoadSegments = d.maxRoadSegments || CONFIG.initialRoadBudget;
      state.bridgeCredits = d.bridgeCredits ?? CONFIG.initialBridgeBudget;
      state.lightLevel = d.lightLevel || 0;
      state.roundaboutLevel = d.roundaboutLevel || 0;
      state.day = d.day || 1;
      state.week = d.week || 1;
      state.elapsed = d.elapsed || 0;
      state.scoreTrips = d.scoreTrips || 0;
      state.congestionMeter = d.congestionMeter || 0;
      state.decorTrees = d.decorTrees || [];
      state.clouds = d.clouds || [];
      state.cars = [];
      updateIntersections();
      return true;
    } catch {
      return false;
    }
  }

  function resetGame() {
    state.roadCells.clear();
    state.bridgeCells.clear();
    state.blockedRiverCells.clear();
    state.intersections.clear();
    state.cars = [];
    state.roadSegmentsUsed = 0;
    state.maxRoadSegments = CONFIG.initialRoadBudget;
    state.bridgeCredits = CONFIG.initialBridgeBudget;
    state.lightLevel = 0;
    state.roundaboutLevel = 0;
    state.day = 1;
    state.week = 1;
    state.elapsed = 0;
    state.scoreTrips = 0;
    state.congestionMeter = 0;
    state.running = true;
    state.pausedForUpgrade = false;
    resize();
    buildRiver();
    spawnDecor();
    spawnBuildings();
    ui.gameOverPanel.classList.add('hidden');
    saveGame();
  }

  function orthogonalPath(a, b) {
    const path = [{ x: a.x, y: a.y }];
    let cx = a.x;
    let cy = a.y;
    while (cx !== b.x) {
      cx += cx < b.x ? 1 : -1;
      path.push({ x: cx, y: cy });
    }
    while (cy !== b.y) {
      cy += cy < b.y ? 1 : -1;
      path.push({ x: cx, y: cy });
    }
    return path;
  }

  function pointerDown(ev) {
    state.pointer.down = true;
    state.pointer.x = ev.clientX;
    state.pointer.y = ev.clientY;

    const g = worldToGrid(ev.clientX, ev.clientY);
    if (!inBounds(g.x, g.y)) return;

    if (ev.button === 2 || ev.shiftKey) {
      removeRoadCell(g.x, g.y);
      saveGame();
      beep(210, 0.08, 'sawtooth', 0.03);
      return;
    }

    state.dragPath = [{ x: g.x, y: g.y }];
  }

  function pointerMove(ev) {
    state.pointer.x = ev.clientX;
    state.pointer.y = ev.clientY;
    if (!state.pointer.down || state.dragPath.length === 0) return;
    const g = worldToGrid(ev.clientX, ev.clientY);
    if (!inBounds(g.x, g.y)) return;

    const start = state.dragPath[0];
    state.dragPath = orthogonalPath(start, g);
  }

  function pointerUp() {
    if (state.dragPath.length > 0) {
      for (const p of state.dragPath) {
        if (!addRoadCell(p.x, p.y)) {
          beep(120, 0.15, 'triangle', 0.06);
          break;
        }
      }
      saveGame();
      beep(520, 0.05, 'sine', 0.03);
    }
    state.dragPath = [];
    state.pointer.down = false;
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (state.running && !state.pausedForUpgrade) {
      updateTime(dt);
      spawnCars(dt);
      updateCars(dt);
      checkFailure();
    }

    if (Math.floor(now / 3500) > state.lastAutoSaveTick) {
      state.lastAutoSaveTick = Math.floor(now / 3500);
      saveGame();
    }

    updateUI();
    draw();
    requestAnimationFrame(loop);
  }

  function init() {
    resize();
    const loaded = loadGame();
    if (!loaded) {
      buildRiver();
      spawnDecor();
      spawnBuildings();
      // TODO(level-mode): swap endless bootstrap for level data + objective checks.
    }

    window.addEventListener('resize', () => {
      resize();
      draw();
    });

    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    ui.restartBtn.addEventListener('click', resetGame);

    requestAnimationFrame(loop);
  }

  init();
})();
