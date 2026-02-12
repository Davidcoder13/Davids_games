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

  const SAVE_KEY = 'transit-tangle-save-v1';
  const COLORS = ['#ff8ba7', '#7ec8e3', '#f6c177', '#a1e887', '#be95ff'];
  const CONFIG = {
    mapPadding: 70,
    nodeSnapDistance: 18,
    removeSnapDistance: 12,
    maxInitialRoadSegments: 45,
    daySeconds: 18,
    weekDays: 7,
    carSpeed: 88,
    edgeBaseCapacity: 4,
    congestionLoseThreshold: 42,
    spawnBase: 0.09,
    spawnGrowthPerWeek: 0.02,
    houseCountStart: 5,
    storeCountStart: 5,
    maxCarsByColorBase: 7,
  };

  const upgradesCatalog = [
    { id: 'roads', label: '+12 Road Segments', apply: (g) => g.maxRoadSegments += 12 },
    { id: 'lights', label: 'Traffic Lights (+flow)', apply: (g) => g.lightLevel++ },
    { id: 'roundabout', label: 'Roundabouts (+intersection speed)', apply: (g) => g.roundaboutLevel++ },
    { id: 'bridges', label: '+2 Bridges', apply: (g) => g.bridgeCredits += 2 },
  ];

  let audioCtx;
  function beep(freq = 320, duration = 0.06, type = 'sine', gain = 0.04) {
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
    running: true,
    pausedForUpgrade: false,
    width: window.innerWidth,
    height: window.innerHeight,
    day: 1,
    week: 1,
    elapsed: 0,
    roadsUsed: 0,
    maxRoadSegments: CONFIG.maxInitialRoadSegments,
    lightLevel: 0,
    roundaboutLevel: 0,
    bridgeCredits: 0,
    scoreTrips: 0,
    congestionMeter: 0,
    draggingRoad: null,
    pointer: { x: 0, y: 0, down: false },
    houses: [],
    stores: [],
    cars: [],
    nodes: [],
    edges: [],
    river: null,
  };

  const id = (() => {
    let n = 1;
    return () => n++;
  })();

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function randomIn(min, max) {
    return min + Math.random() * (max - min);
  }

  function resize() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    canvas.width = state.width;
    canvas.height = state.height;
  }

  function createRiver() {
    const w = state.width;
    const h = state.height;
    const x = w * randomIn(0.35, 0.62);
    const thickness = randomIn(70, 110);
    state.river = {
      x1: x,
      x2: x + thickness,
      y1: 86,
      y2: h - 28,
    };
  }

  function pointInRiver(p) {
    const r = state.river;
    return p.x > r.x1 && p.x < r.x2 && p.y > r.y1 && p.y < r.y2;
  }

  function segmentCrossesRiver(a, b) {
    const r = state.river;
    const left = (a.x < r.x1 && b.x > r.x2) || (b.x < r.x1 && a.x > r.x2);
    const insideY = Math.max(Math.min(a.y, b.y), r.y1) <= Math.min(Math.max(a.y, b.y), r.y2);
    return left && insideY;
  }

  function spawnBuildings() {
    state.houses = [];
    state.stores = [];
    for (let i = 0; i < CONFIG.houseCountStart; i++) {
      const c = COLORS[i % COLORS.length];
      state.houses.push({ id: id(), color: c, x: 0, y: 0, spawnTimer: randomIn(2, 7), queue: 0 });
      state.stores.push({ id: id(), color: c, x: 0, y: 0, congestion: 0 });
    }

    const all = [...state.houses, ...state.stores];
    all.forEach((b) => {
      let attempts = 0;
      do {
        b.x = randomIn(CONFIG.mapPadding, state.width - CONFIG.mapPadding);
        b.y = randomIn(120, state.height - CONFIG.mapPadding);
        attempts++;
      } while ((pointInRiver(b) || tooCloseToOthers(b, all)) && attempts < 140);
    });
  }

  function tooCloseToOthers(target, list) {
    for (const item of list) {
      if (item === target || !item.x) continue;
      if (Math.hypot(item.x - target.x, item.y - target.y) < 82) return true;
    }
    return false;
  }

  function nearestNode(point, threshold = CONFIG.nodeSnapDistance) {
    let best = null;
    let dMin = Infinity;
    for (const n of state.nodes) {
      const d = Math.hypot(point.x - n.x, point.y - n.y);
      if (d < threshold && d < dMin) {
        best = n;
        dMin = d;
      }
    }
    return best;
  }

  function makeNode(x, y) {
    const existing = nearestNode({ x, y }, CONFIG.nodeSnapDistance * 0.7);
    if (existing) return existing;
    const node = { id: id(), x, y, queue: 0 };
    state.nodes.push(node);
    return node;
  }

  function segIntersection(a, b, c, d) {
    const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
    if (Math.abs(den) < 0.001) return null;
    const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den;
    const u = -((a.x - b.x) * (a.y - c.y) - (a.y - b.y) * (a.x - c.x)) / den;
    if (t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98) {
      return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    }
    return null;
  }

  function splitEdge(edge, nodeAtIntersection) {
    state.edges = state.edges.filter((e) => e.id !== edge.id);
    createEdge(edge.a, nodeAtIntersection, edge.bridge);
    createEdge(nodeAtIntersection, edge.b, edge.bridge);
  }

  function createEdge(a, b, bridge = false) {
    if (a.id === b.id) return;
    for (const e of state.edges) {
      if ((e.a.id === a.id && e.b.id === b.id) || (e.a.id === b.id && e.b.id === a.id)) {
        return;
      }
    }
    state.edges.push({ id: id(), a, b, load: 0, bridge });
    state.roadsUsed++;
  }

  function addRoadByPoints(p1, p2) {
    if (state.roadsUsed >= state.maxRoadSegments) {
      beep(120, 0.16, 'triangle', 0.08);
      return;
    }
    if (dist(p1, p2) < 14) return;

    let a = makeNode(p1.x, p1.y);
    let b = makeNode(p2.x, p2.y);

    const intersections = [];
    for (const e of [...state.edges]) {
      const p = segIntersection(a, b, e.a, e.b);
      if (p) {
        const node = makeNode(p.x, p.y);
        intersections.push(node);
        splitEdge(e, node);
      }
    }

    if (intersections.length > 0) {
      const points = [a, ...intersections, b].sort((m, n) => dist(m, a) - dist(n, a));
      for (let i = 0; i < points.length - 1; i++) {
        if (state.roadsUsed < state.maxRoadSegments) {
          if (segmentCrossesRiver(points[i], points[i + 1]) && state.bridgeCredits <= 0) continue;
          const bridge = segmentCrossesRiver(points[i], points[i + 1]);
          if (bridge) state.bridgeCredits--;
          createEdge(points[i], points[i + 1], bridge);
        }
      }
    } else {
      if (segmentCrossesRiver(a, b) && state.bridgeCredits <= 0) {
        beep(160, 0.18, 'square', 0.09);
        return;
      }
      const bridge = segmentCrossesRiver(a, b);
      if (bridge) state.bridgeCredits--;
      createEdge(a, b, bridge);
    }

    beep(540, 0.05, 'sine', 0.03);
    rebuildBuildingConnectors();
  }

  function removeNearestRoad(point) {
    let target = null;
    let best = CONFIG.removeSnapDistance;
    for (const e of state.edges) {
      const d = pointToSegmentDistance(point, e.a, e.b);
      if (d < best) {
        best = d;
        target = e;
      }
    }
    if (!target) return;
    state.edges = state.edges.filter((e) => e.id !== target.id);
    state.roadsUsed = Math.max(0, state.roadsUsed - 1);
    beep(220, 0.08, 'sawtooth', 0.04);
    rebuildBuildingConnectors();
  }

  function pointToSegmentDistance(p, a, b) {
    const l2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    if (l2 === 0) return dist(p, a);
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = clamp(t, 0, 1);
    return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
  }

  function rebuildBuildingConnectors() {
    for (const b of [...state.houses, ...state.stores]) {
      b.node = nearestNode(b, 50);
    }
  }

  function graphNeighbors(node) {
    const out = [];
    for (const e of state.edges) {
      if (e.a.id === node.id) out.push({ node: e.b, edge: e });
      else if (e.b.id === node.id) out.push({ node: e.a, edge: e });
    }
    return out;
  }

  function pathfind(startNode, endNode) {
    if (!startNode || !endNode) return null;
    const distMap = new Map();
    const prev = new Map();
    const queue = [...state.nodes];
    state.nodes.forEach((n) => distMap.set(n.id, Infinity));
    distMap.set(startNode.id, 0);

    while (queue.length) {
      queue.sort((m, n) => distMap.get(m.id) - distMap.get(n.id));
      const u = queue.shift();
      if (!u || distMap.get(u.id) === Infinity) break;
      if (u.id === endNode.id) break;
      for (const { node: v, edge } of graphNeighbors(u)) {
        const penalty = edge.load * 6;
        const alt = distMap.get(u.id) + dist(u, v) + penalty;
        if (alt < distMap.get(v.id)) {
          distMap.set(v.id, alt);
          prev.set(v.id, u.id);
        }
      }
    }

    const path = [];
    let cur = endNode.id;
    while (cur !== undefined) {
      const n = state.nodes.find((x) => x.id === cur);
      if (!n) return null;
      path.unshift(n);
      if (cur === startNode.id) return path;
      cur = prev.get(cur);
    }
    return null;
  }

  function spawnCars(dt) {
    const spawnScale = CONFIG.spawnBase + CONFIG.spawnGrowthPerWeek * (state.week - 1);
    const capPerColor = CONFIG.maxCarsByColorBase + state.week;

    for (const house of state.houses) {
      house.spawnTimer -= dt;
      const activeForColor = state.cars.filter((c) => c.color === house.color).length;
      if (house.spawnTimer <= 0 && activeForColor < capPerColor) {
        if (!house.node) {
          house.queue++;
          state.congestionMeter += 0.08;
        } else {
          const store = state.stores.find((s) => s.color === house.color);
          createCar(house, store);
        }
        house.spawnTimer = randomIn(1.6, 6.8) / spawnScale;
      }
    }
  }

  function createCar(house, store) {
    const toStore = pathfind(house.node, store.node);
    if (!toStore || toStore.length < 2) {
      house.queue++;
      state.congestionMeter += 0.16;
      return;
    }
    state.cars.push({
      id: id(),
      color: house.color,
      x: house.x,
      y: house.y,
      from: house,
      to: store,
      phase: 'toStore',
      path: toStore,
      index: 0,
      progress: 0,
      wait: 0,
    });
    beep(410, 0.03, 'triangle', 0.02);
  }

  function updateCars(dt) {
    state.edges.forEach((e) => (e.load = 0));
    state.nodes.forEach((n) => (n.queue = 0));

    const nodeDelay = Math.max(0.04, 0.22 - state.lightLevel * 0.03 - state.roundaboutLevel * 0.02);

    for (const car of state.cars) {
      const cur = car.path[car.index];
      const next = car.path[car.index + 1];
      if (!next) continue;
      const edge = state.edges.find(
        (e) => (e.a.id === cur.id && e.b.id === next.id) || (e.a.id === next.id && e.b.id === cur.id)
      );
      if (!edge) {
        car.wait += dt;
        state.congestionMeter += dt * 0.2;
        continue;
      }
      edge.load += 1;
      const over = Math.max(0, edge.load - (CONFIG.edgeBaseCapacity + state.lightLevel));
      if (over > 0) {
        car.wait += dt * 0.7;
      }

      if (car.wait > nodeDelay) {
        car.wait = 0;
      } else {
        car.wait += dt;
        cur.queue += 1;
        continue;
      }

      const segLen = Math.max(1, dist(cur, next));
      car.progress += (CONFIG.carSpeed * dt) / segLen;
      const t = clamp(car.progress, 0, 1);
      car.x = cur.x + (next.x - cur.x) * t;
      car.y = cur.y + (next.y - cur.y) * t;

      if (car.progress >= 1) {
        car.index++;
        car.progress = 0;
        if (car.index >= car.path.length - 1) {
          if (car.phase === 'toStore') {
            car.phase = 'toHome';
            const back = pathfind(car.to.node, car.from.node);
            if (!back || back.length < 2) {
              state.congestionMeter += 0.22;
              car.dead = true;
            } else {
              car.path = back;
              car.index = 0;
              car.x = car.to.x;
              car.y = car.to.y;
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
      if (h.queue > 0 && h.node && h.spawnTimer < 0.8) {
        const s = state.stores.find((x) => x.color === h.color);
        createCar(h, s);
        h.queue--;
      }
    }

    const jamNodes = state.nodes.filter((n) => n.queue > 3).length;
    state.congestionMeter += jamNodes * dt * 0.03;
    state.congestionMeter = Math.max(0, state.congestionMeter - dt * 0.02);
  }

  function updateTime(dt) {
    state.elapsed += dt;
    const newDay = Math.floor(state.elapsed / CONFIG.daySeconds) + 1;
    if (newDay > state.day) {
      state.day = newDay;
      beep(280, 0.09, 'sine', 0.03);
      if ((state.day - 1) % CONFIG.weekDays === 0) {
        state.week++;
        showUpgradeChoice();
      }
      if (state.day % 3 === 0 && state.houses.length < COLORS.length * 2) addColorPair();
    }
  }

  function addColorPair() {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const house = { id: id(), color, x: randomIn(80, state.width - 80), y: randomIn(120, state.height - 80), spawnTimer: 3, queue: 0 };
    const store = { id: id(), color, x: randomIn(80, state.width - 80), y: randomIn(120, state.height - 80), congestion: 0 };
    state.houses.push(house);
    state.stores.push(store);
    rebuildBuildingConnectors();
  }

  function showUpgradeChoice() {
    state.pausedForUpgrade = true;
    ui.upgradeChoices.innerHTML = '';
    const options = [...upgradesCatalog].sort(() => Math.random() - 0.5).slice(0, 3);
    options.forEach((up) => {
      const b = document.createElement('button');
      b.textContent = up.label;
      b.onclick = () => {
        up.apply(state);
        state.pausedForUpgrade = false;
        ui.upgradePanel.classList.add('hidden');
        beep(620, 0.12, 'triangle', 0.03);
        saveGame();
      };
      ui.upgradeChoices.appendChild(b);
    });
    ui.upgradePanel.classList.remove('hidden');
  }

  function checkFailure() {
    if (state.congestionMeter >= CONFIG.congestionLoseThreshold) {
      state.running = false;
      ui.gameOverReason.textContent = `Congestion reached ${state.congestionMeter.toFixed(1)}. Try adding intersections earlier and using flow upgrades.`;
      ui.gameOverPanel.classList.remove('hidden');
      beep(90, 0.4, 'sawtooth', 0.1);
    }
  }

  function drawMap() {
    ctx.clearRect(0, 0, state.width, state.height);

    const g = ctx.createLinearGradient(0, 0, 0, state.height);
    g.addColorStop(0, '#f5f8ff');
    g.addColorStop(1, '#eff7f0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, state.width, state.height);

    const r = state.river;
    ctx.fillStyle = '#cbe7ffcc';
    ctx.fillRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);

    state.edges.forEach((e) => {
      ctx.lineCap = 'round';
      ctx.lineWidth = 10;
      const load = clamp(e.load / (CONFIG.edgeBaseCapacity + state.lightLevel + 1), 0, 1);
      ctx.strokeStyle = e.bridge ? '#7d8fb0' : `rgba(${180 + load * 60},${180 - load * 80},${190 - load * 100},0.9)`;
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(e.b.x, e.b.y);
      ctx.stroke();

      if (e.bridge) {
        const mx = (e.a.x + e.b.x) / 2;
        const my = (e.a.y + e.b.y) / 2;
        ctx.fillStyle = '#ffffffdd';
        ctx.beginPath();
        ctx.arc(mx, my, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    state.nodes.forEach((n) => {
      ctx.fillStyle = n.queue > 3 ? '#ff7b7b' : '#ffffffaa';
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.queue > 3 ? 7 : 4, 0, Math.PI * 2);
      ctx.fill();
    });

    drawBuildings(state.houses, true);
    drawBuildings(state.stores, false);

    state.cars.forEach((car) => {
      ctx.fillStyle = car.color;
      ctx.beginPath();
      ctx.roundRect(car.x - 6, car.y - 4, 12, 8, 3);
      ctx.fill();
    });

    if (state.draggingRoad) {
      ctx.strokeStyle = '#8da9c4';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(state.draggingRoad.start.x, state.draggingRoad.start.y);
      ctx.lineTo(state.pointer.x, state.pointer.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawBuildings(list, house) {
    for (const b of list) {
      ctx.fillStyle = `${b.color}cc`;
      if (house) {
        ctx.beginPath();
        ctx.moveTo(b.x, b.y - 10);
        ctx.lineTo(b.x - 11, b.y);
        ctx.lineTo(b.x + 11, b.y);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(b.x - 8, b.y, 16, 12);
      } else {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffffdd';
        ctx.fillRect(b.x - 4, b.y - 3, 8, 6);
      }

      if (!b.node) {
        ctx.fillStyle = '#ff5e5e';
        ctx.beginPath();
        ctx.arc(b.x + 14, b.y - 14, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      if (b.queue > 0) {
        ctx.fillStyle = '#223344';
        ctx.font = '11px sans-serif';
        ctx.fillText(String(b.queue), b.x + 12, b.y + 4);
      }
    }
  }

  function updateUI() {
    ui.day.textContent = `Day ${state.day}`;
    ui.week.textContent = `Week ${state.week}`;
    ui.roads.textContent = `Roads: ${state.roadsUsed} / ${state.maxRoadSegments}`;
    ui.score.textContent = `Trips: ${state.scoreTrips}`;
    const congestion = state.congestionMeter / CONFIG.congestionLoseThreshold;
    ui.status.textContent =
      congestion < 0.45 ? 'Status: Flowing' : congestion < 0.8 ? 'Status: Heavy Traffic' : 'Status: Critical';
  }

  function saveGame() {
    const serializable = {
      day: state.day,
      week: state.week,
      elapsed: state.elapsed,
      roadsUsed: state.roadsUsed,
      maxRoadSegments: state.maxRoadSegments,
      lightLevel: state.lightLevel,
      roundaboutLevel: state.roundaboutLevel,
      bridgeCredits: state.bridgeCredits,
      scoreTrips: state.scoreTrips,
      congestionMeter: state.congestionMeter,
      houses: state.houses,
      stores: state.stores,
      nodes: state.nodes,
      edges: state.edges.map((e) => ({ ...e, a: e.a.id, b: e.b.id })),
      river: state.river,
      // TODO(level-mode): Persist future per-level objectives and star ratings here.
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(serializable));
  }

  function loadGame() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      Object.assign(state, data);
      const nodeById = new Map(state.nodes.map((n) => [n.id, n]));
      state.edges = data.edges.map((e) => ({ ...e, a: nodeById.get(e.a), b: nodeById.get(e.b), load: 0 }));
      state.cars = [];
      rebuildBuildingConnectors();
      return true;
    } catch {
      return false;
    }
  }

  function resetGame() {
    Object.assign(state, {
      running: true,
      pausedForUpgrade: false,
      day: 1,
      week: 1,
      elapsed: 0,
      roadsUsed: 0,
      maxRoadSegments: CONFIG.maxInitialRoadSegments,
      lightLevel: 0,
      roundaboutLevel: 0,
      bridgeCredits: 1,
      scoreTrips: 0,
      congestionMeter: 0,
      houses: [],
      stores: [],
      cars: [],
      nodes: [],
      edges: [],
    });
    createRiver();
    spawnBuildings();
    rebuildBuildingConnectors();
    ui.gameOverPanel.classList.add('hidden');
    saveGame();
  }

  function onPointerDown(ev) {
    state.pointer.down = true;
    state.pointer.x = ev.clientX;
    state.pointer.y = ev.clientY;
    if (ev.button === 2) {
      removeNearestRoad(state.pointer);
      return;
    }
    if (ev.shiftKey) {
      removeNearestRoad(state.pointer);
      return;
    }
    state.draggingRoad = { start: { x: ev.clientX, y: ev.clientY } };
  }

  function onPointerMove(ev) {
    state.pointer.x = ev.clientX;
    state.pointer.y = ev.clientY;
  }

  function onPointerUp(ev) {
    state.pointer.down = false;
    if (state.draggingRoad) {
      addRoadByPoints(state.draggingRoad.start, { x: ev.clientX, y: ev.clientY });
      state.draggingRoad = null;
      saveGame();
    }
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

    updateUI();
    drawMap();

    if (Math.floor(now / 3000) !== Math.floor(last / 3000)) saveGame();

    requestAnimationFrame(loop);
  }

  function init() {
    resize();
    createRiver();
    const loaded = loadGame();
    if (!loaded) {
      spawnBuildings();
      state.bridgeCredits = 1;
      // TODO(level-mode): replace endless setup with map data loader and scripted unlocks.
    }
    rebuildBuildingConnectors();

    window.addEventListener('resize', resize);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    ui.restartBtn.addEventListener('click', resetGame);

    requestAnimationFrame(loop);
  }

  init();
})();
