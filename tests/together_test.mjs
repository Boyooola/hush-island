import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const errs = []; let fails = 0;
const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const S = '/home/claude/ember-isle/shots/';
const visitor = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
  const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => errs.push(name + ': ' + e.message));
  await p.goto('http://localhost:8787/far', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
  await p.evaluate(() => { window.__ember.lockQuality(); window.__ember.idleAfter = 3600000; window.__ember.setHour(11); window.__ember.setRain(0); window.__ember.setFog(false); });
  await p.click('#pick-animal button:nth-child(1)'); await p.click('#rename'); await p.fill('#name-input', name); await p.click('#name-form button'); await p.waitForTimeout(300); await p.click('#enter'); await p.waitForTimeout(5000);
  return p;
};
const go = async (p, x, z, wait = 3000, cam = [0.6, 0.5, 9]) => { await p.evaluate(([x, z, cam]) => { const e = window.__ember; e.teleport(x, z, 0); e.cam(...cam); }, [x, z, cam]); await p.waitForTimeout(wait); };
const run = (p, label) => p.evaluate((label) => { const e = window.__ember, i = e.actions.indexOf(label); if (i < 0) return e.actions.join(' | '); e.run(i); return 'ok'; }, label);
const log = (p, n = 5) => p.evaluate((n) => window.__ember.log.slice(-n).join(' || '), n);
const quests = (p) => p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ember.quests') || '{}')));
const goal = (p) => p.evaluate(() => { const e = window.__ember.goal; return e ? `${e.text} @ ${e.x.toFixed(0)},${e.z.toFixed(0)}` : ''; });
const a = await visitor('Mira');
// one quest in the panel, an arrow, a mark over the Mapmaker
const panel = await a.evaluate(() => [...document.querySelectorAll('#tasks-list li')].map((l) => l.textContent));
ok(panel.length === 2 && /Greet the Mapmaker/.test(panel[1]), 'the panel shows the current quest and no others', panel.join(' | '));
ok(/Greet the Mapmaker @/.test(await goal(a)) && await a.evaluate(() => document.getElementById('goal-arrow').style.display !== 'none'), 'an arrow points to it', await goal(a));
const W = await a.evaluate(() => { const w = window.__ember.world; return { m: { x: w.mapmaker.x, z: w.mapmaker.z }, bell: { x: w.flats.bell.x, z: w.flats.bell.z }, stone: { x: w.stones[2].x, z: w.stones[2].z }, src: w.sources.find((q) => q.kind === 'stone') }; });
await go(a, W.m.x + 2, W.m.z + 1.2, 3000, [0.9, 0.2, 7]); await a.screenshot({ path: S + 't1.png' });
await run(a, 'Greet the Mapmaker'); await a.waitForTimeout(11000);
ok(/Look at the map/.test(await goal(a)), 'the arrow moves on to the next quest', await goal(a));
const b = await visitor('Odo');
// the lantern, shared
await go(a, -160, -79, 6000, [0.6, 0.4, 7]); await go(b, -161.2, -80, 6000, [0.6, 0.4, 7]);
await a.evaluate(() => window.__ember.setLamp(true)); await a.waitForTimeout(600); await a.evaluate(() => window.__ember.teleport(-162, -80.5, 0)); await a.waitForTimeout(600); await a.evaluate(() => window.__ember.teleport(-164.5, -82.5, 0)); await b.waitForTimeout(6000);
await b.screenshot({ path: S + 't2.png' });
ok(/somebody else's light/.test(await log(b, 8)), 'the second visitor walks in the first one\'s light', (await log(b, 2)).slice(0, 160));
ok(/lighting the way for more than you/.test(await log(a, 8)), 'and the carrier is told');
const pn = await b.evaluate(() => { const q = window.__ember.world.paintings[0]; return { x: q.x, z: q.z }; });
await go(a, pn.x + 1.5, pn.z + 1.2, 2500); await go(b, pn.x + 1.2, pn.z - 1.4, 5000);
ok((await run(b, 'Look at the painted stone')) === 'ok', 'a painted stone can be read by somebody else\'s lantern', await run(b, 'zz')); await b.waitForTimeout(600); await b.keyboard.press('Escape');
// the bell and the stones
await go(a, W.bell.x + 1.2, W.bell.z + 0.6, 3000); await run(a, 'Pick up the page'); await a.waitForTimeout(1200); await a.keyboard.press('Escape');
const rb = await run(a, 'Ring the bell'); await b.waitForTimeout(4000);
ok(rb === 'ok' && /From the flats, a bell/.test(await log(b, 6)), 'a bell rung by one visitor is heard by the other', rb + ' ' + (await log(b, 1)).slice(0, 120));
await go(b, W.stone.x + 5.5, W.stone.z + 3, 4000); await go(a, W.stone.x + 1.3, W.stone.z + 0.6, 4000);
const ts = await run(a, 'Touch the standing stone'); await b.waitForTimeout(12000);
ok(ts === 'ok' && (await quests(b)).includes('lr-t-stone'), 'a stone sounded by one counts for the other in the ring', ts + ' ' + (await quests(b)).join());
// two at a source
await go(a, W.src.x + 1.9, W.src.z + 0.6, 3000); await go(b, W.src.x + 1.5, W.src.z - 1.6, 4000);
await run(a, 'Take a stone from the heap'); await a.waitForTimeout(1500);
ok((await a.evaluate(() => window.__ember.light.bag.stone)) === 2, 'with company a go fills two places');
console.log(' ', (await quests(a)).join(), '|', (await quests(b)).join());
console.log(errs.length ? [...new Set(errs)].slice(0, 5).join('\n') : 'no page errors', fails ? `${fails} FAILED` : '');
await browser.close();
