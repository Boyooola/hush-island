// How does the game hold up with many animals on the island? Pretend visitors come from a second tab.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const counts = (process.argv[2] || '0,30,60,100').split(',').map(Number);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
for (const n of counts) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const game = await ctx.newPage();
  const errs = [];
  game.on('pageerror', (e) => errs.push(e.message));
  await game.goto('http://localhost:8765/index.html');
  await game.waitForTimeout(2500);
  await game.evaluate(() => window.__ember.lockQuality());
  await game.click('#enter');
  let bots = null;
  if (n) { bots = await ctx.newPage(); await bots.goto('http://localhost:8765/bots.html?n=' + n); await game.bringToFront(); }
  await game.waitForTimeout(9000);
  await game.evaluate(() => { const e = window.__ember; e.setHour(12); e.teleport(0, 12, Math.PI); e.cam(0, 0.5, 14); });
  await game.waitForTimeout(3000);
  // Time the game's own work per frame with drawing switched off, then with it on.
  // Time the game's own work inside each frame, with drawing switched off and then on.
  const measure = (draw) => game.evaluate(async (draw) => {
    const e = window.__ember, r = e.renderer, real = r.render.bind(r), raf = window.requestAnimationFrame;
    if (!draw) r.render = () => {};
    let spent = 0, frames = 0;
    window.requestAnimationFrame = (cb) => raf((t) => { const a = performance.now(); cb(t); spent += performance.now() - a; frames++; });
    await new Promise((res) => setTimeout(res, 5000));
    window.requestAnimationFrame = raf; r.render = real;
    return spent / Math.max(1, frames);
  }, draw);
  const logic = await measure(false), full = await measure(true);
  const calls = await game.evaluate(() => window.__ember.renderer.info.render.calls + ' draw calls, ' + Math.round(window.__ember.renderer.info.render.triangles / 1000) + 'k triangles');
  const seen = await game.evaluate(() => window.__ember.peers.size);
  if (n === counts[counts.length - 1]) await game.screenshot({ path: 'shots/stress-' + n + '.png' });
  console.log(String(n).padStart(3), 'visitors | seen', String(seen).padStart(3), '| game work per frame', logic.toFixed(1).padStart(6), 'ms | with drawing (software)', full.toFixed(0).padStart(5), 'ms |', calls, errs.length ? '| errors: ' + errs[0] : '');
  await ctx.close();
}
await browser.close();
