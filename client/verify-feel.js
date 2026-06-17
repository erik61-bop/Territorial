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
  const play = await p.evaluate(()=>{const el=[...document.querySelectorAll('div,span')].find(e=>e.textContent&&e.textContent.includes('▶')&&e.textContent.includes('Play'));const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
  await p.mouse.click(play.x, play.y);
  for (let i=0;i<40;i++){ if(await p.evaluate(()=>{const g=window.__game.getState();return g.connected&&g.map&&g.snap;}))break; await sleep(500); }
  const click = await p.evaluate(()=>{const g=window.__game.getState(),m=g.map,s=g.snap;for(let y=14;y<46;y++)for(let x=14;x<46;x++){const i=y*m.width+x;if(s.owner[i]===-1)return{x:x*8+4,y:y*8+4};}return null;});
  await p.mouse.click(click.x, click.y);
  for (let i=0;i<30;i++){ if(await p.evaluate(()=>window.__game.getState().snap.land[window.__game.getState().playerId]>0))break; await sleep(400); }
  // expand aggressively to trigger capture flashes, screenshot mid-expansion
  for (let i=0;i<6;i++){ await p.evaluate(()=>window.__net.sendAction(-1, 0.6)); await sleep(180); }
  await sleep(120);
  await p.screenshot({ path:'/tmp/territorial9.png' });
  const info = await p.evaluate(()=>{ const g=window.__game.getState(); const txt=document.body.innerText; return { land:g.snap.land[g.playerId], hasMute: txt.includes('🔊')||txt.includes('🔇') }; });
  console.log('INFO:', JSON.stringify(info), 'pageerrors:', errs.length);
  console.log((info.land>0 && info.hasMute && errs.length===0) ? 'FEEL: PASS' : 'FEEL: FAIL');
  await b.close();
})();
