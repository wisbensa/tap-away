(() => {
  "use strict";
  // Initial Phase 1B tuning; final touch feel is checked on real devices.
  const CONFIG = { tileWidth: 76, tileHeight: 72, heightScale: 15,
    minZoom: .12, minTapZoom: .25, initialMinZoom: .55, maxZoom: 2.4, dragThreshold: 7, touchDragThreshold: 14, reactionMs: 400,
    sinkMs: 65, contactMs: 35, contactStrength: .15, reboundAtMs: 230, reboundStrength: .12,
    pressDepth: 3.5, minPressPixels: 3.5, pressDarkening: 16,
    blockedPixels: 1, blockedMs: 130, blockedDarkening: 3,
    outlineWidth: 2, minOutlinePixels: 2, colorHoldMs: 65, colorReturnMs: 180, maxPulses: 32, soundVolume: .12,
    completionMs: 420, completionRevealMs: 300, completionEdgeMs: 360,
    waveRadius: 2, waveDelayMs: 75, waveMs: 230, waveOpacity: .5,
    enclosureStartMs: 180, enclosureStepMs: 150, enclosureFadeMs: 150, maxOpenings: 64,
    towerRingMs: 80, towerFadeMs: 120 };
  const canvas = document.querySelector("#map"), ctx = canvas.getContext("2d");
  const soundButton = document.querySelector("#sound"), notice = document.querySelector("#notice");
  const camera = { x: 0, y: 0, zoom: 1 };
  const pointers = new Map(), pulses = [], tiles = [];
  const hitAreas = [], towerReveals = new Map(), openings = new Map();
  let width = 0, height = 0, frame = 0, soundOn = false, audio = null, gesture = null, held = null;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const heightAt = (x, y) => .55 + .27 * Math.sin(x * .68 + y * .36) + .2 * Math.cos(y * .8 - x * .22);
  const SAVE_KEY='tap-away.world.v1';
  let world,saveBlocked=false,saveTimer=0,toastTimer=0,started=false,needsInitialSave=false,legacyReset=false;
  const SAVE_LOAD_ERROR = "セーブを読み込めません。元データを保持しています。この回の進行は保存されません。";
  function toast(message) {
    notice.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => notice.textContent = '', 7000);
  }
  function loadWorld() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const seedText = new URLSearchParams(location.search).get('seed');
      const seed = seedText !== null && /^\d+$/.test(seedText) && Number(seedText) <= 0xffffffff ? Number(seedText) : undefined;
      const previous = raw === null ? null : JSON.parse(raw);
      const loaded = raw === null ? TapWorld.create(Date.now(), seed) : TapWorld.migrate(previous, Date.now(), seed);
      legacyReset = raw !== null && previous.saveVersion < loaded.saveVersion;
      needsInitialSave = raw === null || legacyReset;
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
  }
  document.querySelector('#start').textContent=world.introduced?"つづきから":"はじめる";
  function startGame() {
    started = true;
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
  setInterval(()=>{if(!document.hidden&&started){TapWorld.settle(world);updateHud();}},1000);
  setInterval(()=>{if(!document.hidden&&started)queueSave();},15000);
  tiles.sort((a, b) => a.y - b.y || a.x - b.x);
  const tilesByCoordinate=TapWorld.index(world);
  function project(x, y, z = 0) {
    return { x: width / 2 + camera.x + x * CONFIG.tileWidth * camera.zoom,
      y: height * .48 + camera.y + (y * CONFIG.tileHeight - z) * camera.zoom };
  }
  function ease(t) { t=clamp(t,0,1); return t*t*(3-2*t); }
  function curve(from, to, velocity, age, duration) {
    const t=clamp(age/duration,0,1);
    return (2*t*t*t-3*t*t+1)*from+(t*t*t-2*t*t+t)*duration*velocity+(-2*t*t*t+3*t*t)*to;
  }
  function pulseDuration(p) { return p.kind==='blocked'?CONFIG.blockedMs:p.kind==='complete'?CONFIG.completionMs:CONFIG.reactionMs; }
  function reaction(p, now) {
    const age=Math.max(0,now-p.at), start=p.start??CONFIG.contactStrength, velocity=p.velocity||0;
    if(p===held) return curve(start,CONFIG.contactStrength,velocity,age,CONFIG.contactMs);
    if(p.kind==='complete')return 0;
    const peak=Math.min(1.2,Math.max(1,start));
    const sink=p.kind==='blocked'?25:CONFIG.sinkMs;
    if(age<sink) return clamp(curve(start,peak,velocity,age,sink),-1.2,Math.max(1.2,start));
    if(p.kind==='blocked') return 1-ease((age-sink)/(CONFIG.blockedMs-sink));
    const rise=CONFIG.reboundAtMs;
    const rebound=-CONFIG.reboundStrength;
    if(age<rise) return curve(peak,rebound,0,age-sink,rise-sink);
    return curve(rebound,0,0,age-rise,pulseDuration(p)-rise);
  }
  function tilePulse(tile) { return held?.tile===tile?held:pulses.find(p=>p.tile===tile); }
  function feedbackStrength(tile, now) {
    const p=tilePulse(tile);
    if(!p) return 0;
    if(p===held) return clamp(reaction(p,now),0,1);
    const age=Math.max(0,now-p.at), end=p.kind==='blocked'?CONFIG.blockedMs:CONFIG.colorReturnMs;
    return age<CONFIG.colorHoldMs?clamp(reaction(p,now),0,1):1-ease((age-CONFIG.colorHoldMs)/(end-CONFIG.colorHoldMs));
  }
  function outlineStrength(tile, now) {
    if(tilePulse(tile)?.kind==='complete')return 0;
    return feedbackStrength(tile,now)*(tilePulse(tile)?.kind==='blocked'?.3:1);
  }
  function pulseDepth(p) { return p.kind==='blocked'?CONFIG.blockedPixels/camera.zoom:Math.max(CONFIG.pressDepth,CONFIG.minPressPixels/camera.zoom); }
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
    const darkening=(kind==='blocked'?CONFIG.blockedDarkening:kind==='complete'?0:CONFIG.pressDarkening)*feedbackStrength(tile,now);
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
      const reveal=ease((now-opening.at)/CONFIG.enclosureFadeMs);
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
    return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))+17*camera.zoom};
  }
  function pick(p) {
    // Use the geometry of the last displayed frame, in reverse paint order.
    for (let i = hitAreas.length - 1; i >= 0; i--) {
      if (inside(p, hitAreas[i].points)) return hitAreas[i];
    }
    return null;
  }
  function draw(now) {
    frame = 0;
    // rAF timestamps can precede callback execution during heavy rendering.
    now=Math.max(now,performance.now());
    for(let i=pulses.length-1;i>=0;i--) if(now-pulses[i].at>=pulseDuration(pulses[i])) pulses.splice(i,1);
    for(const [key,reveal] of towerReveals) if(now>=reveal.at+CONFIG.towerFadeMs) towerReveals.delete(key);
    for(const [key,opening] of openings) if(now>=opening.at+(opening.automatic?CONFIG.enclosureFadeMs:CONFIG.completionMs)) openings.delete(key);
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
      if(tile.x===0&&tile.y===0 || tile.landmark==='tower'&&(visibility==='opened'||world.destination?.x===tile.x&&world.destination?.y===tile.y)) {
        const object=tile.x===0&&tile.y===0?skin.objects.city:skin.objects.tower;
        if(visibility==='opened'&&drawAsset(tile.x===0&&tile.y===0?'city':'tower',base)) continue;
        ctx.save();ctx.translate(base.x,base.y);ctx.scale(camera.zoom,camera.zoom);
        if(tile.x===0&&tile.y===0){polygon(object.body,object.bodyColor);polygon(object.roof,object.roofColor);ctx.fillStyle=object.doorColor;ctx.fillRect(-4,-15,8,15);}
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
        if(detail>0) { ctx.globalAlpha=objectAlpha*detail;ctx.strokeStyle=object.detailColor;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-9,-16);ctx.lineTo(-1,-32);ctx.stroke(); }
      } else if ((tile.kind === "rock" || tile.kind === "mine")) {
        polygon(shapes[0],skin.objects.rock.faceColor,skin.objects.rock.lineColor);
        polygon(shapes[1],tile.kind==='mine'?skin.objects.mine.shadeColor:skin.objects.rock.shadeColor);
      } else if (camera.zoom > .65) {
        ctx.globalAlpha=objectAlpha*clamp((camera.zoom-.65)/.35,0,1);
        ctx.strokeStyle = skin.lines.detail; ctx.lineWidth = .9; ctx.beginPath();
        for (let k = 0; k < 3; k++) { ctx.moveTo(k * 5 - 8, 0); ctx.lineTo(k * 5 - 10, -3 - k % 2); } ctx.stroke();
      }
      ctx.restore();
    }
    // Completion stays in the tile plane: the cover retreats from its center.
    for(const opening of openings.values()) if(!opening.automatic)
      drawOpeningCover(opening.tile,corners(opening.tile,now),surface(opening.tile.x+.5,opening.tile.y+.5,now),now);
    drawCompletionEdges(now);
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
      ctx.strokeStyle = `rgba(${skin.lines.outline}, ${strength * .85})`;
      ctx.lineWidth = Math.max(CONFIG.minOutlinePixels, CONFIG.outlineWidth * camera.zoom);
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    if (pulses.length || towerReveals.size || openings.size || held) requestDraw();
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
    if(!world.destination)return;
    const p=surface(world.destination.x+.5,world.destination.y+.5,now);
    const target={x:p.x,y:p.y-64*camera.zoom};
    const margin=36;
    const headerBottom=document.querySelector('header').getBoundingClientRect().bottom;
    const footerTop=document.querySelector('footer').getBoundingClientRect().top;
    const top=Math.min(headerBottom+margin,height/2),bottom=Math.max(top,Math.min(height,footerTop)-margin);
    const x=clamp(target.x,margin,width-margin),y=clamp(target.y,top,bottom);
    const offscreen=x!==target.x||y!==target.y;
    ctx.save();
    const ui=TapSkin.current.ui;
    if(offscreen){ctx.beginPath();ctx.arc(x,y,28,0,Math.PI*2);ctx.fillStyle=ui.surfaceColor;ctx.fill();ctx.strokeStyle=ui.textColor;ctx.lineWidth=2;ctx.stroke();}
    ctx.fillStyle=ui.textColor;ctx.strokeStyle=ui.surfaceColor;ctx.lineWidth=3;ctx.font='20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.strokeText('★',x,y);ctx.fillText('★',x,y);
    if(offscreen) {
      const angle=Math.atan2(target.y-y,target.x-x);ctx.translate(x,y);ctx.rotate(angle);
      polygon([{x:17,y:-7},{x:27,y:0},{x:17,y:7}],ui.textColor);
    }
    ctx.restore();
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
    const kind=tile.visibility==='opened'||canDevelop(tile)?'normal':'blocked';
    const start=previous?reaction(previous,now)*pulseDepth(previous)/(kind==='blocked'?CONFIG.blockedPixels/camera.zoom:Math.max(CONFIG.pressDepth,CONFIG.minPressPixels/camera.zoom)):CONFIG.contactStrength;
    const velocity=previous?(reaction(previous,now+.1)-reaction(previous,now))/.1*pulseDepth(previous)/(kind==='blocked'?CONFIG.blockedPixels/camera.zoom:Math.max(CONFIG.pressDepth,CONFIG.minPressPixels/camera.zoom)):0;
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
    while(openings.size>CONFIG.maxOpenings) openings.delete(openings.keys().next().value);
  }
  function releasePress(commit) {
    if (!held) return;
    if(commit && camera.zoom < CONFIG.minTapZoom) commit=false;
    if(commit){
      const hidden=held.tile.landmark==='tower'?world.tiles.filter(tile=>tile.visibility==='hidden'):[];
      const now=performance.now(), start=reaction(held,now), velocity=(reaction(held,now+.1)-start)/.1, progress=held.tile.developmentProgress;
      const result=held.tile.visibility==='opened'?'touch':!canDevelop(held.tile)?'blocked':TapWorld.develop(world,held.tile,Date.now(),completion=>animateCompletion(completion,now,progress));
      const kind=result==='blocked'||result==='empty'?'blocked':result==='opened'||result==='tower'?'complete':'normal';
      if(result!=='blocked'&&result!=='empty')towerReveals.delete(held.tile.x+','+held.tile.y);
      if(result==='tower') {
        for(const tile of hidden) if(tile.visibility==='preview') {
          const distance=Math.max(Math.abs(tile.x-held.tile.x),Math.abs(tile.y-held.tile.y));
          towerReveals.set(tile.x+','+tile.y,{at:now+distance*CONFIG.towerRingMs});
        }
        toast(world.destination?'古い塔から視界が広がりました。次の★の塔へ進んでみましょう。':'5つの塔を開拓しました。気の向くままに地図を広げましょう。');
      }
      if(result==='opened'||result==='tower')save();
      else if(result==='progress')queueSave();
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
  document.addEventListener("visibilitychange",() => { if (document.hidden) { save(); pointers.clear(); gesture = null; held = null; pulses.length = 0; towerReveals.clear(); openings.clear(); canvas.classList.remove("dragging"); } else { TapWorld.settle(world); updateHud(); queueSave(); } requestDraw(); });
  window.addEventListener('pagehide',save);
  updateHud();
  resize();
})();
