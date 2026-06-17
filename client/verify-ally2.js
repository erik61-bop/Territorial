const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function join(b, yLo, yHi) {
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto('http://localhost:8082', { waitUntil:'networkidle2', timeout:120000 });
  await sleep(3500);
  const play = await p.evaluate(()=>{const el=[...document.querySelectorAll('div,span')].find(e=>e.textContent&&e.textContent.includes('▶')&&e.textContent.includes('Play'));const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
  await p.mouse.click(play.x, play.y);
  for (let i=0;i<40;i++){ if(await p.evaluate(()=>{const g=window.__game.getState();return g.connected&&g.map&&g.snap;}))break; await sleep(500); }
  const click = await p.evaluate((yl,yh)=>{const g=window.__game.getState(),m=g.map,s=g.snap;for(let y=yl;y<yh;y++)for(let x=14;x<46;x++){const i=y*m.width+x;if(s.owner[i]===-1)return{x:x*8+4,y:y*8+4};}return null;}, yLo, yHi);
  await p.mouse.click(click.x, click.y);
  for (let i=0;i<30;i++){ if(await p.evaluate(()=>window.__game.getState().snap.land[window.__game.getState().playerId]>0))break; await sleep(400); }
  const id = await p.evaluate(()=>window.__game.getState().playerId);
  return { p, id };
}
(async () => {
  const b = await puppeteer.launch({ executablePath:'/usr/bin/google-chrome', headless:'new',
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const A = await join(b, 14, 28);
  const B = await join(b, 32, 46);
  console.log('A=P'+A.id+' B=P'+B.id);
  // A requests alliance with B
  await A.p.evaluate((t)=>window.__net.sendChat('ally_request', t), B.id);
  await sleep(1500);
  // B accepts
  await B.p.evaluate((t)=>window.__net.sendDiplo('ACCEPT_ALLY', t), A.id);
  let relA=0;
  for (let i=0;i<30;i++){ relA = await A.p.evaluate((t)=>window.__game.getState().snap.rel[window.__game.getState().playerId][t], B.id); if(relA===2)break; await sleep(400); }
  await sleep(600);
  await A.p.screenshot({ path:'/tmp/territorial8.png' });
  console.log('A.rel[B]='+relA);
  console.log(relA===2 ? 'ALLY E2E: PASS' : 'ALLY E2E: FAIL');
  await b.close();
})();
