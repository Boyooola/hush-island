// Fish at the dock, wet coats, falling stars.
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

// Fish.
await ev(() => { const e = window.__ember; e.teleport(45.7, 0, Math.PI / 2); e.cam(-0.9, 0.5, 4.5); });
await page.waitForTimeout(1500);
ok('dock end offers the fish', (await acts())[0] === 'Paw at the fish', JSON.stringify(await acts()));
await page.screenshot({ path: 'shots/f1-dock.png' });
let caught = false;
for (let i = 0; i < 160 && !caught; i++) {
  const near = await ev(() => { const l = window.__ember.life, s = l.fishingSpot; return l.fish.some((f) => !f.gone && f.scare < 0.2 && Math.hypot(f.x - s.x, f.z - s.z) < 0.75); });
  if (near && !(await ev(() => window.__ember.me.emote))) { await ev(() => window.__ember.run(0)); await page.waitForTimeout(450); await page.screenshot({ path: 'shots/f2-splash.png' }); await page.waitForTimeout(900); caught = (await ev(() => window.__ember.held)) === 2; }
  else await page.waitForTimeout(120);
}
ok('a fish can be caught', caught, JSON.stringify(await log()));
await page.waitForTimeout(600);
await ev(() => window.__ember.cam(1.2, 0.15, 2.4));
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/f3-fish-mouth.png' });
ok('carrying a fish offers to eat it', (await acts())[0] === 'Eat the fish', JSON.stringify(await acts()));
const kp = await ev(() => { const k = window.__ember.keeper; return [k.x, k.z]; });
await ev((kp) => { const d = Math.hypot(kp[0], kp[1]); window.__ember.teleport(kp[0] * (1 + 2.2 / d), kp[1] * (1 + 2.2 / d)); }, kp);
await page.waitForTimeout(600);
ok('near the keeper offers to leave it', (await acts())[0] === 'Leave the fish for the Keeper', JSON.stringify(await acts()));
await ev(() => window.__ember.run(0));
await page.waitForTimeout(2600);
ok('keeper thanks you', (await log()).some((l) => l.startsWith('Keeper')) && (await ev(() => window.__ember.held)) === 0, JSON.stringify(await log()));

// Wet coat.
const wz = await ev(() => { const e = window.__ember; for (let z = 24; z < 40; z += 0.25) if (e.world.surface(0.5, z) === 'water') return z + 0.6; return null; });
await ev((wz) => { const e = window.__ember; e.teleport(0.5, wz, 0); e.cam(0.6, 0.2, 2.8); }, wz);
await page.waitForTimeout(3500);
const w1 = await ev(() => window.__ember.wet);
ok('wading soaks the coat', w1 > 0.5, 'wet ' + w1.toFixed(2) + ' at z ' + wz);
await ev(() => { window.__ember.wet = 1; });
await ev((wz) => { const e = window.__ember; e.teleport(0.5, wz - 3.5, 0); }, wz);
await page.waitForTimeout(1500);
ok('told to shake it off', (await log()).some((l) => l.includes('soaked')), JSON.stringify(await log()));
await page.screenshot({ path: 'shots/f4-wet.png', clip: { x: 340, y: 270, width: 600, height: 450 } });
await ev(() => window.__ember.playEmote('shake'));
await page.waitForTimeout(350);
await page.screenshot({ path: 'shots/f5-shake.png', clip: { x: 340, y: 270, width: 600, height: 450 } });
await page.waitForTimeout(1500);
ok('shaking dries the coat', (await ev(() => window.__ember.wet)) < 0.2);

// Falling stars.
await ev(() => { const e = window.__ember; e.teleport(-15, -11, 0); });
await page.waitForTimeout(700);
await ev(() => { const e = window.__ember; e.run(0); e.life.forceShower(30000); });
await page.waitForTimeout(2500);
ok('shower is announced', (await log()).some((l) => l.includes('Stars have started to fall')), JSON.stringify(await log()));
let best = 0;
for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(350);
  const n = await ev(() => { let n = 0; window.__ember.world; window.__ember.camera.parent; return window.__ember.life.shower ? 1 : 0; });
  await page.screenshot({ path: `shots/f6-sky${i % 4}.png` });
}
console.log('next real shower in', Math.round((await ev(() => 0)) ), '(see keeper)');
console.log(errors.length ? errors.slice(0, 6).join('\n') : 'no errors');
await browser.close();
