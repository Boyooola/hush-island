// Animal actions: resting at the fire, sticks, calls and gestures, warmth.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const part = process.argv[2] || 'a';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
await page.goto('http://localhost:8765/index.html');
await page.waitForTimeout(2500);
await page.evaluate(() => window.__ember.lockQuality());
await page.click('#enter');
await page.waitForTimeout(3000);
const ev = (fn, a) => page.evaluate(fn, a);
const look = async (sp) => { await ev((sp) => window.__ember.setIdentity(sp, 0), sp); for (let k = 0; k < 40 && !(await ev(() => !!window.__ember.me.parts.quad)); k++) await page.waitForTimeout(250); };
const acts = () => ev(() => window.__ember.actions);
const log = () => ev(() => [...document.querySelectorAll('#log .line')].slice(-4).map((l) => l.textContent));
const clip = { x: 340, y: 270, width: 600, height: 450 };
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));

if (part === 'a') {
  // Fire: a husky sits, then lies; warmth builds; the keeper is lying on the ground.
  await look(2);
  await ev(() => { const e = window.__ember; e.setFire(1.0); e.teleport(2.0, -1.6, 0); e.cam(2.3, 0.35, 5.5); });
  await page.waitForTimeout(1500);
  let a = await acts();
  ok('standing by the fire offers to sit', a[0] === 'Sit by the fire', JSON.stringify(a));
  await ev(() => window.__ember.run(0));
  await page.waitForTimeout(2500);
  a = await acts();
  ok('sitting offers lie down and get up', a[0] === 'Lie down' && a[1] === 'Get up', JSON.stringify(a));
  const pos = await ev(() => { const m = window.__ember.me; return [m.x, m.y, m.z, Math.hypot(m.x, m.z)].map((v) => +v.toFixed(2)); });
  console.log('     resting spot', JSON.stringify(pos));
  await page.screenshot({ path: 'shots/a1-sit-fire.png' });
  await ev(() => window.__ember.run(0));
  await page.waitForTimeout(2500);
  a = await acts();
  ok('lying offers only get up', a[0] === null && a[1] === 'Get up', JSON.stringify(a));
  const w0 = await ev(() => window.__ember.warmth);
  await page.waitForTimeout(4000);
  const w1 = await ev(() => window.__ember.warmth);
  ok('warmth builds while resting', w1 > w0 + 0.03, `${w0.toFixed(2)} -> ${w1.toFixed(2)}`);
  await ev(() => { window.__ember.warmth = 0.995; });
  await page.waitForTimeout(1500);
  ok('says when warm through', (await log()).some((l) => l.includes('warm right through')), JSON.stringify(await log()));
  await page.screenshot({ path: 'shots/a2-lie-fire-warm.png' });
  await ev(() => window.__ember.cam(-0.6, 0.25, 4.2));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'shots/a3-keeper.png' });
  await ev(() => window.__ember.run(1));
  await page.waitForTimeout(1200);
  ok('got up', (await ev(() => window.__ember.me.mode)) === 'stand');
  // Keeper greeting
  const kp = await ev(() => { const k = window.__ember.keeper; return [k.x, k.z, k.targetYaw]; });
  await ev((kp) => { const d = Math.hypot(kp[0], kp[1]); window.__ember.teleport(kp[0] * (1 + 1.9 / d) , kp[1] * (1 + 1.9 / d)); }, kp);
  await page.waitForTimeout(600);
  a = await acts();
  ok('keeper can be greeted', a.includes('Greet the keeper'), JSON.stringify(a));
  await ev(() => { const e = window.__ember; const i = e.actions.indexOf('Greet the keeper'); e.run(i); });
  await page.waitForTimeout(2600);
  ok('keeper answers', (await log()).some((l) => l.startsWith('Keeper')), JSON.stringify(await log()));
}
if (part === 'b') {
  // Sticks.
  await look(0);
  await ev(() => { const e = window.__ember; e.setFire(0.3); e.teleport(3.1, 6.3, Math.PI); e.cam(0.9, 0.2, 2.6); });
  await page.waitForTimeout(1500);
  let a = await acts();
  ok('woodpile offers a stick', a[0] === 'Pick up a stick', JSON.stringify(a));
  await ev(() => window.__ember.run(0));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'shots/b1-stick-mouth.png', clip });
  a = await acts();
  ok('carrying offers to put it down', a[1] === 'Put the stick down', JSON.stringify(a));
  await ev(() => { const e = window.__ember; e.teleport(2.4, 3.0, Math.PI); e.cam(0.9, 0.3, 5); });
  await page.waitForTimeout(800);
  a = await acts();
  ok('near the fire offers to drop it on', a[0] === 'Drop the stick on the fire', JSON.stringify(a));
  const f0 = await ev(() => window.__ember.fuel);
  await ev(() => window.__ember.run(0));
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'shots/b2-stick-toss.png' });
  await page.waitForTimeout(3500);
  const f1 = await ev(() => window.__ember.fuel);
  ok('fire takes the stick', f1 > f0 + 0.3 && (await ev(() => window.__ember.held)) === 0, `${f0.toFixed(2)} -> ${f1.toFixed(2)}`);
}
if (part === 'c') {
  // Gestures, close up, on a wolf then a donkey.
  for (const [sp, name] of [[3, 'wolf'], [7, 'donkey']]) {
    await look(sp);
    await ev(() => { const e = window.__ember; e.setMode('stand'); e.teleport(3.2, 9.6, Math.PI / 2); e.cam(0.5, 0.15, 3.0); });
    await page.waitForTimeout(1500);
    for (const [emote, wait] of [['call', 900], ['shake', 450], ['wag', 600], ['paw', 600], ['greet', 600], ['hop', 500], ['sniff', 700]]) {
      await ev((emote) => { const e = window.__ember; if (emote === 'call') e.callOut(); else e.playEmote(emote); }, emote);
      await page.waitForTimeout(wait);
      await page.screenshot({ path: `shots/c-${name}-${emote}.png`, clip });
      await page.waitForTimeout(2600);
    }
  }
  const fs = await import('node:fs');
  fs.writeFileSync('shots/p-list.txt', ['wolf', 'donkey'].flatMap((n) => ['call', 'shake', 'wag', 'paw', 'greet', 'hop', 'sniff'].map((e) => `c-${n}-${e}.png`)).join('\n'));
}
console.log(errors.length ? errors.slice(0, 6).join('\n') : 'no errors');
await browser.close();
