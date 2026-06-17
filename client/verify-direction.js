const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath:'/usr/bin/google-chrome', headless:'new',
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({width:1280,height:800});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8082', { waitUntil:'networkidle2', timeout:120000 });
  await sleep(3500);
  const play = await p.evaluate(()=>{const el=[...document.querySelectorAll('div,span')].find(e=>e.textContent&&e.textContent.includes('▶')&&e.textContent.includes('Play'));const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
  await p.mouse.click(play.x, play.y);
  for (let i=0;i<40;i++){ if(await p.evaluate(()=>{const g=window.__game.getState();return g.connected&&g.map&&g.snap;}))break; await sleep(500); }
  // spawn near map centre
  const click = await p.evaluate(()=>{const g=window.__game.getState(),m=g.map,s=g.snap;const cx=Math.floor(m.width/2),cy=Math.floor(m.height/2);for(let r=0;r<10;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const x=cx+dx,y=cy+dy;if(x>=0&&y>=0&&x<m.width&&y<m.height&&s.owner[y*m.width+x]===-1)return{x:x*8+4,y:y*8+4};}return null;});
  await p.mouse.click(click.x, click.y);
  for (let i=0;i<30;i++){ if(await p.evaluate(()=>window.__game.getState().snap.land[window.__game.getState().playerId]>0))break; await sleep(400); }
  // measure east extent, then expand EAST (toward a far east cell on capital's row) repeatedly
  const before = await p.evaluate(()=>{const g=window.__game.getState(),m=g.map,s=g.snap,me=g.playerId;let maxx=-1;for(let i=0;i<s.owner.length;i++)if(s.owner[i]===me){const x=i%m.width;if(x>maxx)maxx=x;}const cap=s.capitals[me];return {maxx,capx:cap%m.width,capy:Math.floor(cap/m.width),w:m.width};});
  const eastTarget = (before.capy*before.w) + Math.min(before.w-1, before.capx+12);
  for (let i=0;i<14;i++){ await p.evaluate((tc)=>window.__net.sendAction(-1,0.7,tc), eastTarget); await sleep(160); }
  await sleep(400);
  const after = await p.evaluate(()=>{const g=window.__game.getState(),m=g.map,s=g.snap,me=g.playerId;let maxx=-1;for(let i=0;i<s.owner.length;i++)if(s.owner[i]===me){const x=i%m.width;if(x>maxx)maxx=x;}return {maxx,land:s.land[me]};});
  console.log('before maxx='+before.maxx+' after maxx='+after.maxx+' land='+after.land+' errors='+errs.length);
  console.log((after.maxx>before.maxx && after.land>0 && errs.length===0)?'DIRECTION: PASS (territory pushed east)':'DIRECTION: FAIL');
  await b.close();
})();
