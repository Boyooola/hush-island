import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const phone = process.argv[2] === 'phone';
const ctx = await browser.newContext(phone ? { viewport: { width: 800, height: 400 }, hasTouch: true, isMobile: true } : { viewport: { width: 800, height: 450 } });
await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:8787/far', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
await p.evaluate(() => { window.__ember.lockQuality(); window.__ember.idleAfter = 3600000; window.__ember.setHour(11); window.__ember.setRain(0); window.__ember.setFog(false); });
await p.evaluate(() => { document.querySelector('#pick-animal button:nth-child(1)').click(); document.querySelector('#enter').click(); }); await p.waitForTimeout(5000);
if (process.argv[2] && !phone) await p.evaluate((k) => window.__ember.setReach(Number(k), Number(k) < 0.6 ? 0.35 : Number(k) < 1 ? 0.6 : 1), process.argv[2]);
const spots = { landing: [8, 2], woods: [-78, -8], woodsEdge: [-40, -4], valley: [-200, 0], meadow: [-270, -20], summit: [-265, -2], point: [-312, 9], flats: [-100, 125], farbeach: [-313, -97], hollowMouth: [-148, -68] };
for (const [name, [x, z]] of Object.entries(spots)) {
  let worst = { tri: 0, calls: 0 };
  for (const yaw of [0, 1.57, 3.14, 4.71]) {
    await p.evaluate(([x, z, yaw]) => { const e = window.__ember; e.teleport(x, z, 0); e.cam(yaw, 0.3, 9); }, [x, z, yaw]); await p.waitForTimeout(yaw === 0 ? 9000 : 1800);
    const r = await p.evaluate(() => { const i = window.__ember.renderer.info.render; return { tri: i.triangles, calls: i.calls }; });
    if (r.tri > worst.tri) worst = r;
  }
  console.log(name.padEnd(12), String(worst.tri).padStart(8), 'triangles', String(worst.calls).padStart(5), 'draw calls');
}
if (process.argv[2]) { await p.evaluate((k) => window.__ember.setReach && window.__ember.setReach(Number(k), Number(k) < 0.6 ? 0.35 : Number(k) < 1 ? 0.6 : 1), process.argv[2]); }
await browser.close();
