import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
for (const path of ['far', '']) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } }); await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
  const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto('http://localhost:8787/' + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
  await p.evaluate(() => { const e = window.__ember; e.lockQuality(); e.idleAfter = 3600000; e.setHour(11); document.querySelector('#pick-animal button:nth-child(1)').click(); document.querySelector('#enter').click(); }); await p.waitForTimeout(6000);
  const res = await p.evaluate((far) => { const e = window.__ember, out = [], from = far ? e.paths.flat() : [[0.5, 20], [3, 6]];
    for (const c of e.world.chests) { const v = from.slice().sort((a, b) => Math.hypot(a[0] - c.x, a[1] - c.z) - Math.hypot(b[0] - c.x, b[1] - c.z))[0]; let got = false;
      for (const [dx, dz] of [[1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3], [1.6, 1.6], [-1.6, -1.6]]) { e.teleport(v[0], v[1], 0); if (e.walkTo(c.x + dx, c.z + dz)) { got = true; break; } }
      e.teleport(c.x + 1.2, c.z + 0.4, 0); out.push(`${c.id} y=${c.group ? c.group.position.y.toFixed(1) : '?'} ${got ? 'ok' : 'UNREACHABLE'}${c.cave ? ' (cave)' : ''}`); }
    return out; }, path === 'far');
  console.log(res.join('\n'));
  if (!path) { await p.evaluate(() => { const e = window.__ember, c = e.world.chests[0]; e.teleport(c.x + 1.6, c.z + 0.8, 0); e.cam(0.8, 0.4, 6); }); await p.waitForTimeout(4000); await p.screenshot({ path: '/home/claude/ember-isle/shots/hc.png' }); }
  await ctx.close();
}
await browser.close();
