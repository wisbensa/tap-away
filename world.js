(() => {
  'use strict';

  const SCENERY_TYPES = [
    'front_statue',
    'leaf_statue',
    'dressed_tree',
    'front_bird',
    'giant_flower',
    'symmetric_tree',
    'seated_statue',
    'long_statue',
    'paired_statue',
  ];
  const MONUMENTS = Object.freeze({
    doll_keeper: '人形を抱く大きな子',
    ball_chasers: '球を追う三人',
    couple_under_trees: '木陰のふたり',
    child_on_rock: '岩上の子',
    guard_in_wooden_frame: '木枠の番人',
    piper_and_birds: '鳥たちの笛吹き',
    elder_with_black_dog: '黒犬と杖の老人',
  });
  // Provisional pacing and density values: evaluate a leisurely ~30-minute route on devices.
  const RULES = {
    saveVersion: 11,
    extent: 30,
    monumentCount: 3,
    towerRadius: 5,
    costs: { grass: 12, tree: 18, rock: 24, mine: 30 },
    monumentMinDistance: 16,
    monumentMaxDistance: 24,
    monumentSpacing: 12,
    monumentProtectionWidth: 1,
    enclosureLimit: 16,
    memoOpenedThreshold: 8,
    memoManualInterval: 12,
    memoDiscoverZoom: 1.55,
    sceneryTypes: SCENERY_TYPES,
    sceneryCount: 18,
    sceneryMinDistance: 6,
    scenerySpecialMargin: 2,
    sceneryCounts: Object.fromEntries(SCENERY_TYPES.map((type) => [type, 2])),
    terrainBands: [
      { distance: 5, grass: 0.83, tree: 0.152, rock: 0.017 },
      { distance: 10, grass: 0.75, tree: 0.215, rock: 0.03 },
      { distance: 20, grass: 0.62, tree: 0.31, rock: 0.055 },
      { distance: Infinity, grass: 0.56, tree: 0.32, rock: 0.085 },
    ],
  };
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
  // Smooth seeded perimeter, with a generous solid center; four-neighbor topology stays intact.
  function validPosition(seed, x, y) {
    const angle = Math.atan2(y, x),
      phase = ((seed % 1000) / 1000) * Math.PI * 2;
    const radius =
      RULES.extent - 2 + 1.2 * Math.sin(angle * 3 + phase) + 0.7 * Math.cos(angle * 5 - phase);
    return Math.abs(x) <= RULES.extent && Math.abs(y) <= RULES.extent && Math.hypot(x, y) <= radius;
  }
  function requiredCost(kind) {
    return RULES.costs[kind];
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
        if (validPosition(seed, x, y) && accept(x, y)) positions.push({ x, y });
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
  }
  function placeMonument(w) {
    const m = index(w);
    // Distinct seeded choices and nearest-next guidance are provisional selection rules.
    const types = Object.keys(MONUMENTS)
      .map((type, n) => ({ type, n }))
      .sort(
        (a, b) =>
          hash(w.seed, a.n, 0, SALT.monument ^ 7) - hash(w.seed, b.n, 0, SALT.monument ^ 7) ||
          a.n - b.n,
      );
    for (let n = 0; n < RULES.monumentCount; n++) {
      const candidates = rankedCoordinates(w.seed, SALT.monument ^ n, (x, y) => {
        const d = Math.hypot(x, y);
        return d >= RULES.monumentMinDistance && d <= RULES.monumentMaxDistance;
      });
      const position = candidates.find(
        (p) =>
          w.tiles.filter((t) => t.landmark).every((t) => distance(p, t) > 3) &&
          w.monuments.every((q) => distance(p, q) >= RULES.monumentSpacing) &&
          [0, 1].every((dx) => [0, 1].every((dy) => m.has(key(p.x + dx, p.y + dy)))),
      );
      if (!position) throw Error('Cannot place required landmark');
      const occupied = [0, 1].flatMap((dy) =>
        [0, 1].map((dx) => ({ x: position.x + dx, y: position.y + dy })),
      );
      for (const p of occupied) {
        const tile = m.get(key(p.x, p.y));
        if (tile.kind === 'mine') {
          tile.kind = 'rock';
          tile.requiredCost = requiredCost('rock');
        }
      }
      w.monuments.push({
        id: 'monument-' + (n + 1),
        type: types[n].type,
        ...position,
        orientation: 0,
        occupied,
      });
    }
  }
  function placeScenery(w) {
    const specials = [
      { x: 0, y: 0 },
      ...w.tiles.filter((t) => t.landmark),
      ...w.monuments.flatMap((o) => o.occupied),
    ];
    const clear = (p) => specials.every((s) => distance(p, s) > RULES.scenerySpecialMargin);
    const count = RULES.sceneryCount;
    const candidates = rankedCoordinates(w.seed, SALT.scenery, (x, y) => clear({ x, y }));
    let selected = [];
    for (const candidate of candidates) {
      if (selected.every((p) => distance(candidate, p) >= RULES.sceneryMinDistance))
        selected.push(candidate);
      if (selected.length === count) break;
    }
    if (selected.length < count) {
      // Search every phase of a spaced lattice, retaining a finite deterministic fallback.
      const step = RULES.sceneryMinDistance;
      for (let ox = 0; ox < step && selected.length < count; ox++)
        for (let oy = 0; oy < step && selected.length < count; oy++) {
          const lattice = candidates
            .filter(
              (p) =>
                (p.x + RULES.extent + ox) % step === 0 && (p.y + RULES.extent + oy) % step === 0,
            )
            .slice(0, count);
          if (lattice.length > selected.length) selected = lattice;
        }
      if (selected.length < count) throw Error('Cannot place required scenery');
    }
    const types = SCENERY_TYPES.flatMap((type) => Array(RULES.sceneryCounts[type]).fill(type)).map(
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
      for (let x = -RULES.extent; x <= RULES.extent; x++)
        if (validPosition(seed, x, y)) tiles.push(generateTile(seed, x, y));
    const w = {
      saveVersion: RULES.saveVersion,
      worldVersion: 2,
      generatorVersion: 6,
      seed,
      bounds: bounds(),
      savedAt: now,
      introduced: false,
      completionDismissed: false,
      tiles,
      monuments: [],
      scenery: [],
      memoHistory: [],
      memoManualOpened: 0,
    };
    placeLandmarks(w, index(w));
    for (const t of w.tiles)
      if (t.landmark === 'tower' && t.kind === 'mine') {
        t.kind = 'rock';
        t.requiredCost = requiredCost('rock');
      }
    placeMonument(w);
    placeScenery(w);
    w.memo = {
      status: 'waiting',
      clue: null,
      monumentId: w.monuments[0].id,
      asideId: null,
      hintId: null,
    };
    return validate(w);
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
    if (t.landmark === 'tower' && !t.effectApplied) applyTowerEffect(w, t);
    neighbors(t, m).forEach((n) => {
      if (n.visibility === 'hidden') n.visibility = 'preview';
    });
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
    const m = index(w);
    if (m.get(key(t.x, t.y)) !== t) return 'blocked';
    if (!eligible(t, m)) return 'blocked';
    // Check the pre-tap state: the opening that first meets the threshold cannot
    // place the clue, and automatic openings only qualify a later manual tap.
    const memoReady =
      w.memo.status === 'waiting' &&
      w.tiles.filter((tile) => tile.visibility === 'opened').length >= RULES.memoOpenedThreshold;
    const nextTarget = nextMemoTarget(w);
    const nextReady = !!nextTarget && w.memoManualOpened >= RULES.memoManualInterval;
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
    if (nextReady && ordinaryMemoTile(w, t)) {
      w.memoHistory.push(w.memo);
      w.memo = {
        status: 'waiting',
        clue: null,
        monumentId: nextTarget.id,
        asideId: null,
        hintId: null,
      };
      w.memoManualOpened = 0;
    } else if (nextTarget && !nextReady) {
      // Only successful manual completions after collection AND arrival count.
      // Automatic openings and the arrival completion itself never count.
      w.memoManualOpened++;
    }
    const memoPlaced = (memoReady || nextReady) && ordinaryMemoTile(w, t);
    if (memoPlaced) {
      w.memo.status = 'placed';
      w.memo.clue = { x: t.x, y: t.y };
      w.memo.asideId = chooseMemoAside(w);
      w.memo.hintId = chooseMemoHint(w);
    }
    const exhaustedMemoPlaced = placeExhaustedMemo(w);
    const monumentReached =
      previousMonuments.find((p) => !p.reached && monumentStatus(w, p.monument, m).reached)
        ?.monument || null;
    const monumentRevealed =
      previousMonuments.find(
        (p) => !p.fullyRevealed && monumentStatus(w, p.monument, m).fullyRevealed,
      )?.monument || null;
    if (onComplete)
      onComplete({
        tile: t,
        regions,
        automatic,
        monumentAutomatic,
        memoPlaced: memoPlaced || exhaustedMemoPlaced,
        monumentReached,
        monumentRevealed,
      });
    return t.landmark || 'opened';
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
  function nextMemoTarget(w) {
    if (w.memo.status !== 'collected') return null;
    const previous = w.monuments.find((object) => object.id === w.memo.monumentId);
    if (!monumentStatus(w, previous).reached) return null;
    const issued = new Set([...w.memoHistory, w.memo].map((memo) => memo.monumentId));
    return (
      w.monuments
        .filter((object) => !issued.has(object.id))
        .sort(
          (a, b) => distance(previous, a) - distance(previous, b) || a.id.localeCompare(b.id),
        )[0] || null
    );
  }
  function ordinaryMemoTile(w, t) {
    return (
      t.landmark === null &&
      !(t.x === 0 && t.y === 0) &&
      !w.monuments.some((monument) => monument.occupied.some((p) => p.x === t.x && p.y === t.y)) &&
      !w.scenery.some((object) => object.x === t.x && object.y === t.y)
    );
  }
  // Only a fully opened map may issue a new clue on previously opened ground.
  function placeExhaustedMemo(w) {
    if (!w.tiles.every((tile) => tile.visibility === 'opened')) return false;
    const target = nextMemoTarget(w);
    if (!target) return false;
    const previousClue = w.memo.clue;
    const used = new Set([...w.memoHistory, w.memo].map((memo) => key(memo.clue.x, memo.clue.y)));
    const candidates = w.tiles.filter(
      (tile) => ordinaryMemoTile(w, tile) && !used.has(key(tile.x, tile.y)),
    );
    candidates.sort(
      (a, b) =>
        distance(a, previousClue) - distance(b, previousClue) ||
        hash(w.seed, a.x, a.y, 0x13571629) - hash(w.seed, b.x, b.y, 0x13571629),
    );
    const tile = candidates[0];
    if (!tile) return false;
    w.memoHistory.push(w.memo);
    w.memoManualOpened = 0;
    w.memo = {
      status: 'placed',
      clue: { x: tile.x, y: tile.y },
      monumentId: target.id,
      asideId: null,
      hintId: null,
    };
    w.memo.asideId = chooseMemoAside(w);
    w.memo.hintId = chooseMemoHint(w);
    return true;
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
    const exhaustedMemoPlaced = placeExhaustedMemo(w);
    return { monument, alreadyReached, exhaustedMemoPlaced };
  }
  function destinations(w, m = index(w)) {
    const target = w.monuments.find((o) => o.id === w.memo.monumentId);
    return w.memo.status === 'collected' && !monumentStatus(w, target, m).reached
      ? [{ x: target.x, y: target.y }]
      : [];
  }
  function isComplete(w) {
    return (
      [...w.memoHistory, w.memo].filter((m) => m.status === 'collected').length ===
        RULES.monumentCount && w.monuments.every((o) => monumentStatus(w, o).reached)
    );
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
  function validateWorld(w) {
    const fail = () => {
      throw Error('Invalid save data');
    };
    if (
      !w ||
      w.saveVersion !== RULES.saveVersion ||
      w.worldVersion !== 2 ||
      w.generatorVersion !== 6 ||
      !isSeed(w.seed) ||
      !finite(w.savedAt) ||
      typeof w.introduced !== 'boolean' ||
      typeof w.completionDismissed !== 'boolean' ||
      !Array.isArray(w.tiles) ||
      !w.bounds ||
      Object.entries(bounds()).some(([k, v]) => w.bounds[k] !== v)
    )
      fail();
    let expectedCount = 0;
    for (let y = -RULES.extent; y <= RULES.extent; y++)
      for (let x = -RULES.extent; x <= RULES.extent; x++)
        if (validPosition(w.seed, x, y)) expectedCount++;
    if (w.tiles.length !== expectedCount) fail();
    const coordinate = (p) =>
      p && Number.isInteger(p.x) && Number.isInteger(p.y) && validPosition(w.seed, p.x, p.y);
    const seen = new Set(),
      ids = new Set(),
      occupied = new Set();
    const addId = (id) => {
      if (typeof id !== 'string' || !id || id.length > 80 || ids.has(id)) fail();
      ids.add(id);
    };
    for (const t of w.tiles) {
      if (
        !coordinate(t) ||
        seen.has(key(t.x, t.y)) ||
        !Object.hasOwn(RULES.costs, t.kind) ||
        !isSeed(t.seed) ||
        !['hidden', 'preview', 'opened'].includes(t.visibility) ||
        !Number.isInteger(t.requiredCost) ||
        t.requiredCost < 1 ||
        t.requiredCost > 64 ||
        !Number.isInteger(t.developmentProgress) ||
        t.developmentProgress < 0 ||
        t.developmentProgress > t.requiredCost ||
        (t.visibility === 'opened' && t.developmentProgress !== t.requiredCost) ||
        (t.visibility === 'hidden' && t.developmentProgress !== 0) ||
        (t.visibility === 'preview' && t.developmentProgress === t.requiredCost) ||
        ![null, 'tower'].includes(t.landmark) ||
        t.road !== false ||
        (t.landmark === null
          ? t.landmarkId !== null || t.towerOrder !== null || t.effectApplied !== false
          : !Number.isInteger(t.towerOrder) ||
            t.towerOrder < 0 ||
            t.towerOrder > 4 ||
            typeof t.effectApplied !== 'boolean' ||
            t.effectApplied !== (t.visibility === 'opened') ||
            t.kind === 'mine')
      )
        fail();
      seen.add(key(t.x, t.y));
      if (t.landmark) addId(t.landmarkId);
    }
    const m = index(w);
    if (m.get('0,0')?.visibility !== 'opened') fail();
    const towers = w.tiles.filter((t) => t.landmark === 'tower');
    if (towers.length !== 5 || new Set(towers.map((t) => t.towerOrder)).size !== 5) fail();
    if (!Array.isArray(w.monuments) || w.monuments.length !== RULES.monumentCount) fail();
    for (const o of w.monuments) {
      if (
        !coordinate(o) ||
        !Object.hasOwn(MONUMENTS, o.type) ||
        o.orientation !== 0 ||
        !Array.isArray(o.occupied) ||
        o.occupied.length !== 4
      )
        fail();
      addId(o.id);
      for (const p of o.occupied) {
        if (
          !coordinate(p) ||
          ![0, 1].includes(p.x - o.x) ||
          ![0, 1].includes(p.y - o.y) ||
          occupied.has(key(p.x, p.y)) ||
          (p.x === 0 && p.y === 0) ||
          m.get(key(p.x, p.y)).kind === 'mine' ||
          m.get(key(p.x, p.y)).landmark
        )
          fail();
        occupied.add(key(p.x, p.y));
      }
      const opened = o.occupied.filter((p) => m.get(key(p.x, p.y)).visibility === 'opened').length;
      if (opened !== 0 && opened !== 4) fail();
    }
    if (new Set(w.monuments.map((o) => o.type)).size !== RULES.monumentCount) fail();
    if (!Array.isArray(w.scenery) || w.scenery.length !== RULES.sceneryCount) fail();
    const scenerySeen = new Set(),
      counts = new Map(SCENERY_TYPES.map((type) => [type, 0]));
    for (const o of w.scenery) {
      if (
        !coordinate(o) ||
        !counts.has(o.type) ||
        !Number.isInteger(o.orientation) ||
        o.orientation < 0 ||
        o.orientation > 3 ||
        scenerySeen.has(key(o.x, o.y)) ||
        occupied.has(key(o.x, o.y)) ||
        m.get(key(o.x, o.y)).landmark ||
        (o.x === 0 && o.y === 0)
      )
        fail();
      addId(o.id);
      scenerySeen.add(key(o.x, o.y));
      counts.set(o.type, counts.get(o.type) + 1);
    }
    if ([...counts].some(([type, n]) => n !== RULES.sceneryCounts[type])) fail();
    if (
      !w.memo ||
      !['waiting', 'placed', 'collected'].includes(w.memo.status) ||
      !w.monuments.some((o) => o.id === w.memo.monumentId)
    )
      fail();
    if (w.memo.status === 'waiting') {
      if (w.memo.clue !== null) fail();
    } else if (
      !coordinate(w.memo.clue) ||
      m.get(key(w.memo.clue.x, w.memo.clue.y)).visibility !== 'opened' ||
      !ordinaryMemoTile(w, m.get(key(w.memo.clue.x, w.memo.clue.y)))
    )
      fail();
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
  const memoHints = Object.freeze({
    'direction-1': '{direction}に、{name}がある。',
    'direction-2': '{direction}のほうへ進むと、{name}に行き当たる。',
    'direction-3': '{name}は、この紙片から{direction}にある。',
  });
  function chooseMemoHint(w) {
    const previous = w.memoHistory.at(-1)?.hintId;
    const ids = Object.keys(memoHints).filter((id) => id !== previous);
    return ids[hash(w.seed, w.memo.clue.x, w.memo.clue.y, 0x52617341) % ids.length];
  }
  function memoHint(w, memo = w.memo) {
    const target = w.monuments.find((o) => o.id === memo.monumentId);
    const dx = target.x - memo.clue.x,
      dy = target.y - memo.clue.y;
    const direction = (dy < 0 ? '北' : dy > 0 ? '南' : '') + (dx < 0 ? '西' : dx > 0 ? '東' : '');
    return memoHints[memo.hintId]
      .replace('{direction}', direction || 'すぐ近く')
      .replace('{name}', MONUMENTS[target.type]);
  }
  function chooseMemoAside(w) {
    const used = new Set(w.memoHistory.map((m) => m.asideId));
    const ids = Object.keys(memoAsides).filter((id) => !used.has(id)),
      p = w.memo.clue,
      monument = w.monuments.find((m) => m.id === w.memo.monumentId);
    return ids[
      hash(w.seed, p.x, p.y, hash(w.seed, monument.x, monument.y, 0x631fa927)) % ids.length
    ];
  }
  function memoAside(w, memo = w.memo) {
    return Object.hasOwn(memoAsides, memo.asideId) ? memoAsides[memo.asideId] : '';
  }
  function validate(w) {
    validateWorld(w);
    if (
      !Array.isArray(w.memoHistory) ||
      w.memoHistory.length >= w.monuments.length ||
      !Number.isInteger(w.memoManualOpened) ||
      w.memoManualOpened < 0 ||
      w.memoManualOpened > RULES.memoManualInterval ||
      (w.memoManualOpened > 0 && !nextMemoTarget(w))
    )
      throw Error('Invalid memo progression');
    const targets = new Set([w.memo.monumentId]);
    const clues = new Set(w.memo.clue ? [key(w.memo.clue.x, w.memo.clue.y)] : []);
    const m = index(w);
    for (const memo of w.memoHistory) {
      const target = memo && w.monuments.find((object) => object.id === memo.monumentId);
      const clue = memo?.clue && m.get(key(memo.clue.x, memo.clue.y));
      if (
        !target ||
        targets.has(target.id) ||
        memo.status !== 'collected' ||
        !monumentStatus(w, target, m).reached ||
        !clue ||
        clue.visibility !== 'opened' ||
        !Number.isInteger(memo.clue.x) ||
        !Number.isInteger(memo.clue.y) ||
        !ordinaryMemoTile(w, clue) ||
        clues.has(key(clue.x, clue.y)) ||
        !Object.hasOwn(memoAsides, memo.asideId) ||
        !Object.hasOwn(memoHints, memo.hintId)
      )
        throw Error('Invalid memo history');
      targets.add(target.id);
      clues.add(key(clue.x, clue.y));
    }
    if (
      w.memo.status === 'waiting'
        ? w.memo.asideId !== null
        : typeof w.memo.asideId !== 'string' || !Object.hasOwn(memoAsides, w.memo.asideId)
    )
      throw Error('Invalid memo aside');
    const issued = [...w.memoHistory, w.memo].filter((memo) => memo.status !== 'waiting');
    if (
      [...w.memoHistory, w.memo].some((memo) =>
        memo.status === 'waiting' ? memo.hintId !== null : !Object.hasOwn(memoHints, memo.hintId),
      ) ||
      issued.some((memo, i) => i > 0 && memo.hintId === issued[i - 1].hintId) ||
      new Set(issued.map((memo) => memo.asideId)).size !== issued.length ||
      (w.completionDismissed && !isComplete(w))
    )
      throw Error('Invalid memo or completion progression');
    return w;
  }
  globalThis.TapWorld = {
    RULES,
    MONUMENTS,
    create,
    generateTile,
    index,
    eligible,
    develop,
    collectMemo,
    monumentStatus,
    destinations,
    isComplete,
    validate,
    protectedMonumentCoordinates,
    memoAsides,
    memoHints,
    memoHint,
    memoAside,
  };
})();
