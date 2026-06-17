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
  const play = await p.evaluate(()=>{const el=[...document.querySelectorAll('div,span')].find(e=>e.textContent&&e.textContent.includes('▶')&&e.textContent.includes('Play'));if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
  await p.mouse.click(play.x, play.y);
  for (let i=0;i<40;i++){ if(await p.evaluate(()=>{const g=window.__game.getState();return g.connected&&g.map&&g.snap;}))break; await sleep(500); }
  // spawn
  const click = await p.evaluate(()=>{const g=window.__game.getState(),m=g.map,s=g.snap;for(let y=14;y<46;y++)for(let x=14;x<46;x++){const i=y*m.width+x;if(s.owner[i]===-1)return{x:x*8+4,y:y*8+4};}return null;});
  await p.mouse.click(click.x, click.y);
  for (let i=0;i<30;i++){ if(await p.evaluate(()=>window.__game.getState().snap.land[window.__game.getState().playerId]>0))break; await sleep(400); }
  // pick a bot (alive, not me) and send an alliance request
  const target = await p.evaluate(()=>{const g=window.__game.getState();const me=g.playerId;const s=g.snap;for(let q=0;q<s.alive.length;q++){if(q!==me&&s.alive[q]&&!s.human[q]){window.__net.sendChat('ally_request', q);return q;}}return -1;});
  // wait for the bot to accept (rel becomes 2)
  let rel=0;
  for (let i=0;i<30;i++){ rel = await p.evaluate((t)=>{const g=window.__game.getState();return g.snap.rel[g.playerId][t];}, target); if(rel===2)break; await sleep(400); }
  await sleep(800);
  await p.screenshot({ path:'/tmp/territorial8.png' });
  console.log('allied with P'+target+' rel='+rel+' pageerrors='+errs.length);
  console.log(rel===2 ? 'ALLY E2E: PASS' : 'ALLY E2E: FAIL');
  await b.close();
})();
