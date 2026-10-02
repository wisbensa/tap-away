(() => {
  "use strict";
  // Phase 0 tuning values; these are provisional, not world/game rules.
  const CONFIG = { extent: 5, tileWidth: 76, tileHeight: 38, heightScale: 15,
    minZoom: .55, maxZoom: 2.4, dragThreshold: 7, reactionMs: 550,
    sinkMs: 100, sinkHoldMs: 70, contactStrength: .15,
    pressDepth: 12, reactionRadius: 1.5, outlineColor: "48, 65, 40",
    outlineWidth: 2, maxPulses: 32, soundVolume: .12 };
  const canvas = document.querySelector("#map"), ctx = canvas.getContext("2d");
  const soundButton = document.querySelector("#sound"), notice = document.querySelector("#notice");
  const camera = { x: 0, y: 0, zoom: 1 };
  const pointers = new Map(), pulses = [], tiles = [];
  let width = 0, height = 0, frame = 0, soundOn = false, audio = null, gesture = null, held = null;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const heightAt = (x, y) => .55 + .27 * Math.sin(x * .68 + y * .36) + .2 * Math.cos(y * .8 - x * .22);
  for (let y = -CONFIG.extent; y < CONFIG.extent; y++) {
    for (let x = -CONFIG.extent; x < CONFIG.extent; x++) {
      const seed = Math.abs((x + 17) * 73 + (y + 19) * 137);
      tiles.push({ x, y, seed, kind: seed % 11 < 3 ? "tree" : seed % 11 === 4 ? "rock" : "grass" });
    }
  }
  tiles.sort((a, b) => a.x + a.y - b.x - b.y || a.y - b.y);
  function project(x, y, z = 0) {
    return { x: width / 2 + camera.x + (x - y) * CONFIG.tileWidth / 2 * camera.zoom,
      y: height * .48 + camera.y + ((x + y) * CONFIG.tileHeight / 2 - z) * camera.zoom };
  }
  function reaction(p, now) {
    if (p === held) return CONFIG.contactStrength;
    const age = Math.max(0, now - p.at);
    if (age < CONFIG.sinkMs) return CONFIG.contactStrength + (1 - CONFIG.contactStrength) * Math.sin(age / CONFIG.sinkMs * Math.PI / 2);
    if (age < CONFIG.sinkMs + CONFIG.sinkHoldMs) return 1;
    const t = clamp((age - CONFIG.sinkMs - CONFIG.sinkHoldMs) / (CONFIG.reactionMs - CONFIG.sinkMs - CONFIG.sinkHoldMs), 0, 1);
    return Math.cos(t * Math.PI * 1.6) * (1 - t) ** 2;
  }
  function outlineStrength(tile, now) {
    let strength = held && held.tile === tile ? CONFIG.contactStrength : 0;
    for (const p of pulses) if (p.tile === tile) strength = Math.max(strength, reaction(p, now));
    return strength;
  }
  function displacement(x, y, now) {
    let result = 0;
    for (const p of held ? [...pulses, held] : pulses) {
      const d = Math.hypot(x - p.x, y - p.y);
      const falloff = Math.exp(-d * d / (CONFIG.reactionRadius ** 2) * 2.5);
      result += CONFIG.pressDepth * falloff * reaction(p, now);
    }
    return clamp(result, -4, 13);
  }
  function surface(x, y, now) { return project(x, y, heightAt(x, y) * CONFIG.heightScale - displacement(x, y, now)); }
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
  function corners(tile, now) { return [[0,0],[1,0],[1,1],[0,1]].map(([dx,dy]) => surface(tile.x + dx, tile.y + dy, now)); }
  function draw(now) {
    frame = 0;
    while (pulses.length && now - pulses[0].at >= CONFIG.reactionMs) pulses.shift();
    ctx.clearRect(0, 0, width, height);
    const center = project(0, 0);
    ctx.save(); ctx.translate(center.x, center.y + 35 * camera.zoom); ctx.scale(camera.zoom, camera.zoom);
    ctx.fillStyle = "#62634c12"; ctx.beginPath(); ctx.ellipse(0, 0, 315, 150, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    for (const tile of tiles) {
      const pts = corners(tile, now), { x, y, seed } = tile;
      if (x === CONFIG.extent - 1 || y === CONFIG.extent - 1) {
        const edge = x === CONFIG.extent - 1 ? [pts[1], pts[2]] : [pts[2], pts[3]];
        polygon([edge[0], edge[1], {x:edge[1].x,y:edge[1].y+17*camera.zoom}, {x:edge[0].x,y:edge[0].y+17*camera.zoom}], x === CONFIG.extent - 1 ? "#b2a48b" : "#c8baa0");
      }
      const press = displacement(x + .5, y + .5, now);
      polygon(pts, `hsl(${83 + seed % 9} 22% ${69 + seed % 5 - press * .7}%)`, "#657d4b22");
      const base = surface(x + .5, y + .5, now);
      ctx.save(); ctx.translate(base.x, base.y); ctx.scale(camera.zoom, camera.zoom);
      ctx.fillStyle = "#455e3f21"; ctx.beginPath(); ctx.ellipse(3, 2, tile.kind === "grass" ? 4 : 15, 5, -.2, 0, Math.PI * 2); ctx.fill();
      if (tile.kind === "tree") {
        ctx.strokeStyle = "#736b4d"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -21); ctx.stroke();
        polygon([{x:-15,y:-12},{x:0,y:-42-seed%7},{x:14,y:-12},{x:0,y:-6}], "#608164");
        polygon([{x:0,y:-42-seed%7},{x:14,y:-12},{x:0,y:-6}], "#4e7158");
        if (camera.zoom > .85) { ctx.strokeStyle = "#aac09966"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-9,-16); ctx.lineTo(-1,-32); ctx.stroke(); }
      } else if (tile.kind === "rock") {
        polygon([{x:-13,y:0},{x:-9,y:-15},{x:3,y:-23},{x:15,y:-10},{x:12,y:3}], "#a5aaa0", "#808b80");
        polygon([{x:3,y:-23},{x:15,y:-10},{x:12,y:3},{x:0,y:-4}], "#8c998e");
      } else if (camera.zoom > .75) {
        ctx.strokeStyle = "#70864e88"; ctx.lineWidth = .9; ctx.beginPath();
        for (let k = 0; k < 3; k++) { ctx.moveTo(k * 5 - 8, 0); ctx.lineTo(k * 5 - 10, -3 - k % 2); } ctx.stroke();
      }
      ctx.restore();
    }
    // Draw last so neighboring tile fills cannot hide the selected edges.
    for (const tile of tiles) {
      const strength = outlineStrength(tile, now);
      if (strength <= 0) continue;
      ctx.beginPath();
      corners(tile, now).forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.strokeStyle = `rgba(${CONFIG.outlineColor}, ${strength * .85})`;
      ctx.lineWidth = Math.max(1.25, CONFIG.outlineWidth * camera.zoom);
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    if (pulses.length) requestDraw();
  }
  function requestDraw() { if (!frame) frame = requestAnimationFrame(draw); }
  function resize() {
    const oldWidth = width;
    width = canvas.clientWidth; height = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
    if (!oldWidth) camera.zoom = clamp(Math.min(width / 880, height / 650), CONFIG.minZoom, 1.15);
    requestDraw();
  }
  function point(event) { const r = canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; }
  function zoomAt(p, factor) {
    const before = camera.zoom, next = clamp(before * factor, CONFIG.minZoom, CONFIG.maxZoom);
    camera.x = p.x - width / 2 - (p.x - width / 2 - camera.x) * next / before;
    camera.y = p.y - height * .48 - (p.y - height * .48 - camera.y) * next / before;
    camera.zoom = next; requestDraw();
  }
  function pair() { const [a,b] = [...pointers.values()]; return { midpoint: {x:(a.x+b.x)/2,y:(a.y+b.y)/2}, distance:Math.hypot(a.x-b.x,a.y-b.y) }; }
  function press(p) {
    const now = performance.now();
    // Reverse painter order gives raised objects their owning tile as well.
    const tile = [...tiles].reverse().find(t => {
      const base = surface(t.x+.5,t.y+.5,now);
      const objectHit = t.kind !== "grass" && Math.abs(p.x-base.x) < 16*camera.zoom && p.y <= base.y && p.y >= base.y-(t.kind === "tree" ? 49 : 24)*camera.zoom;
      return objectHit || inside(p, corners(t,now));
    });
    if (!tile) return;
    const base = surface(tile.x+.5,tile.y+.5,now);
    const dx = (p.x-base.x) / (CONFIG.tileWidth/2*camera.zoom);
    const dy = (p.y-base.y) / (CONFIG.tileHeight/2*camera.zoom);
    const localX = clamp((dx+dy)/2,-.4,.4), localY = clamp((dy-dx)/2,-.4,.4);
    held = {x:tile.x+.5+localX,y:tile.y+.5+localY,tile};
    requestDraw();
  }
  function releasePress(commit) {
    if (!held) return;
    if (commit) pulses.push({...held,at:performance.now()});
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
    if (pointers.size === 1) { gesture = { start:p, last:p, moved:false, multi:false }; press(p); }
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
      if (Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y) > CONFIG.dragThreshold) { gesture.moved = true; releasePress(false); }
      if (gesture.moved || gesture.multi) { camera.x += p.x-gesture.last.x; camera.y += p.y-gesture.last.y; canvas.classList.add("dragging"); requestDraw(); }
      gesture.last = p;
    }
  });
  function endPointer(event) {
    if (!pointers.has(event.pointerId)) return;
    const p = point(event);
    releasePress(event.type === "pointerup" && pointers.size === 1 && !gesture.multi && !gesture.moved && Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y) <= CONFIG.dragThreshold);
    pointers.delete(event.pointerId);
    if (pointers.size === 1) gesture.last = [...pointers.values()][0];
    if (!pointers.size) { gesture = null; canvas.classList.remove("dragging"); }
  }
  for (const name of ["pointerup","pointercancel","lostpointercapture"]) canvas.addEventListener(name,endPointer);
  canvas.addEventListener("wheel", event => { event.preventDefault(); zoomAt(point(event),Math.exp(-clamp(event.deltaY,-120,120)*.002)); },{passive:false});
  window.addEventListener("resize",resize);
  document.addEventListener("visibilitychange",() => { if (document.hidden) { pointers.clear(); gesture = null; held = null; pulses.length = 0; canvas.classList.remove("dragging"); } requestDraw(); });
  resize();
})();
