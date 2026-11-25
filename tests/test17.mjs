import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.goto('http://localhost:8765/index.html');
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__ember.lockQuality(); window.__ember.setIdentity(3, 0); });
await page.click('#enter');
await page.waitForTimeout(3500);
const ev = (fn, a) => page.evaluate(fn, a);
for (const [h, name] of [[12, 'day'], [18.3, 'dusk'], [23, 'night']]) {
  await ev((h) => { const e = window.__ember; e.standUp(); e.setHour(h); e.setRain(0); e.teleport(-15, -11, 0); }, h);
  await page.waitForTimeout(1500);
  console.log(name, 'hill offers:', JSON.stringify(await ev(() => window.__ember.actions)));
  await ev(() => window.__ember.run(0));
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `shots/s-${name}-gaze.png` });
  if (name !== 'night') {
    await ev(() => { const e = window.__ember; e.standUp(); e.teleport(4.5, 21, Math.PI); e.cam(0.25, 0.1, 9); });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `shots/s-${name}-wide.png` });
  }
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
