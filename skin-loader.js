(() => {
  "use strict";
  const FORMAT_VERSION = 1;
  const SELECTION_KEY = 'tap-away.dev.skin';
  const available = Object.freeze([
    Object.freeze({id:'default',label:'標準'}),
    Object.freeze({id:'contrast',label:'配色比較（開発用）'})
  ]);
  const terrainIds = ['grass','tree','rock','mine'];
  const assetIds = new Set([...terrainIds,'city','tower','stone_arch','front_statue','leaf_statue','dressed_tree','front_bird','giant_flower','symmetric_tree']);
  const uiVariables = Object.freeze({textColor:'--tap-text-color',surfaceColor:'--tap-surface-color',borderColor:'--tap-border-color',hoverColor:'--tap-hover-color',backdropColor:'--tap-backdrop-color',noticeTextColor:'--tap-notice-text-color',noticeSurfaceColor:'--tap-notice-surface-color',mapColor:'--tap-map-color'});
  // This small built-in drawing remains usable when even the standard package is unavailable.
  const builtin = {
    formatVersion:1,id:'default',label:'標準',
    palette:{hidden:{h:48,s:16,l:34},preview:{grass:{h:85,s:13,l:46},tree:{h:105,s:13,l:46},rock:{h:55,s:13,l:46},mine:{h:32,s:13,l:46}},opened:{grass:{h:85,s:22,l:71},tree:{h:85,s:22,l:71},rock:{h:85,s:22,l:71},mine:{h:85,s:22,l:71}}},
    objects:{
      tree:{trunkColor:'#736b4d',leafColor:'#608164',shadeColor:'#4e7158',detailColor:'#aac09966',shapes:[[{x:-1.5,y:0},{x:1.5,y:0},{x:1.5,y:-21},{x:-1.5,y:-21}],[{x:-15,y:-12},{x:0,y:-45},{x:14,y:-12},{x:0,y:-6}],[{x:0,y:-45},{x:14,y:-12},{x:0,y:-6}]]},
      rock:{faceColor:'#a5aaa0',shadeColor:'#8c998e',lineColor:'#808b80',shapes:[[{x:-13,y:0},{x:-9,y:-15},{x:3,y:-23},{x:15,y:-10},{x:12,y:3}],[{x:3,y:-23},{x:15,y:-10},{x:12,y:3},{x:0,y:-4}]]},
      mine:{shadeColor:'#98774e'},
      city:{bodyColor:'#d6c4a2',roofColor:'#9a7761',doorColor:'#77654f',body:[{x:-20,y:0},{x:20,y:0},{x:20,y:-22},{x:-20,y:-22}],roof:[{x:-24,y:-22},{x:0,y:-40},{x:24,y:-22}]},
      tower:{bodyColor:'#8d9482',detailColor:'#555f50',body:[{x:-9,y:0},{x:9,y:0},{x:7,y:-56},{x:-7,y:-56}]}
    },
    lines:{hidden:'#eeeade16',edge:'#657d4b22',eligible:'#75856b',detail:'#70864e88',outline:'48, 65, 40'},
    shadows:{ground:'#62634c12',object:'#455e3f21'},
    ui:{textColor:'#263d2e',surfaceColor:'#fffdf5',borderColor:'#778571',hoverColor:'#ecefdf',backdropColor:'#34403666',noticeTextColor:'#ffffff',noticeSurfaceColor:'#263d2e',mapColor:'#eeeade'},
    assets:{}
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const finite = (value,min,max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const color = value => typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value);
  const opaque = value => color(value) && (value.length===4 || value.length===7 || value.length===5 && /f$/i.test(value) || value.length===9 && /ff$/i.test(value));
  const uiColor = (key,value) => key==='backdropColor' ? color(value) : opaque(value);
  function luminance(value) {
    const hex=value.slice(1), short=hex.length<=4;
    const channels=short ? [...hex.slice(0,3)].map(n=>parseInt(n+n,16)/255) : [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255);
    const linear=channels.map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);
    return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
  }
  function readablePair(foreground,background,lightText=false) {
    if(!opaque(foreground)||!opaque(background)) return false;
    const foregroundLight=luminance(foreground),backgroundLight=luminance(background);
    return (Math.max(foregroundLight,backgroundLight)+.05)/(Math.min(foregroundLight,backgroundLight)+.05)>=4.5 && (lightText?foregroundLight>backgroundLight:foregroundLight<backgroundLight);
  }
  function repairUi(ui,base) {
    if(!readablePair(ui.textColor,ui.surfaceColor)) {ui.textColor=base.textColor;ui.surfaceColor=base.surfaceColor;}
    if(!readablePair(ui.textColor,ui.hoverColor)) {ui.textColor=base.textColor;ui.hoverColor=base.hoverColor;}
    // Restoring text after a bad hover override can affect a previously valid surface pair.
    if(!readablePair(ui.textColor,ui.surfaceColor)) {ui.textColor=base.textColor;ui.surfaceColor=base.surfaceColor;}
    if(!readablePair(ui.noticeTextColor,ui.noticeSurfaceColor,true)) {ui.noticeTextColor=base.noticeTextColor;ui.noticeSurfaceColor=base.noticeSurfaceColor;}
    return ui;
  }
  const rgb = value => typeof value === 'string' && /^\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*$/.test(value) && value.split(',').every(n=>Number(n)<=255);
  const points = value => Array.isArray(value) && value.length>=3 && value.length<=32 && value.every(p=>plain(p)&&finite(p.x,-512,512)&&finite(p.y,-512,512));
  const hsl = value => plain(value) && finite(value.h,0,360) && finite(value.s,0,70) && finite(value.l,0,100);
  const copyHsl = value => ({h:value.h,s:value.s,l:value.l});
  const copyPoints = value => value.map(p=>({x:p.x,y:p.y}));
  const relativeAssetPath = value => typeof value === 'string' && value.length<=240 && /^[a-z\d_-][a-z\d_./-]*\.(?:png|jpe?g|webp|gif|svg)$/i.test(value) && value.split('/').every(part=>part!=='.'&&part!=='..'&&part!=='');
  function asset(value) {
    return plain(value) && relativeAssetPath(value.path) && finite(value.width,1,1024) && finite(value.height,1,1024) && finite(value.anchorX,0,value.width) && finite(value.anchorY,0,value.height) && (value.visualHeight===undefined || finite(value.visualHeight,0,512));
  }
  // Validation copies only known data fields. Arbitrary code and unknown properties never reach rendering.
  function validate(input) {
    if (!plain(input) || input.formatVersion !== FORMAT_VERSION) return null;
    const result = {formatVersion:FORMAT_VERSION};
    if (plain(input.palette)) {
      result.palette = {};
      if (hsl(input.palette.hidden)) result.palette.hidden = copyHsl(input.palette.hidden);
      for (const state of ['preview','opened']) if (plain(input.palette[state])) {
        result.palette[state] = {};
        for (const id of terrainIds) if (hsl(input.palette[state][id])) result.palette[state][id] = copyHsl(input.palette[state][id]);
      }
    }
    for (const section of ['objects','lines','shadows','ui']) {
      if (!plain(input[section])) continue;
      result[section] = {};
      for (const [key,standard] of Object.entries(builtin[section])) {
        const value=input[section][key];
        if (section==='objects') {
          if(!plain(value)) continue;
          const object={};
          for (const [field,baseValue] of Object.entries(standard)) {
            const candidate=value[field];
            if (field==='shapes') {
              if (Array.isArray(candidate) && candidate.length===baseValue.length && candidate.every(points)) object[field]=candidate.map(copyPoints);
            } else if (Array.isArray(baseValue)) {
              if(points(candidate)) object[field]=copyPoints(candidate);
            } else if (color(candidate)) object[field]=candidate;
          }
          result[section][key]=object;
        } else if (section==='ui' ? uiColor(key,value) : section==='lines' && key==='outline' ? rgb(value) : color(value)) result[section][key]=value;
      }
    }
    if (plain(input.assets)) {
      result.assets={};
      for (const [id,value] of Object.entries(input.assets)) if (assetIds.has(id) && asset(value)) result.assets[id]={path:value.path,width:value.width,height:value.height,anchorX:value.anchorX,anchorY:value.anchorY,visualHeight:value.visualHeight??value.height};
    }
    return result;
  }
  function merge(base,patch) {
    const result=clone(base);
    if (!patch) return result;
    function copy(target,source) {
      for(const [key,value] of Object.entries(source)) {
        if (key==='assets') { Object.assign(target.assets,clone(value)); continue; }
        if(plain(value)&&plain(target[key])) copy(target[key],value);
        else target[key]=clone(value);
      }
    }
    copy(result,patch);
    // Keep the three exploration states readable even when a valid color is a poor override.
    if(result.palette.hidden.l<10 || result.palette.hidden.l>45) result.palette.hidden=clone(base.palette.hidden);
    for(const id of terrainIds) {
      const preview=result.palette.preview[id], opened=result.palette.opened[id];
      if(preview.l<35 || preview.l>60 || preview.l<result.palette.hidden.l+6) result.palette.preview[id]=clone(base.palette.preview[id]);
      if(opened.l<65 || opened.l>85 || opened.l<result.palette.preview[id].l+6) result.palette.opened[id]=clone(base.palette.opened[id]);
    }
    if(terrainIds.some(id=>result.palette.preview[id].l<result.palette.hidden.l+6 || result.palette.opened[id].l<result.palette.preview[id].l+6)) result.palette=clone(base.palette);
    repairUi(result.ui,base.ui);
    return result;
  }
  function parseUiCss(css) {
    if (typeof css!=='string' || css.length>8192) return null;
    const source=css.replace(/\/\*[\s\S]*?\*\//g,'').trim();
    const match=/^:root\s*\{([^{}]*)\}\s*$/.exec(source);
    if (!match) return null;
    const allowed=new Set(Object.values(uiVariables)), result={};
    for(const declaration of match[1].split(';')) {
      if(!declaration.trim()) continue;
      const field=/^\s*(--tap-[a-z-]+)\s*:\s*(#[\da-f]+)\s*$/i.exec(declaration);
      if(!field || !allowed.has(field[1]) || !uiColor(Object.keys(uiVariables).find(key=>uiVariables[key]===field[1]),field[2])) return null;
      result[field[1]]=field[2];
    }
    return result;
  }
  function applyUi(skin,css) {
    if(typeof document==='undefined' || !document.documentElement?.style) return;
    const style=document.documentElement.style;
    for(const variable of Object.values(uiVariables)) style.removeProperty(variable);
    for(const [key,variable] of Object.entries(uiVariables)) style.setProperty(variable,skin.ui[key]);
    if(css) for(const [variable,value] of Object.entries(css)) style.setProperty(variable,value);
  }
  function mergeUiCss(skin,css) {
    if(!css) return;
    const before=clone(skin.ui);
    for(const [key,variable] of Object.entries(uiVariables)) if(Object.hasOwn(css,variable)) skin.ui[key]=css[variable];
    repairUi(skin.ui,before);
  }
  function selection() {
    try { const value=globalThis.localStorage?.getItem(SELECTION_KEY); return available.some(s=>s.id===value)?value:null; }
    catch { return null; }
  }
  function select(id) {
    if(id!==null && !available.some(s=>s.id===id)) throw Error('Unknown bundled skin');
    if(!globalThis.localStorage) throw Error('Development settings cannot be saved');
    if(id===null) globalThis.localStorage.removeItem(SELECTION_KEY);
    else globalThis.localStorage.setItem(SELECTION_KEY,id);
  }
  const baseUrl = () => typeof document!=='undefined' && document.baseURI ? document.baseURI : 'http://localhost/';
  async function read(url,json) {
    if(typeof globalThis.fetch!=='function') throw Error('Fetch unavailable');
    const response=await globalThis.fetch(url,{cache:'no-cache'});
    if(!response.ok) throw Error('Appearance file unavailable');
    return json ? response.json() : response.text();
  }
  function packageUrl(id,file) { return new URL(`skins/${id}/${file}`,baseUrl()).href; }
  function resolveAssets(patch,id) {
    if(patch?.assets) for(const descriptor of Object.values(patch.assets)) descriptor.url=new URL(descriptor.path,packageUrl(id,'skin.json')).href;
    return patch;
  }
  function imageFor(descriptor) {
    return new Promise((resolve,reject)=>{
      if(typeof globalThis.Image!=='function') { reject(Error('Image unavailable')); return; }
      const picture=new globalThis.Image();
      const timer=setTimeout(()=>{picture.onload=picture.onerror=null;reject(Error('Image timed out'));},3000);
      picture.onload=()=>{clearTimeout(timer);resolve(picture);};
      picture.onerror=()=>{clearTimeout(timer);reject(Error('Image unavailable'));};
      picture.src=descriptor.url;
    });
  }
  async function loadAssets(skin,standard) {
    await Promise.all(Object.entries(skin.assets).map(async([id,descriptor])=>{
      try { descriptor.image=await imageFor(descriptor); }
      catch {
        const fallback=standard.assets[id];
        if(fallback && fallback.url!==descriptor.url) {
          try { skin.assets[id]={...fallback,image:await imageFor(fallback)}; return; } catch {}
        }
        delete skin.assets[id];
      }
    }));
  }
  let pendingLoad;
  const api = {current:clone(builtin),available,selection,select,validate,merge,parseUiCss,relativeAssetPath};
  async function load() {
    const results=await Promise.allSettled([read(packageUrl('default','skin.json'),true),read(packageUrl('default','ui.css'),false),read(new URL('config/appearance.json',baseUrl()).href,true)]);
    const standardPatch=results[0].status==='fulfilled'?resolveAssets(validate(results[0].value),'default'):null;
    const standard=merge(builtin,standardPatch);
    const css=standardPatch && results[1].status==='fulfilled'?parseUiCss(results[1].value):null;
    mergeUiCss(standard,css);
    const configured=results[2].status==='fulfilled'&&plain(results[2].value)?results[2].value.skin:null;
    let id=selection() || (available.some(s=>s.id===configured)?configured:'default');
    let skin=standard;
    if(id!=='default') {
      const files=await Promise.allSettled([read(packageUrl(id,'skin.json'),true),read(packageUrl(id,'ui.css'),false)]);
      const patch=files[0].status==='fulfilled'?resolveAssets(validate(files[0].value),id):null;
      if(patch) {
        skin=merge(standard,patch);
        const customCss=files[1].status==='fulfilled'?parseUiCss(files[1].value):null;
        mergeUiCss(skin,customCss);
      } else id='default';
    }
    skin.id=id;skin.label=available.find(s=>s.id===id).label;
    await loadAssets(skin,standard);
    api.current=skin;
    applyUi(skin,null);
    return skin;
  }
  api.load=()=>pendingLoad || (pendingLoad=load().catch(()=>{api.current=clone(builtin);applyUi(api.current,null);return api.current;}));
  globalThis.TapSkin=api;
})();
