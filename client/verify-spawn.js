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

  // 1) Menu: click Play
  const play = await p.evaluate(() => {
    const el = [...document.querySelectorAll('div,span')].find(e => e.textContent && e.textContent.includes('Play') && e.textContent.includes('▶'));
    if (!el) return null; const r = el.getBoundingClientRect(); return { x:r.x+r.width/2, y:r.y+r.height/2 };
  });
  if (!play) { console.log('FAIL: no Play button'); await b.close(); process.exit(1); }
  await p.mouse.click(play.x, play.y);

  // 2) wait for connect + first snapshot
  for (let i=0;i<40;i++){ const ok = await p.evaluate(()=>{const g=window.__game.getState();return g.connected&&g.map&&g.snap;}); if(ok)break; await sleep(500); }
  const beforeSpawn = await p.evaluate(()=>{const g=window.__game.getState();return {pid:g.playerId,land:g.snap.land[g.playerId]};});

  // 3) find a neutral cell near centre and click it (camera default scale 8, tx/ty 0 in spawn mode)
  const click = await p.evaluate(()=>{
    const g=window.__game.getState(); const m=g.map,s=g.snap;
    for (let y=12;y<48;y++) for (let x=12;x<48;x++){ const i=y*m.width+x; if(s.owner[i]===-1){ return {x:x*8+4,y:y*8+4,cell:i}; } }
    return null;
  });
  if (click) await p.mouse.click(click.x, click.y);

  // 4) wait for land > 0 (spawned)
  let afterLand=0;
  for (let i=0;i<30;i++){ afterLand = await p.evaluate(()=>{const g=window.__game.getState();return g.snap.land[g.playerId];}); if(afterLand>0)break; await sleep(400); }

  await sleep(1500);
  await p.screenshot({ path:'/tmp/territorial6.png' });
  console.log('BEFORE spawn:', JSON.stringify(beforeSpawn), ' clicked:', JSON.stringify(click), ' AFTER land:', afterLand, ' pageerrors:', errs.length);
  console.log((beforeSpawn.land===0 && afterLand>0) ? 'SPAWN E2E: PASS' : 'SPAWN E2E: FAIL');
  await b.close();
})();
