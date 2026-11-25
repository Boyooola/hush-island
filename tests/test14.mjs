// Butterflies, the warm stone, rain, the hull.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
await page.goto('http://localhost:8765/index.html');
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__ember.lockQuality(); window.__ember.setIdentity(0, 0); });
await page.click('#enter');
await page.waitForTimeout(3000);
const ev = (fn, a) => page.evaluate(fn, a);
const acts = () => ev(() => window.__ember.actions);
const log = () => ev(() => [...document.querySelectorAll('#log .line')].slice(-3).map((l) => l.textContent));
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
await ev(() => { window.__ember.setHour(12); window.__ember.setRain(0); });
// Butterflies.
const mdw = await ev(() => { const m = window.__ember.life.meadowNear(0, 0).meadow; return m ? { x: m.x, z: m.z } : null; });
console.log('meadow', JSON.stringify(mdw), 'stone', JSON.stringify(await ev(() => window.__ember.life.stone)));
await ev((m) => { const e = window.__ember; e.teleport(m.x + 0.8, m.z + 0.6, 0); e.cam(0.7, 0.25, 4.2); }, mdw);
await page.waitForTimeout(1500);
ok('meadow offers a pounce', (await acts()).includes('Pounce at the butterflies'), JSON.stringify(await acts()));
await page.screenshot({ path: 'shots/w1-butterflies.png' });
for (let i = 0; i < 60 && !(await ev(() => window.__ember.butterfly)); i++) await page.waitForTimeout(500);
ok('a butterfly lands on a still animal', await ev(() => window.__ember.butterfly), JSON.stringify(await log()));
await ev(() => window.__ember.cam(2.4, 0.15, 2.0));
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/w2-nose.png', clip: { x: 340, y: 240, width: 600, height: 450 } });
// Stone.
await ev(() => { const e = window.__ember, s = e.life.stone; e.teleport(s.x + 1.2, s.z + 0.8, 0); e.cam(0.5, 0.35, 5); });
await page.waitForTimeout(900);
ok('butterfly leaves when you move', !(await ev(() => window.__ember.butterfly)));
ok('stone offers a place to lie', (await acts()).includes('Lie on the warm stone'), JSON.stringify(await acts()));
await ev(() => { const e = window.__ember; e.run(e.actions.indexOf('Lie on the warm stone')); });
const w0 = await ev(() => window.__ember.warmth);
await page.waitForTimeout(19000);
ok('stone warms you by day', (await ev(() => window.__ember.warmth)) > w0 + 0.03 && (await log()).some((l) => l.includes('warm from the sun')), JSON.stringify(await log()));
await page.screenshot({ path: 'shots/w3-stone.png' });
// Rain.
await ev(() => { const e = window.__ember; e.standUp(); e.setRain(1); e.teleport(4.5, 21, Math.PI); e.cam(0.25, 0.22, 8); e.wet = 0; });
await page.waitForTimeout(3500);
ok('rain is announced', (await log()).some((l) => l.includes('Rain is coming in')), JSON.stringify(await log()));
await page.screenshot({ path: 'shots/w4-rain-day.png' });
ok('rain wets a coat in the open', (await ev(() => window.__ember.wet)) > 0.05, 'wet ' + (await ev(() => window.__ember.wet)).toFixed(2));
const tree = await ev(() => { const e = window.__ember; const c = e.world.trees.sort((a, b) => Math.hypot(a.x - e.me.x, a.z - e.me.z) - Math.hypot(b.x - e.me.x, b.z - e.me.z))[0]; return c; });
await ev((c) => { const e = window.__ember; e.teleport(c.x + c.r * 0.45, c.z, 0); e.wet = 0.3; }, tree);
await page.waitForTimeout(3000);
ok('a tree keeps the rain off', (await ev(() => window.__ember.wet)) <= 0.3, 'wet ' + (await ev(() => window.__ember.wet)).toFixed(2));
await ev(() => { const e = window.__ember; e.setHour(0.5); e.teleport(2.0, -3.4, 0); e.cam(2.3, 0.3, 6); });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/w5-rain-night.png' });
// Hull.
await ev(() => { const e = window.__ember, s = e.yard.site; e.setRain(0); e.setHour(13); e.teleport(s.x, s.z, 0); e.yard.setProgress(70); e.cam(2.62 + Math.PI / 2 + 0.9, 0.3, 7.5); });
await page.waitForTimeout(2200);
await page.screenshot({ path: 'shots/w6-hull.png' });
console.log(errors.length ? errors.slice(0, 6).join('\n') : 'no errors');
await browser.close();
