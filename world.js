(() => {
'use strict';
const RULES={extent:30,maxPoints:1000,recoveryMs:21600000,towerRadius:5,towers:[{x:0,y:-7},{x:7,y:-12},{x:15,y:-8},{x:19,y:1},{x:12,y:10}],costs:{grass:4,tree:7,rock:10,mine:15}};
const key=(x,y)=>x+','+y;
const index=w=>new Map(w.tiles.map(t=>[key(t.x,t.y),t]));
const neighbors=(t,m)=>[[1,0],[-1,0],[0,1],[0,-1]].map(([x,y])=>m.get(key(t.x+x,t.y+y))).filter(Boolean);
const eligible=(t,m)=>t.visibility==='preview'&&neighbors(t,m).some(n=>n.visibility==='opened');
function create(now=Date.now()) {
 const tiles=[];
 for(let y=-30;y<=30;y++) for(let x=-30;x<=30;x++) {
  const seed=Math.abs((x+37)*73856093 ^ (y+41)*19349663)>>>0;
  tiles.push({x,y,seed,kind:'grass',road:y===-5&&x>=0&&x<=10,landmark:RULES.towers.some(t=>t.x===x&&t.y===y)?'tower':x===6&&y===-5?'spring':x===10&&y===-7?'ruins':null,effectApplied:false,visibility:x===0&&y===0?'opened':Math.abs(x)+Math.abs(y)===1?'preview':'hidden',developmentProgress:0});
 }
 const ranked=tiles.filter(t=>Math.max(Math.abs(t.x),Math.abs(t.y))>3).sort((a,b)=>(b.seed%10000+Math.max(Math.abs(b.x),Math.abs(b.y))*240)-(a.seed%10000+Math.max(Math.abs(a.x),Math.abs(a.y))*240));
 ranked.forEach((t,i)=>t.kind=i<112?'mine':i<410?'rock':i<1563?'tree':'grass');
 tiles.forEach(t=>{const d=Math.max(Math.abs(t.x),Math.abs(t.y));if(d<=3)t.kind='grass';t.requiredCost=Math.max(1,RULES.costs[t.kind]+Math.max(0,Math.ceil(d/5)-1)+(t.road?-1:0));if(t.visibility==='opened')t.developmentProgress=t.requiredCost;});
 return {saveVersion:2,worldVersion:1,phase:1,savedAt:now,lastCalculatedAt:now,bounds:{minX:-30,maxX:30,minY:-30,maxY:30},seed:20261003,generatorVersion:1,points:1000,resources:{wood:0,rock:0,metal:0},facilities:{inn:0,well:0,workshop:0},destination:{...RULES.towers[0]},introduced:false,tiles};
}
function settle(w, now = Date.now()) {
 if (!Number.isFinite(now)) return;
 const elapsed = Math.max(0, now - w.lastCalculatedAt);
 w.points = Math.min(RULES.maxPoints, w.points + elapsed * RULES.maxPoints / RULES.recoveryMs);
 w.lastCalculatedAt = Math.max(now, w.lastCalculatedAt);
}
function applyTowerEffect(w, tower) {
 for (const tile of w.tiles) {
  const distance = Math.max(Math.abs(tile.x - tower.x), Math.abs(tile.y - tower.y));
  if (tile.visibility === 'hidden' && distance <= RULES.towerRadius) tile.visibility = 'preview';
 }
 tower.effectApplied = true;
}
function develop(w,t,now=Date.now()) {
 settle(w,now);const m=index(w);if(!eligible(t,m))return 'blocked';if(w.points<1)return 'empty';w.points--;t.developmentProgress=Math.min(t.requiredCost,t.developmentProgress+1);if(t.developmentProgress<t.requiredCost)return 'progress';t.visibility='opened';neighbors(t,m).forEach(n=>{if(n.visibility==='hidden')n.visibility='preview';});
 if(t.landmark==='tower'&&!t.effectApplied){applyTowerEffect(w,t);chooseDestination(w);return 'tower';}return 'opened';
}
function chooseDestination(w) {
 const remaining=w.tiles.filter(t=>t.landmark==='tower'&&!t.effectApplied);
 remaining.sort((a,b)=>{
   const order=t=>RULES.towers.findIndex(p=>p.x===t.x&&p.y===t.y);
   return order(a)-order(b);
 });
 w.destination=remaining.length?{x:remaining[0].x,y:remaining[0].y}:null;
}
function migrate(w) {
 // Validate the old world before adding attributes; preserve existing terrain and progress.
 validate(w);
 if(w.saveVersion===2)return w;
 w=JSON.parse(JSON.stringify(w));
 const m=index(w);
 for(const p of RULES.towers.slice(1)) {
  const t=m.get(key(p.x,p.y));t.landmark='tower';
  if(t.visibility==='opened') {
   applyTowerEffect(w,t);
  }
 }
 w.saveVersion=2;chooseDestination(w);return validate(w);
}
function validate(w){
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 if(!w||![1,2].includes(w.saveVersion)||w.worldVersion!==1||w.phase!==1||!finite(w.savedAt)||!finite(w.lastCalculatedAt)||!finite(w.points)||w.points<0||w.points>1000||typeof w.introduced!=='boolean'||!Array.isArray(w.tiles)||w.tiles.length!==3721)throw Error('Invalid save data');
 const seen=new Set();
 for(const t of w.tiles){if(!Number.isInteger(t.x)||!Number.isInteger(t.y)||Math.abs(t.x)>30||Math.abs(t.y)>30||seen.has(key(t.x,t.y))||!Object.hasOwn(RULES.costs,t.kind)||!['hidden','preview','opened'].includes(t.visibility)||!Number.isInteger(t.requiredCost)||t.requiredCost<1||!finite(t.developmentProgress)||t.developmentProgress<0||t.developmentProgress>t.requiredCost||typeof t.road!=='boolean'||typeof t.effectApplied!=='boolean'||!finite(t.seed)||![null,'tower','spring','ruins'].includes(t.landmark)||t.visibility==='opened'&&t.developmentProgress!==t.requiredCost||t.effectApplied&&(t.landmark!=='tower'||t.visibility!=='opened'))throw Error('Invalid save data');seen.add(key(t.x,t.y));}
 const m=index(w);if(m.get('0,0').visibility!=='opened'||JSON.stringify(w.bounds)!==JSON.stringify({minX:-30,maxX:30,minY:-30,maxY:30})||!finite(w.seed)||w.generatorVersion!==1)throw Error('Invalid save data');
 for(const [name,x,y] of [['spring',6,-5],['ruins',10,-7]])if(w.tiles.filter(t=>t.landmark===name).length!==1||m.get(key(x,y)).landmark!==name)throw Error('Invalid save data');
 const towers=w.tiles.filter(t=>t.landmark==='tower');
 if(w.saveVersion===1) {if(towers.length!==1||m.get('0,-3').landmark!=='tower')throw Error('Invalid save data');}
 else {if(towers.length!==5||!RULES.towers.slice(1).every(p=>m.get(key(p.x,p.y)).landmark==='tower')||!['0,-7','0,-3'].some(k=>m.get(k).landmark==='tower'))throw Error('Invalid save data');}
 if(w.destination!==null&&(!w.destination||!Number.isInteger(w.destination.x)||!Number.isInteger(w.destination.y)||m.get(key(w.destination.x,w.destination.y))?.landmark!=='tower'||m.get(key(w.destination.x,w.destination.y)).effectApplied))throw Error('Invalid save data');
 if(w.destination===null&&towers.some(t=>!t.effectApplied))throw Error('Invalid save data');
 for(const k of ['wood','rock','metal'])if(!finite(w.resources?.[k])||w.resources[k]<0)throw Error('Invalid save data');
 for(const k of ['inn','well','workshop'])if(w.facilities?.[k]!==0)throw Error('Invalid save data');return w;
}
globalThis.TapWorld={RULES,create,index,eligible,settle,develop,validate,migrate};
})();
