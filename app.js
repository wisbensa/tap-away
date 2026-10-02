(() => {
  "use strict";
  // Touch tuning inherited from the approved Phase 0 prototype.
  const CONFIG = { extent: 31, tileWidth: 76, tileHeight: 68, heightScale: 15,
    minZoom: .12, minTapZoom: .25, initialMinZoom: .55, maxZoom: 2.4, dragThreshold: 7, touchDragThreshold: 14, reactionMs: 550,
    sinkMs: 100, sinkHoldMs: 70, contactStrength: .15,
    pressDepth: 2, minPressPixels: 2, pressDarkening: 30, outlineColor: "48, 65, 40",
    outlineWidth: 2, minOutlinePixels: 2, outlineHoldMs: 320, colorHoldMs: 100, colorReturnMs: 240, maxPulses: 32, soundVolume: .12, hiddenLightness: 34, previewLightness: 46 };
  const canvas = document.querySelector("#map"), ctx = canvas.getContext("2d");
  const soundButton = document.querySelector("#sound"), notice = document.querySelector("#notice");
  const camera = { x: 0, y: 0, zoom: 1 };
  const pointers = new Map(), pulses = [], tiles = [];
  const hitAreas = [];
  let width = 0, height = 0, frame = 0, soundOn = false, audio = null, gesture = null, held = null;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const heightAt = (x, y) => .55 + .27 * Math.sin(x * .68 + y * .36) + .2 * Math.cos(y * .8 - x * .22);
  const SAVE_KEY='tap-away.world.v1';
  let world,saveBlocked=false,saveTimer=0,toastTimer=0,started=false;
  const SAVE_LOAD_ERROR = "セーブを読み込めません。元データを保持しています。この回の進行は保存されません。";
  function toast(message) {
    notice.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => notice.textContent = '', 7000);
  }
  function loadWorld() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const loaded = raw === null ? TapWorld.create() : TapWorld.migrate(JSON.parse(raw));
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
    if (saveBlocked) return;
    TapWorld.settle(world);
    world.savedAt = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(world));
    } catch {
      toast("保存できませんでした。端末の空き容量や保存設定を確認してください。");
    }
  }
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
      toast("隣の土地をポチポチ開拓。★の古い塔まで行くと、遠くを見渡せます。");
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
  setInterval(()=>{if(!document.hidden&&started){TapWorld.settle(world);updateHud();}},1000);
  setInterval(()=>{if(!document.hidden&&started)queueSave();},15000);
  tiles.sort((a, b) => a.y - b.y || a.x - b.x);
  function project(x, y, z = 0) {
    return { x: width / 2 + camera.x + x * CONFIG.tileWidth * camera.zoom,
      y: height * .48 + camera.y + (y * CONFIG.tileHeight - z) * camera.zoom };
  }
  function reaction(p, now) {
    if (p === held) return CONFIG.contactStrength;
    const age = Math.max(0, now - p.at);
    if (age < CONFIG.sinkMs) return CONFIG.contactStrength + (1 - CONFIG.contactStrength) * Math.sin(age / CONFIG.sinkMs * Math.PI / 2);
    if (age < CONFIG.sinkMs + CONFIG.sinkHoldMs) return 1;
    const t = clamp((age - CONFIG.sinkMs - CONFIG.sinkHoldMs) / (CONFIG.reactionMs - CONFIG.sinkMs - CONFIG.sinkHoldMs), 0, 1);
    return Math.cos(t * Math.PI * 1.6) * (1 - t) ** 2;
  }
  function feedbackStrength(tile, now, holdMs, endMs) {
    let strength = held && held.tile === tile ? CONFIG.contactStrength : 0;
    for (const p of pulses) {
      if (p.tile !== tile) continue;
      const age = Math.max(0, now - p.at);
      const fade = clamp((endMs - age) / (endMs - holdMs), 0, 1);
      // Identification must remain visible through the rebound, not vanish
      // when displacement becomes negative.
      strength = Math.max(strength, age < CONFIG.sinkMs ? reaction(p, now) : fade);
    }
    return strength;
  }
  function outlineStrength(tile, now) {
    return feedbackStrength(tile, now, CONFIG.outlineHoldMs, CONFIG.reactionMs);
  }
  function displacement(x, y, now) {
    let result = 0;
    for (const p of held ? [...pulses, held] : pulses) {
      if (Math.floor(x) !== p.tile.x || Math.floor(y) !== p.tile.y) continue;
      result += Math.max(CONFIG.pressDepth, CONFIG.minPressPixels / camera.zoom) * reaction(p, now);
    }
    return clamp(result, -4 / camera.zoom, Math.max(CONFIG.pressDepth + 1, CONFIG.minPressPixels / camera.zoom));
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
  function corners(tile, now) { return [[0,0],[1,0],[1,1],[0,1]].map(([dx,dy]) => surface(tile.x + dx, tile.y + dy, now, tile)); }
  function tileColor(tile, now) {
    const darkening=CONFIG.pressDarkening*feedbackStrength(tile,now,CONFIG.colorHoldMs,CONFIG.colorReturnMs);
    if(tile.visibility==='hidden') return `hsl(48 16% ${CONFIG.hiddenLightness-darkening}%)`;
    if(tile.visibility==='preview') return `hsl(${tile.kind==='tree'?105:tile.kind==='mine'?32:tile.kind==='rock'?55:85} 13% ${CONFIG.previewLightness-darkening}%)`;
    return `hsl(${83 + tile.seed % 9} 22% ${69 + tile.seed % 5 - darkening}%)`;
  }
  function objectShapes(tile) {
    if (tile.kind === "tree") return [
      [{x:-1.5,y:0},{x:1.5,y:0},{x:1.5,y:-21},{x:-1.5,y:-21}],
      [{x:-15,y:-12},{x:0,y:-42-tile.seed%7},{x:14,y:-12},{x:0,y:-6}],
      [{x:0,y:-42-tile.seed%7},{x:14,y:-12},{x:0,y:-6}]
    ];
    if ((tile.kind === "rock" || tile.kind === "mine")) return [
      [{x:-13,y:0},{x:-9,y:-15},{x:3,y:-23},{x:15,y:-10},{x:12,y:3}],
      [{x:3,y:-23},{x:15,y:-10},{x:12,y:3},{x:0,y:-4}]
    ];
    return [];
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
    while (pulses.length && now - pulses[0].at >= CONFIG.reactionMs) pulses.shift();
    ctx.clearRect(0, 0, width, height);
    hitAreas.length = 0;
    const center = project(0, 0);
    ctx.save(); ctx.translate(center.x, center.y + 35 * camera.zoom); ctx.scale(camera.zoom, camera.zoom);
    ctx.fillStyle = "#62634c12"; ctx.beginPath(); ctx.ellipse(0, 0, 315, 150, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    const worldIndex=TapWorld.index(world);
    for (const tile of tiles) {
      const pts = corners(tile, now), { x, y, seed } = tile;
      if(pts.every(p=>p.x<-80)||pts.every(p=>p.x>width+80)||pts.every(p=>p.y<-20)||pts.every(p=>p.y>height+100)) continue;
      const base = surface(x + .5, y + .5, now);
      const remember = points => hitAreas.push({ tile, points, base, zoom:camera.zoom });
      if (y === CONFIG.extent - 1) {
        const edge = [pts[2], pts[3]];
        const side = [edge[0], edge[1], {x:edge[1].x,y:edge[1].y+17*camera.zoom}, {x:edge[0].x,y:edge[0].y+17*camera.zoom}];
        polygon(side, "#c8baa0");
        remember(side);
      }
      polygon(pts, tileColor(tile, now), tile.visibility==='hidden'?'#eeeade0a':'#657d4b22');
      remember(pts);
      if(tile.visibility==='preview'&&TapWorld.eligible(tile,worldIndex)) {
        ctx.save();ctx.setLineDash([3*camera.zoom,5*camera.zoom]);ctx.strokeStyle='#75856b';ctx.lineWidth=1;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();ctx.restore();
      }
      if(tile.x===0&&tile.y===0 || tile.landmark==='tower'&&(tile.visibility==='opened'||world.destination?.x===tile.x&&world.destination?.y===tile.y)) {
        ctx.save();ctx.translate(base.x,base.y);ctx.scale(camera.zoom,camera.zoom);
        if(tile.x===0&&tile.y===0){polygon([{x:-20,y:0},{x:20,y:0},{x:20,y:-22},{x:-20,y:-22}],'#d6c4a2');polygon([{x:-24,y:-22},{x:0,y:-40},{x:24,y:-22}],'#9a7761');ctx.fillStyle='#77654f';ctx.fillRect(-4,-15,8,15);}
        else{ctx.globalAlpha=tile.visibility==='opened'?1:.5;polygon([{x:-9,y:0},{x:9,y:0},{x:7,y:-56},{x:-7,y:-56}],'#8d9482');if(tile.visibility==='opened'){ctx.fillStyle='#555f50';ctx.fillRect(-2,-44,4,9);}}
        ctx.restore();continue;
      }
      if(tile.visibility==='hidden') {
        // Sparse, sharp cartographic strokes; no blurred or moving overlay.
        if(camera.zoom>.8 && seed%7===0) {
          ctx.save();ctx.strokeStyle='#eeeade16';ctx.lineWidth=.8;
          ctx.beginPath();ctx.moveTo(base.x-7*camera.zoom,base.y);ctx.lineTo(base.x+7*camera.zoom,base.y);ctx.stroke();ctx.restore();
        }
        continue;
      }
      const shapes = objectShapes(tile);
      ctx.save(); ctx.translate(base.x, base.y); ctx.scale(camera.zoom, camera.zoom); ctx.globalAlpha=tile.visibility==='preview'?.38:1;
      ctx.fillStyle = "#455e3f21"; ctx.beginPath(); ctx.ellipse(3, 2, tile.kind === "grass" ? 4 : 15, 5, -.2, 0, Math.PI * 2); ctx.fill();
      if (tile.kind === "tree") {
        ctx.strokeStyle = "#736b4d"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -21); ctx.stroke();
        polygon(shapes[1], "#608164");
        polygon(shapes[2], "#4e7158");
        if (camera.zoom > .85) { ctx.strokeStyle = "#aac09966"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-9,-16); ctx.lineTo(-1,-32); ctx.stroke(); }
      } else if ((tile.kind === "rock" || tile.kind === "mine")) {
        polygon(shapes[0], "#a5aaa0", "#808b80");
        polygon(shapes[1],tile.kind==='mine'?'#98774e':'#8c998e');
      } else if (camera.zoom > .75) {
        ctx.strokeStyle = "#70864e88"; ctx.lineWidth = .9; ctx.beginPath();
        for (let k = 0; k < 3; k++) { ctx.moveTo(k * 5 - 8, 0); ctx.lineTo(k * 5 - 10, -3 - k % 2); } ctx.stroke();
      }
      ctx.restore();
    }
    drawDestination(now);
    // Draw last so neighboring tile fills cannot hide the selected edges.
    for (const tile of tiles) {
      const strength = outlineStrength(tile, now);
      if (strength <= 0) continue;
      ctx.beginPath();
      corners(tile, now).forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.strokeStyle = `rgba(${CONFIG.outlineColor}, ${strength * .85})`;
      ctx.lineWidth = Math.max(CONFIG.minOutlinePixels, CONFIG.outlineWidth * camera.zoom);
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    if (pulses.length) requestDraw();
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
    if(offscreen){ctx.beginPath();ctx.arc(x,y,28,0,Math.PI*2);ctx.fillStyle='#faf8ee';ctx.fill();ctx.strokeStyle='#655a3d';ctx.lineWidth=2;ctx.stroke();}
    ctx.fillStyle='#f0db93';ctx.strokeStyle='#655a3d';ctx.lineWidth=3;ctx.font='20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.strokeText('★',x,y);ctx.fillText('★',x,y);
    if(offscreen) {
      const angle=Math.atan2(target.y-y,target.x-x);ctx.translate(x,y);ctx.rotate(angle);
      polygon([{x:17,y:-7},{x:27,y:0},{x:17,y:7}],'#655a3d');
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
  function press(p) {
    if (!started || camera.zoom < CONFIG.minTapZoom) return;
    const hit = pick(p);
    if (!hit || hit.zoom < CONFIG.minTapZoom) return;
    const {tile, base, zoom} = hit;
    if (!TapWorld.eligible(tile, TapWorld.index(world))) return;
    const localX = clamp((p.x-base.x) / (CONFIG.tileWidth*zoom),-.4,.4);
    const localY = clamp((p.y-base.y) / (CONFIG.tileHeight*zoom),-.4,.4);
    held = {x:tile.x+.5+localX,y:tile.y+.5+localY,tile};
    requestDraw();
  }
  function releasePress(commit) {
    if (!held) return;
    if(commit && (camera.zoom < CONFIG.minTapZoom || !TapWorld.eligible(held.tile,TapWorld.index(world)))) commit=false;
    if(commit){const result=TapWorld.develop(world,held.tile);if(result==='empty')toast("探索ポイントが回復するまで、ひと休み。");if(result==='tower')toast(world.destination?'古い塔から視界が広がりました。次の★の塔へ進んでみましょう。':'5つの塔を開拓しました。気の向くままに地図を広げましょう。');if(result!=='blocked'&&result!=='empty')queueSave();updateHud();pulses.push({...held,at:performance.now()});}
    held = null;
    if (pulses.length > CONFIG.maxPulses) pulses.shift();
    if (commit) playSound();
    requestDraw();
  }
  function playSound() {
    if (!soundOn || !audio || audio.state !== "running") return;
    const oscillator = audio.createOscillator(), gain = audio.createGain(), time = audio.currentTime;
    oscillator.type = "sine"; oscillator.frequency.setValueAtTime(420 + Math.random()*30, time); oscillator.frequency.exponentialRampToValueAtTime(150,time+.045);
    gain.gain.setValueAtTime(0,time); gain.gain.linearRampToValueAtTime(CONFIG.soundVolume,time+.003); gain.gain.exponentialRampToValueAtTime(.001,time+.065);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(time); oscillator.stop(time+.075);
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
  document.addEventListener("visibilitychange",() => { if (document.hidden) { save(); pointers.clear(); gesture = null; held = null; pulses.length = 0; canvas.classList.remove("dragging"); } else { TapWorld.settle(world); updateHud(); queueSave(); } requestDraw(); });
  window.addEventListener('pagehide',save);
  updateHud();
  resize();
})();
