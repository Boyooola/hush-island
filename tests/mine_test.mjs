// Nothing of a visitor's is kept in the browser but their key: the rest is with the island.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const errs = []; let fails = 0;
const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const open = async (init) => { const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } }); await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort()); if (init) await ctx.addInitScript(init); const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => errs.push(e.message)); return p; };
const enter = async (p) => { await p.waitForTimeout(4000); await p.evaluate(() => { const e = window.__ember; e.lockQuality(); e.idleAfter = 3600000; document.querySelector('#pick-animal button:nth-child(1)').click(); document.querySelector('#enter').click(); }); await p.waitForTimeout(8000); };
const kept = (p) => p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('ember.') || k.startsWith('hush.')).sort().join(','));
const a = await open(); await a.goto('http://localhost:8787/?live', { waitUntil: 'domcontentloaded' }); await enter(a);
await a.evaluate(() => { window.__ember.give('shell', 3, true); }); await a.waitForTimeout(6000);
ok((await kept(a)) === 'ember.key', 'the browser holds the key and nothing else', await kept(a));
const key = await a.evaluate(() => JSON.parse(localStorage.getItem('ember.key')));
await a.reload({ waitUntil: 'domcontentloaded' }); await enter(a);
ok(await a.evaluate(() => window.__ember.inv.shell === 3 && window.__ember.mine.ok), 'what was carried is there again after a reload, from the island', JSON.stringify(await a.evaluate(() => window.__ember.inv)));
// another device, given the same key
const b = await open(); await b.goto('http://localhost:8787/?live', { waitUntil: 'domcontentloaded' }); await b.waitForTimeout(3000);
await b.evaluate((k) => localStorage.setItem('ember.key', JSON.stringify(k)), key); await b.reload({ waitUntil: 'domcontentloaded' }); await enter(b);
ok(await b.evaluate(() => window.__ember.inv.shell === 3), 'another browser with the same key has the same things');
// a browser that still holds an older visit's storage: taken up once, then cleared
const c = await open(() => { if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('ember.key', JSON.stringify('zz' + Math.random().toString(36).slice(2).padEnd(12, 'a') + 'abcdefghijklmnop')); localStorage.setItem('ember.inv', JSON.stringify({ feather: 4 })); localStorage.setItem('ember.quests', JSON.stringify({ cold: 5 })); } });
await c.goto('http://localhost:8787/?live', { waitUntil: 'domcontentloaded' }); await enter(c);
ok(await c.evaluate(() => window.__ember.inv.feather === 4 && window.__ember.quests.cold === 5), 'what an older visit left in the browser is taken up');
ok((await kept(c)) === 'ember.key', 'and cleared out of the browser', await kept(c));
// which shore: kept with the island too
await a.evaluate(() => { const e = window.__ember; e.setBoat(99999); e.teleport(e.berth.x + 1.5, e.berth.z + 1.5, 0); }); await a.waitForTimeout(3000);
await a.evaluate(() => { const e = window.__ember, i = e.actions.findIndex((x) => x && x.startsWith('Sail for the far shore')); e.run(i); }); await a.waitForTimeout(8000);
await a.evaluate(() => { const e = window.__ember, i = e.actions.findIndex((x) => x && x.startsWith('Cast off now')); if (i >= 0) e.run(i); });
for (let i = 0; i < 60 && !(await a.evaluate(() => window.__ember && window.__ember.isle === 'far' && document.body.classList.contains('playing')).catch(() => false)); i++) await a.waitForTimeout(1000);
ok(await a.evaluate(() => window.__ember.isle === 'far' && location.pathname === '/'), 'the boat lands on Lantern Rock with no address of its own', await a.evaluate(() => location.pathname + ' ' + window.__ember.isle));
await a.waitForTimeout(5000); await a.reload({ waitUntil: 'domcontentloaded' }); await a.waitForTimeout(4000);
ok(await a.evaluate(() => window.__ember.isle === 'far'), 'and a reload is still Lantern Rock');
ok((await kept(a)) === 'ember.key', 'with still nothing but the key in the browser', await kept(a));
ok(errs.length === 0, 'no errors on the page', errs.join(' | '));
console.log(fails ? `FAILED ${fails}` : 'ALL PASS'); await browser.close();
