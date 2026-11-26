import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:8787/', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
await p.evaluate(() => { const e = window.__ember; e.lockQuality(); e.idleAfter = 3600000; e.setHour(11); e.setRain(0); document.querySelector('#pick-animal button:nth-child(1)').click(); document.querySelector('#enter').click(); });
await p.waitForTimeout(6000);
const sets = (process.argv[2] || '1,4,7').split('/').map((s) => s.split(',').map(Number));
const which = (process.argv[3] || '0,1,2,3,4,5,6,7').split(',').map(Number);
for (const sp of which) for (const [k, set] of sets.entries()) {
  await p.evaluate(([sp, set]) => { const e = window.__ember; e.teleport(14, 9, 0.6); e.me.setLook(sp, 0); e.me.setWear(set); }, [sp, set]); await p.waitForTimeout(2500);
  await p.evaluate(() => { const e = window.__ember, m = e.me, h = m.spec ? m.spec.height : 1; e.cutTo([m.x + 1.5 * h + 0.5, m.y + 0.85 * h + 0.25, m.z + 0.5 * h + 0.2], [m.x, m.y + 0.66 * h, m.z - 0.15 * h], 8); }); await p.waitForTimeout(4200);
  await p.screenshot({ path: `/home/claude/ember-isle/shots/wear_${sp}_${k}.png`, clip: { x: 360, y: 120, width: 560, height: 440 } }); await p.waitForTimeout(4500);
}
await browser.close();
