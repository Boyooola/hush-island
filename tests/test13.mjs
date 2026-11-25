// Island time, the sea, the boat yard and the keeper's list.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const part = process.argv[2] || 'a';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
await page.goto('http://localhost:8765/index.html');
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__ember.lockQuality(); window.__ember.setIdentity(2, 0); });
await page.click('#enter');
await page.waitForTimeout(3000);
const ev = (fn, a) => page.evaluate(fn, a);
const acts = () => ev(() => window.__ember.actions);
const log = () => ev(() => [...document.querySelectorAll('#log .line')].slice(-3).map((l) => l.textContent));
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
if (part === 'a') {
  // The same two views at four hours of the island day.
  for (const [h, name] of [[12, 'day'], [6.7, 'dawn'], [18.2, 'dusk'], [0.5, 'night']]) {
    await ev((h) => { const e = window.__ember; e.setHour(h); e.teleport(4.5, 21, Math.PI); e.cam(0.25, 0.22, 8); }, h);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `shots/t-${name}-beach.png` });
    await ev(() => { const e = window.__ember; e.teleport(40, 0, Math.PI / 2); e.cam(-1.9, 0.3, 7); });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `shots/t-${name}-dock.png` });
    console.log(name, await ev(() => document.getElementById('clock').textContent));
  }
}
if (part === 'b') {
  await ev(() => window.__ember.setHour(13));
  const site = await ev(() => window.__ember.yard.site);
  await ev((s) => { const e = window.__ember; e.teleport(s.x, s.z, 0); e.cam(2.6 + Math.PI / 2, 0.3, 9); }, site);
  await page.waitForTimeout(1800);
  console.log('yard at', JSON.stringify(site), 'surface', await ev(() => window.__ember.world.surface(window.__ember.me.x, window.__ember.me.z)));
  ok('yard offers a look at the boat', (await acts())[0] === 'Look over the boat', JSON.stringify(await acts()));
  await page.screenshot({ path: 'shots/y1-yard.png' });
  const pc = await ev(() => window.__ember.yard.pieces[0]);
  await ev((p) => { const e = window.__ember; e.teleport(p.x + 0.6, p.z + 0.3, 0); e.cam(0.6, 0.3, 4); }, pc);
  await page.waitForTimeout(1200);
  ok('driftwood can be picked up', (await acts())[0] === 'Pick up the driftwood', JSON.stringify(await acts()) + ' ' + JSON.stringify(pc));
  await page.screenshot({ path: 'shots/y2-driftwood.png' });
  await ev(() => window.__ember.run(0));
  await page.waitForTimeout(700);
  ok('carried in the mouth', (await ev(() => window.__ember.held)) === 3);
  await ev((s) => { const e = window.__ember; e.teleport(s.x + 0.5, s.z + 0.5, 0); }, site);
  await page.waitForTimeout(700);
  ok('yard takes the driftwood', (await acts())[0] === 'Add the driftwood to the boat', JSON.stringify(await acts()));
  await ev(() => window.__ember.run(0));
  await page.waitForTimeout(1800);
  console.log('     log:', JSON.stringify(await log()), 'boat', await ev(() => window.__ember.boat));
  ok('plank and list count', (await ev(() => window.__ember.boat)) === 3, 'expected 1 plank + 2 for the list');
  await ev(() => { const e = window.__ember; for (let i = 0; i < 20; i++) e.yard.setProgress(60); e.cam(2.6 + Math.PI / 2 + 0.8, 0.35, 8); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'shots/y3-yard-half.png' });
  await ev(() => document.getElementById('btn-help').click());
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'shots/y4-help.png' });
  console.log('     list:', JSON.stringify(await ev(() => [...document.querySelectorAll('#list li')].map((l) => (l.className ? '[x] ' : '[ ] ') + l.textContent))));
}
console.log(errors.length ? errors.slice(0, 6).join('\n') : 'no errors');
await browser.close();
