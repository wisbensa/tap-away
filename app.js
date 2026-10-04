(() => {
  "use strict";
  // Initial visual tuning; final touch feel and exploration are checked on real devices.
  const CONFIG = { tileWidth: 76, tileHeight: 72, heightScale: 15,
    minZoom: .12, minTapZoom: .25, initialMinZoom: .55, maxZoom: 2.4, dragThreshold: 7, touchDragThreshold: 14, reactionMs: 400,
    sinkMs: 65, contactMs: 35, contactStrength: .15, reboundAtMs: 230, reboundStrength: .12,
    pressDepth: 3.5, minPressPixels: 3.5, pressDarkening: 16,
    blockedPixels: 1, blockedMs: 130, blockedDarkening: 3,
    openedPixels:1.5, openedMs:180, openedBrightening:8,
    emptyNoticeCooldownMs:7000, monumentStepMs:100,
    outlineWidth: 2, minOutlinePixels: 2, colorHoldMs: 65, colorReturnMs: 180, maxPulses: 32, soundVolume: .12,
    completionMs: 420, completionRevealMs: 300, completionEdgeMs: 360,
    waveRadius: 2, waveDelayMs: 75, waveMs: 230, waveOpacity: .5,
    enclosureStartMs: 180, enclosureStepMs: 150, enclosureFadeMs: 150, maxOpenings: 64,
    towerRingMs: 80, towerFadeMs: 120, memoDisplayMs: 10000, memoMinPixels: 7,
    shadowMinMs:90000, shadowMaxMs:180000, shadowMs:4200, shadowOpacity:.14,
    shadowHalfWidth:.58, shadowAspect:.32, shadowStartY:.32, shadowDriftY:.3,
    noticeMs:7000, blockedSinkMs:25, openedSinkMs:40, openedReboundMs:100, openedReboundStrength:.08,
    roadWidth:7, roadBorderWidth:2, roadPreviewOpacity:.3,
    smallEventCooldownMs:18000, smallEventChance:.12, smallEventMs:1500,
    markerMargin: 36, markerRadius: 28, markerSpacing: 60 };
  const canvas = document.querySelector("#map"), ctx = canvas.getContext("2d");
  const soundButton = document.querySelector("#sound"), notice = document.querySelector("#notice");
  const camera = { x: 0, y: 0, zoom: 1 };
  const pointers = new Map(), pulses = [], tiles = [];
  const hitAreas = [], towerReveals = new Map(), openings = new Map();
  let width = 0, height = 0, frame = 0, soundOn = false, audio = null, gesture = null, held = null;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const heightAt = (x, y) => .55 + .27 * Math.sin(x * .68 + y * .36) + .2 * Math.cos(y * .8 - x * .22);
  const SAVE_KEY='tap-away.world.v1';
  let world,saveBlocked=false,saveTimer=0,toastTimer=0,memoTimer=0,started=false,needsInitialSave=false,legacyReset=false,emptyNoticeAt=-Infinity;
  const memoPanel=document.querySelector('#memo-panel'), memoReview=document.querySelector('#memo-review');
  const SAVE_LOAD_ERROR = "セーブを読み込めません。元データを保持しています。この回の進行は保存されません。";
  function toast(message) {
    notice.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => notice.textContent = '', CONFIG.noticeMs);
  }
  function loadWorld() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const seedText = new URLSearchParams(location.search).get('seed');
      const seed = seedText !== null && /^\d+$/.test(seedText) && Number(seedText) <= 0xffffffff ? Number(seedText) : undefined;
      const previous = raw === null ? null : JSON.parse(raw);
      const loaded = raw === null ? TapWorld.create(Date.now(), seed) : TapWorld.migrate(previous, Date.now(), seed);
      legacyReset = raw !== null && previous.saveVersion < 3;
      needsInitialSave = raw === null || previous.saveVersion < loaded.saveVersion;
      TapWorld.settle(loaded);
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
    TapWorld.settle(world);
    const savedAt = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({...world, savedAt}));
      world.savedAt = savedAt;
      return true;
    } catch {
      toast("保存できませんでした。端末の空き容量や保存設定を確認してください。");
      return false;
    }
  }
  if (needsInitialSave) save();
  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 500);
  }
  function updateHud() {
    document.querySelector('#points').textContent = '探索 ' + Math.floor(world.points) + ' / ' + TapWorld.RULES.maxPoints;
    memoReview.hidden = !started || world.memo.status !== 'collected';
  }
  document.querySelector('#start').textContent=world.introduced?"つづきから":"はじめる";
  function startGame() {
    started = true;
    resetAtmosphere();
    document.querySelector('#start-screen').hidden = true;
    if (saveBlocked) toast(SAVE_LOAD_ERROR);
    if (!world.introduced && !saveBlocked) {
      world.introduced = true;
      toast((legacyReset ? "地図が新しくなりました。" : "") + "隣の土地をポチポチ開拓。★の古い塔まで行くと、遠くを見渡せます。");
      queueSave();
    }
    updateHud();
    requestDraw();
  }
  document.querySelector('#start').addEventListener('click', startGame);
  function memoHint(monument) {
    const clue=world.memo.clue, dx=monument.x-clue.x, dy=monument.y-clue.y;
    const direction=(dy<0?'北':dy>0?'南':'')+(dx<0?'西':dx>0?'東':'');
    return (direction || 'この近く')+'に、大きな石のアーチがある。\n地図の位置：'+monument.x+' / '+monument.y;
  }
  function closeMemo() { clearTimeout(memoTimer); memoPanel.hidden=true; requestDraw(); }
  function showMemo(alreadyReached=false) {
    const monument=world.monuments.find(m=>m.id===world.memo.monumentId);
    if(world.memo.status!=='collected'||!monument) return;
    document.querySelector('#memo-hint').textContent=memoHint(monument);
    document.querySelector('#memo-aside').textContent=TapWorld.memoAside(world);
    document.querySelector('#memo-context').textContent=alreadyReached || TapWorld.monumentStatus(world,monument).reached?
      'この場所は、もう見つけていた。':'★の先に、描かれた場所がある。';
    const picture=document.querySelector('#memo-picture'), pen=picture.getContext('2d'), skin=TapSkin.current;
    pen.clearRect(0,0,picture.width,picture.height);
    drawArch(pen,90,86,1,true);
    memoPanel.hidden=false;clearTimeout(memoTimer);memoTimer=setTimeout(closeMemo,CONFIG.memoDisplayMs);requestDraw();
  }
  document.querySelector('#memo-close').addEventListener('click',closeMemo);
  memoReview.addEventListener('click',()=>showMemo());
  const devButton=document.querySelector('#dev-reset');
  devButton.addEventListener('click',()=>{if(!confirm("Tap Awayの進行を初期状態に戻しますか？"))return;try{clearTimeout(saveTimer);localStorage.removeItem(SAVE_KEY);saveBlocked=true;location.reload();}catch{toast("セーブを削除できませんでした。");}});
  const notes=document.querySelector('#release-dialog');
  function renderReleaseNotes(body, releases) {
    body.replaceChildren();
    const sorted = releases.slice().sort((a, b) =>
      b.date.localeCompare(a.date) || b.version.localeCompare(a.version, undefined, {numeric: true}));
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
    body.textContent = "読み込み中…";
    try {
      const response = await fetch('release-notes.json', {cache: 'no-cache'});
      if (!response.ok) throw Error('Release notes unavailable');
      const data = await response.json();
      renderReleaseNotes(body, data.releases);
    } catch {
      body.textContent = "更新情報を取得できませんでした。ゲームはそのまま遊べます。";
    }
  }
  document.querySelector('#notes').addEventListener('click', openReleaseNotes);
  document.querySelector('#close-notes').addEventListener('click',()=>notes.close());
  const skinDialog = document.querySelector('#skin-dialog'), skinChoice = document.querySelector('#skin-choice');
  for (const skin of TapSkin.available) {
    const option = document.createElement('option');
    option.value = skin.id; option.textContent = skin.label; skinChoice.append(option);
  }
  function syncSkinChoice() { skinChoice.value = TapSkin.selection() || ''; }
  function switchSkin(id) {
    if (!save()) {
      syncSkinChoice();
      if (saveBlocked) toast("進行を保存できないため、スキンを切り替えられません。");
      return;
    }
    try { TapSkin.select(id); location.reload(); }
    catch { syncSkinChoice(); toast("スキンの設定を保存できませんでした。"); }
  }
  document.querySelector('#dev-skin').addEventListener('click',()=>{syncSkinChoice();skinDialog.showModal();});
  document.querySelector('#close-skin').addEventListener('click',()=>skinDialog.close());
  skinChoice.addEventListener('change',()=>switchSkin(skinChoice.value || null));
  document.querySelector('#skin-default').addEventListener('click',()=>switchSkin(null));
  const skinReady = TapSkin.load().then(()=>{syncSkinChoice();requestDraw();});
  setInterval(()=>{if(!document.hidden&&started){TapWorld.settle(world);updateHud();tickAtmosphere(performance.now());}},1000);
  setInterval(()=>{if(!document.hidden&&started)queueSave();},15000);
  tiles.sort((a, b) => a.y - b.y || a.x - b.x);
  const tilesByCoordinate=TapWorld.index(world);
  const monumentsByCoordinate=new Map(world.monuments.flatMap(monument=>monument.occupied.map(p=>[p.x+','+p.y,monument])));
  const sceneryByCoordinate=new Map(world.scenery.map(object=>[object.x+','+object.y,object]));
  const atmosphere={shadow:null,small:null,nextShadow:0,nextSmall:0};
  function resetAtmosphere(now=performance.now()) {
    atmosphere.shadow=null;atmosphere.small=null;
    atmosphere.nextShadow=now+CONFIG.shadowMinMs+Math.random()*(CONFIG.shadowMaxMs-CONFIG.shadowMinMs);
    atmosphere.nextSmall=now+CONFIG.smallEventCooldownMs;
  }
  function tickAtmosphere(now) {
    if(!started||document.hidden) return;
    if(!atmosphere.nextShadow) resetAtmosphere(now);
    if(now>=atmosphere.nextShadow) {
      atmosphere.shadow={at:now,reverse:Math.random()<.5};
      atmosphere.nextShadow=now+CONFIG.shadowMinMs+Math.random()*(CONFIG.shadowMaxMs-CONFIG.shadowMinMs);
      requestDraw();
    }
  }
  function smallEvent(tile,now) {
    if(!started||document.hidden||tile.visibility!=='opened'||tile.landmark||tile.x===0&&tile.y===0||
      !['grass','tree'].includes(tile.kind)||monumentsByCoordinate.has(tile.x+','+tile.y)||
      sceneryByCoordinate.has(tile.x+','+tile.y)||now<atmosphere.nextSmall) return;
    atmosphere.nextSmall=now+CONFIG.smallEventCooldownMs;
    if(Math.random()<CONFIG.smallEventChance) atmosphere.small={tile,at:now,kind:tile.kind==='tree'?'leaves':'birds'};
  }
  function shadowGeometry(shadow,now) {
    const progress=clamp((now-shadow.at)/CONFIG.shadowMs,0,1);
    const spanX=Math.max(width,height)*CONFIG.shadowHalfWidth,spanY=spanX*CONFIG.shadowAspect,travel=width+spanX*2;
    return {x:shadow.reverse?width+spanX-travel*progress:-spanX+travel*progress,
      y:height*(CONFIG.shadowStartY+CONFIG.shadowDriftY*progress),spanX,spanY,progress};
  }
  function drawAtmosphere(now) {
    if(!started||document.hidden) return;
    const shadow=atmosphere.shadow, small=atmosphere.small;
    if(shadow) {
      const t=(now-shadow.at)/CONFIG.shadowMs;
      if(t>=1) atmosphere.shadow=null;
      else {
        const shape=shadowGeometry(shadow,now);
        ctx.save();ctx.translate(shape.x,shape.y);ctx.scale(shape.spanX,shape.spanY);
        ctx.fillStyle=TapSkin.current.objects.atmosphere.shadowColor;ctx.globalAlpha=CONFIG.shadowOpacity;
        // Only an uneven passing mass is visible; it has no identifiable owner.
        const outline=TapSkin.current.objects.atmosphere.shadowShape;
        ctx.beginPath();ctx.moveTo(outline[0].x,outline[0].y);
        for(let i=1;i<outline.length;i+=3) {
          const [a,b,c]=outline.slice(i,i+3);ctx.bezierCurveTo(a.x,a.y,b.x,b.y,c.x,c.y);
        }
        ctx.fill();ctx.restore();
      }
    }
    if(small) {
      const t=(now-small.at)/CONFIG.smallEventMs;
      if(t>=1) atmosphere.small=null;
      else {
        const p=surface(small.tile.x+.5,small.tile.y+.5,now),z=camera.zoom;
        ctx.save();ctx.translate(p.x,p.y);ctx.scale(z,z);ctx.globalAlpha=Math.sin(Math.PI*t)*.7;
        ctx.strokeStyle=TapSkin.current.objects.atmosphere.detailColor;ctx.lineWidth=1.5;
        const outline=TapSkin.current.objects.atmosphere[small.kind==='leaves'?'leafShape':'birdShape'];
        for(let i=0;i<3;i++) {
          const x=(i-1)*10+t*22,y=-12-t*35-i*5;
          ctx.beginPath();outline.forEach((p,index)=>index?ctx.lineTo(x+p.x,y+p.y):ctx.moveTo(x+p.x,y+p.y));ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
  function drawScenery(tile,base,alpha=1) {
    const object=sceneryByCoordinate.get(tile.x+','+tile.y);
    if(!object||tile.visibility!=='opened'||alpha<=0) return false;
    if(drawAsset(object.type,base,alpha)) return true;
    if(globalThis.TapScenery) {
      ctx.save();ctx.globalAlpha=alpha;
      const drawn=TapScenery.draw(ctx,object.type,base.x,base.y,camera.zoom,TapSkin.current);
      ctx.restore();return drawn;
    }
    return false;
  }
  function project(x, y, z = 0) {
    return { x: width / 2 + camera.x + x * CONFIG.tileWidth * camera.zoom,
      y: height * .48 + camera.y + (y * CONFIG.tileHeight - z) * camera.zoom };
  }
  function ease(t) { t=clamp(t,0,1); return t*t*(3-2*t); }
  function curve(from, to, velocity, age, duration) {
    const t=clamp(age/duration,0,1);
    return (2*t*t*t-3*t*t+1)*from+(t*t*t-2*t*t+t)*duration*velocity+(-2*t*t*t+3*t*t)*to;
  }
  function pulseDuration(p) { return p.kind==='blocked'?CONFIG.blockedMs:p.kind==='opened'?CONFIG.openedMs:p.kind==='complete'?CONFIG.completionMs:CONFIG.reactionMs; }
  function reaction(p, now) {
    const age=Math.max(0,now-p.at), start=p.start??CONFIG.contactStrength, velocity=p.velocity||0;
    if(p===held) return curve(start,CONFIG.contactStrength,velocity,age,CONFIG.contactMs);
    if(p.kind==='complete')return 0;
    const peak=Math.min(1.2,Math.max(1,start));
    const sink=p.kind==='blocked'?CONFIG.blockedSinkMs:p.kind==='opened'?CONFIG.openedSinkMs:CONFIG.sinkMs;
    if(age<sink) return clamp(curve(start,peak,velocity,age,sink),-1.2,Math.max(1.2,start));
    if(p.kind==='blocked') return 1-ease((age-sink)/(CONFIG.blockedMs-sink));
    const rise=p.kind==='opened'?CONFIG.openedReboundMs:CONFIG.reboundAtMs;
    const rebound=p.kind==='opened'?-CONFIG.openedReboundStrength:-CONFIG.reboundStrength;
    if(age<rise) return curve(peak,rebound,0,age-sink,rise-sink);
    return curve(rebound,0,0,age-rise,pulseDuration(p)-rise);
  }
  function tilePulse(tile) { return held?.tile===tile?held:pulses.find(p=>p.tile===tile); }
  function feedbackStrength(tile, now) {
    const p=tilePulse(tile);
    if(!p) return 0;
    if(p===held) return clamp(reaction(p,now),0,1);
    const age=Math.max(0,now-p.at), end=p.kind==='blocked'?CONFIG.blockedMs:p.kind==='opened'?CONFIG.openedMs:CONFIG.colorReturnMs;
    return age<CONFIG.colorHoldMs?clamp(reaction(p,now),0,1):1-ease((age-CONFIG.colorHoldMs)/(end-CONFIG.colorHoldMs));
  }
  function outlineStrength(tile, now) {
    if(tilePulse(tile)?.kind==='complete')return 0;
    return feedbackStrength(tile,now);
  }
  function pulseDepth(p) { return p.kind==='blocked'?CONFIG.blockedPixels/camera.zoom:p.kind==='opened'?CONFIG.openedPixels/camera.zoom:Math.max(CONFIG.pressDepth,CONFIG.minPressPixels/camera.zoom); }
  function displacement(x, y, now) {
    const tile=tilesByCoordinate.get(Math.floor(x)+','+Math.floor(y)), p=tile&&tilePulse(tile);
    const result=p?pulseDepth(p)*reaction(p,now):0;
    return clamp(result,-CONFIG.minPressPixels/camera.zoom,Math.max(CONFIG.pressDepth,CONFIG.minPressPixels/camera.zoom)*1.2);
  }
  function surface(x, y, now, tile) {
    const depth = tile ? displacement(tile.x + .5, tile.y + .5, now) : displacement(x, y, now);
    return project(x, y, heightAt(x, y) * CONFIG.heightScale - depth);
  }
  function polygon(points, fill, stroke) {
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = .65 * camera.zoom; ctx.stroke(); }
  }
  function inside(p, points) {
    let yes = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) yes = !yes;
    }
    return yes;
  }
  function corners(tile, now) {
    const depth=displacement(tile.x+.5,tile.y+.5,now);
    return [[0,0],[1,0],[1,1],[0,1]].map(([dx,dy]) => project(tile.x+dx,tile.y+dy,heightAt(tile.x+dx,tile.y+dy)*CONFIG.heightScale-depth));
  }
  function tileColor(tile, now) {
    const kind=tilePulse(tile)?.kind;
    const darkening=(kind==='blocked'?CONFIG.blockedDarkening:kind==='opened'?-CONFIG.openedBrightening:kind==='complete'?0:CONFIG.pressDarkening)*feedbackStrength(tile,now);
    const palette=TapSkin.current.palette;
    const display=displayState(tile,now);
    let color=terrainColor(tile,display.visibility,display.progress);
    if(display.visibility==='preview') {
      const fade=towerFade(tile,now), hidden=palette.hidden;
      color={h:hidden.h+(color.h-hidden.h)*fade,s:hidden.s+(color.s-hidden.s)*fade,l:hidden.l+(color.l-hidden.l)*fade};
    }
    if(display.reveal!==undefined) {
      const opened=palette.opened[tile.kind], t=display.reveal;
      color={h:color.h+(opened.h-color.h)*t,s:color.s+(opened.s-color.s)*t,l:color.l+(opened.l-color.l)*t};
    }
    const variation=display.visibility==='opened'?(tile.seed%5)-2:0;
    return `hsl(${color.h} ${color.s}% ${Math.max(0,color.l+variation-darkening)}%)`;
  }
  function terrainColor(tile,visibility,progress) {
    const palette=TapSkin.current.palette;
    if(visibility!=='preview') return visibility==='hidden'?palette.hidden:palette.opened[tile.kind];
    const preview=palette.preview[tile.kind], opened=palette.opened[tile.kind], ratio=clamp(progress/tile.requiredCost,0,1);
    return {h:preview.h+(opened.h-preview.h)*ratio,s:preview.s+(opened.s-preview.s)*ratio,l:preview.l+(Math.min(60,opened.l-6)-preview.l)*ratio};
  }
  function displayState(tile,now) {
    const opening=openings.get(tile.x+','+tile.y);
    if(opening?.automatic) {
      const reveal=ease((now-opening.at)/(opening.monument?CONFIG.completionRevealMs:CONFIG.enclosureFadeMs));
      if(reveal<1) return {visibility:opening.visibility,progress:opening.progress,reveal};
    }
    return {visibility:tile.visibility,progress:tile.developmentProgress};
  }
  function objectShapes(tile) {
    return tile.kind==='tree'?TapSkin.current.objects.tree.shapes:
      tile.kind==='rock'||tile.kind==='mine'?TapSkin.current.objects.rock.shapes:[];
  }
  function towerFade(tile,now) {
    const reveal=towerReveals.get(tile.x+','+tile.y);
    return reveal?clamp((now-reveal.at)/CONFIG.towerFadeMs,0,1):1;
  }
  function drawAsset(id, base, alpha=1) {
    const asset=TapSkin.current.assets[id];
    if(!asset?.image) return false;
    ctx.save(); ctx.globalAlpha=alpha;
    ctx.drawImage(asset.image,base.x-asset.anchorX*camera.zoom,base.y-asset.anchorY*camera.zoom,asset.width*camera.zoom,asset.height*camera.zoom);
    ctx.restore(); return true;
  }
  function visibleBounds(tile,pts,base) {
    const skin=TapSkin.current, points=pts.slice();
    let shapes=[], id=null;
    const city=tile.x===0&&tile.y===0, destination=world.destination?.x===tile.x&&world.destination?.y===tile.y;
    if(city) { shapes=[skin.objects.city.body,skin.objects.city.roof]; id='city'; }
    else if(tile.landmark==='tower') {
      shapes=tile.visibility==='opened'||destination?[skin.objects.tower.body]:[[{x:-7,y:0},{x:7,y:0},{x:5,y:-38},{x:-5,y:-38}]];
      if(tile.visibility==='opened') id='tower';
    } else if(tile.visibility!=='hidden') { shapes=objectShapes(tile); id=tile.kind; }
    for(const shape of shapes) for(const p of shape) points.push({x:base.x+p.x*camera.zoom,y:base.y+p.y*camera.zoom});
    const asset=id&&skin.assets[id];
    if(asset?.image) {
      points.push({x:base.x-asset.anchorX*camera.zoom,y:base.y-asset.anchorY*camera.zoom},
        {x:base.x+(asset.width-asset.anchorX)*camera.zoom,y:base.y+(asset.height-asset.anchorY)*camera.zoom});
    }
    if(tile.visibility==='opened'&&monumentsByCoordinate.has(tile.x+','+tile.y)) {
      points.push(...pts.map(p=>({x:p.x,y:p.y-120*camera.zoom})));
      const archBase=surface(tile.x+.5,tile.y+.5,performance.now());
      points.push({x:archBase.x-110*camera.zoom,y:archBase.y-130*camera.zoom},{x:archBase.x+110*camera.zoom,y:archBase.y});
      const monument=monumentsByCoordinate.get(tile.x+','+tile.y),bitmap=skin.assets.stone_arch;
      if(bitmap?.image) {
        const center=surface(monument.x+.5,monument.y+.5,performance.now());
        points.push({x:center.x-bitmap.anchorX*camera.zoom,y:center.y-bitmap.anchorY*camera.zoom},
          {x:center.x+(bitmap.width-bitmap.anchorX)*camera.zoom,y:center.y+(bitmap.height-bitmap.anchorY)*camera.zoom});
      }
    }
    if(tile.visibility==='opened'&&sceneryByCoordinate.has(tile.x+','+tile.y)) {
      const type=sceneryByCoordinate.get(tile.x+','+tile.y).type;
      const visual=globalThis.TapScenery?.bounds(type,skin)||{left:-32,right:32,top:-78,bottom:5};
      points.push({x:base.x+visual.left*camera.zoom,y:base.y+visual.top*camera.zoom},{x:base.x+visual.right*camera.zoom,y:base.y+visual.bottom*camera.zoom});
      const asset=skin.assets[type];
      if(asset?.image) points.push({x:base.x-asset.anchorX*camera.zoom,y:base.y-asset.anchorY*camera.zoom},{x:base.x+(asset.width-asset.anchorX)*camera.zoom,y:base.y+(asset.height-asset.anchorY)*camera.zoom});
    }
    return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))+17*camera.zoom};
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
    const state = displayState(tile,now);
    // Delayed reveals obey the displayed state, including tower visibility waves.
    if (state.visibility==='hidden' || state.visibility==='preview' && towerFade(tile,now)===0) return [];
    const neighbors = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) =>
      ({dx,dy,tile:tilesByCoordinate.get((tile.x+dx)+','+(tile.y+dy))}));
    const opened = neighbor => neighbor.tile?.road && displayState(neighbor.tile,now).visibility==='opened';
    if (state.visibility==='preview') return neighbors.filter(opened);
    return neighbors.filter(neighbor => neighbor.tile?.road &&
      (opened(neighbor) || displayState(neighbor.tile,now).visibility==='preview' && towerFade(neighbor.tile,now)>0));
  }
  function drawRoad(tile, now) {
    const segments=roadSegments(tile,now);
    const state=displayState(tile,now);
    if(!segments.length && (!tile.road || state.visibility!=='opened')) return;
    const center=surface(tile.x+.5,tile.y+.5,now,tile);
    ctx.save();
    const bounds=corners(tile,now);
    ctx.beginPath();bounds.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.clip();
    ctx.globalAlpha=state.visibility==='opened'?1:CONFIG.roadPreviewOpacity;
    ctx.lineCap='round';ctx.lineJoin='round';
    for(const [color,width] of [[TapSkin.current.lines.roadEdge,CONFIG.roadWidth+CONFIG.roadBorderWidth*2],[TapSkin.current.lines.road,CONFIG.roadWidth]]) {
      ctx.strokeStyle=color;ctx.lineWidth=width*camera.zoom;
      ctx.beginPath();
      if(!segments.length) {ctx.moveTo(center.x,center.y);ctx.lineTo(center.x+.1*camera.zoom,center.y);}
      for(const {dx,dy} of segments) {
        const edge=surface(tile.x+.5+dx*.5,tile.y+.5+dy*.5,now,tile);
        ctx.moveTo(center.x,center.y);ctx.lineTo(edge.x,edge.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  function draw(now) {
    frame = 0;
    // rAF timestamps can precede callback execution during heavy rendering.
    now=Math.max(now,performance.now());
    for(let i=pulses.length-1;i>=0;i--) if(now-pulses[i].at>=pulseDuration(pulses[i])) pulses.splice(i,1);
    for(const [key,reveal] of towerReveals) if(now>=reveal.at+CONFIG.towerFadeMs) towerReveals.delete(key);
    for(const [key,opening] of openings) if(now>=opening.at+(opening.monument?CONFIG.completionRevealMs:opening.automatic?CONFIG.enclosureFadeMs:CONFIG.completionMs)) openings.delete(key);
    const skin=TapSkin.current;
    ctx.clearRect(0, 0, width, height);
    hitAreas.length = 0;
    const center = project(0, 0);
    ctx.save(); ctx.translate(center.x, center.y + 35 * camera.zoom); ctx.scale(camera.zoom, camera.zoom);
    ctx.fillStyle = skin.shadows.ground; ctx.beginPath(); ctx.ellipse(0, 0, 315, 150, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    const worldIndex=tilesByCoordinate;
    for (const tile of tiles) {
      const pts = corners(tile, now), { x, y, seed } = tile;
      const base = surface(x + .5, y + .5, now);
      const bounds=visibleBounds(tile,pts,base);
      if(bounds.right<0||bounds.left>width||bounds.bottom<0||bounds.top>height) continue;
      const remember = points => hitAreas.push({ tile, points, base, zoom:camera.zoom });
      const display=displayState(tile,now), fade=towerFade(tile,now);
      const visibility=display.reveal>0?'opened':display.visibility==='preview'&&fade===0?'hidden':display.visibility;
      if (y === world.bounds.maxY) {
        const edge = [pts[2], pts[3]];
        const sideDepth=17*camera.zoom;
        const side = [edge[0], edge[1], {x:edge[1].x,y:edge[1].y+sideDepth}, {x:edge[0].x,y:edge[0].y+sideDepth}];
        polygon(side,skin.objects.rock.faceColor);
        remember(side);
      }
      polygon(pts, tileColor(tile, now), visibility==='hidden'?skin.lines.hidden:skin.lines.edge);
      remember(pts);
      drawRoad(tile,now);
      if(visibility==='opened' && monumentsByCoordinate.has(x+','+y)) {
        drawMonumentPart(tile,base,now);continue;
      }
      if(visibility==='opened'&&sceneryByCoordinate.has(x+','+y)) {
        const opening=openings.get(x+','+y);
        const alpha=opening?ease((now-opening.at)/(opening.automatic?CONFIG.enclosureFadeMs:CONFIG.completionRevealMs)):1;
        if(drawScenery(tile,base,alpha)) continue;
      }
      if(tile.x===0&&tile.y===0 || tile.landmark==='tower'&&(visibility==='opened'||world.destination?.x===tile.x&&world.destination?.y===tile.y)) {
        const object=tile.x===0&&tile.y===0?skin.objects.city:skin.objects.tower;
        if(visibility==='opened'&&drawAsset(tile.x===0&&tile.y===0?'city':'tower',base)) continue;
        ctx.save();ctx.translate(base.x,base.y);ctx.scale(camera.zoom,camera.zoom);
        if(tile.x===0&&tile.y===0){polygon(object.body,object.bodyColor);polygon(object.roof,object.roofColor);ctx.fillStyle=object.doorColor;ctx.fillRect(-3,-15,6,15);ctx.fillRect(-12,-23,4,5);ctx.fillRect(8,-23,4,5);}
        else{ctx.globalAlpha=visibility==='opened'?1:.5;polygon(object.body,object.bodyColor);if(visibility==='opened'){ctx.fillStyle=object.detailColor;ctx.fillRect(-2,-44,4,9);}}
        ctx.restore();continue;
      }
      // Other enabled towers are only anonymous shapes until they are opened.
      if(tile.landmark==='tower') {
        ctx.save();ctx.translate(base.x,base.y);ctx.scale(camera.zoom,camera.zoom);ctx.globalAlpha=.25;
        polygon([{x:-7,y:0},{x:7,y:0},{x:5,y:-38},{x:-5,y:-38}],skin.objects.tower.bodyColor);
        ctx.restore();
      }
      if(visibility==='hidden') {
        // Sparse, sharp cartographic strokes; no blurred or moving overlay.
        const detail=clamp((camera.zoom-.65)/.35,0,1);
        if(detail>0 && seed%7===0) {
          ctx.save();ctx.globalAlpha=detail;ctx.strokeStyle=skin.lines.hidden;ctx.lineWidth=.8;
          ctx.beginPath();ctx.moveTo(base.x-7*camera.zoom,base.y);ctx.lineTo(base.x+7*camera.zoom,base.y);ctx.stroke();ctx.restore();
        }
        continue;
      }
      const previewAlpha=(.38+.4*display.progress/tile.requiredCost)*fade;
      const opening=openings.get(tile.x+','+tile.y), completionAlpha=opening&&!opening.automatic?ease((now-opening.at)/CONFIG.completionRevealMs):1;
      const objectAlpha=(display.reveal!==undefined?(display.visibility==='hidden'?0:previewAlpha)+(1-(display.visibility==='hidden'?0:previewAlpha))*display.reveal:visibility==='preview'?previewAlpha:1)*completionAlpha;
      if(drawAsset(tile.kind,base,objectAlpha)) continue;
      const shapes = objectShapes(tile);
      ctx.save(); ctx.translate(base.x, base.y); ctx.scale(camera.zoom, camera.zoom); ctx.globalAlpha=objectAlpha;
      ctx.fillStyle = skin.shadows.object; ctx.beginPath(); ctx.ellipse(3, 2, tile.kind === "grass" ? 4 : 15, 5, -.2, 0, Math.PI * 2); ctx.fill();
      if (tile.kind === "tree") {
        const object=skin.objects.tree;
        polygon(shapes[0],object.trunkColor);polygon(shapes[1],object.leafColor);polygon(shapes[2],object.shadeColor);
        const detail=clamp((camera.zoom-.65)/.35,0,1);
        if(detail>0) {
          ctx.globalAlpha=objectAlpha*detail;ctx.strokeStyle=object.detailColor;ctx.lineWidth=.8;
          // Veins follow the skin's leaf polygons, including alternate skins.
          for(const leaf of shapes.slice(1)) {
            const center=leaf.reduce((p,q)=>({x:p.x+q.x/leaf.length,y:p.y+q.y/leaf.length}),{x:0,y:0});
            ctx.beginPath();
            leaf.forEach((p,i)=>{if(i%2===0){ctx.moveTo(center.x,center.y);ctx.lineTo(center.x+(p.x-center.x)*.72,center.y+(p.y-center.y)*.72);}});
            ctx.stroke();
          }
        }
      } else if ((tile.kind === "rock" || tile.kind === "mine")) {
        polygon(shapes[0],skin.objects.rock.faceColor,skin.objects.rock.lineColor);
        polygon(shapes[1],tile.kind==='mine'?skin.objects.mine.shadeColor:skin.objects.rock.shadeColor);
      } else if (camera.zoom > .65) {
        ctx.globalAlpha=objectAlpha*clamp((camera.zoom-.65)/.35,0,1);
        ctx.strokeStyle = skin.lines.detail; ctx.lineWidth = .9; ctx.beginPath();
        for (let k = 0; k < 3; k++) { ctx.moveTo(k * 5 - 8, 0); ctx.lineTo(k * 5 - 8, -5); } ctx.stroke();
        // An occasional oversized leaf belongs to ordinary terrain, with no event or reward.
        if(seed%5===0) {
          const leaf=skin.objects.tree;
          polygon([{x:5,y:1},{x:-1,y:-8},{x:-2,y:-20},{x:7,y:-16},{x:11,y:-8}],leaf.leafColor);
          ctx.strokeStyle=leaf.detailColor;ctx.beginPath();ctx.moveTo(5,1);ctx.lineTo(1,-15);ctx.stroke();
        }
      }
      ctx.restore();
    }
    // Completion stays in the tile plane: the cover retreats from its center.
    for(const opening of openings.values()) if(!opening.automatic)
      drawOpeningCover(opening.tile,corners(opening.tile,now),surface(opening.tile.x+.5,opening.tile.y+.5,now),now);
    for(const monument of world.monuments) drawMonument(monument,now);
    drawAtmosphere(now);
    drawCompletionEdges(now);
    drawMemoClue(now);
    drawDestination(now);
    // Keep eligible ground readable beneath tall decorative objects.
    for (const tile of tiles) {
      if(tile.visibility==='preview'&&TapWorld.eligible(tile,worldIndex)) {
        ctx.save();ctx.setLineDash([3*camera.zoom,5*camera.zoom]);ctx.strokeStyle=skin.lines.eligible;ctx.lineWidth=1;
        ctx.beginPath();corners(tile,now).forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();ctx.restore();
      }
    }
    // Draw selected edges last so later terrain or eligibility lines cannot cover them.
    for (const tile of tiles) {
      const strength = outlineStrength(tile, now);
      if (strength <= 0) continue;
      ctx.beginPath();
      corners(tile, now).forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      const kind=tilePulse(tile)?.kind;
      ctx.strokeStyle = `rgba(${kind==='blocked'?skin.lines.blockedOutline:kind==='opened'?skin.lines.openedOutline:skin.lines.outline}, ${strength * .85})`;
      ctx.lineWidth = Math.max(CONFIG.minOutlinePixels, CONFIG.outlineWidth * camera.zoom);
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    if (pulses.length || towerReveals.size || openings.size || held || atmosphere.shadow || atmosphere.small) requestDraw();
  }
  // The memo and the map share the same arch silhouette and open passage.
  function drawArch(pen,x,y,scale,inkOnly=false) {
    const object=TapSkin.current.objects.stone_arch;
    const path=()=>{
      pen.beginPath();pen.moveTo(-68,0);pen.lineTo(-68,-27);
      pen.bezierCurveTo(-68,-78,68,-78,68,-27);pen.lineTo(68,0);
      pen.lineTo(38,0);pen.lineTo(38,-26);
      pen.bezierCurveTo(38,-50,-38,-50,-38,-26);pen.lineTo(-38,0);pen.closePath();
    };
    pen.save();pen.translate(x,y);pen.scale(scale,scale);pen.lineJoin='round';
    pen.strokeStyle=inkOnly?TapSkin.current.objects.memo.inkColor:object.lineColor;pen.lineWidth=inkOnly?2:1.2;
    if(!inkOnly) {pen.save();pen.translate(8,-8);path();pen.fillStyle=object.shadeColor;pen.fill();pen.stroke();pen.restore();}
    path();if(!inkOnly){pen.fillStyle=object.faceColor;pen.fill();}pen.stroke();
    pen.beginPath();pen.moveTo(-78,5);pen.lineTo(78,5);
    pen.moveTo(0,-65);pen.lineTo(0,-45);pen.moveTo(-55,-43);pen.lineTo(-34,-31);
    pen.moveTo(55,-43);pen.lineTo(34,-31);pen.moveTo(-68,-14);pen.lineTo(-38,-14);
    pen.moveTo(38,-14);pen.lineTo(68,-14);pen.stroke();pen.restore();
  }
  function drawMonumentPart(tile,base,now) {
    const monument=monumentsByCoordinate.get(tile.x+','+tile.y);
    if(!monument || tile.visibility!=='opened') return;
    const object=TapSkin.current.objects.stone_arch,opening=openings.get(tile.x+','+tile.y);
    ctx.save();
    if(opening) ctx.globalAlpha=opening.automatic?ease((now-opening.at)/(opening.monument?CONFIG.completionRevealMs:CONFIG.enclosureFadeMs)):completionReveal(opening,now);
    const pts=corners(tile,now);
    polygon(pts,object.baseColor,object.lineColor);ctx.restore();
  }
  function drawMonument(monument,now) {
    if(!TapWorld.monumentStatus(world,monument,tilesByCoordinate).fullyRevealed)return;
    // Paint the shared silhouette after the ground so neither pillar is covered by a later tile.
    const base=surface(monument.x+.5,monument.y+1.5,now);
    const pending=monument.occupied.map(p=>openings.get(p.x+','+p.y)).filter(Boolean);
    const revealAt=pending.length?Math.max(...pending.map(e=>e.at)):null;
    const alpha=revealAt===null?1:ease((now-revealAt)/CONFIG.completionRevealMs);
    if(alpha<=0)return;
    ctx.save();ctx.globalAlpha=alpha;
    if(!drawAsset('stone_arch',base,alpha))drawArch(ctx,base.x,base.y,CONFIG.tileWidth*camera.zoom*2.4/136);
    ctx.restore();
  }
  function drawMemoClue(now) {
    if(world.memo.status!=='placed') return;
    const clue=world.memo.clue,tile=tilesByCoordinate.get(clue.x+','+clue.y);
    if(tile?.visibility!=='opened') return;
    const opening=openings.get(clue.x+','+clue.y);
    const base=surface(clue.x+.5,clue.y+.5,now);
    if(base.x<0||base.x>width||base.y<0||base.y>height) return;
    const detail=camera.zoom>=TapWorld.RULES.memoDiscoverZoom,object=TapSkin.current.objects.memo;
    ctx.save();ctx.translate(base.x+CONFIG.tileWidth*camera.zoom*.2,base.y+CONFIG.tileHeight*camera.zoom*.18);
    const scale=Math.max(camera.zoom,CONFIG.memoMinPixels/10);ctx.scale(scale,scale);
    if(opening)ctx.globalAlpha=completionReveal(opening,now);
    polygon([{x:-8,y:2},{x:-3,y:-1},{x:2,y:2},{x:0,y:5},{x:-7,y:5}],object.stoneColor);
    polygon([{x:-5,y:-7},{x:5,y:-8},{x:6,y:1},{x:-4,y:2}],object.paperColor,object.inkColor);
    if(detail) {
      ctx.strokeStyle=object.inkColor;ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(2,-7);ctx.lineTo(2,-4);ctx.lineTo(5,-4);
      ctx.moveTo(-2,-3);ctx.lineTo(1,-3);ctx.moveTo(-2,-1);ctx.lineTo(3,-1);ctx.stroke();
    }
    ctx.restore();
  }
  function drawOpeningCover(tile,pts,base,now) {
    const opening=openings.get(tile.x+','+tile.y);
    if(!opening||opening.automatic) return;
    const progress=completionReveal(opening,now);
    if(progress>=1)return;
    const color=terrainColor(tile,'preview',opening.progress);
    const inner=pts.map(p=>({x:base.x+(p.x-base.x)*progress,y:base.y+(p.y-base.y)*progress}));
    ctx.save();
    for(let i=0;i<4;i++) {
      const next=(i+1)%4;
      polygon([pts[i],pts[next],inner[next],inner[i]],`hsl(${color.h} ${color.s}% ${color.l}%)`);
    }
    // A moving border makes the change readable even when the center is covered by a finger.
    if(progress>0) {
      ctx.beginPath();inner.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
      ctx.globalAlpha=.65*(1-progress);ctx.strokeStyle=TapSkin.current.ui.textColor;ctx.lineWidth=1.5;ctx.stroke();
    }
    ctx.restore();
  }
  function completionReveal(opening,now) { return ease((now-opening.at)/CONFIG.completionRevealMs); }
  function completionEdgeStrength(tile,now) {
    if(tile.visibility==='hidden')return 0;
    let strength=0;
    for(const opening of openings.values()) {
      if(opening.automatic)continue;
      const distance=Math.abs(tile.x-opening.tile.x)+Math.abs(tile.y-opening.tile.y);
      if(distance>CONFIG.waveRadius)continue;
      const age=now-opening.at-distance*CONFIG.waveDelayMs;
      const duration=distance===0?CONFIG.completionEdgeMs:CONFIG.waveMs;
      if(age>0&&age<duration)strength=Math.max(strength,Math.sin(age/duration*Math.PI)/(distance+1));
    }
    return strength;
  }
  function drawCompletionEdges(now) {
    const affected=new Set();
    for(const opening of openings.values()) if(!opening.automatic)
      for(let dy=-CONFIG.waveRadius;dy<=CONFIG.waveRadius;dy++)for(let dx=-CONFIG.waveRadius;dx<=CONFIG.waveRadius;dx++)
        if(Math.abs(dx)+Math.abs(dy)<=CONFIG.waveRadius)affected.add((opening.tile.x+dx)+','+(opening.tile.y+dy));
    for(const key of affected) {
      const tile=tilesByCoordinate.get(key);if(!tile)continue;
      const strength=completionEdgeStrength(tile,now);
      if(!strength)continue;
      const pts=corners(tile,now);
      if(pts.every(p=>p.x<0||p.x>width||p.y<0||p.y>height))continue;
      ctx.save();ctx.globalAlpha=strength*CONFIG.waveOpacity;
      ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
      ctx.strokeStyle=TapSkin.current.ui.textColor;ctx.lineWidth=Math.max(1.5,2*camera.zoom);ctx.stroke();ctx.restore();
    }
  }
  function drawDestination(now) {
    const destinations=TapWorld.destinations(world,tilesByCoordinate);
    if(!destinations.length)return;
    const margin=CONFIG.markerMargin,spacing=CONFIG.markerSpacing;
    const headerBottom=document.querySelector('header').getBoundingClientRect().bottom;
    const footerTop=document.querySelector('footer').getBoundingClientRect().top;
    const top=Math.min(headerBottom+margin,height/2),bottom=Math.max(top,Math.min(height,footerTop)-margin);
    const panel=memoPanel.hidden?null:memoPanel.getBoundingClientRect(),placed=[];
    const available=(x,y)=>!(panel&&x>panel.left-margin&&x<panel.right+margin&&y>panel.top-margin&&y<panel.bottom+margin)&&
      placed.every(p=>Math.hypot(p.x-x,p.y-y)>=spacing);
    for(const destination of destinations) {
      const p=surface(destination.x+.5,destination.y+.5,now),target={x:p.x,y:p.y-64*camera.zoom};
      let x=clamp(target.x,margin,width-margin),y=clamp(target.y,top,bottom);
      if(!available(x,y)) {
        const candidates=[];
        const add=(a,b)=>{a=clamp(a,margin,width-margin);b=clamp(b,top,bottom);if(available(a,b))candidates.push({x:a,y:b});};
        if(panel) {add(panel.left-margin,y);add(panel.right+margin,y);add(x,panel.top-margin);add(x,panel.bottom+margin);}
        for(const other of placed)for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]])add(other.x+dx*spacing,other.y+dy*spacing);
        // A small bounded grid also finds space when both arrows share an edge.
        for(let a=margin;a<=width-margin;a+=spacing)for(let b=top;b<=bottom;b+=spacing)add(a,b);
        for(let a=margin;a<=width-margin;a+=spacing)add(a,bottom);
        for(let b=top;b<=bottom;b+=spacing)add(width-margin,b);
        add(width-margin,bottom);
        candidates.sort((a,b)=>(a.x-x)**2+(a.y-y)**2-((b.x-x)**2+(b.y-y)**2));
        if(candidates.length)({x,y}=candidates[0]);
      }
      placed.push({x,y});
      const offscreen=x!==target.x||y!==target.y,ui=TapSkin.current.ui;
      const label=tilesByCoordinate.get(destination.x+','+destination.y)?.landmark==='tower'?'塔':'アーチ';
      ctx.save();
      if(offscreen){ctx.beginPath();ctx.arc(x,y,CONFIG.markerRadius,0,Math.PI*2);ctx.fillStyle=ui.surfaceColor;ctx.fill();ctx.strokeStyle=ui.textColor;ctx.lineWidth=2;ctx.stroke();}
      ctx.fillStyle=ui.textColor;ctx.strokeStyle=ui.surfaceColor;ctx.lineWidth=3;ctx.font='20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.strokeText('★',x,y);ctx.fillText('★',x,y);
      if(destinations.length>1) {ctx.font='10px sans-serif';ctx.strokeText(label,x,y+16);ctx.fillText(label,x,y+16);}
      if(offscreen) {
        const angle=Math.atan2(target.y-y,target.x-x);ctx.translate(x,y);ctx.rotate(angle);
        polygon([{x:17,y:-7},{x:27,y:0},{x:17,y:7}],ui.textColor);
      }
      ctx.restore();
    }
  }
  function requestDraw() { if (!frame) frame = requestAnimationFrame(draw); }
  function resize() {
    const oldWidth = width;
    width = canvas.clientWidth; height = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
    if (!oldWidth) camera.zoom = clamp(Math.min(width / 880, height / 650), CONFIG.initialMinZoom, 1.15);
    requestDraw();
  }
  function point(event) { const r = canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; }
  function zoomAt(p, factor) {
    const before = camera.zoom, next = clamp(before * factor, CONFIG.minZoom, CONFIG.maxZoom);
    camera.x = p.x - width / 2 - (p.x - width / 2 - camera.x) * next / before;
    camera.y = p.y - height * .48 - (p.y - height * .48 - camera.y) * next / before;
    camera.zoom = next;
    if (next < CONFIG.minTapZoom) releasePress(false);
    requestDraw();
  }
  function pair() { const [a,b] = [...pointers.values()]; return { midpoint: {x:(a.x+b.x)/2,y:(a.y+b.y)/2}, distance:Math.hypot(a.x-b.x,a.y-b.y) }; }
  function canDevelop(tile) {
    const available=Math.min(TapWorld.RULES.maxPoints,world.points+Math.max(0,Date.now()-world.lastCalculatedAt)*TapWorld.RULES.maxPoints/TapWorld.RULES.recoveryMs);
    return TapWorld.eligible(tile,tilesByCoordinate)&&available>=1;
  }
  function press(p) {
    if (!started || camera.zoom < CONFIG.minTapZoom) return;
    const hit = pick(p);
    if (!hit || hit.zoom < CONFIG.minTapZoom) return;
    const {tile, base, zoom} = hit;
    const localX = clamp((p.x-base.x) / (CONFIG.tileWidth*zoom),-.4,.4);
    const localY = clamp((p.y-base.y) / (CONFIG.tileHeight*zoom),-.4,.4);
    const now=performance.now(), previous=tilePulse(tile);
    const kind=tile.visibility==='opened'?'opened':canDevelop(tile)?'normal':'blocked';
    const start=previous?reaction(previous,now)*pulseDepth(previous)/pulseDepth({kind}):CONFIG.contactStrength;
    const velocity=previous?(reaction(previous,now+.1)-reaction(previous,now))/.1*pulseDepth(previous)/pulseDepth({kind}):0;
    const old=pulses.findIndex(entry=>entry.tile===tile);if(old>=0)pulses.splice(old,1);
    held = {x:tile.x+.5+localX,y:tile.y+.5+localY,tile,kind,at:now,start,velocity};
    // Touching an already opened automatic tile must show its current logical state.
    if(tile.visibility==='opened'&&openings.get(tile.x+','+tile.y)?.automatic) openings.delete(tile.x+','+tile.y);
    requestDraw();
  }
  function animateCompletion(result, now, progress) {
    const tile=result.tile;
    openings.set(tile.x+','+tile.y,{tile,at:now,progress,automatic:false});
    for(const region of result.regions) {
      const remaining=new Set(region.map(t=>t.x+','+t.y)), layers=new Map();
      let layer=0;
      while(remaining.size) {
        const boundary=region.filter(t=>remaining.has(t.x+','+t.y)&&[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>!remaining.has((t.x+dx)+','+(t.y+dy))));
        for(const t of boundary) {remaining.delete(t.x+','+t.y);layers.set(t,layer);}
        layer++;
      }
      for(const entry of result.automatic.filter(entry=>layers.has(entry.tile))) {
        openings.set(entry.tile.x+','+entry.tile.y,{...entry,automatic:true,at:now+CONFIG.enclosureStartMs+layers.get(entry.tile)*CONFIG.enclosureStepMs});
      }
    }
    for(const entry of result.monumentAutomatic) {
      const distance=Math.abs(entry.tile.x-tile.x)+Math.abs(entry.tile.y-tile.y);
      openings.set(entry.tile.x+','+entry.tile.y,{...entry,automatic:true,monument:true,at:now+distance*CONFIG.monumentStepMs});
    }
    while(openings.size>CONFIG.maxOpenings) openings.delete(openings.keys().next().value);
  }
  function releasePress(commit) {
    if (!held) return;
    if(commit && camera.zoom < CONFIG.minTapZoom) commit=false;
    if(commit){
      const hidden=held.tile.landmark==='tower'?world.tiles.filter(tile=>tile.visibility==='hidden'):[];
      const now=performance.now(), start=reaction(held,now), velocity=(reaction(held,now+.1)-start)/.1, progress=held.tile.developmentProgress;
      let completion=null,memo=null;
      const result=held.tile.visibility==='opened'?
        ((memo=TapWorld.collectMemo(world,held.tile,camera.zoom))?'memo':'touch'):
        !TapWorld.eligible(held.tile,tilesByCoordinate)?'blocked':TapWorld.develop(world,held.tile,Date.now(),entry=>{completion=entry;animateCompletion(entry,now,progress);});
      const kind=result==='blocked'||result==='empty'?'blocked':result==='opened'||result==='tower'?'complete':result==='touch'||result==='memo'?'opened':'normal';
      if(result!=='blocked'&&result!=='empty')towerReveals.delete(held.tile.x+','+held.tile.y);
      if(result==='tower') {
        for(const tile of hidden) if(tile.visibility==='preview') {
          const distance=Math.max(Math.abs(tile.x-held.tile.x),Math.abs(tile.y-held.tile.y));
          towerReveals.set(tile.x+','+tile.y,{at:now+distance*CONFIG.towerRingMs});
        }
        toast(world.destination?'古い塔から視界が広がりました。次の★の塔へ進んでみましょう。':'5つの塔を開拓しました。気の向くままに地図を広げましょう。');
      }
      if(completion?.monumentReached)toast('大きな石のアーチを見つけました。周りの土地が広がり、全体が姿を現します。');
      if(result==='empty'&&now-emptyNoticeAt>=CONFIG.emptyNoticeCooldownMs) {
        emptyNoticeAt=now;
        toast('探索ポイントが足りないため開拓できません。しばらく待つと回復します。');
      }
      if(result==='opened'||result==='tower'||result==='memo')save();
      else if(result==='progress')queueSave();
      if(memo)showMemo(memo.alreadyReached);
      if(result==='touch'||result==='opened')smallEvent(held.tile,now);
      updateHud();pulses.push({...held,kind,start,velocity,at:now});
    }
    const blocked=commit?pulses[pulses.length-1].kind==='blocked':held.kind==='blocked';
    held = null;
    if (pulses.length > CONFIG.maxPulses) pulses.shift();
    if (commit) playSound(blocked);
    requestDraw();
  }
  function playSound(blocked=false) {
    if (!soundOn || !audio || audio.state !== "running") return;
    const oscillator = audio.createOscillator(), gain = audio.createGain(), time = audio.currentTime;
    oscillator.type = "sine"; oscillator.frequency.setValueAtTime((blocked?680:420) + Math.random()*30, time); oscillator.frequency.exponentialRampToValueAtTime(blocked?350:150,time+(blocked?.025:.045));
    gain.gain.setValueAtTime(0,time); gain.gain.linearRampToValueAtTime(CONFIG.soundVolume*(blocked?.35:1),time+.003); gain.gain.exponentialRampToValueAtTime(.001,time+(blocked?.04:.065));
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(time); oscillator.stop(time+(blocked?.05:.075));
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  soundButton.addEventListener("click", async () => {
    if (soundOn) { soundOn = false; } else {
      try { const AudioContext = window.AudioContext || window.webkitAudioContext; if (!audio) audio = new AudioContext(); await audio.resume(); soundOn = audio.state === "running"; if (!soundOn) throw new Error("Audio unavailable"); notice.textContent = ""; }
      catch { soundOn = false; notice.textContent = "この環境では音を再生できません。"; }
    }
    soundButton.textContent = soundOn ? "Sound ON" : "Sound OFF"; soundButton.setAttribute("aria-pressed", String(soundOn));
  });
  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const p = point(event); pointers.set(event.pointerId,p); canvas.setPointerCapture(event.pointerId);
    if (pointers.size === 1) {
      gesture = { start:p, last:p, moved:false, multi:false,
        threshold:event.pointerType === "touch" ? CONFIG.touchDragThreshold : CONFIG.dragThreshold };
      press(p);
    }
    if (pointers.size >= 2) { releasePress(false); gesture.multi = true; gesture.pair = pair(); }
  });
  canvas.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId)) return;
    const p = point(event); pointers.set(event.pointerId,p);
    if (pointers.size >= 2) {
      const next = pair(), prev = gesture.pair;
      if (prev && prev.distance > 0) { zoomAt(prev.midpoint,next.distance/prev.distance); camera.x += next.midpoint.x-prev.midpoint.x; camera.y += next.midpoint.y-prev.midpoint.y; }
      gesture.pair = next; requestDraw();
    } else {
      if (Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y) > gesture.threshold) { gesture.moved = true; releasePress(false); }
      if (gesture.moved || gesture.multi) { camera.x += p.x-gesture.last.x; camera.y += p.y-gesture.last.y; canvas.classList.add("dragging"); requestDraw(); }
      gesture.last = p;
    }
  });
  function endPointer(event) {
    if (!pointers.has(event.pointerId)) return;
    const p = point(event);
    releasePress(event.type === "pointerup" && pointers.size === 1 && !gesture.multi && !gesture.moved && Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y) <= gesture.threshold);
    pointers.delete(event.pointerId);
    if (pointers.size === 1) gesture.last = [...pointers.values()][0];
    if (!pointers.size) { gesture = null; canvas.classList.remove("dragging"); }
  }
  for (const name of ["pointerup","pointercancel","lostpointercapture"]) canvas.addEventListener(name,endPointer);
  canvas.addEventListener("wheel", event => { event.preventDefault(); zoomAt(point(event),Math.exp(-clamp(event.deltaY,-120,120)*.002)); },{passive:false});
  window.addEventListener("resize",resize);
  document.addEventListener("visibilitychange",() => { resetAtmosphere(); if (document.hidden) { save(); pointers.clear(); gesture = null; held = null; pulses.length = 0; towerReveals.clear(); openings.clear(); canvas.classList.remove("dragging"); } else { TapWorld.settle(world); updateHud(); queueSave(); } requestDraw(); });
  window.addEventListener('pagehide',()=>{resetAtmosphere();save();});
  window.addEventListener('pageshow',()=>{resetAtmosphere();requestDraw();});
  updateHud();
  resize();
})();
