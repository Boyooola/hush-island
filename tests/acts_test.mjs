import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const errs = []; let fails = 0;
const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const visitor = async (species) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }); await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
  const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8787/', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
  await p.evaluate((n) => { const e = window.__ember; e.lockQuality(); e.idleAfter = 3600000; e.setHour(11); e.setRain(0); document.querySelector(`#pick-animal button:nth-child(${n})`).click(); document.querySelector('#enter').click(); }, species); await p.waitForTimeout(6000);
  return p;
};
const acts = (p) => p.evaluate(() => window.__ember.actions.filter(Boolean));
const at = async (p, x, z, wait = 2500) => { await p.evaluate(([x, z]) => window.__ember.teleport(x, z, 0), [x, z]); await p.waitForTimeout(wait); };
const a = await visitor(6), b = await visitor(1);      // a stag, and a shiba to stand beside it
const L = await a.evaluate(() => { const e = window.__ember; return { dock: [e.dockEnd ? e.dockEnd.x : 45.2, 0], yard: [e.yard.site.x, e.yard.site.z] }; });
// a stag can fish
await at(a, 45.3, 0, 3000); let A = await acts(a);
ok(A[0] === 'Stamp at the fish', 'at the end of the dock a stag is offered the fish', A.join(' | '));
let caught = false; for (let i = 0; i < 14 && !caught; i++) { await a.evaluate(() => { const e = window.__ember, k = e.actions.indexOf('Stamp at the fish'); if (k >= 0) e.run(k); }); await a.waitForTimeout(2600); caught = await a.evaluate(() => /You caught/.test(window.__ember.log.slice(-4).join(' '))); }
ok(caught, 'and catches one', await a.evaluate(() => window.__ember.log.slice(-1)[0]));
await a.evaluate(() => { const e = window.__ember, k = e.actions.indexOf('Eat the fish'); if (k >= 0) e.run(k); }); await a.waitForTimeout(1500);
// with somebody beside you, the place still comes first
await at(b, 44.6, 0.7, 3500); await at(a, 45.3, 0, 3500); A = await acts(a);
ok(A[0] === 'Stamp at the fish' && A.some((x) => /^Greet /.test(x)), 'with another animal beside you the fish is still first, and they can still be greeted', A.join(' | '));
await at(b, L.yard[0] + 1.6, L.yard[1] + 1.2, 3000); await at(a, L.yard[0] + 1.2, L.yard[1] - 1.0, 3500); A = await acts(a);
ok(A.includes('Look over the boat') && !/^Greet|^Sniff/.test(A[0]), 'the boat can be looked over with company', A.join(' | '));
await at(b, -5.6, 5.4, 3000); await at(a, -5.2, 4.4, 3500); A = await acts(a);
ok(/marks on the driftwood/.test(A[0] || ''), 'the driftwood wall can be read with company, and tracks do not come first', A.join(' | '));
ok(A.length <= 3, 'never more than three things are offered', A.length);
console.log(errs.length ? [...new Set(errs)].slice(0, 5).join('\n') : 'no page errors', fails ? `${fails} FAILED` : '');
await browser.close();
