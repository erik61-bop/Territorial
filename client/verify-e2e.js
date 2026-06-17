// Headless end-to-end check: load the exported web app in Chrome, let it connect to the
// running game server, and assert the client receives live game state (welcome + map + ticks).
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  const url = process.argv[2] || 'http://localhost:5050';
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });

  // Poll the exposed store for up to 20s for a connected socket + advancing ticks.
  let snapshot = null;
  for (let i = 0; i < 40; i++) {
    snapshot = await page.evaluate(() => {
      const g = window.__game && window.__game.getState ? window.__game.getState() : null;
      if (!g) return null;
      return {
        connected: g.connected,
        playerId: g.playerId,
        hasMap: !!g.map,
        mapW: g.map ? g.map.width : 0,
        tick: g.snap ? g.snap.tick : -1,
        myLand: g.snap && g.playerId >= 0 ? g.snap.land[g.playerId] : -1,
        canvasW: (() => { const c = document.querySelector('canvas'); return c ? c.width : 0; })(),
      };
    });
    if (snapshot && snapshot.connected && snapshot.hasMap && snapshot.tick > 5 && snapshot.canvasW > 0) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('RESULT:', JSON.stringify(snapshot, null, 2));
  if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.slice(0, 8).join('\n'));

  const ok =
    snapshot && snapshot.connected && snapshot.hasMap && snapshot.tick > 5 &&
    snapshot.playerId >= 0 && snapshot.canvasW > 0;
  console.log(ok ? 'E2E: PASS — client connected and is receiving live game state'
                 : 'E2E: FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('E2E ERROR:', e.message); process.exit(2); });
