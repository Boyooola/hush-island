import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:8787/far', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
await p.evaluate(() => { window.__ember.lockQuality(); window.__ember.idleAfter = 3600000; window.__ember.setHour(11); });
await p.click('#pick-animal button:nth-child(1)'); await p.click('#enter'); await p.waitForTimeout(5000);
const W = await p.evaluate(() => window.__ember.world.logPages.map((q) => ({ x: q.x, z: q.z })));
let k = 0;
for (const i of [2, 5, 4, 0]) {
  await p.evaluate(([x, z]) => { const e = window.__ember; e.teleport(x + 6, z + 6, 0); const y = e.me.y; setTimeout(() => e.cutTo([x + 1.6, e.world.logPages[0].group ? e.world.logPages.find((q) => q.x === x).group.position.y + 1.3 : y, z + 1.9], [x, e.world.logPages.find((q) => q.x === x).group.position.y, z], 8), 500); }, [W[i].x, W[i].z]); await p.waitForTimeout(5000);
  await p.screenshot({ path: `/home/claude/ember-isle/shots/pg${k++}.png` }); await p.waitForTimeout(5000);
}
const g = await p.evaluate(() => document.getElementById('goal').innerText); console.log(g);
await browser.close();
