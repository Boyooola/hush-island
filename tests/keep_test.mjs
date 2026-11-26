import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const errs = []; let fails = 0;
const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const S = '/home/claude/ember-isle/shots/';
const open = async (ctx, path = 'far') => { const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => errs.push(e.message)); await p.goto('http://localhost:8787/' + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
  await p.evaluate(() => { const e = window.__ember; e.lockQuality(); e.idleAfter = 3600000; e.setHour(11); e.setRain(0); if (e.setFog) e.setFog(false); document.querySelector('#pick-animal button:nth-child(1)').click(); document.querySelector('#enter').click(); }); await p.waitForTimeout(7000); return p; };
const mk = async () => { const c = await browser.newContext({ viewport: { width: 1280, height: 720 } }); await c.route((u) => u.hostname !== 'localhost', (r) => r.abort()); return c; };
const run = (p, label) => p.evaluate((label) => { const e = window.__ember, i = e.actions.findIndex((a) => a && a.startsWith(label)); if (i < 0) return e.actions.join(' | '); e.run(i); return 'ok'; }, label);
const at = async (p, x, z, wait = 3000) => { await p.evaluate(([x, z]) => window.__ember.teleport(x, z, 0), [x, z]); await p.waitForTimeout(wait); };
const c1 = await mk(), a = await open(c1);
const W = await a.evaluate(() => { const w = window.__ember.world; return { ways: w.ways.map((q) => ({ id: q.id, x: q.x, z: q.z })), two: w.chests.find((c) => c.id === 'c-two'), land: w.chests.find((c) => c.id === 'c-landing') }; });
// waystones
const wd = W.ways.find((q) => q.id === 'woods'), pt = W.ways.find((q) => q.id === 'point');
await at(a, wd.x + 1.4, wd.z + 0.6); await a.screenshot({ path: S + 'k1.png' });
ok((await run(a, 'Light the lantern')) === 'ok', 'a lantern post can be lit', await run(a, 'zz')); await a.waitForTimeout(1200);
await at(a, pt.x + 1.4, pt.z + 0.6); ok((await run(a, 'Light the lantern')) === 'ok', 'and another'); await a.waitForTimeout(1200);
ok((await run(a, 'Follow the lit way')) === 'ok', 'a lit post offers the way'); await a.waitForTimeout(700);
const rows = await a.evaluate(() => [...document.querySelectorAll('#sheet-body .row')].map((r) => r.textContent)); ok(rows.some((r) => /Whisper Woods/.test(r)) && rows.some((r) => /The Landing/.test(r)), 'it lists the other lit lanterns', rows.join(' | '));
await a.evaluate(() => [...document.querySelectorAll('#sheet-body .row')].find((r) => /Whisper Woods/.test(r.textContent)).click()); await a.waitForTimeout(2500);
ok(await a.evaluate((w) => Math.hypot(window.__ember.me.x - w.x, window.__ember.me.z - w.z) < 3, wd), 'and takes you there');
// first today
ok(await a.evaluate(async () => (await (await fetch('/room/db', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'list', coll: 'today' }) })).json()).rows.length > 0), 'the first to stand somewhere today is recorded');
// the two-handled chest
await at(a, W.two.x + 1.3, W.two.z + 0.5); await run(a, 'Open the chest'); await a.waitForTimeout(700);
ok(/wants another animal/.test(await a.evaluate(() => window.__ember.log.slice(-1)[0])), 'the two-handled chest will not open for one');
// progress kept, and brought back with the key in another browser
await at(a, W.land.x + 1.4, W.land.z + 0.5); await run(a, 'Open the chest'); await a.waitForTimeout(34000);
const key = await a.evaluate(() => window.__ember.key), had = await a.evaluate(() => ({ hat: window.__ember.inv.strawhat, ways: [...window.__ember.waysLit].sort().join() }));
await a.evaluate(() => window.__ember.moment('A line held on the picture, for the turning points of the story.', 6)); await a.waitForTimeout(1600); await a.screenshot({ path: S + 'k2.png' });
const c2 = await mk(), b = await open(c2);
const twoOk = await (async () => { await at(b, W.two.x - 1.2, W.two.z + 0.4, 3500); await at(a, W.two.x + 1.3, W.two.z + 0.5, 14000); const r = await run(a, 'Open the chest'); await a.waitForTimeout(1500); return r === 'ok' && await a.evaluate(() => window.__ember.inv.bell === 1); })();
ok(twoOk, 'with a second animal beside it, the two-handled chest opens', await a.evaluate(() => window.__ember.log.slice(-2).join(' || ')));
ok(await b.evaluate(() => !window.__ember.inv.strawhat), 'a new browser starts with nothing');
await b.evaluate((k) => { document.getElementById('key-in').value = k; document.getElementById('key-use').click(); }, key); await b.waitForTimeout(9000);
await b.evaluate(() => { const e = window.__ember; e.lockQuality(); document.querySelector('#pick-animal button:nth-child(1)').click(); document.querySelector('#enter').click(); }); await b.waitForTimeout(16000);
await b.waitForTimeout(12000); console.log('  stored:', await b.evaluate(() => [localStorage.getItem('ember.inv'), localStorage.getItem('ember.key').slice(0, 6), sessionStorage.getItem('ember.restored')].join(' ')), key.slice(0, 6));
const got = await b.evaluate(() => ({ hat: window.__ember.inv.strawhat, ways: [...window.__ember.waysLit].sort().join(), chest: window.__ember.opened.has('c-landing') }));
ok(got.hat === 1 && got.ways === had.ways && got.chest, 'with the key, everything comes back in another browser', JSON.stringify(got));
// the phone menu
const c3 = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }); await c3.route((u) => u.hostname !== 'localhost', (r) => r.abort());
const m = await open(c3, ''); ok(await m.evaluate(() => getComputedStyle(document.getElementById('tools')).display === 'none' && getComputedStyle(document.getElementById('btn-menu')).display !== 'none'), 'on a phone the top row is one word');
await m.evaluate(() => document.getElementById('btn-menu').click()); await m.waitForTimeout(500); await m.screenshot({ path: S + 'k3.png' }); ok(await m.evaluate(() => getComputedStyle(document.getElementById('tools')).display === 'flex'), 'which opens the rest');
console.log(errs.length ? [...new Set(errs)].slice(0, 5).join('\n') : 'no page errors', fails ? `${fails} FAILED` : '');
await browser.close();
