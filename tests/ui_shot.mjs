import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
for (const [name, path, opt] of [['u1', '', { viewport: { width: 1280, height: 720 } }], ['u2', 'far', { viewport: { width: 1280, height: 720 } }], ['u3', '', { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }]]) {
  const ctx = await browser.newContext(opt); await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
  const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => console.log('ERR', name, e.message));
  await p.goto('http://localhost:8787/' + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
  await p.evaluate(() => { window.__ember.lockQuality(); window.__ember.idleAfter = 3600000; window.__ember.setHour(11); document.querySelector('#pick-animal button:nth-child(1)').click(); document.querySelector('#enter').click(); });
  await p.waitForTimeout(6000);
  if (!path) { await p.evaluate(() => window.__ember.teleport(2.5, 2.5, 0)); await p.waitForTimeout(9000); }
  await p.screenshot({ path: `/home/claude/ember-isle/shots/${name}.png` });
  if (name === 'u1') { await p.keyboard.press('j'); await p.waitForTimeout(700); console.log('journal opens with J:', await p.evaluate(() => !document.getElementById('sheet').hidden && document.getElementById('sheet-title').textContent)); await p.keyboard.press('Escape'); console.log('panel:', await p.evaluate(() => document.getElementById('tasks').innerText.replace(/\n/g, ' | '))); }
  await ctx.close();
}
await browser.close();
