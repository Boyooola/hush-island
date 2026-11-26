import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } }); await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:8787/index.html', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
await p.evaluate(() => localStorage.setItem('ember.starter', '4')); await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
await p.evaluate(() => { window.__ember.lockQuality(); window.__ember.idleAfter = 3600000; }); await p.click('#enter'); await p.waitForTimeout(5000);
await p.evaluate(() => { const e = window.__ember; e.setBoat(120); e.teleport(e.yard.plankFoot.x, e.yard.plankFoot.z, 0); }); await p.waitForTimeout(1500);
await p.evaluate(() => window.__ember.boardBoat());
for (let i = 0; i < 80 && !(await p.evaluate(() => window.__ember.voyage.seated)); i++) await p.waitForTimeout(400);
await p.evaluate(() => { window.__ember.voyageCast = window.__ember.timeNow() - 36000; }); await p.waitForTimeout(1500);
let leaps = 0, was = 0, before = 0, late = 0; const t0 = Date.now();
while (Date.now() - t0 < 24000) {
  const s = await p.evaluate(() => { const e = window.__ember; return [e.voyage.dolphins, (e.timeNow() - e.voyage.cast) / 1000 - 40]; });
  if (s[0] > was) leaps += s[0] - was; was = s[0];
  if (s[1] < -0.3 && s[0]) before++; if (s[1] > 11 && s[0]) late++;
  await p.waitForTimeout(150);
}
const log = await p.evaluate(() => window.__ember.log.filter((l) => /Dolphins!/.test(l)).length);
ok('the dolphins come once: a few leaps, none before their time and none after', leaps >= 2 && leaps <= 4 && before === 0 && late === 0, `leaps ${leaps}, early ${before}, late ${late}`);
ok('and it is said once', log === 1, String(log));
console.log(errs.length ? errs.join('|') : 'no page errors');
await browser.close();
