(() => {
  'use strict';

  const SCENERY_TYPES = [
    'front_statue',
    'leaf_statue',
    'dressed_tree',
    'front_bird',
    'giant_flower',
    'symmetric_tree',
  ];
  const RULES = {
    extent: 30,
    maxPoints: 1200,
    recoveryMs: 21600000,
    towerRadius: 5,
    enclosureLimit: 16,
    costs: { grass: 4, tree: 7, rock: 10, mine: 15 },
    // These are initial placement/balance values, not additional gameplay rules.
    monumentMinDistance: 16,
    monumentMaxDistance: 24,
    monumentProtectionWidth: 1,
    memoOpenedThreshold: 24,
    memoDiscoverZoom: 1.55,
    sceneryTypes: SCENERY_TYPES,
    sceneryPerType: 6,
    sceneryMinDistance: 6,
    scenerySpecialMargin: 3,
    terrainBands: [
      { distance: 5, grass: 0.83, tree: 0.152, rock: 0.017 },
      { distance: 10, grass: 0.75, tree: 0.215, rock: 0.03 },
      { distance: 20, grass: 0.62, tree: 0.31, rock: 0.055 },
      { distance: 25, grass: 0.56, tree: 0.32, rock: 0.085 },
      { distance: Infinity, grass: 0.51, tree: 0.335, rock: 0.11 },
    ],
  };
  const LEGACY_TOWERS = [
    { x: 0, y: -7 },
    { x: 7, y: -12 },
    { x: 15, y: -8 },
    { x: 19, y: 1 },
    { x: 12, y: 10 },
  ];
  const SALT = {
    terrain: 0x183947a1,
    appearance: 0x754392a7,
    landmarks: 0x98cd7413,
    monument: 0xda951c3b,
    scenery: 0x4279df63,
    sceneryType: 0xf837a913,
    road: 0x79d8b461,
  };
  const key = (x, y) => x + ',' + y;
  const index = (w) => new Map(w.tiles.map((t) => [key(t.x, t.y), t]));
  const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const neighbors = (t, m) =>
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
      .map(([x, y]) => m.get(key(t.x + x, t.y + y)))
      .filter(Boolean);
  const eligible = (t, m) =>
    t.visibility === 'preview' && neighbors(t, m).some((n) => n.visibility === 'opened');
  const isSeed = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  const isCoordinate = (n) => Number.isSafeInteger(n) && Math.abs(n) <= 0x3fffffff;
  const finite = (n) => typeof n === 'number' && Number.isFinite(n);
  const bounds = () => ({
    minX: -RULES.extent,
    maxX: RULES.extent,
    minY: -RULES.extent,
    maxY: RULES.extent,
  });

  // Integer hashing keeps each coordinate/use independent of generation order.
  function hash(seed, x, y, salt) {
    let h = (seed >>> 0) ^ Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca6b) ^ salt;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function randomSeed() {
    if (globalThis.crypto?.getRandomValues)
      return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    return Math.floor(Math.random() * 0x100000000) >>> 0;
  }
  function requiredCost(kind, x, y, road) {
    const d = Math.max(Math.abs(x), Math.abs(y));
    return Math.max(1, RULES.costs[kind] + Math.max(0, Math.ceil(d / 5) - 1) + (road ? -1 : 0));
  }
  function generateTile(seed, x, y) {
    if (!isSeed(seed) || !isCoordinate(x) || !isCoordinate(y))
      throw Error('Invalid generation input');
    const d = Math.max(Math.abs(x), Math.abs(y));
    const band = RULES.terrainBands.find((b) => d <= b.distance);
    const value = hash(seed, x, y, SALT.terrain) / 0x100000000;
    const kind =
      d <= 2 || value < band.grass
        ? 'grass'
        : value < band.grass + band.tree
          ? 'tree'
          : value < band.grass + band.tree + band.rock
            ? 'rock'
            : 'mine';
    const cost = requiredCost(kind, x, y, false);
    return {
      x,
      y,
      seed: hash(seed, x, y, SALT.appearance),
      kind,
      road: false,
      landmark: null,
      landmarkId: null,
      towerOrder: null,
      effectApplied: false,
      visibility:
        x === 0 && y === 0 ? 'opened' : Math.abs(x) + Math.abs(y) === 1 ? 'preview' : 'hidden',
      requiredCost: cost,
      developmentProgress: x === 0 && y === 0 ? cost : 0,
    };
  }
  function rankedCoordinates(seed, salt, accept) {
    const positions = [];
    for (let y = -RULES.extent; y <= RULES.extent; y++) {
      for (let x = -RULES.extent; x <= RULES.extent; x++)
        if (accept(x, y)) positions.push({ x, y });
    }
    return positions.sort(
      (a, b) => hash(seed, a.x, a.y, salt) - hash(seed, b.x, b.y, salt) || a.y - b.y || a.x - b.x,
    );
  }
  function placeLandmarks(w, m) {
    const roll = (slot, min, max) =>
      min + (hash(w.seed, slot, 0, SALT.landmarks) % (max - min + 1));
    const rotation = roll(0, 0, 3),
      mirror = roll(1, 0, 1) ? -1 : 1;
    function transform(x, y) {
      x *= mirror;
      for (let i = 0; i < rotation; i++) [x, y] = [-y, x];
      return { x, y };
    }
    // Seeded sectors form a short first trip followed by a continuous arc.
    const towerPositions = [
      transform(roll(2, -2, 2), -7),
      transform(roll(3, 6, 9), -roll(4, 11, 14)),
      transform(roll(5, 13, 17), -roll(6, 6, 10)),
      transform(roll(7, 19, 23), roll(8, -1, 3)),
      transform(roll(9, 10, 15), roll(10, 10, 14)),
    ];
    towerPositions.forEach((p, order) =>
      Object.assign(m.get(key(p.x, p.y)), {
        landmark: 'tower',
        landmarkId: 'tower-' + (order + 1),
        towerOrder: order,
      }),
    );
    const targets = [
      { kind: 'spring', position: transform(roll(11, 4, 9), -roll(12, 5, 10)) },
      { kind: 'ruins', position: transform(roll(13, 11, 17), -roll(14, 3, 9)) },
    ];
    for (const { kind, position } of targets) {
      const candidates = rankedCoordinates(
        w.seed,
        SALT.landmarks ^ (kind === 'spring' ? 1 : 2),
        (x, y) => Math.max(Math.abs(x), Math.abs(y)) >= 5,
      );
      candidates.sort((a, b) => distance(a, position) - distance(b, position));
      const selected = candidates.find((p) => !m.get(key(p.x, p.y)).landmark);
      if (!selected) throw Error('Cannot place required landmark');
      Object.assign(m.get(key(selected.x, selected.y)), {
        landmark: kind,
        landmarkId: kind + '-1',
      });
    }
  }
  function placeRoads(w, m) {
    const blocked = new Set([
      '0,0',
      ...w.tiles.filter((t) => t.landmark).map((t) => key(t.x, t.y)),
      ...w.monuments.flatMap((o) => o.occupied).map((p) => key(p.x, p.y)),
      ...w.scenery.map((p) => key(p.x, p.y)),
    ]);
    const adjacent = (p) =>
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
        .map(([dx, dy]) => m.get(key(p.x + dx, p.y + dy)))
        .filter((t) => t && t.kind === 'grass' && !blocked.has(key(t.x, t.y)));
    const named = (kind) => w.tiles.find((t) => t.landmark === kind);
    const ends = [
      { x: 0, y: 0 },
      named('spring'),
      named('ruins'),
      w.tiles.find((t) => t.towerOrder === 4),
    ];
    const starts = adjacent(ends[0]);
    let start = starts[hash(w.seed, 0, 0, SALT.road) % starts.length];
    // Stay on existing grass; unreachable destinations stop at the closest reachable cell.
    for (let i = 1; i < ends.length; i++) {
      const targets = new Set(adjacent(ends[i]).map((t) => key(t.x, t.y)));
      const queue = [start],
        previous = new Map([[key(start.x, start.y), null]]);
      let end = start;
      const remaining = (t) => Math.abs(t.x - ends[i].x) + Math.abs(t.y - ends[i].y);
      for (let n = 0; n < queue.length; n++) {
        const tile = queue[n],
          tileKey = key(tile.x, tile.y);
        if (remaining(tile) < remaining(end)) end = tile;
        if (targets.has(tileKey)) {
          end = tile;
          break;
        }
        for (const next of adjacent(tile)) {
          const nextKey = key(next.x, next.y);
          if (!previous.has(nextKey)) {
            previous.set(nextKey, tileKey);
            queue.push(next);
          }
        }
      }
      for (let p = key(end.x, end.y); p !== null; p = previous.get(p)) m.get(p).road = true;
      start = end;
    }
    for (const tile of w.tiles) {
      if (tile.road) tile.requiredCost = requiredCost(tile.kind, tile.x, tile.y, true);
      if (tile.visibility === 'opened') tile.developmentProgress = tile.requiredCost;
    }
  }
  function placeMonument(w) {
    const specials = [{ x: 0, y: 0 }, ...w.tiles.filter((t) => t.landmark)];
    const candidates = rankedCoordinates(w.seed, SALT.monument, (x, y) => {
      const d = Math.max(Math.abs(x), Math.abs(y));
      return (
        d >= RULES.monumentMinDistance &&
        d <= RULES.monumentMaxDistance &&
        Math.abs(x) < RULES.extent &&
        Math.abs(y) < RULES.extent
      );
    });
    // Finite search, then a deterministic less restrictive fallback; never reroll forever.
    const position =
      candidates.find((p) => specials.every((s) => distance(p, s) > 3)) ||
      candidates.find((p) => specials.every((s) => distance(p, s) > 1));
    if (!position) throw Error('Cannot place required monument');
    const occupied = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) occupied.push({ x: position.x + dx, y: position.y + dy });
    w.monuments = [
      {
        id: 'monument-1',
        type: 'stone_arch',
        ...position,
        orientation: hash(w.seed, position.x, position.y, SALT.monument ^ 1) % 4,
        occupied,
      },
    ];
  }
  function placeScenery(w) {
    const specials = [
      { x: 0, y: 0 },
      ...w.tiles.filter((t) => t.landmark),
      ...w.monuments.flatMap((o) => o.occupied),
    ];
    const clear = (p) => specials.every((s) => distance(p, s) > RULES.scenerySpecialMargin);
    const count = SCENERY_TYPES.length * RULES.sceneryPerType;
    const candidates = rankedCoordinates(w.seed, SALT.scenery, (x, y) => clear({ x, y }));
    let selected = [];
    for (const candidate of candidates) {
      if (selected.every((p) => distance(candidate, p) >= RULES.sceneryMinDistance))
        selected.push(candidate);
      if (selected.length === count) break;
    }
    if (selected.length < count) {
      // A centered spaced lattice leaves ample room after excluding special sites.
      const step = Math.max(8, RULES.sceneryMinDistance);
      const offset = (Math.floor((RULES.extent * 2) / step) * step) / 2;
      selected = candidates
        .filter((p) => (p.x + offset) % step === 0 && (p.y + offset) % step === 0)
        .slice(0, count);
      if (selected.length < count) throw Error('Cannot place required scenery');
    }
    const types = SCENERY_TYPES.flatMap((type) => Array(RULES.sceneryPerType).fill(type)).map(
      (type, n) => ({ type, n }),
    );
    types.sort(
      (a, b) =>
        hash(w.seed, a.n, 0, SALT.sceneryType) - hash(w.seed, b.n, 0, SALT.sceneryType) ||
        a.n - b.n,
    );
    w.scenery = selected.map((p, i) => ({
      id: 'scenery-' + (i + 1),
      type: types[i].type,
      ...p,
      orientation: hash(w.seed, p.x, p.y, SALT.scenery ^ 1) % 4,
    }));
  }
  function create(now = Date.now(), seed = randomSeed()) {
    if (!finite(now) || !isSeed(seed)) throw Error('Invalid generation input');
    const tiles = [];
    for (let y = -RULES.extent; y <= RULES.extent; y++)
      for (let x = -RULES.extent; x <= RULES.extent; x++) tiles.push(generateTile(seed, x, y));
    const w = {
      saveVersion: 7,
      worldVersion: 1,
      phase: 1,
      savedAt: now,
      lastCalculatedAt: now,
      bounds: bounds(),
      seed,
      generatorVersion: 4,
      points: RULES.maxPoints,
      resources: { wood: 0, rock: 0, metal: 0 },
      facilities: { inn: 0, well: 0, workshop: 0 },
      destination: null,
      introduced: false,
      tiles,
      monuments: [],
      scenery: [],
    };
    const m = index(w);
    placeLandmarks(w, m);
    placeMonument(w);
    placeScenery(w);
    placeRoads(w, m);
    w.memo = { status: 'waiting', clue: null, monumentId: w.monuments[0].id, asideId: null };
    chooseDestination(w);
    return validate(w);
  }
  function settle(w, now = Date.now()) {
    if (!finite(now)) return;
    const elapsed = Math.max(0, now - w.lastCalculatedAt);
    w.points = Math.min(RULES.maxPoints, w.points + (elapsed * RULES.maxPoints) / RULES.recoveryMs);
    w.lastCalculatedAt = Math.max(now, w.lastCalculatedAt);
  }
  function applyTowerEffect(w, tower) {
    for (const tile of w.tiles)
      if (tile.visibility === 'hidden' && distance(tile, tower) <= RULES.towerRadius)
        tile.visibility = 'preview';
    tower.effectApplied = true;
  }
  function completeTile(w, t, m) {
    if (t.visibility === 'opened') return;
    t.developmentProgress = t.requiredCost;
    t.visibility = 'opened';
    neighbors(t, m).forEach((n) => {
      if (n.visibility === 'hidden') n.visibility = 'preview';
    });
    if (t.landmark === 'tower' && !t.effectApplied) {
      applyTowerEffect(w, t);
    }
    // Opened terrain is the production source; production starts in Phase 2.
  }
  function completeMonument(w, monument, m) {
    const entries = monument.occupied
      .map((p) => m.get(key(p.x, p.y)))
      .filter((t) => t.visibility !== 'opened')
      .map((tile) => ({ tile, visibility: tile.visibility, progress: tile.developmentProgress }));
    for (const entry of entries) completeTile(w, entry.tile, m);
    return entries;
  }
  function enclosedRegions(w, origin, m) {
    const checked = new Set(),
      protectedKeys = protectedMonumentCoordinates(w),
      regions = [];
    for (const start of neighbors(origin, m)) {
      if (start.visibility === 'opened' || checked.has(key(start.x, start.y))) continue;
      const region = [start],
        seen = new Set([key(start.x, start.y)]);
      let allowed = true;
      for (let i = 0; i < region.length && region.length <= RULES.enclosureLimit; i++) {
        const t = region[i],
          k = key(t.x, t.y);
        checked.add(k);
        if (protectedKeys.has(k) || t.landmark) allowed = false;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const n = m.get(key(t.x + dx, t.y + dy));
          if (!n) {
            allowed = false;
            continue;
          }
          if (n.visibility !== 'opened' && !seen.has(key(n.x, n.y))) {
            seen.add(key(n.x, n.y));
            region.push(n);
          }
        }
      }
      if (allowed && region.length <= RULES.enclosureLimit) regions.push(region);
    }
    return regions;
  }
  function develop(w, t, now = Date.now(), onComplete) {
    settle(w, now);
    const m = index(w);
    if (m.get(key(t.x, t.y)) !== t) return 'blocked';
    if (!eligible(t, m)) return 'blocked';
    if (w.points < 1) return 'empty';
    // Check the pre-tap state: the opening that first meets the threshold cannot
    // place the clue, and automatic openings only qualify a later manual tap.
    const memoReady =
      w.memo.status === 'waiting' &&
      w.tiles.some((tile) => tile.towerOrder === 0 && tile.effectApplied) &&
      w.tiles.filter((tile) => tile.visibility === 'opened').length >= RULES.memoOpenedThreshold;
    w.points--;
    t.developmentProgress = Math.min(t.requiredCost, t.developmentProgress + 1);
    if (t.developmentProgress < t.requiredCost) return 'progress';
    const previousMonuments = w.monuments.map((monument) => ({
      monument,
      ...monumentStatus(w, monument, m),
    }));
    completeTile(w, t, m);
    // Gather every result before opening anything: automatic openings cannot chain.
    const regions = enclosedRegions(w, t, m);
    const automatic = regions
      .flat()
      .map((tile) => ({ tile, visibility: tile.visibility, progress: tile.developmentProgress }));
    for (const entry of automatic) completeTile(w, entry.tile, m);
    const reached = previousMonuments.find(
      (p) => !p.reached && monumentStatus(w, p.monument, m).reached,
    );
    const monumentAutomatic = reached ? completeMonument(w, reached.monument, m) : [];
    const memoPlaced = memoReady && ordinaryMemoTile(w, t);
    if (memoPlaced) {
      w.memo.status = 'placed';
      w.memo.clue = { x: t.x, y: t.y };
      w.memo.asideId = chooseMemoAside(w);
    }
    const monumentReached =
      previousMonuments.find((p) => !p.reached && monumentStatus(w, p.monument, m).reached)
        ?.monument || null;
    const monumentRevealed =
      previousMonuments.find(
        (p) => !p.fullyRevealed && monumentStatus(w, p.monument, m).fullyRevealed,
      )?.monument || null;
    if (t.landmark === 'tower') chooseDestination(w);
    if (onComplete)
      onComplete({
        tile: t,
        regions,
        automatic,
        monumentAutomatic,
        memoPlaced,
        monumentReached,
        monumentRevealed,
      });
    return t.landmark === 'tower' ? 'tower' : 'opened';
  }
  function monumentStatus(w, monument, m = index(w)) {
    const opened = monument.occupied.filter(
      (p) => m.get(key(p.x, p.y))?.visibility === 'opened',
    ).length;
    return {
      opened,
      total: monument.occupied.length,
      reached: opened > 0,
      fullyRevealed: opened === monument.occupied.length,
    };
  }
  function ordinaryMemoTile(w, t) {
    return (
      t.landmark === null &&
      !(t.x === 0 && t.y === 0) &&
      !w.monuments.some((monument) => monument.occupied.some((p) => p.x === t.x && p.y === t.y)) &&
      !w.scenery.some((object) => object.x === t.x && object.y === t.y)
    );
  }
  function collectMemo(w, t, zoom) {
    if (
      !finite(zoom) ||
      zoom < RULES.memoDiscoverZoom ||
      w.memo.status !== 'placed' ||
      !t ||
      t.x !== w.memo.clue.x ||
      t.y !== w.memo.clue.y ||
      t.visibility !== 'opened' ||
      index(w).get(key(t.x, t.y)) !== t
    )
      return null;
    const monument = w.monuments.find((object) => object.id === w.memo.monumentId);
    const alreadyReached = monumentStatus(w, monument).reached;
    w.memo.status = 'collected';
    return { monument, alreadyReached };
  }
  function chooseDestination(w) {
    const remaining = w.tiles
      .filter((t) => t.landmark === 'tower' && !t.effectApplied)
      .sort((a, b) => a.towerOrder - b.towerOrder);
    w.destination = remaining.length ? { x: remaining[0].x, y: remaining[0].y } : null;
  }
  function destinations(w, m = index(w)) {
    const result = [],
      seen = new Set();
    const add = (p) => {
      if (!seen.has(key(p.x, p.y))) {
        seen.add(key(p.x, p.y));
        result.push({ x: p.x, y: p.y });
      }
    };
    const tower = w.destination && m.get(key(w.destination.x, w.destination.y));
    if (tower?.landmark === 'tower' && !tower.effectApplied) add(tower);
    if (w.memo.status === 'collected') {
      const monument = w.monuments.find((object) => object.id === w.memo.monumentId);
      if (monument && !monumentStatus(w, monument, m).reached) add(monument);
    }
    return result;
  }
  function protectedMonumentCoordinates(w, width = RULES.monumentProtectionWidth) {
    if (!Number.isInteger(width) || width < 0) throw Error('Invalid protection width');
    const protectedKeys = new Set();
    for (const monument of w.monuments)
      for (const p of monument.occupied) {
        for (let dy = -width; dy <= width; dy++)
          for (let dx = -width; dx <= width; dx++) {
            const x = p.x + dx,
              y = p.y + dy;
            if (
              Math.abs(dx) + Math.abs(dy) <= width &&
              x >= w.bounds.minX &&
              x <= w.bounds.maxX &&
              y >= w.bounds.minY &&
              y <= w.bounds.maxY
            )
              protectedKeys.add(key(x, y));
          }
      }
    return protectedKeys;
  }
  function validateWorld(w, saveVersion) {
    const fail = () => {
      throw Error('Invalid save data');
    };
    if (
      !w ||
      w.saveVersion !== saveVersion ||
      w.worldVersion !== 1 ||
      w.phase !== 1 ||
      ![2, 3, 4].includes(w.generatorVersion) ||
      !isSeed(w.seed) ||
      !finite(w.savedAt) ||
      !finite(w.lastCalculatedAt) ||
      !finite(w.points) ||
      w.points < 0 ||
      w.points > (saveVersion < 7 ? 700 : RULES.maxPoints) ||
      typeof w.introduced !== 'boolean' ||
      !Array.isArray(w.tiles) ||
      w.tiles.length !== 3721
    )
      fail();
    const expectedBounds = bounds();
    if (!w.bounds || Object.keys(expectedBounds).some((k) => w.bounds[k] !== expectedBounds[k]))
      fail();
    const seen = new Set(),
      ids = new Set(),
      towers = [],
      landmarks = [],
      occupied = new Set();
    const coordinate = (p) =>
      p &&
      Number.isInteger(p.x) &&
      Number.isInteger(p.y) &&
      Math.abs(p.x) <= RULES.extent &&
      Math.abs(p.y) <= RULES.extent;
    const addId = (id) => {
      if (typeof id !== 'string' || !id || id.length > 80 || ids.has(id)) fail();
      ids.add(id);
    };
    const orientation = (n) => Number.isInteger(n) && n >= 0 && n <= 3;
    for (const t of w.tiles) {
      if (
        !coordinate(t) ||
        seen.has(key(t.x, t.y)) ||
        !Object.hasOwn(RULES.costs, t.kind) ||
        !['hidden', 'preview', 'opened'].includes(t.visibility) ||
        !Number.isSafeInteger(t.requiredCost) ||
        t.requiredCost < 1 ||
        !finite(t.developmentProgress) ||
        t.developmentProgress < 0 ||
        t.developmentProgress > t.requiredCost ||
        typeof t.road !== 'boolean' ||
        typeof t.effectApplied !== 'boolean' ||
        !isSeed(t.seed) ||
        ![null, 'tower', 'spring', 'ruins'].includes(t.landmark) ||
        (t.visibility === 'opened' && t.developmentProgress !== t.requiredCost) ||
        (t.visibility === 'hidden' && t.developmentProgress !== 0) ||
        (t.visibility === 'preview' && t.developmentProgress === t.requiredCost) ||
        (t.effectApplied && (t.landmark !== 'tower' || t.visibility !== 'opened'))
      )
        fail();
      seen.add(key(t.x, t.y));
      if (t.landmark === null) {
        if (t.landmarkId !== null || t.towerOrder !== null) fail();
      } else {
        addId(t.landmarkId);
        landmarks.push(t);
        if (t.landmark === 'tower') {
          if (
            !Number.isInteger(t.towerOrder) ||
            t.towerOrder < 0 ||
            t.towerOrder > 4 ||
            (t.visibility === 'opened' && !t.effectApplied)
          )
            fail();
          towers.push(t);
        } else if (t.towerOrder !== null) fail();
      }
    }
    const m = index(w),
      city = m.get('0,0');
    if (
      !city ||
      city.visibility !== 'opened' ||
      city.kind !== 'grass' ||
      city.landmark !== null ||
      towers.length !== 5 ||
      new Set(towers.map((t) => t.towerOrder)).size !== 5 ||
      landmarks.filter((t) => t.landmark === 'spring').length !== 1 ||
      landmarks.filter((t) => t.landmark === 'ruins').length !== 1
    )
      fail();
    if (!Array.isArray(w.monuments) || w.monuments.length !== 1) fail();
    for (const monument of w.monuments) {
      if (
        !coordinate(monument) ||
        monument.type !== 'stone_arch' ||
        !orientation(monument.orientation) ||
        !Array.isArray(monument.occupied) ||
        monument.occupied.length !== 9
      )
        fail();
      addId(monument.id);
      for (const p of monument.occupied) {
        if (
          !coordinate(p) ||
          Math.abs(p.x - monument.x) > 1 ||
          Math.abs(p.y - monument.y) > 1 ||
          occupied.has(key(p.x, p.y)) ||
          (p.x === 0 && p.y === 0) ||
          m.get(key(p.x, p.y)).landmark !== null
        )
          fail();
        occupied.add(key(p.x, p.y));
      }
    }
    if (
      !Array.isArray(w.scenery) ||
      w.scenery.length !== SCENERY_TYPES.length * RULES.sceneryPerType
    )
      fail();
    const scenerySeen = new Set(),
      counts = new Map(SCENERY_TYPES.map((type) => [type, 0]));
    for (const object of w.scenery) {
      if (
        !coordinate(object) ||
        !counts.has(object.type) ||
        !orientation(object.orientation) ||
        scenerySeen.has(key(object.x, object.y)) ||
        occupied.has(key(object.x, object.y)) ||
        (object.x === 0 && object.y === 0) ||
        m.get(key(object.x, object.y)).landmark !== null
      )
        fail();
      addId(object.id);
      scenerySeen.add(key(object.x, object.y));
      counts.set(object.type, counts.get(object.type) + 1);
    }
    if ([...counts.values()].some((n) => n !== RULES.sceneryPerType)) fail();
    let target = null;
    if (saveVersion >= 4) {
      if (
        !w.memo ||
        Array.isArray(w.memo) ||
        !['waiting', 'placed', 'collected'].includes(w.memo.status) ||
        !w.monuments.some((monument) => monument.id === w.memo.monumentId)
      )
        fail();
      if (w.memo.status === 'waiting') {
        if (w.memo.clue !== null) fail();
      } else if (
        !coordinate(w.memo.clue) ||
        m.get(key(w.memo.clue.x, w.memo.clue.y)).visibility !== 'opened' ||
        !ordinaryMemoTile(w, m.get(key(w.memo.clue.x, w.memo.clue.y))) ||
        !towers.some((t) => t.towerOrder === 0 && t.effectApplied)
      )
        fail();
      if (saveVersion === 4 && w.memo.status === 'collected') {
        const monument = w.monuments.find((object) => object.id === w.memo.monumentId);
        if (!monumentStatus(w, monument, m).reached) target = monument;
      }
    }
    if (target) {
      if (
        !coordinate(w.destination) ||
        w.destination.x !== target.x ||
        w.destination.y !== target.y
      )
        fail();
    } else {
      if (
        w.destination !== null &&
        (!coordinate(w.destination) ||
          m.get(key(w.destination.x, w.destination.y))?.landmark !== 'tower' ||
          m.get(key(w.destination.x, w.destination.y)).effectApplied)
      )
        fail();
      if (w.destination === null && towers.some((t) => !t.effectApplied)) fail();
    }
    for (const k of ['wood', 'rock', 'metal'])
      if (!finite(w.resources?.[k]) || w.resources[k] < 0) fail();
    for (const k of ['inn', 'well', 'workshop']) if (w.facilities?.[k] !== 0) fail();
    // Saved terrain/costs are authoritative; validation never invokes the generator.
    return w;
  }
  // Published IDs and their original texts stay fixed; revisions receive new IDs.
  // Original production references, in order: Kurt Vonnegut, Charles Bukowski,
  // Richard Brautigan, Kenji Nakagami, Jorge Luis Borges, Kobo Abe.
  // These references are never labels in the game.
  const memoAsides = Object.freeze({
    'planet-1': '星がひとつ消えた。\nここでは石がひとつ倒れた。\nどちらも、昨日のことだ。',
    'room-1': '寝床にはまだ昼の熱が残っていた。\nくそったれ、外の石のほうがよく眠っている。',
    'afternoon-1': '午後を三つに折った。\n折り目には、緑の鱒が一匹いた。',
    'land-1':
      '土を踏む、また踏む、ここを出た父も戻らなかった父も同じ土を踏んだと、\n誰の声ともつかぬ声が足の底に残っていた。',
    'index-1':
      '架空の書物『不在の石目録』では、初版に石の数が記されている。\n第二版は同じ数の空白から成る。編者は訂正と呼んだ。',
    'form-1':
      '箱の内側に所有者の名前を書く欄がある。\n記入すると、外にいる者のほうが内容物となる。',
  });
  function chooseMemoAside(w) {
    const ids = Object.keys(memoAsides),
      p = w.memo.clue,
      monument = w.monuments.find((m) => m.id === w.memo.monumentId);
    return ids[
      hash(w.seed, p.x, p.y, hash(w.seed, monument.x, monument.y, 0x631fa927)) % ids.length
    ];
  }
  function memoAside(w) {
    return Object.hasOwn(memoAsides, w.memo.asideId) ? memoAsides[w.memo.asideId] : '';
  }
  function validate(w, version = 7) {
    validateWorld(w, version);
    if (
      w.memo.status === 'waiting'
        ? w.memo.asideId !== null
        : typeof w.memo.asideId !== 'string' || !Object.hasOwn(memoAsides, w.memo.asideId)
    )
      throw Error('Invalid memo aside');
    return w;
  }
  function validateLegacy(w) {
    const fail = () => {
      throw Error('Invalid legacy save data');
    };
    if (
      !w ||
      ![1, 2].includes(w.saveVersion) ||
      w.worldVersion !== 1 ||
      w.phase !== 1 ||
      !finite(w.savedAt) ||
      !finite(w.lastCalculatedAt) ||
      !finite(w.points) ||
      w.points < 0 ||
      w.points > 1000 ||
      typeof w.introduced !== 'boolean' ||
      !Array.isArray(w.tiles) ||
      w.tiles.length !== 3721
    )
      fail();
    const seen = new Set();
    for (const t of w.tiles) {
      if (
        !t ||
        !Number.isInteger(t.x) ||
        !Number.isInteger(t.y) ||
        Math.abs(t.x) > 30 ||
        Math.abs(t.y) > 30 ||
        seen.has(key(t.x, t.y)) ||
        !Object.hasOwn(RULES.costs, t.kind) ||
        !['hidden', 'preview', 'opened'].includes(t.visibility) ||
        !Number.isInteger(t.requiredCost) ||
        t.requiredCost < 1 ||
        !finite(t.developmentProgress) ||
        t.developmentProgress < 0 ||
        t.developmentProgress > t.requiredCost ||
        typeof t.road !== 'boolean' ||
        typeof t.effectApplied !== 'boolean' ||
        !finite(t.seed) ||
        ![null, 'tower', 'spring', 'ruins'].includes(t.landmark) ||
        (t.visibility === 'opened' && t.developmentProgress !== t.requiredCost) ||
        (t.effectApplied && (t.landmark !== 'tower' || t.visibility !== 'opened'))
      )
        fail();
      seen.add(key(t.x, t.y));
    }
    const m = index(w),
      expectedBounds = bounds();
    if (
      m.get('0,0').visibility !== 'opened' ||
      !w.bounds ||
      Object.keys(expectedBounds).some((k) => w.bounds[k] !== expectedBounds[k]) ||
      !finite(w.seed) ||
      w.generatorVersion !== 1
    )
      fail();
    for (const [name, x, y] of [
      ['spring', 6, -5],
      ['ruins', 10, -7],
    ])
      if (
        w.tiles.filter((t) => t.landmark === name).length !== 1 ||
        m.get(key(x, y)).landmark !== name
      )
        fail();
    const towers = w.tiles.filter((t) => t.landmark === 'tower');
    if (w.saveVersion === 1) {
      if (towers.length !== 1 || m.get('0,-3').landmark !== 'tower') fail();
    } else if (
      towers.length !== 5 ||
      !LEGACY_TOWERS.slice(1).every((p) => m.get(key(p.x, p.y)).landmark === 'tower') ||
      !['0,-7', '0,-3'].some((k) => m.get(k).landmark === 'tower')
    )
      fail();
    if (
      w.destination !== null &&
      (!w.destination ||
        !Number.isInteger(w.destination.x) ||
        !Number.isInteger(w.destination.y) ||
        m.get(key(w.destination.x, w.destination.y))?.landmark !== 'tower' ||
        m.get(key(w.destination.x, w.destination.y)).effectApplied)
    )
      fail();
    if (w.destination === null && towers.some((t) => !t.effectApplied)) fail();
    for (const k of ['wood', 'rock', 'metal'])
      if (!finite(w.resources?.[k]) || w.resources[k] < 0) fail();
    for (const k of ['inn', 'well', 'workshop']) if (w.facilities?.[k] !== 0) fail();
    return w;
  }
  function migrate(w, now = Date.now(), seed) {
    if (w?.saveVersion === 7) return validate(w);
    if (w?.saveVersion === 6) {
      validate(w, 6);
      if (!finite(now)) throw Error('Invalid migration time');
      const migrated = JSON.parse(JSON.stringify(w));
      migrated.points = Math.min(
        700,
        migrated.points + (Math.max(0, now - migrated.lastCalculatedAt) * 700) / RULES.recoveryMs,
      );
      migrated.lastCalculatedAt = Math.max(now, migrated.lastCalculatedAt);
      migrated.saveVersion = 7;
      const m = index(migrated);
      for (const monument of migrated.monuments)
        if (monumentStatus(migrated, monument, m).reached) completeMonument(migrated, monument, m);
      return validate(migrated);
    }
    if (w?.saveVersion === 5) {
      validateWorld(w, 5);
      const migrated = JSON.parse(JSON.stringify(w));
      migrated.saveVersion = 6;
      // Fill only absent legacy IDs; loading never places or collects a note.
      if (!Object.hasOwn(migrated.memo, 'asideId'))
        migrated.memo.asideId =
          migrated.memo.status === 'waiting' ? null : chooseMemoAside(migrated);
      return migrate(migrated, now, seed);
    }
    if (w?.saveVersion === 4) {
      validateWorld(w, 4);
      const migrated = JSON.parse(JSON.stringify(w));
      migrated.saveVersion = 5;
      // Version 4 replaced the tower marker with the memo target. Restore only
      // that hidden tower guide; all land, progress and event data remain saved.
      if (
        migrated.destination &&
        index(migrated).get(key(migrated.destination.x, migrated.destination.y)).landmark !==
          'tower'
      )
        chooseDestination(migrated);
      return migrate(migrated, now, seed);
    }
    if (w?.saveVersion === 3) {
      validateWorld(w, 3);
      // Only the new event state is added; all saved land and reservations stay authoritative.
      const migrated = JSON.parse(JSON.stringify(w));
      migrated.saveVersion = 5;
      migrated.memo = { status: 'waiting', clue: null, monumentId: migrated.monuments[0].id };
      return migrate(migrated, now, seed);
    }
    validateLegacy(w);
    // The specification authorizes this one fixed-map transition to start a new world.
    // Invalid/unknown saves never reach create(), and the input is never modified.
    return create(now, seed);
  }
  globalThis.TapWorld = {
    RULES,
    create,
    generateTile,
    index,
    eligible,
    settle,
    develop,
    collectMemo,
    monumentStatus,
    destinations,
    validate,
    migrate,
    protectedMonumentCoordinates,
    memoAsides,
    memoAside,
  };
})();
