const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath:'/usr/bin/google-chrome', headless:'new',
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8082', { waitUntil:'networkidle2', timeout:120000 });
  await sleep(3500);
  // Play
  const play = await p.evaluate(() => { const el=[...document.querySelectorAll('div,span')].find(e=>e.textContent&&e.textContent.includes('▶')&&e.textContent.includes('Play')); if(!el)return null; const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; });
  await p.mouse.click(play.x, play.y);
  for (let i=0;i<40;i++){ if(await p.evaluate(()=>{const g=window.__game.getState();return g.connected&&g.map&&g.snap;}))break; await sleep(500); }
  // spawn at a neutral cell (camera default scale 8)
  const click = await p.evaluate(()=>{ const g=window.__game.getState(),m=g.map,s=g.snap; for(let y=14;y<46;y++)for(let x=14;x<46;x++){const i=y*m.width+x; if(s.owner[i]===-1)return{x:x*8+4,y:y*8+4};} return null; });
  if(click) await p.mouse.click(click.x, click.y);
  for (let i=0;i<30;i++){ if(await p.evaluate(()=>window.__game.getState().snap.land[window.__game.getState().playerId]>0))break; await sleep(400); }
  await sleep(1500);
  const info = await p.evaluate(()=>{ const g=window.__game.getState(); const me=g.playerId; const txt=document.body.innerText;
    return { morale:g.snap.morale?.[me], land:g.snap.land[me], legend: txt.includes('Mountain')&&txt.includes('Forest'), hasMoraleText: txt.toLowerCase().includes('morale') }; });
  await p.screenshot({ path:'/tmp/territorial7.png' });
  console.log('INFO:', JSON.stringify(info), 'pageerrors:', errs.length);
  console.log((info.land>0 && info.morale!=null && info.legend && info.hasMoraleText) ? 'DEPTH UI: PASS' : 'DEPTH UI: FAIL');
  await b.close();
})();
