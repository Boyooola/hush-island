import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const errors = [];
for (const [name, opts] of [['desk', { viewport: { width: 1280, height: 720 } }], ['phone', { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }]]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await page.goto('http://localhost:8765/index.html');
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__ember.lockQuality(); window.__ember.setIdentity(2, 0); });
  await (name === 'phone' ? page.tap('#enter') : page.click('#enter'));
  await page.waitForTimeout(3500);
  await page.evaluate(() => { const e = window.__ember; e.setHour(name === 'x' ? 0 : 12); e.setRain(0); e.did(e.listToday()[1]); });
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => ({ closed: document.getElementById('tasks').dataset.closed, count: document.getElementById('tasks-count').textContent, items: [...document.querySelectorAll('#tasks-list li')].map((l) => (l.className ? '[x] ' : '[ ] ') + l.textContent) }));
  console.log(name, JSON.stringify(state));
  await page.screenshot({ path: `shots/l-${name}.png` });
  if (name === 'phone') { await page.tap('#tasks-head'); await page.waitForTimeout(400); await page.screenshot({ path: 'shots/l-phone-open.png' }); }
  if (name === 'desk') { await page.evaluate(() => window.__ember.setHour(0.5)); await page.waitForTimeout(1500); await page.screenshot({ path: 'shots/l-desk-night.png' }); }
  await ctx.close();
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
