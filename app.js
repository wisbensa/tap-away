(() => {
  'use strict';
  // Initial visual tuning; final touch feel and exploration are checked on real devices.
  const CONFIG = {
    developmentBuild: true,
    tileWidth: 76,
    tileHeight: 48,
    tileSkew: 16,
    viewSkews: { original: 0, depth: 16 },
    viewHeights: { original: 72, depth: 48 },
    archTrial: 'full',
    sceneryReactionMs: 650,
    sceneryReactionCooldownMs: 1200,
    sceneryReactionAngle: 0.035,
    heightScale: 15,
    minZoom: 0.12,
    minTapZoom: 0.25,
    initialMinZoom: 0.55,
    maxZoom: 2.4,
    dragThreshold: 7,
    touchDragThreshold: 14,
    reactionMs: 400,
    sinkMs: 65,
    contactMs: 35,
    contactStrength: 0.15,
    reboundAtMs: 230,
    reboundStrength: 0.12,
    pressDepth: 3.5,
    minPressPixels: 3.5,
    pressDarkening: 16,
    blockedPixels: 1,
    blockedMs: 130,
    blockedDarkening: 3,
    openedPixels: 1.5,
    openedMs: 180,
    openedBrightening: 8,
    emptyNoticeCooldownMs: 7000,
    monumentStepMs: 100,
    outlineWidth: 2,
    minOutlinePixels: 2,
    colorHoldMs: 65,
    colorReturnMs: 180,
    maxPulses: 32,
    soundVolume: 0.12,
    completionMs: 420,
    completionRevealMs: 300,
    completionEdgeMs: 360,
    waveRadius: 2,
    waveDelayMs: 75,
    waveMs: 230,
    waveOpacity: 0.5,
    enclosureStartMs: 180,
    enclosureStepMs: 150,
    enclosureFadeMs: 150,
    maxOpenings: 64,
    towerRingMs: 80,
    towerFadeMs: 120,
    memoDisplayMs: 10000,
    memoMinPixels: 7,
    shadowMinMs: 90000,
    shadowMaxMs: 180000,
    shadowMs: 4200,
    shadowOpacity: 0.14,
    shadowHalfWidth: 0.58,
    shadowAspect: 0.32,
    shadowStartY: 0.32,
    shadowDriftY: 0.3,
    noticeMs: 7000,
    noticeMergeMs: 40,
    blockedSinkMs: 25,
    openedSinkMs: 40,
    openedReboundMs: 100,
    openedReboundStrength: 0.08,
    roadWidth: 7,
    roadBorderWidth: 2,
    roadPreviewOpacity: 0.3,
    smallEventCooldownMs: 18000,
    smallEventChance: 0.12,
    smallEventMs: 1500,
    markerMargin: 36,
    markerRadius: 28,
    markerSpacing: 60,
    cityVillageFacilityLevels: 1,
    cityTownFacilityLevels: 6,
  };
  const canvas = document.querySelector('#map'),
    ctx = canvas.getContext('2d');
  const soundButton = document.querySelector('#sound'),
    notice = document.querySelector('#notice');
  const camera = { x: 0, y: 0, zoom: 1 };
  const pointers = new Map(),
    pulses = [],
    tiles = [];
  const hitAreas = [],
    towerReveals = new Map(),
    openings = new Map();
  let width = 0,
    height = 0,
    frame = 0,
    soundOn = false,
    audio = null,
    gesture = null,
    held = null;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const heightAt = (x, y) =>
    0.55 + 0.27 * Math.sin(x * 0.68 + y * 0.36) + 0.2 * Math.cos(y * 0.8 - x * 0.22);
  const SAVE_KEY = 'tap-away.world.v1';
  let world,
    saveBlocked = false,
    saveTimer = 0,
    toastTimer = 0,
    memoTimer = 0,
    started = false,
    needsInitialSave = false,
    legacyReset = false,
    suspended = false,
    resumeGains = null,
    emptyNoticeAt = -Infinity;
  let toastAt = -Infinity;
  const memoPanel = document.querySelector('#memo-panel'),
    memoReview = document.querySelector('#memo-review');
  const townPanel = document.querySelector('#town-panel');
  const settingsPanel = document.querySelector('#settings-panel');
  function closeSettings() {
    settingsPanel.hidden = true;
    document.querySelector('#settings').setAttribute('aria-expanded', 'false');
    requestDraw();
  }
  document.querySelector('#settings').addEventListener('click', () => {
    const opening = settingsPanel.hidden;
    closeSettings();
    if (opening) {
      settingsPanel.hidden = false;
      document.querySelector('#settings').setAttribute('aria-expanded', 'true');
    }
  });
  document.querySelector('#settings-close').addEventListener('click', closeSettings);
  const helpDialog = document.querySelector('#help-dialog');
  document.querySelector('#help').addEventListener('click', () => {
    closeSettings();
    helpDialog.showModal();
  });
  document.querySelector('#help-close').addEventListener('click', () => helpDialog.close());
  document.querySelector('#view-trial').addEventListener('change', (event) => {
    const next = CONFIG.viewHeights[event.target.value];
    if (!next) return;
    // Keep the ground coordinate at the viewport center fixed while comparing.
    let focusX = -camera.x / (CONFIG.tileWidth * camera.zoom);
    let focusY = (height * 0.02 - camera.y) / (CONFIG.tileHeight * camera.zoom);
    for (let i = 0; i < 5; i++) {
      focusX = (-camera.x / camera.zoom - focusY * CONFIG.tileSkew) / CONFIG.tileWidth;
      focusY =
        ((height * 0.02 - camera.y) / camera.zoom + heightAt(focusX, focusY) * CONFIG.heightScale) /
        CONFIG.tileHeight;
    }
    const nextSkew = CONFIG.viewSkews[event.target.value];
    camera.x -= focusY * (nextSkew - CONFIG.tileSkew) * camera.zoom;
    camera.y -= focusY * (next - CONFIG.tileHeight) * camera.zoom;
    CONFIG.tileHeight = next;
    CONFIG.tileSkew = nextSkew;
    held = null;
    pointers.clear();
    gesture = null;
    requestDraw();
  });
  document.querySelector('#arch-trial').addEventListener('change', (event) => {
    CONFIG.archTrial = event.target.value === 'original' ? 'original' : 'full';
    requestDraw();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSettings();
  });
  document.querySelector('#development-tools').hidden = !CONFIG.developmentBuild;
  let highlightTown = false;
  const resourceLabels = { wood: '木', rock: '岩', metal: '金属' };
  function affordable(id) {
    const cost = TapWorld.facilityCost(world, id);
    return !!cost && Object.keys(cost).every((k) => world.resources[k] >= cost[k]);
  }
  function learn() {
    if (!started || saveBlocked || suspended) return;
    const learning = world.learning,
      messages = [];
    const kinds = ['tree', 'rock', 'mine'].filter(
      (kind) =>
        !learning.resources.includes(kind) &&
        world.tiles.some((t) => t.kind === kind && t.visibility === 'opened'),
    );
    if (kinds.length) {
      const first = learning.resources.length === 0;
      const labels = { tree: ['森', '木'], rock: ['岩場', '岩'], mine: ['鉱山', '金属'] };
      for (const kind of kinds) {
        learning.resources.push(kind);
        messages.push(
          labels[kind][0] + 'を開拓。ここから' + labels[kind][1] + 'が少しずつ生産される。',
        );
      }
      if (first) messages.push('ゲームを閉じている間も生産する（最大12時間分）。');
    }
    if (learning.town === 'waiting') {
      if (Object.values(world.facilities).some((level) => level > 0)) learning.town = 'done';
      else if (Object.keys(facilityNames).some(affordable)) {
        learning.town = townPanel.hidden ? 'guiding' : 'done';
        highlightTown = !townPanel.hidden;
        messages.push(
          townPanel.hidden
            ? '街で施設を建設・強化できそうだ。街をタップしてみよう。'
            : '建設できる施設を選んで、街を育てられます。',
        );
      }
      if (learning.town !== 'waiting') queueSave();
    }
    if (messages.length) {
      toast(messages.join('\n'));
      queueSave();
      requestDraw();
    }
  }
  const facilityNames = { inn: '宿屋', well: '井戸', workshop: '工房' };
  function facilityEffect(id, level) {
    if (id === 'inn') return '探索上限 ' + TapWorld.maximumPoints(world, level);
    if (id === 'well') return '回復速度 ×' + TapWorld.recoveryMultiplier(world, level).toFixed(1);
    return '開拓力 ' + TapWorld.developmentPower(world, level);
  }
  function updateTown() {
    const rates = TapWorld.productionRates(world);
    const counts = TapWorld.resourceTileCounts(world);
    document.querySelector('#resource-tiles').textContent =
      '開拓済み　森 ' +
      counts.tree +
      'マス　岩場 ' +
      counts.rock +
      'マス　鉱山 ' +
      counts.mine +
      'マス';
    document.querySelector('#production').textContent = Object.keys(resourceLabels)
      .map((k) => resourceLabels[k] + ' +' + rates[k] + '/h')
      .join('　');
    document.querySelector('#town-resources').textContent =
      document.querySelector('#resources').textContent;
    const total = Object.values(world.facilities).reduce((a, b) => a + b, 0);
    document.querySelector('#town-state').textContent =
      total >= CONFIG.cityTownFacilityLevels
        ? '育った街'
        : total >= CONFIG.cityVillageFacilityLevels
          ? '小さな村'
          : '小さな街';
    for (const id of Object.keys(facilityNames)) {
      const level = world.facilities[id],
        cost = TapWorld.facilityCost(world, id);
      document.querySelector('#' + id + '-level').textContent =
        facilityNames[id] + (level ? ' Lv' + level : '（未建設）');
      document.querySelector('#' + id + '-effect').textContent =
        facilityEffect(id, level) + (cost ? ' → ' + facilityEffect(id, level + 1) : '（上限）');
      document.querySelector('#' + id + '-cost').textContent = cost
        ? '必要：木 ' + cost.wood + '　岩 ' + cost.rock + '　金属 ' + cost.metal
        : '最大レベルです';
      const button = document.querySelector('#upgrade-' + id);
      const missing = cost ? Object.keys(cost).filter((k) => world.resources[k] < cost[k]) : [];
      const card = button.closest('.facility');
      card.classList.toggle('guided', highlightTown && affordable(id));
      if (missing.length)
        document.querySelector('#' + id + '-cost').textContent +=
          '（不足：' +
          missing
            .map((k) => resourceLabels[k] + ' ' + Math.ceil(cost[k] - world.resources[k]))
            .join('・') +
          '）';
      button.textContent = cost
        ? facilityNames[id] +
          (level === 0 ? 'を建てる' : 'を強化する') +
          ' → Lv' +
          (level + 1) +
          (missing.length ? '' : level === 0 ? '（建設できる）' : '（強化できる）')
        : '上限到達';
      button.hidden = !cost;
      button.disabled =
        !cost || Object.keys(cost).some((k) => world.resources[k] < cost[k]) || saveBlocked;
    }
  }
  function openTown() {
    closeMemo();
    townPanel.hidden = false;
    closeSettings();
    if (world.learning.town === 'guiding') {
      world.learning.town = 'done';
      highlightTown = true;
      queueSave();
    }
    updateHud();
    updateTown();
    requestDraw();
  }
  document.querySelector('#town-close').addEventListener('click', () => {
    townPanel.hidden = true;
    highlightTown = false;
    requestDraw();
  });
  for (const id of Object.keys(facilityNames))
    document.querySelector('#upgrade-' + id).addEventListener('click', () => {
      if (saveBlocked || suspended) return;
      const before = facilityEffect(id, world.facilities[id]),
        powerBefore = TapWorld.developmentPower(world),
        levelBefore = world.facilities[id];
      const result = TapWorld.upgrade(world, id);
      if (result === 'upgraded') {
        const first = !world.learning.facilityNotified;
        world.learning.facilityNotified = true;
        world.learning.town = 'done';
        highlightTown = false;
        let message = facilityNames[id] + (levelBefore === 0 ? 'を建設した。' : 'を強化した。');
        if (id === 'workshop')
          message += '開拓力 ' + powerBefore + ' → ' + TapWorld.developmentPower(world) + '。';
        else if (first)
          message +=
            before +
            ' → ' +
            facilityEffect(id, world.facilities[id]) +
            (id === 'inn' ? '。探索ポイントが全回復。' : '。');
        if (save()) toast(message);
      }
      updateHud();
      requestDraw();
    });
  const backupDialog = document.querySelector('#backup-dialog'),
    backupText = document.querySelector('#backup-json');
  document.querySelector('#backup').addEventListener('click', () => {
    closeSettings();
    backupDialog.showModal();
  });
  document.querySelector('#backup-close').addEventListener('click', () => backupDialog.close());
  document.querySelector('#export-save').addEventListener('click', () => {
    if (!save()) return;
    backupText.value = JSON.stringify(world, null, 2);
    const url = URL.createObjectURL(new Blob([backupText.value], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tap-away-save.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  function importSave(text) {
    try {
      const candidate = TapWorld.validate(JSON.parse(text));
      TapWorld.settle(candidate, Date.now(), true);
      candidate.savedAt = Date.now();
      // Commit first, then reload through the normal current-version loader.
      localStorage.setItem(SAVE_KEY, JSON.stringify(candidate));
    } catch {
      document.querySelector('#backup-status').textContent =
        '読み込めませんでした。現行版のJSONか、端末の保存設定を確認してください。現在のセーブは保持しています。';
      return false;
    }
    clearTimeout(saveTimer);
    saveBlocked = true; // pagehide must not overwrite the committed import with the old world.
    location.reload();
    return true;
  }
  document
    .querySelector('#import-save')
    .addEventListener('click', () => importSave(backupText.value));
  document.querySelector('#import-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      backupText.value = await file.text();
      document.querySelector('#backup-status').textContent =
        'JSONを読み込みました。「このJSONで再開」で適用します。';
    } catch {
      document.querySelector('#backup-status').textContent = 'ファイルを読み込めませんでした。';
    }
  });
  const SAVE_LOAD_ERROR =
    'セーブを読み込めません。元データを保持しています。この回の進行は保存されません。';
  function toast(message) {
    const now = performance.now();
    notice.textContent =
      now - toastAt < CONFIG.noticeMergeMs && notice.textContent
        ? notice.textContent + '\n' + message
        : message;
    toastAt = now;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (notice.textContent = ''), CONFIG.noticeMs);
  }
  function loadWorld() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const seedText = new URLSearchParams(location.search).get('seed');
      const seed =
        seedText !== null && /^\d+$/.test(seedText) && Number(seedText) <= 0xffffffff
          ? Number(seedText)
          : undefined;
      const previous = raw === null ? null : JSON.parse(raw);
      // Development builds deliberately start over when the save schema changes.
      legacyReset =
        previous !== null &&
        Number.isInteger(previous?.saveVersion) &&
        previous.saveVersion >= 1 &&
        previous.saveVersion < TapWorld.RULES.saveVersion;
      const loaded =
        raw === null || legacyReset
          ? TapWorld.create(Date.now(), seed)
          : TapWorld.validate(previous);
      needsInitialSave = raw === null || legacyReset;
      if (!needsInitialSave) resumeGains = TapWorld.settle(loaded, Date.now(), true);
      return loaded;
    } catch {
      saveBlocked = true;
      toast(SAVE_LOAD_ERROR);
      return TapWorld.create();
    }
  }
  world = loadWorld();
  tiles.push(...world.tiles);
  function save() {
    clearTimeout(saveTimer);
    if (saveBlocked) return false;
    if (!suspended) TapWorld.settle(world);
    const savedAt = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ...world, savedAt }));
      world.savedAt = savedAt;
      return true;
    } catch {
      toast('保存できませんでした。端末の空き容量や保存設定を確認してください。');
      return false;
    }
  }
  if (needsInitialSave) save();
  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 500);
  }
  function updateHud() {
    learn();
    document.querySelector('#power').textContent = '開拓力 ' + TapWorld.developmentPower(world);
    document.querySelector('#points').textContent =
      '探索 ' + Math.floor(world.points) + ' / ' + TapWorld.maximumPoints(world);
    document.querySelector('#resources').textContent =
      '木 ' +
      Math.floor(world.resources.wood) +
      '　岩 ' +
      Math.floor(world.resources.rock) +
      '　金属 ' +
      Math.floor(world.resources.metal);
    memoReview.hidden = !started || world.memo.status !== 'collected';
    if (!townPanel.hidden) updateTown();
  }
  function showResume(gained) {
    if (!gained) return;
    const labels = { points: '探索', wood: '木', rock: '岩', metal: '金属' };
    const entries = Object.keys(labels).filter((k) => gained[k] > 0);
    if (entries.length)
      toast(
        'おかえりなさい\n' +
          entries
            .map(
              (k) =>
                labels[k] + ' +' + (gained[k] >= 1 ? Math.floor(gained[k]) : gained[k].toFixed(2)),
            )
            .join('　'),
      );
  }
  document.querySelector('#start').textContent = world.introduced ? 'つづきから' : 'はじめる';
  function startGame() {
    started = true;
    resetAtmosphere();
    document.querySelector('#start-screen').hidden = true;
    if (saveBlocked) toast(SAVE_LOAD_ERROR);
    if (!world.introduced && !saveBlocked) {
      world.introduced = true;
      toast(
        (legacyReset ? '開発版の更新により、新しい世界を開始しました。' : '') +
          '隣の土地をポチポチ開拓。街をタップすると施設を育てられます。',
      );
      queueSave();
    }
    if (world.introduced && resumeGains) {
      showResume(resumeGains);
      resumeGains = null;
      queueSave();
    }
    updateHud();
    requestDraw();
  }
  document.querySelector('#start').addEventListener('click', startGame);
  function memoHint(monument) {
    const clue = world.memo.clue,
      dx = monument.x - clue.x,
      dy = monument.y - clue.y;
    const direction = (dy < 0 ? '北' : dy > 0 ? '南' : '') + (dx < 0 ? '西' : dx > 0 ? '東' : '');
    return (direction || 'この近く') + 'に、' + TapWorld.MONUMENTS[monument.type] + 'がある。';
  }
  function closeMemo() {
    clearTimeout(memoTimer);
    memoPanel.hidden = true;
    requestDraw();
  }
  function showMemo(alreadyReached = false) {
    townPanel.hidden = true;
    const monument = world.monuments.find((m) => m.id === world.memo.monumentId);
    if (world.memo.status !== 'collected' || !monument) return;
    document.querySelector('#memo-hint').textContent = memoHint(monument);
    document.querySelector('#memo-aside').textContent = TapWorld.memoAside(world);
    document.querySelector('#memo-context').textContent =
      alreadyReached || TapWorld.monumentStatus(world, monument).reached
        ? 'この場所は、もう見つけていた。'
        : '★の先に、描かれた場所がある。';
    const picture = document.querySelector('#memo-picture'),
      pen = picture.getContext('2d'),
      skin = TapSkin.current;
    pen.clearRect(0, 0, picture.width, picture.height);
    drawArch(pen, 90, 86, 1, true);
    memoPanel.hidden = false;
    clearTimeout(memoTimer);
    memoTimer = setTimeout(closeMemo, CONFIG.memoDisplayMs);
    requestDraw();
  }
  document.querySelector('#memo-close').addEventListener('click', closeMemo);
  memoReview.addEventListener('click', () => showMemo());
  const devButton = document.querySelector('#dev-reset');
  devButton.addEventListener('click', () => {
    if (!confirm('Tap Awayの進行を初期状態に戻しますか？')) return;
    try {
      clearTimeout(saveTimer);
      localStorage.removeItem(SAVE_KEY);
      saveBlocked = true;
      location.reload();
    } catch {
      toast('セーブを削除できませんでした。');
    }
  });
  const notes = document.querySelector('#release-dialog');
  function renderReleaseNotes(body, releases) {
    body.replaceChildren();
    const sorted = releases
      .slice()
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.version.localeCompare(a.version, undefined, { numeric: true }),
      );
    for (const release of sorted) {
      const title = document.createElement('h3');
      title.textContent = 'v' + release.version + ' · ' + release.date + ' — ' + release.title;
      body.append(title);
      for (const item of release.items) {
        const paragraph = document.createElement('p');
        paragraph.textContent = item;
        body.append(paragraph);
      }
    }
  }
  async function openReleaseNotes() {
    notes.showModal();
    const body = document.querySelector('#release-body');
    body.textContent = '読み込み中…';
    try {
      const response = await fetch('release-notes.json', { cache: 'no-cache' });
      if (!response.ok) throw Error('Release notes unavailable');
      const data = await response.json();
      renderReleaseNotes(body, data.releases);
    } catch {
      body.textContent = '更新情報を取得できませんでした。ゲームはそのまま遊べます。';
    }
  }
  document.querySelector('#notes').addEventListener('click', openReleaseNotes);
  document.querySelector('#close-notes').addEventListener('click', () => notes.close());
  const skinDialog = document.querySelector('#skin-dialog'),
    skinChoice = document.querySelector('#skin-choice');
  for (const skin of TapSkin.available) {
    const option = document.createElement('option');
    option.value = skin.id;
    option.textContent = skin.label;
    skinChoice.append(option);
  }
  function syncSkinChoice() {
    skinChoice.value = TapSkin.selection() || '';
  }
  function switchSkin(id) {
    if (!save()) {
      syncSkinChoice();
      if (saveBlocked) toast('進行を保存できないため、スキンを切り替えられません。');
      return;
    }
    try {
      TapSkin.select(id);
      location.reload();
    } catch {
      syncSkinChoice();
      toast('スキンの設定を保存できませんでした。');
    }
  }
  document.querySelector('#dev-skin').addEventListener('click', () => {
    syncSkinChoice();
    skinDialog.showModal();
  });
  document.querySelector('#close-skin').addEventListener('click', () => skinDialog.close());
  skinChoice.addEventListener('change', () => switchSkin(skinChoice.value || null));
  document.querySelector('#skin-default').addEventListener('click', () => switchSkin(null));
  const skinReady = TapSkin.load().then(() => {
    syncSkinChoice();
    requestDraw();
  });
  setInterval(() => {
    if (!document.hidden && !suspended && started) {
      TapWorld.settle(world);
      updateHud();
      tickAtmosphere(performance.now());
    }
  }, 1000);
  setInterval(() => {
    if (!document.hidden && !suspended && started) queueSave();
  }, 15000);
  tiles.sort((a, b) => a.y - b.y || a.x - b.x);
  const tilesByCoordinate = TapWorld.index(world);
  const monumentsByCoordinate = new Map(
    world.monuments.flatMap((monument) =>
      monument.occupied.map((p) => [p.x + ',' + p.y, monument]),
    ),
  );
  const sceneryByCoordinate = new Map(
    world.scenery.map((object) => [object.x + ',' + object.y, object]),
  );
  const atmosphere = { shadow: null, small: null, nextShadow: 0, nextSmall: 0 };
  function resetAtmosphere(now = performance.now()) {
    sceneryReactions.clear();
    atmosphere.shadow = null;
    atmosphere.small = null;
    atmosphere.nextShadow =
      now + CONFIG.shadowMinMs + Math.random() * (CONFIG.shadowMaxMs - CONFIG.shadowMinMs);
    atmosphere.nextSmall = now + CONFIG.smallEventCooldownMs;
  }
  function tickAtmosphere(now) {
    if (!started || document.hidden) return;
    if (!atmosphere.nextShadow) resetAtmosphere(now);
    if (now >= atmosphere.nextShadow) {
      atmosphere.shadow = { at: now, reverse: Math.random() < 0.5 };
      atmosphere.nextShadow =
        now + CONFIG.shadowMinMs + Math.random() * (CONFIG.shadowMaxMs - CONFIG.shadowMinMs);
      requestDraw();
    }
  }
  function smallEvent(tile, now) {
    if (
      !started ||
      document.hidden ||
      tile.visibility !== 'opened' ||
      tile.landmark ||
      (tile.x === 0 && tile.y === 0) ||
      !['grass', 'tree'].includes(tile.kind) ||
      monumentsByCoordinate.has(tile.x + ',' + tile.y) ||
      sceneryByCoordinate.has(tile.x + ',' + tile.y) ||
      now < atmosphere.nextSmall
    )
      return;
    atmosphere.nextSmall = now + CONFIG.smallEventCooldownMs;
    if (Math.random() < CONFIG.smallEventChance)
      atmosphere.small = { tile, at: now, kind: tile.kind === 'tree' ? 'leaves' : 'birds' };
  }
  function shadowGeometry(shadow, now) {
    const progress = clamp((now - shadow.at) / CONFIG.shadowMs, 0, 1);
    const spanX = Math.max(width, height) * CONFIG.shadowHalfWidth,
      spanY = spanX * CONFIG.shadowAspect,
      travel = width + spanX * 2;
    return {
      x: shadow.reverse ? width + spanX - travel * progress : -spanX + travel * progress,
      y: height * (CONFIG.shadowStartY + CONFIG.shadowDriftY * progress),
      spanX,
      spanY,
      progress,
    };
  }
  function drawAtmosphere(now) {
    if (!started || document.hidden) return;
    const shadow = atmosphere.shadow,
      small = atmosphere.small;
    if (shadow) {
      const t = (now - shadow.at) / CONFIG.shadowMs;
      if (t >= 1) atmosphere.shadow = null;
      else {
        const shape = shadowGeometry(shadow, now);
        ctx.save();
        ctx.translate(shape.x, shape.y);
        ctx.scale(shape.spanX, shape.spanY);
        ctx.fillStyle = TapSkin.current.objects.atmosphere.shadowColor;
        ctx.globalAlpha = CONFIG.shadowOpacity;
        // Only an uneven passing mass is visible; it has no identifiable owner.
        const outline = TapSkin.current.objects.atmosphere.shadowShape;
        ctx.beginPath();
        ctx.moveTo(outline[0].x, outline[0].y);
        for (let i = 1; i < outline.length; i += 3) {
          const [a, b, c] = outline.slice(i, i + 3);
          ctx.bezierCurveTo(a.x, a.y, b.x, b.y, c.x, c.y);
        }
        ctx.fill();
        ctx.restore();
      }
    }
    if (small) {
      const t = (now - small.at) / CONFIG.smallEventMs;
      if (t >= 1) atmosphere.small = null;
      else {
        const p = surface(small.tile.x + 0.5, small.tile.y + 0.5, now),
          z = camera.zoom;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(z, z);
        ctx.globalAlpha = Math.sin(Math.PI * t) * 0.7;
        ctx.strokeStyle = TapSkin.current.objects.atmosphere.detailColor;
        ctx.lineWidth = 1.5;
        const outline =
          TapSkin.current.objects.atmosphere[small.kind === 'leaves' ? 'leafShape' : 'birdShape'];
        for (let i = 0; i < 3; i++) {
          const x = (i - 1) * 10 + t * 22,
            y = -12 - t * 35 - i * 5;
          ctx.beginPath();
          outline.forEach((p, index) =>
            index ? ctx.lineTo(x + p.x, y + p.y) : ctx.moveTo(x + p.x, y + p.y),
          );
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
  const sceneryReactions = new Map();
  const sceneryCooldowns = new Map();
  function reactScenery(tile, now) {
    const object = sceneryByCoordinate.get(tile.x + ',' + tile.y);
    if (
      tile.visibility !== 'opened' ||
      !object ||
      !['front_bird', 'giant_flower', 'symmetric_tree'].includes(object.type) ||
      now < (sceneryCooldowns.get(object.id) || 0)
    )
      return;
    sceneryReactions.set(object.id, now);
    sceneryCooldowns.set(object.id, now + CONFIG.sceneryReactionCooldownMs);
  }
  function drawScenery(tile, base, alpha = 1) {
    const object = sceneryByCoordinate.get(tile.x + ',' + tile.y);
    if (!object || tile.visibility !== 'opened' || alpha <= 0) return false;
    const age = performance.now() - (sceneryReactions.get(object.id) ?? -Infinity);
    ctx.save();
    if (age < CONFIG.sceneryReactionMs) {
      ctx.translate(base.x, base.y);
      ctx.rotate(
        Math.sin((age / CONFIG.sceneryReactionMs) * Math.PI * 2) *
          Math.sin((age / CONFIG.sceneryReactionMs) * Math.PI) *
          CONFIG.sceneryReactionAngle,
      );
      ctx.translate(-base.x, -base.y);
    }
    if (drawAsset(object.type, base, alpha)) {
      ctx.restore();
      return true;
    }
    if (globalThis.TapScenery) {
      ctx.save();
      ctx.globalAlpha = alpha;
      const drawn = TapScenery.draw(ctx, object.type, base.x, base.y, camera.zoom, TapSkin.current);
      ctx.restore();
      ctx.restore();
      return drawn;
    }
    ctx.restore();
    return false;
  }
  function project(x, y, z = 0) {
    return {
      x: width / 2 + camera.x + (x * CONFIG.tileWidth + y * CONFIG.tileSkew) * camera.zoom,
      y: height * 0.48 + camera.y + (y * CONFIG.tileHeight - z) * camera.zoom,
    };
  }
  function ease(t) {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  }
  function curve(from, to, velocity, age, duration) {
    const t = clamp(age / duration, 0, 1);
    return (
      (2 * t * t * t - 3 * t * t + 1) * from +
      (t * t * t - 2 * t * t + t) * duration * velocity +
      (-2 * t * t * t + 3 * t * t) * to
    );
  }
  function pulseDuration(p) {
    return p.kind === 'blocked'
      ? CONFIG.blockedMs
      : p.kind === 'opened'
        ? CONFIG.openedMs
        : p.kind === 'complete'
          ? CONFIG.completionMs
          : CONFIG.reactionMs;
  }
  function reaction(p, now) {
    const age = Math.max(0, now - p.at),
      start = p.start ?? CONFIG.contactStrength,
      velocity = p.velocity || 0;
    if (p === held) return curve(start, CONFIG.contactStrength, velocity, age, CONFIG.contactMs);
    if (p.kind === 'complete') return 0;
    const peak = Math.min(1.2, Math.max(1, start));
    const sink =
      p.kind === 'blocked'
        ? CONFIG.blockedSinkMs
        : p.kind === 'opened'
          ? CONFIG.openedSinkMs
          : CONFIG.sinkMs;
    if (age < sink)
      return clamp(curve(start, peak, velocity, age, sink), -1.2, Math.max(1.2, start));
    if (p.kind === 'blocked') return 1 - ease((age - sink) / (CONFIG.blockedMs - sink));
    const rise = p.kind === 'opened' ? CONFIG.openedReboundMs : CONFIG.reboundAtMs;
    const rebound = p.kind === 'opened' ? -CONFIG.openedReboundStrength : -CONFIG.reboundStrength;
    if (age < rise) return curve(peak, rebound, 0, age - sink, rise - sink);
    return curve(rebound, 0, 0, age - rise, pulseDuration(p) - rise);
  }
  function tilePulse(tile) {
    return held?.tile === tile ? held : pulses.find((p) => p.tile === tile);
  }
  function feedbackStrength(tile, now) {
    const p = tilePulse(tile);
    if (!p) return 0;
    if (p === held) return clamp(reaction(p, now), 0, 1);
    const age = Math.max(0, now - p.at),
      end =
        p.kind === 'blocked'
          ? CONFIG.blockedMs
          : p.kind === 'opened'
            ? CONFIG.openedMs
            : CONFIG.colorReturnMs;
    return age < CONFIG.colorHoldMs
      ? clamp(reaction(p, now), 0, 1)
      : 1 - ease((age - CONFIG.colorHoldMs) / (end - CONFIG.colorHoldMs));
  }
  function outlineStrength(tile, now) {
    if (tilePulse(tile)?.kind === 'complete') return 0;
    return feedbackStrength(tile, now);
  }
  function pulseDepth(p) {
    return p.kind === 'blocked'
      ? CONFIG.blockedPixels / camera.zoom
      : p.kind === 'opened'
        ? CONFIG.openedPixels / camera.zoom
        : Math.max(CONFIG.pressDepth, CONFIG.minPressPixels / camera.zoom);
  }
  function displacement(x, y, now) {
    const tile = tilesByCoordinate.get(Math.floor(x) + ',' + Math.floor(y)),
      p = tile && tilePulse(tile);
    const result = p ? pulseDepth(p) * reaction(p, now) : 0;
    return clamp(
      result,
      -CONFIG.minPressPixels / camera.zoom,
      Math.max(CONFIG.pressDepth, CONFIG.minPressPixels / camera.zoom) * 1.2,
    );
  }
  function surface(x, y, now, tile) {
    const depth = tile ? displacement(tile.x + 0.5, tile.y + 0.5, now) : displacement(x, y, now);
    return project(x, y, heightAt(x, y) * CONFIG.heightScale - depth);
  }
  function polygon(points, fill, stroke) {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.65 * camera.zoom;
      ctx.stroke();
    }
  }
  function inside(p, points) {
    let yes = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i],
        b = points[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
        yes = !yes;
    }
    return yes;
  }
  function corners(tile, now) {
    const depth = displacement(tile.x + 0.5, tile.y + 0.5, now);
    return [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([dx, dy]) =>
      project(
        tile.x + dx,
        tile.y + dy,
        heightAt(tile.x + dx, tile.y + dy) * CONFIG.heightScale - depth,
      ),
    );
  }
  function blendColor(from, to, ratio) {
    return {
      h: from.h + (to.h - from.h) * ratio,
      s: from.s + (to.s - from.s) * ratio,
      l: from.l + (to.l - from.l) * ratio,
    };
  }
  function tileColor(tile, now) {
    const kind = tilePulse(tile)?.kind;
    const darkening =
      (kind === 'blocked'
        ? CONFIG.blockedDarkening
        : kind === 'opened'
          ? -CONFIG.openedBrightening
          : kind === 'complete'
            ? 0
            : CONFIG.pressDarkening) * feedbackStrength(tile, now);
    const palette = TapSkin.current.palette;
    const display = displayState(tile, now);
    let color = terrainColor(tile, display.visibility, display.progress);
    if (display.visibility === 'preview') {
      color = blendColor(palette.hidden, color, towerFade(tile, now));
    }
    if (display.reveal !== undefined) {
      color = blendColor(color, palette.opened[tile.kind], display.reveal);
    }
    const variation = display.visibility === 'opened' ? (tile.seed % 5) - 2 : 0;
    return `hsl(${color.h} ${color.s}% ${Math.max(0, color.l + variation - darkening)}%)`;
  }
  function terrainColor(tile, visibility, progress) {
    const palette = TapSkin.current.palette;
    if (visibility !== 'preview')
      return visibility === 'hidden' ? palette.hidden : palette.opened[tile.kind];
    const preview = palette.preview[tile.kind],
      opened = palette.opened[tile.kind],
      ratio = clamp(progress / tile.requiredCost, 0, 1);
    return blendColor(preview, { ...opened, l: Math.min(60, opened.l - 6) }, ratio);
  }
  function displayState(tile, now) {
    const opening = openings.get(tile.x + ',' + tile.y);
    if (opening?.automatic) {
      const reveal = ease(
        (now - opening.at) /
          (opening.monument ? CONFIG.completionRevealMs : CONFIG.enclosureFadeMs),
      );
      if (reveal < 1) return { visibility: opening.visibility, progress: opening.progress, reveal };
    }
    return { visibility: tile.visibility, progress: tile.developmentProgress };
  }
  function objectShapes(tile) {
    return tile.kind === 'tree'
      ? TapSkin.current.objects.tree.shapes
      : tile.kind === 'rock' || tile.kind === 'mine'
        ? TapSkin.current.objects[tile.kind].shapes
        : [];
  }
  function towerFade(tile, now) {
    const reveal = towerReveals.get(tile.x + ',' + tile.y);
    return reveal ? clamp((now - reveal.at) / CONFIG.towerFadeMs, 0, 1) : 1;
  }
  function drawAsset(id, base, alpha = 1) {
    const asset = TapSkin.current.assets[id];
    if (!asset?.image) return false;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(
      asset.image,
      base.x - asset.anchorX * camera.zoom,
      base.y - asset.anchorY * camera.zoom,
      asset.width * camera.zoom,
      asset.height * camera.zoom,
    );
    ctx.restore();
    return true;
  }
  function visibleBounds(tile, pts, base) {
    const skin = TapSkin.current,
      points = pts.slice();
    let shapes = [],
      id = null;
    const city = tile.x === 0 && tile.y === 0,
      destination = world.destination?.x === tile.x && world.destination?.y === tile.y;
    if (city) {
      shapes = [skin.objects.city.body, skin.objects.city.roof];
      id = 'city';
    } else if (tile.landmark === 'tower') {
      shapes =
        tile.visibility === 'opened' || destination
          ? [skin.objects.tower.body]
          : [
              [
                { x: -7, y: 0 },
                { x: 7, y: 0 },
                { x: 5, y: -38 },
                { x: -5, y: -38 },
              ],
            ];
      if (tile.visibility === 'opened') id = 'tower';
    } else if (tile.landmark === 'spring' || tile.landmark === 'ruins') {
      if (tile.visibility !== 'hidden')
        shapes = [
          [
            { x: -22, y: 5 },
            { x: 22, y: -38 },
          ],
        ];
      if (tile.visibility === 'opened') id = tile.landmark;
    } else if (tile.visibility !== 'hidden') {
      shapes = objectShapes(tile);
      id = tile.kind;
    }
    for (const shape of shapes)
      for (const p of shape)
        points.push({ x: base.x + p.x * camera.zoom, y: base.y + p.y * camera.zoom });
    const asset = id && skin.assets[id];
    if (asset?.image) {
      points.push(
        { x: base.x - asset.anchorX * camera.zoom, y: base.y - asset.anchorY * camera.zoom },
        {
          x: base.x + (asset.width - asset.anchorX) * camera.zoom,
          y: base.y + (asset.height - asset.anchorY) * camera.zoom,
        },
      );
    }
    if (tile.visibility === 'opened' && monumentsByCoordinate.has(tile.x + ',' + tile.y)) {
      const monumentBounds = monumentsByCoordinate.get(tile.x + ',' + tile.y);
      for (const x of [-1, 2])
        for (const y of [-1, 2]) {
          const p = surface(monumentBounds.x + x, monumentBounds.y + y, performance.now());
          points.push(p, { x: p.x, y: p.y - 190 * camera.zoom });
        }
      const archBase = surface(tile.x + 0.5, tile.y + 0.5, performance.now());
      points.push(
        { x: archBase.x - 110 * camera.zoom, y: archBase.y - 130 * camera.zoom },
        { x: archBase.x + 110 * camera.zoom, y: archBase.y },
      );
      const monument = monumentsByCoordinate.get(tile.x + ',' + tile.y),
        bitmap = skin.assets.stone_arch;
      if (bitmap?.image) {
        const center = surface(monument.x + 0.5, monument.y + 0.5, performance.now());
        points.push(
          {
            x: center.x - bitmap.anchorX * camera.zoom,
            y: center.y - bitmap.anchorY * camera.zoom,
          },
          {
            x: center.x + (bitmap.width - bitmap.anchorX) * camera.zoom,
            y: center.y + (bitmap.height - bitmap.anchorY) * camera.zoom,
          },
        );
      }
    }
    if (tile.visibility === 'opened' && sceneryByCoordinate.has(tile.x + ',' + tile.y)) {
      const type = sceneryByCoordinate.get(tile.x + ',' + tile.y).type;
      const visual = globalThis.TapScenery?.bounds(type, skin) || {
        left: -32,
        right: 32,
        top: -78,
        bottom: 5,
      };
      points.push(
        { x: base.x + visual.left * camera.zoom, y: base.y + visual.top * camera.zoom },
        { x: base.x + visual.right * camera.zoom, y: base.y + visual.bottom * camera.zoom },
      );
      const asset = skin.assets[type];
      if (asset?.image)
        points.push(
          { x: base.x - asset.anchorX * camera.zoom, y: base.y - asset.anchorY * camera.zoom },
          {
            x: base.x + (asset.width - asset.anchorX) * camera.zoom,
            y: base.y + (asset.height - asset.anchorY) * camera.zoom,
          },
        );
    }
    return {
      left: Math.min(...points.map((p) => p.x)),
      right: Math.max(...points.map((p) => p.x)),
      top: Math.min(...points.map((p) => p.y)),
      bottom: Math.max(...points.map((p) => p.y)) + 17 * camera.zoom,
    };
  }
  function pick(p) {
    // Use the geometry of the last displayed frame, in reverse paint order.
    for (let i = hitAreas.length - 1; i >= 0; i--) {
      if (inside(p, hitAreas[i].points)) return hitAreas[i];
    }
    return null;
  }
  function roadSegments(tile, now) {
    if (!tile.road) return [];
    const state = displayState(tile, now);
    // Delayed reveals obey the displayed state, including tower visibility waves.
    if (
      state.visibility === 'hidden' ||
      (state.visibility === 'preview' && towerFade(tile, now) === 0)
    )
      return [];
    const neighbors = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].map(([dx, dy]) => ({
      dx,
      dy,
      tile: tilesByCoordinate.get(tile.x + dx + ',' + (tile.y + dy)),
    }));
    const opened = (neighbor) =>
      neighbor.tile?.road && displayState(neighbor.tile, now).visibility === 'opened';
    return neighbors.filter(
      (neighbor) =>
        neighbor.tile?.road &&
        (opened(neighbor) ||
          (displayState(neighbor.tile, now).visibility === 'preview' &&
            towerFade(neighbor.tile, now) > 0)),
    );
  }
  function drawRoad(tile, now) {
    const segments = roadSegments(tile, now);
    const state = displayState(tile, now);
    if (
      !tile.road ||
      state.visibility === 'hidden' ||
      (state.visibility === 'preview' && towerFade(tile, now) === 0)
    )
      return;
    const center = surface(tile.x + 0.5, tile.y + 0.5, now, tile);
    ctx.save();
    const bounds = corners(tile, now);
    ctx.beginPath();
    bounds.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha = state.visibility === 'opened' ? 1 : CONFIG.roadPreviewOpacity;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [color, width] of [
      [TapSkin.current.lines.roadEdge, CONFIG.roadWidth + CONFIG.roadBorderWidth * 2],
      [TapSkin.current.lines.road, CONFIG.roadWidth],
    ]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width * camera.zoom;
      ctx.beginPath();
      if (!segments.length) {
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(center.x + 0.1 * camera.zoom, center.y);
      }
      for (const { dx, dy } of segments) {
        const edge = surface(tile.x + 0.5 + dx * 0.5, tile.y + 0.5 + dy * 0.5, now, tile);
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(edge.x, edge.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  function draw(now) {
    frame = 0;
    for (const [id, at] of sceneryReactions)
      if (now - at >= CONFIG.sceneryReactionMs) sceneryReactions.delete(id);
    // rAF timestamps can precede callback execution during heavy rendering.
    now = Math.max(now, performance.now());
    for (let i = pulses.length - 1; i >= 0; i--)
      if (now - pulses[i].at >= pulseDuration(pulses[i])) pulses.splice(i, 1);
    for (const [key, reveal] of towerReveals)
      if (now >= reveal.at + CONFIG.towerFadeMs) towerReveals.delete(key);
    for (const [key, opening] of openings)
      if (
        now >=
        opening.at +
          (opening.monument
            ? CONFIG.completionRevealMs
            : opening.automatic
              ? CONFIG.enclosureFadeMs
              : CONFIG.completionMs)
      )
        openings.delete(key);
    const skin = TapSkin.current;
    ctx.clearRect(0, 0, width, height);
    hitAreas.length = 0;
    const center = project(0, 0);
    ctx.save();
    ctx.translate(center.x, center.y + 35 * camera.zoom);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.fillStyle = skin.shadows.ground;
    ctx.beginPath();
    ctx.ellipse(0, 0, 315, 150, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const worldIndex = tilesByCoordinate;
    for (const tile of tiles) {
      const pts = corners(tile, now),
        { x, y, seed } = tile;
      const base = surface(x + 0.5, y + 0.5, now);
      const bounds = visibleBounds(tile, pts, base);
      if (bounds.right < 0 || bounds.left > width || bounds.bottom < 0 || bounds.top > height)
        continue;
      const remember = (points) => hitAreas.push({ tile, points, base, zoom: camera.zoom });
      const display = displayState(tile, now),
        fade = towerFade(tile, now);
      const visibility =
        display.reveal > 0
          ? 'opened'
          : display.visibility === 'preview' && fade === 0
            ? 'hidden'
            : display.visibility;
      if (y === world.bounds.maxY) {
        const edge = [pts[2], pts[3]];
        const sideDepth = 17 * camera.zoom;
        const side = [
          edge[0],
          edge[1],
          { x: edge[1].x, y: edge[1].y + sideDepth },
          { x: edge[0].x, y: edge[0].y + sideDepth },
        ];
        polygon(side, skin.objects.rock.faceColor);
        remember(side);
      }
      polygon(
        pts,
        tileColor(tile, now),
        visibility === 'hidden' ? skin.lines.hidden : skin.lines.edge,
      );
      remember(pts);
      drawRoad(tile, now);
      if (visibility === 'opened' && monumentsByCoordinate.has(x + ',' + y)) {
        drawMonumentPart(tile, base, now);
        continue;
      }
      if (visibility === 'opened' && sceneryByCoordinate.has(x + ',' + y)) {
        const opening = openings.get(x + ',' + y);
        const alpha = opening
          ? ease(
              (now - opening.at) /
                (opening.automatic ? CONFIG.enclosureFadeMs : CONFIG.completionRevealMs),
            )
          : 1;
        if (drawScenery(tile, base, alpha)) continue;
      }
      if (tile.landmark === 'spring' || tile.landmark === 'ruins') {
        if (visibility === 'hidden') continue;
        if (visibility === 'opened' && drawAsset(tile.landmark, base)) continue;
        ctx.save();
        ctx.translate(base.x, base.y);
        ctx.scale(camera.zoom, camera.zoom);
        if (visibility !== 'opened') {
          // Anonymous outline: zoom does not reveal the type or its effect.
          ctx.globalAlpha = 0.25;
          polygon(
            [
              { x: -12, y: 0 },
              { x: 12, y: 0 },
              { x: 8, y: -20 },
              { x: -7, y: -18 },
            ],
            skin.objects.tower.bodyColor,
          );
        } else if (tile.landmark === 'spring') {
          ctx.fillStyle = skin.objects.spring.bodyColor;
          ctx.beginPath();
          ctx.ellipse(0, 0, 20, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = skin.objects.spring.waterColor;
          ctx.beginPath();
          ctx.ellipse(0, -2, 15, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = skin.objects.spring.detailColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-6, -3);
          ctx.lineTo(5, -3);
          ctx.stroke();
        } else {
          for (const x of [-14, 9])
            polygon(
              [
                { x, y: 0 },
                { x: x + 7, y: 0 },
                { x: x + 7, y: -28 },
                { x, y: -32 },
              ],
              skin.objects.ruins.bodyColor,
            );
          polygon(
            [
              { x: -14, y: -28 },
              { x: 16, y: -28 },
              { x: 12, y: -36 },
              { x: -12, y: -35 },
            ],
            skin.objects.ruins.bodyColor,
          );
          ctx.fillStyle = skin.objects.ruins.detailColor;
          ctx.fillRect(-5, -4, 9, 4);
        }
        ctx.restore();
        continue;
      }
      if (
        (tile.x === 0 && tile.y === 0) ||
        (tile.landmark === 'tower' &&
          (visibility === 'opened' ||
            (tile.towerOrder === 0 &&
              world.destination?.x === tile.x &&
              world.destination?.y === tile.y)))
      ) {
        const object = tile.x === 0 && tile.y === 0 ? skin.objects.city : skin.objects.tower;
        if (
          visibility === 'opened' &&
          drawAsset(tile.x === 0 && tile.y === 0 ? 'city' : 'tower', base)
        )
          continue;
        ctx.save();
        ctx.translate(base.x, base.y);
        ctx.scale(camera.zoom, camera.zoom);
        if (tile.x === 0 && tile.y === 0) {
          const total = Object.values(world.facilities).reduce((a, b) => a + b, 0);
          const houses =
            total >= CONFIG.cityTownFacilityLevels
              ? 3
              : total >= CONFIG.cityVillageFacilityLevels
                ? 1
                : 0;
          for (let i = 0; i < houses; i++) {
            ctx.save();
            ctx.translate(i === 0 ? -22 : 20 + (i - 1) * 9, i === 2 ? -10 : 4);
            ctx.scale(0.45, 0.45);
            polygon(object.body, object.bodyColor);
            polygon(object.roof, object.roofColor);
            ctx.restore();
          }
          polygon(object.body, object.bodyColor);
          polygon(object.roof, object.roofColor);
          ctx.fillStyle = object.doorColor;
          ctx.fillRect(-3, -15, 6, 15);
          ctx.fillRect(-12, -23, 4, 5);
          ctx.fillRect(8, -23, 4, 5);
        } else {
          ctx.globalAlpha = visibility === 'opened' ? 1 : 0.5;
          polygon(object.body, object.bodyColor);
          if (visibility === 'opened') {
            ctx.fillStyle = object.detailColor;
            ctx.fillRect(-2, -44, 4, 9);
          }
        }
        ctx.restore();
        continue;
      }
      // Other enabled towers are only anonymous shapes until they are opened.
      if (tile.landmark === 'tower') {
        ctx.save();
        ctx.translate(base.x, base.y);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.globalAlpha = 0.25;
        polygon(
          [
            { x: -7, y: 0 },
            { x: 7, y: 0 },
            { x: 5, y: -38 },
            { x: -5, y: -38 },
          ],
          skin.objects.tower.bodyColor,
        );
        ctx.restore();
      }
      if (visibility === 'hidden') {
        // Sparse, sharp cartographic strokes; no blurred or moving overlay.
        const detail = clamp((camera.zoom - 0.65) / 0.35, 0, 1);
        if (detail > 0 && seed % 7 === 0) {
          ctx.save();
          ctx.globalAlpha = detail;
          ctx.strokeStyle = skin.lines.hidden;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(base.x - 7 * camera.zoom, base.y);
          ctx.lineTo(base.x + 7 * camera.zoom, base.y);
          ctx.stroke();
          ctx.restore();
        }
        continue;
      }
      const previewAlpha = (0.38 + (0.4 * display.progress) / tile.requiredCost) * fade;
      const opening = openings.get(tile.x + ',' + tile.y),
        completionAlpha =
          opening && !opening.automatic ? ease((now - opening.at) / CONFIG.completionRevealMs) : 1;
      const objectAlpha =
        (display.reveal !== undefined
          ? (display.visibility === 'hidden' ? 0 : previewAlpha) +
            (1 - (display.visibility === 'hidden' ? 0 : previewAlpha)) * display.reveal
          : visibility === 'preview'
            ? previewAlpha
            : 1) * completionAlpha;
      if (drawAsset(tile.kind, base, objectAlpha)) continue;
      const shapes = objectShapes(tile);
      ctx.save();
      ctx.translate(base.x, base.y);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.globalAlpha = objectAlpha;
      ctx.fillStyle = skin.shadows.object;
      ctx.beginPath();
      ctx.ellipse(3, 2, tile.kind === 'grass' ? 4 : 15, 5, -0.2, 0, Math.PI * 2);
      ctx.fill();
      if (tile.kind === 'tree') {
        const object = skin.objects.tree;
        polygon(shapes[0], object.trunkColor);
        polygon(shapes[1], object.leafColor);
        polygon(shapes[2], object.shadeColor);
        const detail = clamp((camera.zoom - 0.65) / 0.35, 0, 1);
        if (detail > 0) {
          ctx.globalAlpha = objectAlpha * detail;
          ctx.strokeStyle = object.detailColor;
          ctx.lineWidth = 0.8;
          // Veins follow the skin's leaf polygons, including alternate skins.
          for (const leaf of shapes.slice(1)) {
            const center = leaf.reduce(
              (p, q) => ({ x: p.x + q.x / leaf.length, y: p.y + q.y / leaf.length }),
              { x: 0, y: 0 },
            );
            ctx.beginPath();
            leaf.forEach((p, i) => {
              if (i % 2 === 0) {
                ctx.moveTo(center.x, center.y);
                ctx.lineTo(center.x + (p.x - center.x) * 0.72, center.y + (p.y - center.y) * 0.72);
              }
            });
            ctx.stroke();
          }
        }
      } else if (tile.kind === 'rock') {
        polygon(shapes[0], skin.objects.rock.faceColor, skin.objects.rock.lineColor);
        polygon(shapes[1], skin.objects.rock.shadeColor);
      } else if (tile.kind === 'mine') {
        const object = skin.objects.mine;
        // The entrance and timber frame stay visible even in small previews.
        polygon(shapes[0], object.shadeColor);
        polygon(shapes[1], object.entranceColor);
        for (const shape of shapes.slice(2)) polygon(shape, object.timberColor);
      } else if (camera.zoom > 0.65) {
        ctx.globalAlpha = objectAlpha * clamp((camera.zoom - 0.65) / 0.35, 0, 1);
        ctx.strokeStyle = skin.lines.detail;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          ctx.moveTo(k * 5 - 8, 0);
          ctx.lineTo(k * 5 - 8, -5);
        }
        ctx.stroke();
        // An occasional oversized leaf belongs to ordinary terrain, with no event or reward.
        if (seed % 5 === 0) {
          const leaf = skin.objects.tree;
          polygon(
            [
              { x: 5, y: 1 },
              { x: -1, y: -8 },
              { x: -2, y: -20 },
              { x: 7, y: -16 },
              { x: 11, y: -8 },
            ],
            leaf.leafColor,
          );
          ctx.strokeStyle = leaf.detailColor;
          ctx.beginPath();
          ctx.moveTo(5, 1);
          ctx.lineTo(1, -15);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    // Completion stays in the tile plane: the cover retreats from its center.
    for (const opening of openings.values())
      if (!opening.automatic)
        drawOpeningCover(
          opening.tile,
          corners(opening.tile, now),
          surface(opening.tile.x + 0.5, opening.tile.y + 0.5, now),
          now,
        );
    for (const monument of world.monuments) drawMonument(monument, now);
    drawAtmosphere(now);
    drawCompletionEdges(now);
    drawMemoClue(now);
    drawDestination(now);
    // Keep eligible ground readable beneath tall decorative objects.
    for (const tile of tiles) {
      if (tile.visibility === 'preview' && TapWorld.eligible(tile, worldIndex)) {
        ctx.save();
        ctx.setLineDash([3 * camera.zoom, 5 * camera.zoom]);
        ctx.strokeStyle = skin.lines.eligible;
        ctx.lineWidth = 1;
        ctx.beginPath();
        corners(tile, now).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }
    // Draw selected edges last so later terrain or eligibility lines cannot cover them.
    for (const tile of tiles) {
      const strength = outlineStrength(tile, now);
      if (strength <= 0) continue;
      ctx.beginPath();
      corners(tile, now).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      const kind = tilePulse(tile)?.kind;
      ctx.strokeStyle = `rgba(${kind === 'blocked' ? skin.lines.blockedOutline : kind === 'opened' ? skin.lines.openedOutline : skin.lines.outline}, ${strength * 0.85})`;
      ctx.lineWidth = Math.max(CONFIG.minOutlinePixels, CONFIG.outlineWidth * camera.zoom);
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    if (
      pulses.length ||
      towerReveals.size ||
      openings.size ||
      held ||
      atmosphere.shadow ||
      atmosphere.small ||
      sceneryReactions.size
    )
      requestDraw();
  }
  // The memo and the map share the same arch silhouette and open passage.
  function drawArch(pen, x, y, scale, inkOnly = false) {
    const object = TapSkin.current.objects.stone_arch;
    const path = () => {
      pen.beginPath();
      pen.moveTo(-68, 0);
      pen.lineTo(-68, -27);
      pen.bezierCurveTo(-68, -78, 68, -78, 68, -27);
      pen.lineTo(68, 0);
      pen.lineTo(38, 0);
      pen.lineTo(38, -26);
      pen.bezierCurveTo(38, -50, -38, -50, -38, -26);
      pen.lineTo(-38, 0);
      pen.closePath();
    };
    pen.save();
    pen.translate(x, y);
    pen.scale(scale, scale);
    pen.lineJoin = 'round';
    pen.strokeStyle = inkOnly ? TapSkin.current.objects.memo.inkColor : object.lineColor;
    pen.lineWidth = inkOnly ? 2 : 1.2;
    if (!inkOnly) {
      pen.save();
      pen.translate(8, -8);
      path();
      pen.fillStyle = object.shadeColor;
      pen.fill();
      pen.stroke();
      pen.restore();
    }
    path();
    if (!inkOnly) {
      pen.fillStyle = object.faceColor;
      pen.fill();
    }
    pen.stroke();
    pen.beginPath();
    pen.moveTo(-78, 5);
    pen.lineTo(78, 5);
    pen.moveTo(0, -65);
    pen.lineTo(0, -45);
    pen.moveTo(-55, -43);
    pen.lineTo(-34, -31);
    pen.moveTo(55, -43);
    pen.lineTo(34, -31);
    pen.moveTo(-68, -14);
    pen.lineTo(-38, -14);
    pen.moveTo(38, -14);
    pen.lineTo(68, -14);
    pen.stroke();
    pen.restore();
  }
  function drawMonumentPart(tile, base, now) {
    const monument = monumentsByCoordinate.get(tile.x + ',' + tile.y);
    if (!monument || tile.visibility !== 'opened') return;
    const object = TapSkin.current.objects.stone_arch,
      opening = openings.get(tile.x + ',' + tile.y);
    ctx.save();
    if (opening)
      ctx.globalAlpha = opening.automatic
        ? ease(
            (now - opening.at) /
              (opening.monument ? CONFIG.completionRevealMs : CONFIG.enclosureFadeMs),
          )
        : completionReveal(opening, now);
    const pts = corners(tile, now);
    polygon(pts, object.baseColor, object.lineColor);
    ctx.restore();
  }
  function drawMonument(monument, now) {
    if (!TapWorld.monumentStatus(world, monument, tilesByCoordinate).fullyRevealed) return;
    // Paint the shared silhouette after the ground so neither pillar is covered by a later tile.
    const base = surface(monument.x + 0.5, monument.y + 1.5, now);
    const pending = monument.occupied.map((p) => openings.get(p.x + ',' + p.y)).filter(Boolean);
    const revealAt = pending.length ? Math.max(...pending.map((e) => e.at)) : null;
    const alpha = revealAt === null ? 1 : ease((now - revealAt) / CONFIG.completionRevealMs);
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (monument.type === 'stone_arch' && CONFIG.archTrial === 'original') {
      if (!drawAsset('stone_arch', base, alpha))
        drawArch(ctx, base.x, base.y, (CONFIG.tileWidth * camera.zoom * 2.4) / 136);
    } else drawLandmarkStructure(monument, now);
    ctx.restore();
  }
  // Trial forms share ground projection and skin colors, without gameplay effects.
  function drawLandmarkStructure(monument, now) {
    const stone = TapSkin.current.objects.stone_arch;
    const at = (x, y, z = 0) => {
      const p = surface(monument.x + x, monument.y + y, now);
      return { x: p.x, y: p.y - z * camera.zoom };
    };
    const block = (x1, y1, x2, y2, z1, z2) => {
      polygon(
        [at(x1, y2, z1), at(x2, y2, z1), at(x2, y2, z2), at(x1, y2, z2)],
        stone.faceColor,
        stone.lineColor,
      );
      polygon(
        [at(x2, y1, z1), at(x2, y2, z1), at(x2, y2, z2), at(x2, y1, z2)],
        stone.shadeColor,
        stone.lineColor,
      );
      polygon(
        [at(x1, y1, z2), at(x2, y1, z2), at(x2, y2, z2), at(x1, y2, z2)],
        stone.baseColor,
        stone.lineColor,
      );
    };
    // A shared low plinth binds all nine occupied tiles into one footprint.
    block(-0.92, -0.92, 1.92, 1.92, 0, 5);
    if (monument.type === 'stone_arch') {
      const back = at(0.5, -0.65, 5),
        front = at(0.5, 1.65, 5);
      const scale = (CONFIG.tileWidth * camera.zoom * 2.6) / 136;
      drawArch(ctx, back.x, back.y, scale);
      // Deep piers and voussoir roof connect the rear and front arches.
      block(-0.8, -0.65, -0.23, 1.65, 5, 48);
      block(1.23, -0.65, 1.8, 1.65, 5, 48);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI,
          b = ((i + 1) / 12) * Math.PI;
        const p = (angle) => ({ x: 0.5 + Math.cos(angle) * 1.3, z: 32 + Math.sin(angle) * 66 });
        const q = p(a),
          r = p(b);
        polygon(
          [at(q.x, -0.65, q.z), at(r.x, -0.65, r.z), at(r.x, 1.65, r.z), at(q.x, 1.65, q.z)],
          stone.baseColor,
          stone.lineColor,
        );
      }
      drawArch(ctx, front.x, front.y, scale);
      return;
    }
    switch (monument.type) {
      case 'modern_building':
        block(-0.5, -0.55, 1.5, 1.55, 5, 160);
        for (let z = 25; z < 160; z += 24) block(-0.51, 1.53, 1.51, 1.57, z, z + 3);
        break;
      case 'giant_statue':
        block(-0.55, -0.3, 1.55, 1.3, 5, 18);
        block(-0.25, 0.2, 0.28, 0.9, 18, 62);
        block(0.72, 0.2, 1.25, 0.9, 18, 62);
        block(-0.4, 0.05, 1.4, 1.1, 62, 113);
        block(-0.68, 0.3, -0.4, 0.8, 55, 105);
        block(1.4, 0.3, 1.68, 0.8, 55, 105);
        block(0.08, 0.18, 0.92, 0.98, 113, 146);
        break;
      case 'stepped_pyramid':
        for (let i = 0; i < 5; i++)
          block(
            -0.8 + i * 0.22,
            -0.8 + i * 0.22,
            1.8 - i * 0.22,
            1.8 - i * 0.22,
            5 + i * 19,
            24 + i * 19,
          );
        break;
      case 'ring_gate': {
        const center = at(0.5, 0.5, 79);
        ctx.strokeStyle = stone.shadeColor;
        ctx.lineWidth = 18 * camera.zoom;
        ctx.beginPath();
        ctx.ellipse(
          center.x + 7 * camera.zoom,
          center.y - 7 * camera.zoom,
          62 * camera.zoom,
          65 * camera.zoom,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.strokeStyle = stone.faceColor;
        ctx.beginPath();
        ctx.ellipse(center.x, center.y, 62 * camera.zoom, 65 * camera.zoom, 0, 0, Math.PI * 2);
        ctx.stroke();
        block(-0.1, 0.2, 1.1, 0.8, 5, 18);
        break;
      }
      case 'twin_obelisks':
        for (const x of [-0.5, 1]) {
          block(x, -0.4, x + 0.5, 1.4, 5, 105);
          polygon(
            [at(x, 1.4, 105), at(x + 0.5, 1.4, 105), at(x + 0.25, 0.5, 143)],
            stone.faceColor,
            stone.lineColor,
          );
        }
        break;
      case 'silent_dome': {
        const p = at(0.5, 0.6, 5);
        ctx.fillStyle = stone.faceColor;
        ctx.strokeStyle = stone.lineColor;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 96 * camera.zoom, 99 * camera.zoom, 0, Math.PI, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        block(-0.8, 0.6, 1.8, 1.2, 5, 15);
        break;
      }
      case 'long_colonnade':
        for (const y of [-0.5, 1.25])
          for (const x of [-0.6, 0.35, 1.3]) block(x, y, x + 0.3, y + 0.3, 5, 86);
        block(-0.7, -0.65, 1.75, 1.7, 86, 100);
        break;
      case 'stone_chair':
        for (const y of [-0.5, 1.1])
          for (const x of [-0.5, 1.1]) block(x, y, x + 0.4, y + 0.4, 5, 43);
        block(-0.65, -0.65, 1.65, 1.65, 43, 58);
        block(-0.65, -0.65, 1.65, -0.25, 58, 139);
        break;
      case 'spiral_tower':
        block(0.15, 0.15, 0.85, 0.85, 5, 128);
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 3,
            x = 0.5 + Math.cos(a) * 0.7,
            y = 0.5 + Math.sin(a) * 0.7;
          block(x - 0.34, y - 0.34, x + 0.34, y + 0.34, 8 + i * 9, 15 + i * 9);
        }
        break;
    }
  }
  function drawMemoClue(now) {
    if (world.memo.status !== 'placed') return;
    const clue = world.memo.clue,
      tile = tilesByCoordinate.get(clue.x + ',' + clue.y);
    if (tile?.visibility !== 'opened') return;
    const opening = openings.get(clue.x + ',' + clue.y);
    const base = surface(clue.x + 0.5, clue.y + 0.5, now);
    if (base.x < 0 || base.x > width || base.y < 0 || base.y > height) return;
    const detail = camera.zoom >= TapWorld.RULES.memoDiscoverZoom,
      object = TapSkin.current.objects.memo;
    ctx.save();
    ctx.translate(
      base.x + CONFIG.tileWidth * camera.zoom * 0.2,
      base.y + CONFIG.tileHeight * camera.zoom * 0.18,
    );
    const scale = Math.max(camera.zoom, CONFIG.memoMinPixels / 10);
    ctx.scale(scale, scale);
    if (opening) ctx.globalAlpha = completionReveal(opening, now);
    polygon(
      [
        { x: -8, y: 2 },
        { x: -3, y: -1 },
        { x: 2, y: 2 },
        { x: 0, y: 5 },
        { x: -7, y: 5 },
      ],
      object.stoneColor,
    );
    polygon(
      [
        { x: -5, y: -7 },
        { x: 5, y: -8 },
        { x: 6, y: 1 },
        { x: -4, y: 2 },
      ],
      object.paperColor,
      object.inkColor,
    );
    if (detail) {
      ctx.strokeStyle = object.inkColor;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(2, -7);
      ctx.lineTo(2, -4);
      ctx.lineTo(5, -4);
      ctx.moveTo(-2, -3);
      ctx.lineTo(1, -3);
      ctx.moveTo(-2, -1);
      ctx.lineTo(3, -1);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawOpeningCover(tile, pts, base, now) {
    const opening = openings.get(tile.x + ',' + tile.y);
    if (!opening || opening.automatic) return;
    const progress = completionReveal(opening, now);
    if (progress >= 1) return;
    const color = terrainColor(tile, 'preview', opening.progress);
    const inner = pts.map((p) => ({
      x: base.x + (p.x - base.x) * progress,
      y: base.y + (p.y - base.y) * progress,
    }));
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      polygon(
        [pts[i], pts[next], inner[next], inner[i]],
        `hsl(${color.h} ${color.s}% ${color.l}%)`,
      );
    }
    // A moving border makes the change readable even when the center is covered by a finger.
    if (progress > 0) {
      ctx.beginPath();
      inner.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.globalAlpha = 0.65 * (1 - progress);
      ctx.strokeStyle = TapSkin.current.ui.textColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }
  function completionReveal(opening, now) {
    return ease((now - opening.at) / CONFIG.completionRevealMs);
  }
  function completionEdgeStrength(tile, now) {
    if (tile.visibility === 'hidden') return 0;
    let strength = 0;
    for (const opening of openings.values()) {
      if (opening.automatic) continue;
      const distance = Math.abs(tile.x - opening.tile.x) + Math.abs(tile.y - opening.tile.y);
      if (distance > CONFIG.waveRadius) continue;
      const age = now - opening.at - distance * CONFIG.waveDelayMs;
      const duration = distance === 0 ? CONFIG.completionEdgeMs : CONFIG.waveMs;
      if (age > 0 && age < duration)
        strength = Math.max(strength, Math.sin((age / duration) * Math.PI) / (distance + 1));
    }
    return strength;
  }
  function drawCompletionEdges(now) {
    const affected = new Set();
    for (const opening of openings.values())
      if (!opening.automatic)
        for (let dy = -CONFIG.waveRadius; dy <= CONFIG.waveRadius; dy++)
          for (let dx = -CONFIG.waveRadius; dx <= CONFIG.waveRadius; dx++)
            if (Math.abs(dx) + Math.abs(dy) <= CONFIG.waveRadius)
              affected.add(opening.tile.x + dx + ',' + (opening.tile.y + dy));
    for (const key of affected) {
      const tile = tilesByCoordinate.get(key);
      if (!tile) continue;
      const strength = completionEdgeStrength(tile, now);
      if (!strength) continue;
      const pts = corners(tile, now);
      if (pts.every((p) => p.x < 0 || p.x > width || p.y < 0 || p.y > height)) continue;
      ctx.save();
      ctx.globalAlpha = strength * CONFIG.waveOpacity;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.strokeStyle = TapSkin.current.ui.textColor;
      ctx.lineWidth = Math.max(1.5, 2 * camera.zoom);
      ctx.stroke();
      ctx.restore();
    }
  }
  function drawDestination(now) {
    const destinations = TapWorld.destinations(world, tilesByCoordinate);
    if (world.learning.town === 'guiding') destinations.push({ x: 0, y: 0, city: true });
    if (!destinations.length) return;
    const margin = CONFIG.markerMargin,
      spacing = CONFIG.markerSpacing;
    const headerBottom = document.querySelector('header').getBoundingClientRect().bottom;
    const footerTop = document.querySelector('footer').getBoundingClientRect().top;
    const top = Math.min(headerBottom + margin, height / 2),
      bottom = Math.max(top, Math.min(height, footerTop) - margin);
    const panel = !settingsPanel.hidden
        ? settingsPanel.getBoundingClientRect()
        : !townPanel.hidden
          ? townPanel.getBoundingClientRect()
          : memoPanel.hidden
            ? null
            : memoPanel.getBoundingClientRect(),
      placed = [];
    const available = (x, y) =>
      !(
        panel &&
        x > panel.left - margin &&
        x < panel.right + margin &&
        y > panel.top - margin &&
        y < panel.bottom + margin
      ) && placed.every((p) => Math.hypot(p.x - x, p.y - y) >= spacing);
    for (const destination of destinations) {
      const p = surface(destination.x + 0.5, destination.y + 0.5, now),
        target = { x: p.x, y: p.y - 64 * camera.zoom };
      let x = clamp(target.x, margin, width - margin),
        y = clamp(target.y, top, bottom);
      if (!available(x, y)) {
        const candidates = [];
        const add = (a, b) => {
          a = clamp(a, margin, width - margin);
          b = clamp(b, top, bottom);
          if (available(a, b)) candidates.push({ x: a, y: b });
        };
        if (panel) {
          add(panel.left - margin, y);
          add(panel.right + margin, y);
          add(x, panel.top - margin);
          add(x, panel.bottom + margin);
        }
        for (const other of placed)
          for (const [dx, dy] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ])
            add(other.x + dx * spacing, other.y + dy * spacing);
        // A small bounded grid also finds space when both arrows share an edge.
        for (let a = margin; a <= width - margin; a += spacing)
          for (let b = top; b <= bottom; b += spacing) add(a, b);
        for (let a = margin; a <= width - margin; a += spacing) add(a, bottom);
        for (let b = top; b <= bottom; b += spacing) add(width - margin, b);
        add(width - margin, bottom);
        candidates.sort(
          (a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2),
        );
        if (candidates.length) ({ x, y } = candidates[0]);
      }
      placed.push({ x, y });
      const offscreen = x !== target.x || y !== target.y,
        ui = TapSkin.current.ui;
      const label = destination.city
        ? '街'
        : tilesByCoordinate.get(destination.x + ',' + destination.y)?.landmark === 'tower'
          ? '塔'
          : 'アーチ';
      ctx.save();
      if (offscreen) {
        ctx.beginPath();
        ctx.arc(x, y, CONFIG.markerRadius, 0, Math.PI * 2);
        ctx.fillStyle = ui.surfaceColor;
        ctx.fill();
        ctx.strokeStyle = ui.textColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.fillStyle = ui.textColor;
      ctx.strokeStyle = ui.surfaceColor;
      ctx.lineWidth = 3;
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText(destination.city ? '街' : '★', x, y);
      ctx.fillText(destination.city ? '街' : '★', x, y);
      if (destinations.length > 1 && !destination.city) {
        ctx.font = '10px sans-serif';
        ctx.strokeText(label, x, y + 16);
        ctx.fillText(label, x, y + 16);
      }
      if (offscreen) {
        const angle = Math.atan2(target.y - y, target.x - x);
        ctx.translate(x, y);
        ctx.rotate(angle);
        polygon(
          [
            { x: 17, y: -7 },
            { x: 27, y: 0 },
            { x: 17, y: 7 },
          ],
          ui.textColor,
        );
      }
      ctx.restore();
    }
  }
  function requestDraw() {
    if (!frame) frame = requestAnimationFrame(draw);
  }
  function resize() {
    const oldWidth = width;
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!oldWidth)
      camera.zoom = clamp(Math.min(width / 880, height / 650), CONFIG.initialMinZoom, 1.15);

    requestDraw();
  }
  function point(event) {
    const r = canvas.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  }
  function zoomAt(p, factor) {
    const before = camera.zoom,
      next = clamp(before * factor, CONFIG.minZoom, CONFIG.maxZoom);
    camera.x = p.x - width / 2 - ((p.x - width / 2 - camera.x) * next) / before;
    camera.y = p.y - height * 0.48 - ((p.y - height * 0.48 - camera.y) * next) / before;
    camera.zoom = next;
    if (next < CONFIG.minTapZoom) releasePress(false);
    requestDraw();
  }
  function pair() {
    const [a, b] = [...pointers.values()];
    return {
      midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      distance: Math.hypot(a.x - b.x, a.y - b.y),
    };
  }
  function canDevelop(tile) {
    const available = Math.min(
      TapWorld.maximumPoints(world),
      world.points +
        Math.max(0, Date.now() - world.lastCalculatedAt) * TapWorld.recoveryRate(world),
    );
    return TapWorld.eligible(tile, tilesByCoordinate) && available >= 1;
  }
  function press(p) {
    if (!started || suspended || camera.zoom < CONFIG.minTapZoom) return;
    const hit = pick(p);
    if (!hit || hit.zoom < CONFIG.minTapZoom) return;
    const { tile, base, zoom } = hit;
    const localX = clamp((p.x - base.x) / (CONFIG.tileWidth * zoom), -0.4, 0.4);
    const localY = clamp((p.y - base.y) / (CONFIG.tileHeight * zoom), -0.4, 0.4);
    const now = performance.now(),
      previous = tilePulse(tile);
    const kind = tile.visibility === 'opened' ? 'opened' : canDevelop(tile) ? 'normal' : 'blocked';
    const start = previous
      ? (reaction(previous, now) * pulseDepth(previous)) / pulseDepth({ kind })
      : CONFIG.contactStrength;
    const velocity = previous
      ? (((reaction(previous, now + 0.1) - reaction(previous, now)) / 0.1) * pulseDepth(previous)) /
        pulseDepth({ kind })
      : 0;
    const old = pulses.findIndex((entry) => entry.tile === tile);
    if (old >= 0) pulses.splice(old, 1);
    held = {
      x: tile.x + 0.5 + localX,
      y: tile.y + 0.5 + localY,
      tile,
      kind,
      at: now,
      start,
      velocity,
    };
    // Touching an already opened automatic tile must show its current logical state.
    if (tile.visibility === 'opened' && openings.get(tile.x + ',' + tile.y)?.automatic)
      openings.delete(tile.x + ',' + tile.y);
    requestDraw();
  }
  function animateCompletion(result, now, progress) {
    const tile = result.tile;
    openings.set(tile.x + ',' + tile.y, { tile, at: now, progress, automatic: false });
    for (const region of result.regions) {
      const remaining = new Set(region.map((t) => t.x + ',' + t.y)),
        layers = new Map();
      let layer = 0;
      while (remaining.size) {
        const boundary = region.filter(
          (t) =>
            remaining.has(t.x + ',' + t.y) &&
            [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ].some(([dx, dy]) => !remaining.has(t.x + dx + ',' + (t.y + dy))),
        );
        for (const t of boundary) {
          remaining.delete(t.x + ',' + t.y);
          layers.set(t, layer);
        }
        layer++;
      }
      for (const entry of result.automatic.filter((entry) => layers.has(entry.tile))) {
        openings.set(entry.tile.x + ',' + entry.tile.y, {
          ...entry,
          automatic: true,
          at: now + CONFIG.enclosureStartMs + layers.get(entry.tile) * CONFIG.enclosureStepMs,
        });
      }
    }
    for (const entry of result.monumentAutomatic) {
      const distance = Math.abs(entry.tile.x - tile.x) + Math.abs(entry.tile.y - tile.y);
      openings.set(entry.tile.x + ',' + entry.tile.y, {
        ...entry,
        automatic: true,
        monument: true,
        at: now + distance * CONFIG.monumentStepMs,
      });
    }
    while (openings.size > CONFIG.maxOpenings) openings.delete(openings.keys().next().value);
  }
  function releasePress(commit) {
    if (!held) return;
    if (commit && camera.zoom < CONFIG.minTapZoom) commit = false;
    if (commit) {
      const hidden =
        held.tile.landmark === 'tower'
          ? world.tiles.filter((tile) => tile.visibility === 'hidden')
          : [];
      const now = performance.now(),
        start = reaction(held, now),
        velocity = (reaction(held, now + 0.1) - start) / 0.1,
        progress = held.tile.developmentProgress;
      let completion = null,
        memo = null;
      const result =
        held.tile.visibility === 'opened'
          ? (memo = TapWorld.collectMemo(world, held.tile, camera.zoom))
            ? 'memo'
            : 'touch'
          : !TapWorld.eligible(held.tile, tilesByCoordinate)
            ? 'blocked'
            : TapWorld.develop(world, held.tile, Date.now(), (entry) => {
                completion = entry;
                animateCompletion(entry, now, progress);
              });
      const kind =
        result === 'blocked' || result === 'empty'
          ? 'blocked'
          : result === 'opened' || result === 'tower' || result === 'spring' || result === 'ruins'
            ? 'complete'
            : result === 'touch' || result === 'memo'
              ? 'opened'
              : 'normal';
      if (result !== 'blocked' && result !== 'empty')
        towerReveals.delete(held.tile.x + ',' + held.tile.y);
      if (result === 'tower') {
        for (const tile of hidden)
          if (tile.visibility === 'preview') {
            const distance = Math.max(
              Math.abs(tile.x - held.tile.x),
              Math.abs(tile.y - held.tile.y),
            );
            towerReveals.set(tile.x + ',' + tile.y, { at: now + distance * CONFIG.towerRingMs });
          }
        toast(
          held.tile.towerOrder === 0
            ? '古い塔から視界が広がりました。開いた土地に残る手掛かりを探してみましょう。'
            : '古い塔から視界が広がりました。気の向くままに地図を広げましょう。',
        );
      }
      if (completion?.monumentReached)
        toast(
          TapWorld.MONUMENTS[completion.monumentReached.type] +
            'を見つけました。全体が姿を現します。',
        );
      if (result === 'spring') toast('清水の泉を見つけました。探索ポイントが回復しました。');
      if (result === 'ruins')
        toast(
          '遺跡を見つけました。開拓力 ' +
            (TapWorld.developmentPower(world) - 1) +
            ' → ' +
            TapWorld.developmentPower(world) +
            '。',
        );
      if (result === 'touch' && held.tile.x === 0 && held.tile.y === 0) openTown();
      if (result === 'empty' && now - emptyNoticeAt >= CONFIG.emptyNoticeCooldownMs) {
        emptyNoticeAt = now;
        toast('探索ポイントが足りないため開拓できません。しばらく待つと回復します。');
      }
      learn();
      if (
        result === 'opened' ||
        result === 'tower' ||
        result === 'spring' ||
        result === 'ruins' ||
        result === 'memo'
      )
        save();
      else if (result === 'progress') queueSave();
      if (memo) showMemo(memo.alreadyReached);
      if (result === 'touch') reactScenery(held.tile, now);
      if (result === 'touch' || result === 'opened') smallEvent(held.tile, now);
      updateHud();
      pulses.push({ ...held, kind, start, velocity, at: now });
    }
    const blocked = commit ? pulses[pulses.length - 1].kind === 'blocked' : held.kind === 'blocked';
    held = null;
    if (pulses.length > CONFIG.maxPulses) pulses.shift();
    if (commit) playSound(blocked);
    requestDraw();
  }
  function playSound(blocked = false) {
    if (!soundOn || !audio || audio.state !== 'running') return;
    const oscillator = audio.createOscillator(),
      gain = audio.createGain(),
      time = audio.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime((blocked ? 680 : 420) + Math.random() * 30, time);
    oscillator.frequency.exponentialRampToValueAtTime(
      blocked ? 350 : 150,
      time + (blocked ? 0.025 : 0.045),
    );
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(CONFIG.soundVolume * (blocked ? 0.35 : 1), time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, time + (blocked ? 0.04 : 0.065));
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(time);
    oscillator.stop(time + (blocked ? 0.05 : 0.075));
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  soundButton.addEventListener('click', async () => {
    if (soundOn) {
      soundOn = false;
    } else {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!audio) audio = new AudioContext();
        await audio.resume();
        soundOn = audio.state === 'running';
        if (!soundOn) throw new Error('Audio unavailable');
        notice.textContent = '';
      } catch {
        soundOn = false;
        notice.textContent = 'この環境では音を再生できません。';
      }
    }
    soundButton.textContent = soundOn ? 'Sound ON' : 'Sound OFF';
    soundButton.setAttribute('aria-pressed', String(soundOn));
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const p = point(event);
    pointers.set(event.pointerId, p);
    canvas.setPointerCapture(event.pointerId);
    if (pointers.size === 1) {
      gesture = {
        start: p,
        last: p,
        moved: false,
        multi: false,
        threshold: event.pointerType === 'touch' ? CONFIG.touchDragThreshold : CONFIG.dragThreshold,
      };
      press(p);
    }
    if (pointers.size >= 2) {
      releasePress(false);
      gesture.multi = true;
      gesture.pair = pair();
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    const p = point(event);
    pointers.set(event.pointerId, p);
    if (pointers.size >= 2) {
      const next = pair(),
        prev = gesture.pair;
      if (prev && prev.distance > 0) {
        zoomAt(prev.midpoint, next.distance / prev.distance);
        camera.x += next.midpoint.x - prev.midpoint.x;
        camera.y += next.midpoint.y - prev.midpoint.y;
      }
      gesture.pair = next;
      requestDraw();
    } else {
      if (Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > gesture.threshold) {
        gesture.moved = true;
        releasePress(false);
      }
      if (gesture.moved || gesture.multi) {
        camera.x += p.x - gesture.last.x;
        camera.y += p.y - gesture.last.y;
        canvas.classList.add('dragging');
        requestDraw();
      }
      gesture.last = p;
    }
  });
  function endPointer(event) {
    if (!pointers.has(event.pointerId)) return;
    const p = point(event);
    releasePress(
      event.type === 'pointerup' &&
        pointers.size === 1 &&
        !gesture.multi &&
        !gesture.moved &&
        Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) <= gesture.threshold,
    );
    pointers.delete(event.pointerId);
    if (pointers.size === 1) gesture.last = [...pointers.values()][0];
    if (!pointers.size) {
      gesture = null;
      canvas.classList.remove('dragging');
    }
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    canvas.addEventListener(name, endPointer);
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      zoomAt(point(event), Math.exp(-clamp(event.deltaY, -120, 120) * 0.002));
    },
    { passive: false },
  );
  window.addEventListener('resize', resize);
  function suspend() {
    if (suspended) return;
    // Flush while still online; further hidden/pagehide calls must not settle again.
    save();
    suspended = true;
    resetAtmosphere();
    pointers.clear();
    gesture = null;
    held = null;
    pulses.length = 0;
    towerReveals.clear();
    openings.clear();
    canvas.classList.remove('dragging');
  }
  function resume() {
    if (!suspended || document.hidden) return;
    const gained = TapWorld.settle(world, Date.now(), true);
    suspended = false;
    resetAtmosphere();
    if (started) showResume(gained);
    else resumeGains = gained;
    updateHud();
    save();
    requestDraw();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspend();
    else resume();
    requestDraw();
  });
  window.addEventListener('pagehide', suspend);
  window.addEventListener('pageshow', () => {
    resume();
    requestDraw();
  });
  updateHud();
  resize();
})();
