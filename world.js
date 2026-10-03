(() => {
  'use strict';

  const SCENERY_TYPES = ['front_statue', 'leaf_statue', 'dressed_tree', 'front_bird', 'giant_flower', 'symmetric_tree'];
  const RULES = {
    extent: 30, maxPoints: 700, recoveryMs: 21600000, towerRadius: 5,
    costs: {grass: 4, tree: 7, rock: 10, mine: 15},
    // These are initial placement/balance values, not additional gameplay rules.
    monumentMinDistance: 16, monumentMaxDistance: 24, monumentProtectionWidth: 1,
    sceneryTypes: SCENERY_TYPES, sceneryPerType: 6, sceneryMinDistance: 6, scenerySpecialMargin: 3,
    terrainBands: [
      {distance: 5, grass: .83, tree: .152, rock: .017},
      {distance: 10, grass: .75, tree: .215, rock: .03},
      {distance: 20, grass: .62, tree: .31, rock: .055},
      {distance: 25, grass: .56, tree: .32, rock: .085},
      {distance: Infinity, grass: .51, tree: .335, rock: .11}
    ]
  };
  const LEGACY_TOWERS = [{x: 0, y: -7}, {x: 7, y: -12}, {x: 15, y: -8}, {x: 19, y: 1}, {x: 12, y: 10}];
  const SALT = {terrain: 0x183947a1, appearance: 0x754392a7, landmarks: 0x98cd7413, monument: 0xda951c3b, scenery: 0x4279df63, sceneryType: 0xf837a913, road: 0x79d8b461};
  const key = (x, y) => x + ',' + y;
  const index = w => new Map(w.tiles.map(t => [key(t.x, t.y), t]));
  const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const neighbors = (t, m) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, y]) => m.get(key(t.x + x, t.y + y))).filter(Boolean);
  const eligible = (t, m) => t.visibility === 'preview' && neighbors(t, m).some(n => n.visibility === 'opened');
  const isSeed = n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  const isCoordinate = n => Number.isSafeInteger(n) && Math.abs(n) <= 0x3fffffff;
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const bounds = () => ({minX: -RULES.extent, maxX: RULES.extent, minY: -RULES.extent, maxY: RULES.extent});

  // Integer hashing keeps each coordinate/use independent of generation order.
  function hash(seed, x, y, salt) {
    let h = (seed >>> 0) ^ Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca6b) ^ salt;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function randomSeed() {
    if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    return Math.floor(Math.random() * 0x100000000) >>> 0;
  }
  function requiredCost(kind, x, y, road) {
    const d = Math.max(Math.abs(x), Math.abs(y));
    return Math.max(1, RULES.costs[kind] + Math.max(0, Math.ceil(d / 5) - 1) + (road ? -1 : 0));
  }
  function generateTile(seed, x, y) {
    if (!isSeed(seed) || !isCoordinate(x) || !isCoordinate(y)) throw Error('Invalid generation input');
    const d = Math.max(Math.abs(x), Math.abs(y));
    const band = RULES.terrainBands.find(b => d <= b.distance);
    const value = hash(seed, x, y, SALT.terrain) / 0x100000000;
    const kind = d <= 2 || value < band.grass ? 'grass' : value < band.grass + band.tree ? 'tree' : value < band.grass + band.tree + band.rock ? 'rock' : 'mine';
    const cost = requiredCost(kind, x, y, false);
    return {x, y, seed: hash(seed, x, y, SALT.appearance), kind, road: false,
      landmark: null, landmarkId: null, towerOrder: null, effectApplied: false,
      visibility: x === 0 && y === 0 ? 'opened' : Math.abs(x) + Math.abs(y) === 1 ? 'preview' : 'hidden',
      requiredCost: cost, developmentProgress: x === 0 && y === 0 ? cost : 0};
  }
  function rankedCoordinates(seed, salt, accept) {
    const positions = [];
    for (let y = -RULES.extent; y <= RULES.extent; y++) {
      for (let x = -RULES.extent; x <= RULES.extent; x++) if (accept(x, y)) positions.push({x, y});
    }
    return positions.sort((a, b) => hash(seed, a.x, a.y, salt) - hash(seed, b.x, b.y, salt) || a.y - b.y || a.x - b.x);
  }
  function placeLandmarks(w, m) {
    const roll = (slot, min, max) => min + hash(w.seed, slot, 0, SALT.landmarks) % (max - min + 1);
    const rotation = roll(0, 0, 3), mirror = roll(1, 0, 1) ? -1 : 1;
    function transform(x, y) {
      x *= mirror;
      for (let i = 0; i < rotation; i++) [x, y] = [-y, x];
      return {x, y};
    }
    // Seeded sectors form a short first trip followed by a continuous arc.
    const towerPositions = [
      transform(roll(2, -2, 2), -7),
      transform(roll(3, 6, 9), -roll(4, 11, 14)),
      transform(roll(5, 13, 17), -roll(6, 6, 10)),
      transform(roll(7, 19, 23), roll(8, -1, 3)),
      transform(roll(9, 10, 15), roll(10, 10, 14))
    ];
    towerPositions.forEach((p, order) => Object.assign(m.get(key(p.x, p.y)), {landmark: 'tower', landmarkId: 'tower-' + (order + 1), towerOrder: order}));
    const targets = [
      {kind: 'spring', position: transform(roll(11, 4, 9), -roll(12, 5, 10))},
      {kind: 'ruins', position: transform(roll(13, 11, 17), -roll(14, 3, 9))}
    ];
    for (const {kind, position} of targets) {
      const candidates = rankedCoordinates(w.seed, SALT.landmarks ^ (kind === 'spring' ? 1 : 2), (x, y) => Math.max(Math.abs(x), Math.abs(y)) >= 5);
      candidates.sort((a, b) => distance(a, position) - distance(b, position));
      const selected = candidates.find(p => !m.get(key(p.x, p.y)).landmark);
      if (!selected) throw Error('Cannot place required landmark');
      Object.assign(m.get(key(selected.x, selected.y)), {landmark: kind, landmarkId: kind + '-1'});
    }
  }
  function placeRoads(w, m) {
    const named = kind => w.tiles.find(t => t.landmark === kind);
    const ends = [{x: 0, y: 0}, named('spring'), named('ruins'), w.tiles.find(t => t.towerOrder === 4)];
    for (let i = 1; i < ends.length; i++) {
      let {x, y} = ends[i - 1];
      const target = ends[i];
      const xFirst = hash(w.seed, i, 0, SALT.road) % 2 === 0;
      m.get(key(x, y)).road = true;
      while (x !== target.x || y !== target.y) {
        if ((xFirst && x !== target.x) || y === target.y) x += Math.sign(target.x - x);
        else y += Math.sign(target.y - y);
        m.get(key(x, y)).road = true;
      }
    }
    for (const tile of w.tiles) {
      if (tile.road) tile.requiredCost = requiredCost(tile.kind, tile.x, tile.y, true);
      if (tile.visibility === 'opened') tile.developmentProgress = tile.requiredCost;
    }
  }
  function placeMonument(w) {
    const specials = [{x: 0, y: 0}, ...w.tiles.filter(t => t.landmark)];
    const candidates = rankedCoordinates(w.seed, SALT.monument, (x, y) => {
      const d = Math.max(Math.abs(x), Math.abs(y));
      return d >= RULES.monumentMinDistance && d <= RULES.monumentMaxDistance && Math.abs(x) < RULES.extent && Math.abs(y) < RULES.extent;
    });
    // Finite search, then a deterministic less restrictive fallback; never reroll forever.
    const position = candidates.find(p => specials.every(s => distance(p, s) > 3)) || candidates.find(p => specials.every(s => distance(p, s) > 1));
    if (!position) throw Error('Cannot place required monument');
    const occupied = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) occupied.push({x: position.x + dx, y: position.y + dy});
    w.monuments = [{id: 'monument-1', type: 'stone_arch', ...position, orientation: hash(w.seed, position.x, position.y, SALT.monument ^ 1) % 4, occupied}];
  }
  function placeScenery(w) {
    const specials = [{x: 0, y: 0}, ...w.tiles.filter(t => t.landmark), ...w.monuments.flatMap(o => o.occupied)];
    const clear = p => specials.every(s => distance(p, s) > RULES.scenerySpecialMargin);
    const count = SCENERY_TYPES.length * RULES.sceneryPerType;
    const candidates = rankedCoordinates(w.seed, SALT.scenery, (x, y) => clear({x, y}));
    let selected = [];
    for (const candidate of candidates) {
      if (selected.every(p => distance(candidate, p) >= RULES.sceneryMinDistance)) selected.push(candidate);
      if (selected.length === count) break;
    }
    if (selected.length < count) {
      // A centered spaced lattice leaves ample room after excluding special sites.
      const step = Math.max(8, RULES.sceneryMinDistance);
      const offset = Math.floor(RULES.extent * 2 / step) * step / 2;
      selected = candidates.filter(p => (p.x + offset) % step === 0 && (p.y + offset) % step === 0).slice(0, count);
      if (selected.length < count) throw Error('Cannot place required scenery');
    }
    const types = SCENERY_TYPES.flatMap(type => Array(RULES.sceneryPerType).fill(type)).map((type, n) => ({type, n}));
    types.sort((a, b) => hash(w.seed, a.n, 0, SALT.sceneryType) - hash(w.seed, b.n, 0, SALT.sceneryType) || a.n - b.n);
    w.scenery = selected.map((p, i) => ({id: 'scenery-' + (i + 1), type: types[i].type, ...p, orientation: hash(w.seed, p.x, p.y, SALT.scenery ^ 1) % 4}));
  }
  function create(now = Date.now(), seed = randomSeed()) {
    if (!finite(now) || !isSeed(seed)) throw Error('Invalid generation input');
    const tiles = [];
    for (let y = -RULES.extent; y <= RULES.extent; y++) for (let x = -RULES.extent; x <= RULES.extent; x++) tiles.push(generateTile(seed, x, y));
    const w = {saveVersion: 3, worldVersion: 1, phase: 1, savedAt: now, lastCalculatedAt: now, bounds: bounds(),
      seed, generatorVersion: 2, points: RULES.maxPoints, resources: {wood: 0, rock: 0, metal: 0},
      facilities: {inn: 0, well: 0, workshop: 0}, destination: null, introduced: false, tiles, monuments: [], scenery: []};
    const m = index(w);
    placeLandmarks(w, m);
    placeRoads(w, m);
    placeMonument(w);
    placeScenery(w);
    chooseDestination(w);
    return validate(w);
  }
  function settle(w, now = Date.now()) {
    if (!finite(now)) return;
    const elapsed = Math.max(0, now - w.lastCalculatedAt);
    w.points = Math.min(RULES.maxPoints, w.points + elapsed * RULES.maxPoints / RULES.recoveryMs);
    w.lastCalculatedAt = Math.max(now, w.lastCalculatedAt);
  }
  function applyTowerEffect(w, tower) {
    for (const tile of w.tiles) if (tile.visibility === 'hidden' && distance(tile, tower) <= RULES.towerRadius) tile.visibility = 'preview';
    tower.effectApplied = true;
  }
  function develop(w, t, now = Date.now()) {
    settle(w, now);
    const m = index(w);
    if (!eligible(t, m)) return 'blocked';
    if (w.points < 1) return 'empty';
    w.points--;
    t.developmentProgress = Math.min(t.requiredCost, t.developmentProgress + 1);
    if (t.developmentProgress < t.requiredCost) return 'progress';
    t.visibility = 'opened';
    neighbors(t, m).forEach(n => {if (n.visibility === 'hidden') n.visibility = 'preview';});
    if (t.landmark === 'tower' && !t.effectApplied) {
      applyTowerEffect(w, t);
      chooseDestination(w);
      return 'tower';
    }
    return 'opened';
  }
  function chooseDestination(w) {
    const remaining = w.tiles.filter(t => t.landmark === 'tower' && !t.effectApplied).sort((a, b) => a.towerOrder - b.towerOrder);
    w.destination = remaining.length ? {x: remaining[0].x, y: remaining[0].y} : null;
  }
  function protectedMonumentCoordinates(w, width = RULES.monumentProtectionWidth) {
    if (!Number.isInteger(width) || width < 0) throw Error('Invalid protection width');
    const protectedKeys = new Set();
    for (const monument of w.monuments) for (const p of monument.occupied) {
      for (let dy = -width; dy <= width; dy++) for (let dx = -width; dx <= width; dx++) {
        const x = p.x + dx, y = p.y + dy;
        if (Math.abs(dx) + Math.abs(dy) <= width && x >= w.bounds.minX && x <= w.bounds.maxX && y >= w.bounds.minY && y <= w.bounds.maxY) protectedKeys.add(key(x, y));
      }
    }
    return protectedKeys;
  }
  function validate(w) {
    const fail = () => {throw Error('Invalid save data');};
    if (!w || w.saveVersion !== 3 || w.worldVersion !== 1 || w.phase !== 1 || w.generatorVersion !== 2 || !isSeed(w.seed) || !finite(w.savedAt) || !finite(w.lastCalculatedAt) || !finite(w.points) || w.points < 0 || w.points > RULES.maxPoints || typeof w.introduced !== 'boolean' || !Array.isArray(w.tiles) || w.tiles.length !== 3721) fail();
    const expectedBounds = bounds();
    if (!w.bounds || Object.keys(expectedBounds).some(k => w.bounds[k] !== expectedBounds[k])) fail();
    const seen = new Set(), ids = new Set(), towers = [], landmarks = [], occupied = new Set();
    const coordinate = p => p && Number.isInteger(p.x) && Number.isInteger(p.y) && Math.abs(p.x) <= RULES.extent && Math.abs(p.y) <= RULES.extent;
    const addId = id => {if (typeof id !== 'string' || !id || id.length > 80 || ids.has(id)) fail(); ids.add(id);};
    const orientation = n => Number.isInteger(n) && n >= 0 && n <= 3;
    for (const t of w.tiles) {
      if (!coordinate(t) || seen.has(key(t.x, t.y)) || !Object.hasOwn(RULES.costs, t.kind) || !['hidden', 'preview', 'opened'].includes(t.visibility) || !Number.isSafeInteger(t.requiredCost) || t.requiredCost < 1 || !finite(t.developmentProgress) || t.developmentProgress < 0 || t.developmentProgress > t.requiredCost || typeof t.road !== 'boolean' || typeof t.effectApplied !== 'boolean' || !isSeed(t.seed) || ![null, 'tower', 'spring', 'ruins'].includes(t.landmark) || t.visibility === 'opened' && t.developmentProgress !== t.requiredCost || t.visibility === 'hidden' && t.developmentProgress !== 0 || t.visibility === 'preview' && t.developmentProgress === t.requiredCost || t.effectApplied && (t.landmark !== 'tower' || t.visibility !== 'opened')) fail();
      seen.add(key(t.x, t.y));
      if (t.landmark === null) {if (t.landmarkId !== null || t.towerOrder !== null) fail();}
      else {
        addId(t.landmarkId);
        landmarks.push(t);
        if (t.landmark === 'tower') {if (!Number.isInteger(t.towerOrder) || t.towerOrder < 0 || t.towerOrder > 4 || t.visibility === 'opened' && !t.effectApplied) fail(); towers.push(t);}
        else if (t.towerOrder !== null) fail();
      }
    }
    const m = index(w), city = m.get('0,0');
    if (!city || city.visibility !== 'opened' || city.kind !== 'grass' || city.landmark !== null || towers.length !== 5 || new Set(towers.map(t => t.towerOrder)).size !== 5 || landmarks.filter(t => t.landmark === 'spring').length !== 1 || landmarks.filter(t => t.landmark === 'ruins').length !== 1) fail();
    if (w.destination !== null && (!coordinate(w.destination) || m.get(key(w.destination.x, w.destination.y))?.landmark !== 'tower' || m.get(key(w.destination.x, w.destination.y)).effectApplied)) fail();
    if (w.destination === null && towers.some(t => !t.effectApplied)) fail();
    if (!Array.isArray(w.monuments) || w.monuments.length !== 1) fail();
    for (const monument of w.monuments) {
      if (!coordinate(monument) || monument.type !== 'stone_arch' || !orientation(monument.orientation) || !Array.isArray(monument.occupied) || monument.occupied.length !== 9) fail();
      addId(monument.id);
      for (const p of monument.occupied) {
        if (!coordinate(p) || Math.abs(p.x - monument.x) > 1 || Math.abs(p.y - monument.y) > 1 || occupied.has(key(p.x, p.y)) || p.x === 0 && p.y === 0 || m.get(key(p.x, p.y)).landmark !== null) fail();
        occupied.add(key(p.x, p.y));
      }
    }
    if (!Array.isArray(w.scenery) || w.scenery.length !== SCENERY_TYPES.length * RULES.sceneryPerType) fail();
    const scenerySeen = new Set(), counts = new Map(SCENERY_TYPES.map(type => [type, 0]));
    for (const object of w.scenery) {
      if (!coordinate(object) || !counts.has(object.type) || !orientation(object.orientation) || scenerySeen.has(key(object.x, object.y)) || occupied.has(key(object.x, object.y)) || object.x === 0 && object.y === 0 || m.get(key(object.x, object.y)).landmark !== null) fail();
      addId(object.id);
      scenerySeen.add(key(object.x, object.y));
      counts.set(object.type, counts.get(object.type) + 1);
    }
    if ([...counts.values()].some(n => n !== RULES.sceneryPerType)) fail();
    for (const k of ['wood', 'rock', 'metal']) if (!finite(w.resources?.[k]) || w.resources[k] < 0) fail();
    for (const k of ['inn', 'well', 'workshop']) if (w.facilities?.[k] !== 0) fail();
    // Saved terrain/costs are authoritative; validation never invokes the generator.
    return w;
  }
  function validateLegacy(w) {
    const fail = () => {throw Error('Invalid legacy save data');};
    if (!w || ![1, 2].includes(w.saveVersion) || w.worldVersion !== 1 || w.phase !== 1 || !finite(w.savedAt) || !finite(w.lastCalculatedAt) || !finite(w.points) || w.points < 0 || w.points > 1000 || typeof w.introduced !== 'boolean' || !Array.isArray(w.tiles) || w.tiles.length !== 3721) fail();
    const seen = new Set();
    for (const t of w.tiles) {
      if (!t || !Number.isInteger(t.x) || !Number.isInteger(t.y) || Math.abs(t.x) > 30 || Math.abs(t.y) > 30 || seen.has(key(t.x, t.y)) || !Object.hasOwn(RULES.costs, t.kind) || !['hidden', 'preview', 'opened'].includes(t.visibility) || !Number.isInteger(t.requiredCost) || t.requiredCost < 1 || !finite(t.developmentProgress) || t.developmentProgress < 0 || t.developmentProgress > t.requiredCost || typeof t.road !== 'boolean' || typeof t.effectApplied !== 'boolean' || !finite(t.seed) || ![null, 'tower', 'spring', 'ruins'].includes(t.landmark) || t.visibility === 'opened' && t.developmentProgress !== t.requiredCost || t.effectApplied && (t.landmark !== 'tower' || t.visibility !== 'opened')) fail();
      seen.add(key(t.x, t.y));
    }
    const m = index(w), expectedBounds = bounds();
    if (m.get('0,0').visibility !== 'opened' || !w.bounds || Object.keys(expectedBounds).some(k => w.bounds[k] !== expectedBounds[k]) || !finite(w.seed) || w.generatorVersion !== 1) fail();
    for (const [name, x, y] of [['spring', 6, -5], ['ruins', 10, -7]]) if (w.tiles.filter(t => t.landmark === name).length !== 1 || m.get(key(x, y)).landmark !== name) fail();
    const towers = w.tiles.filter(t => t.landmark === 'tower');
    if (w.saveVersion === 1) {if (towers.length !== 1 || m.get('0,-3').landmark !== 'tower') fail();}
    else if (towers.length !== 5 || !LEGACY_TOWERS.slice(1).every(p => m.get(key(p.x, p.y)).landmark === 'tower') || !['0,-7', '0,-3'].some(k => m.get(k).landmark === 'tower')) fail();
    if (w.destination !== null && (!w.destination || !Number.isInteger(w.destination.x) || !Number.isInteger(w.destination.y) || m.get(key(w.destination.x, w.destination.y))?.landmark !== 'tower' || m.get(key(w.destination.x, w.destination.y)).effectApplied)) fail();
    if (w.destination === null && towers.some(t => !t.effectApplied)) fail();
    for (const k of ['wood', 'rock', 'metal']) if (!finite(w.resources?.[k]) || w.resources[k] < 0) fail();
    for (const k of ['inn', 'well', 'workshop']) if (w.facilities?.[k] !== 0) fail();
    return w;
  }
  function migrate(w, now = Date.now(), seed) {
    if (w?.saveVersion === 3) return validate(w);
    validateLegacy(w);
    // The specification authorizes this one fixed-map transition to start a new world.
    // Invalid/unknown saves never reach create(), and the input is never modified.
    return create(now, seed);
  }
  globalThis.TapWorld = {RULES, create, generateTile, index, eligible, settle, develop, validate, migrate, protectedMonumentCoordinates};
})();
